/**
 * @module ObjectStore
 *
 * Central registry for all tracked Three.js objects in a react-three-dom session.
 * Provides two-tier data access: Tier 1 (lightweight metadata cached per-frame)
 * and Tier 2 (on-demand deep inspection of geometry, materials, and bounds).
 * Designed for BIM-scale scenes (100k+ objects) with O(1) lookups by uuid,
 * testId, and name, plus amortized flat-list iteration and async registration.
 */
import {
  Object3D,
  Mesh,
  InstancedMesh,
  BufferGeometry,
  Material,
  Box3,
  Color,
  PerspectiveCamera,
  OrthographicCamera,
} from 'three';
import type {
  ObjectMetadata,
  ObjectInspection,
  GeometryInspection,
  MaterialInspection,
  InspectOptions,
  StoreEvent,
  StoreListener,
} from '../types';
import { r3fLog } from '../debug';

// ---------------------------------------------------------------------------
// Helper: extract Tier 1 metadata from a live Three.js object
//
// Split into two paths for performance at BIM scale:
//   - extractMetadata(): full extraction, called once on register
//   - updateDynamicFields(): only reads fields that change per-frame
//     (position, rotation, scale, visible, children count, parent),
//     skipping geometry/material/instanceCount which are static.
//     Reuses the existing metadata object to avoid allocation.
// ---------------------------------------------------------------------------

function extractMetadata(obj: Object3D): ObjectMetadata {
  const meta: ObjectMetadata = {
    uuid: obj.uuid,
    name: obj.name,
    type: obj.type,
    visible: obj.visible,
    testId: obj.userData?.testId as string | undefined,
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    parentUuid: obj.parent?.uuid ?? null,
    childrenUuids: obj.children.map((c) => c.uuid),
    boundsDirty: true,
  };

  extractStaticFields(obj, meta);
  return meta;
}

function extractStaticFields(obj: Object3D, meta: ObjectMetadata): void {
  try {
    if ('geometry' in obj) {
      const geom = (obj as Mesh).geometry;
      if (geom instanceof BufferGeometry) {
        meta.geometryType = geom.type;
        const posAttr = geom.getAttribute('position');
        if (posAttr) {
          meta.vertexCount = posAttr.count;
          if (geom.index) {
            meta.triangleCount = Math.floor(geom.index.count / 3);
          } else {
            meta.triangleCount = Math.floor(posAttr.count / 3);
          }
        }
      }
    }
  } catch {
    r3fLog('store', `extractMetadata: geometry access failed for "${obj.name || obj.uuid}"`);
  }

  try {
    if ('material' in obj) {
      const mat = (obj as Mesh).material;
      if (mat instanceof Material) {
        meta.materialType = mat.type;
      } else if (Array.isArray(mat) && mat.length > 0) {
        meta.materialType = mat[0].type + (mat.length > 1 ? ` (+${mat.length - 1})` : '');
      }
    }
  } catch {
    r3fLog('store', `extractMetadata: material access failed for "${obj.name || obj.uuid}"`);
  }

  try {
    if (obj instanceof InstancedMesh) {
      meta.instanceCount = obj.count;
    }
  } catch {
    // Skip instance count if access fails
  }

  try {
    if (obj instanceof PerspectiveCamera) {
      meta.fov = obj.fov;
      meta.near = obj.near;
      meta.far = obj.far;
      meta.zoom = obj.zoom;
    } else if (obj instanceof OrthographicCamera) {
      meta.near = obj.near;
      meta.far = obj.far;
      meta.zoom = obj.zoom;
    }
  } catch {
    // Skip camera fields if access fails
  }
}

/**
 * Fast per-frame update: only reads dynamic fields that actually change
 * between frames (transform, visibility, children, parent).
 * Mutates `meta` in-place and returns true if anything changed.
 * Avoids allocating a new metadata object or reading static geometry/material.
 */
function updateDynamicFields(obj: Object3D, meta: ObjectMetadata): boolean {
  let changed = false;

  if (meta.visible !== obj.visible) { meta.visible = obj.visible; changed = true; }
  if (meta.name !== obj.name) { meta.name = obj.name; changed = true; }

  const testId = obj.userData?.testId as string | undefined;
  if (meta.testId !== testId) { meta.testId = testId; changed = true; }

  const p = obj.position;
  if (meta.position[0] !== p.x || meta.position[1] !== p.y || meta.position[2] !== p.z) {
    meta.position[0] = p.x; meta.position[1] = p.y; meta.position[2] = p.z;
    changed = true;
  }

  const r = obj.rotation;
  if (meta.rotation[0] !== r.x || meta.rotation[1] !== r.y || meta.rotation[2] !== r.z) {
    meta.rotation[0] = r.x; meta.rotation[1] = r.y; meta.rotation[2] = r.z;
    changed = true;
  }

  const s = obj.scale;
  if (meta.scale[0] !== s.x || meta.scale[1] !== s.y || meta.scale[2] !== s.z) {
    meta.scale[0] = s.x; meta.scale[1] = s.y; meta.scale[2] = s.z;
    changed = true;
  }

  const parentUuid = obj.parent?.uuid ?? null;
  if (meta.parentUuid !== parentUuid) { meta.parentUuid = parentUuid; changed = true; }

  const children = obj.children;
  const cached = meta.childrenUuids;
  if (cached.length !== children.length) {
    meta.childrenUuids = children.map((c) => c.uuid);
    changed = true;
  } else {
    for (let i = 0; i < cached.length; i++) {
      if (cached[i] !== children[i].uuid) {
        meta.childrenUuids = children.map((c) => c.uuid);
        changed = true;
        break;
      }
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Helper: Tier 2 on-demand inspection
// ---------------------------------------------------------------------------

const _box3 = new Box3();

function inspectObject(obj: Object3D, metadata: ObjectMetadata, options?: InspectOptions): ObjectInspection {
  // Start with a minimal valid inspection — each section fills in details
  // and is wrapped in try/catch so a failure in one area (e.g. disposed
  // geometry) doesn't prevent the rest from being returned.
  let worldMatrix: number[] = Array(16).fill(0);
  let boundsMin: [number, number, number] = [0, 0, 0];
  let boundsMax: [number, number, number] = [0, 0, 0];

  // World matrix + bounds
  try {
    obj.updateWorldMatrix(true, false);
    worldMatrix = Array.from(obj.matrixWorld.elements);
    _box3.setFromObject(obj);
    boundsMin = [_box3.min.x, _box3.min.y, _box3.min.z];
    boundsMax = [_box3.max.x, _box3.max.y, _box3.max.z];
  } catch {
    r3fLog('store', `inspectObject: world matrix / bounds failed for "${obj.name || obj.uuid}"`);
  }

  const inspection: ObjectInspection = {
    metadata,
    worldMatrix,
    bounds: { min: boundsMin, max: boundsMax },
    userData: {},
  };

  // userData (shallow copy, may contain non-serializable values)
  try {
    inspection.userData = { ...obj.userData };
  } catch {
    r3fLog('store', `inspectObject: userData copy failed for "${obj.name || obj.uuid}"`);
  }

  // Geometry details
  try {
    if ('geometry' in obj) {
      const geom = (obj as Mesh).geometry;
      if (geom instanceof BufferGeometry && geom.attributes) {
        const geoInspection: GeometryInspection = {
          type: geom.type,
          attributes: {},
        };

        for (const [name, attr] of Object.entries(geom.attributes)) {
          if (!attr) continue;
          geoInspection.attributes[name] = {
            itemSize: attr.itemSize,
            count: attr.count,
          };
        }

        if (geom.index) {
          geoInspection.index = { count: geom.index.count };
        }

        if (options?.includeGeometryData) {
          const posAttr = geom.getAttribute('position');
          if (posAttr?.array) {
            geoInspection.positionData = Array.from(posAttr.array);
          }
          if (geom.index?.array) {
            geoInspection.indexData = Array.from(geom.index.array);
          }
        }

        geom.computeBoundingSphere();
        const sphere = geom.boundingSphere;
        if (sphere) {
          geoInspection.boundingSphere = {
            center: [sphere.center.x, sphere.center.y, sphere.center.z],
            radius: sphere.radius,
          };
        }

        inspection.geometry = geoInspection;
      }
    }
  } catch {
    r3fLog('store', `inspectObject: geometry inspection failed for "${obj.name || obj.uuid}"`);
  }

  // Material details
  try {
    if ('material' in obj) {
      const rawMat = (obj as Mesh).material;
      if (!rawMat) throw new Error('disposed');
      const mat = Array.isArray(rawMat) ? rawMat[0] : rawMat;
      if (mat instanceof Material) {
        const matInspection: MaterialInspection = {
          type: mat.type,
          transparent: mat.transparent,
          opacity: mat.opacity,
          side: mat.side,
        };

        // Color (most materials have it)
        if ('color' in mat && (mat as unknown as { color: Color }).color instanceof Color) {
          matInspection.color = '#' + (mat as unknown as { color: Color }).color.getHexString();
        }

        // Map texture
        if ('map' in mat) {
          const map = (mat as unknown as { map: { name?: string; uuid?: string } | null }).map;
          if (map) {
            matInspection.map = map.name || map.uuid || 'unnamed';
          }
        }

        // ShaderMaterial uniforms
        if ('uniforms' in mat) {
          const uniforms = (mat as unknown as { uniforms: Record<string, { value: unknown }> })
            .uniforms;
          matInspection.uniforms = {};
          for (const [key, uniform] of Object.entries(uniforms)) {
            const val = uniform.value;
            if (val === null || val === undefined) {
              matInspection.uniforms[key] = val;
            } else if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
              matInspection.uniforms[key] = val;
            } else if (typeof val === 'object' && 'toArray' in val) {
              matInspection.uniforms[key] = (val as { toArray(): number[] }).toArray();
            } else {
              matInspection.uniforms[key] = `[${typeof val}]`;
            }
          }
        }

        inspection.material = matInspection;
      }
    }
  } catch {
    r3fLog('store', `inspectObject: material inspection failed for "${obj.name || obj.uuid}"`);
  }

  return inspection;
}

// ---------------------------------------------------------------------------
// ObjectStore — the source of truth for all tracked Three.js objects
// ---------------------------------------------------------------------------

/**
 * Source of truth for all tracked Three.js objects.
 * Maintains O(1) indexes by uuid, testId, and name, a dirty queue for
 * priority per-frame sync, and an event system for add/remove/update
 * notifications consumed by DomMirror and the devtools panel.
 */
export class ObjectStore {
  // Tier 1: metadata for every tracked object
  private _metaByObject = new WeakMap<Object3D, ObjectMetadata>();
  private _objectByUuid = new Map<string, Object3D>();
  private _objectsByTestId = new Map<string, Object3D>();
  private _objectsByName = new Map<string, Set<Object3D>>();

  // Flat list for amortized iteration
  private _flatList: Object3D[] = [];
  private _flatListDirty = true;

  // Priority dirty queue: objects that changed and need immediate sync
  private _dirtyQueue = new Set<Object3D>();

  // Event listeners
  private _listeners: StoreListener[] = [];

  // Track the root scene(s) for scoping
  private _trackedRoots = new WeakSet<Object3D>();

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register a single object into the store.
   * Populates Tier 1 metadata and all indexes.
   * Tags the object with `__r3fdom_tracked = true` for O(1) scene membership checks.
   */
  register(obj: Object3D): ObjectMetadata {
    // Skip internal highlight/label helpers created by Highlighter
    if (obj.userData?.__r3fdom_internal) {
      return extractMetadata(obj);
    }

    // Skip if already registered
    const existing = this._metaByObject.get(obj);
    if (existing) return existing;

    const meta = extractMetadata(obj);
    this._metaByObject.set(obj, meta);
    this._objectByUuid.set(meta.uuid, obj);
    this._flatListDirty = true;

    // O(1) tracking flag for patchObject3D.findTrackingPair
    obj.userData.__r3fdom_tracked = true;

    if (meta.testId) {
      this._objectsByTestId.set(meta.testId, obj);
    }

    if (meta.name) {
      let nameSet = this._objectsByName.get(meta.name);
      if (!nameSet) {
        nameSet = new Set();
        this._objectsByName.set(meta.name, nameSet);
      }
      nameSet.add(obj);
    }

    this._emit({ type: 'add', object: obj, metadata: meta });
    if (meta.testId) {
      r3fLog('store', `Registered "${meta.testId}" (${meta.type})`);
    }
    return meta;
  }

  /**
   * Register an entire subtree (object + all descendants) synchronously.
   * Prefer `registerTreeAsync` for large scenes (100k+) to avoid blocking.
   */
  registerTree(root: Object3D): void {
    this._trackedRoots.add(root);
    root.traverse((obj) => {
      try {
        this.register(obj);
      } catch (err) {
        r3fLog('store', `registerTree: failed to register "${obj.name || obj.uuid}"`, err);
      }
    });
  }

  // ---- Async registration state ----
  private _asyncRegQueue: Object3D[] = [];
  private _asyncRegHandle: number | null = null;
  private _asyncRegBatchSize = 1000;

  /**
   * Register an entire subtree asynchronously using requestIdleCallback.
   * Processes ~1000 objects per idle slice to avoid blocking the main thread.
   *
   * IMPORTANT: install patchObject3D BEFORE calling this so that objects
   * added to the scene during async registration are caught by the patch.
   *
   * Returns a cancel function. Also cancelled automatically by dispose().
   */
  registerTreeAsync(root: Object3D): () => void {
    this._trackedRoots.add(root);

    // Collect all objects upfront (traverse is fast — no DOM/GPU work)
    const queue: Object3D[] = [];
    root.traverse((obj) => queue.push(obj));

    this._asyncRegQueue = queue;
    r3fLog('store', `registerTreeAsync: ${queue.length} objects queued`);

    this._scheduleRegChunk();

    return () => this._cancelAsyncRegistration();
  }

  private _scheduleRegChunk(): void {
    if (this._asyncRegQueue.length === 0) {
      this._asyncRegHandle = null;
      r3fLog('store', `registerTreeAsync complete: ${this.getCount()} objects registered`);
      return;
    }

    const callback = (deadline?: IdleDeadline) => {
      const hasTime = deadline
        ? () => deadline.timeRemaining() > 1
        : () => true;

      let processed = 0;
      while (
        this._asyncRegQueue.length > 0 &&
        processed < this._asyncRegBatchSize &&
        hasTime()
      ) {
        const obj = this._asyncRegQueue.shift()!;
        try {
          this.register(obj);
        } catch (err) {
          r3fLog('store', `registerTreeAsync: failed to register "${obj.name || obj.uuid}"`, err);
        }
        processed++;
      }

      this._scheduleRegChunk();
    };

    if (typeof requestIdleCallback === 'function') {
      this._asyncRegHandle = requestIdleCallback(callback, { timeout: 50 }) as unknown as number;
    } else {
      this._asyncRegHandle = setTimeout(callback, 4) as unknown as number;
    }
  }

  private _cancelAsyncRegistration(): void {
    if (this._asyncRegHandle !== null) {
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(this._asyncRegHandle);
      } else {
        clearTimeout(this._asyncRegHandle);
      }
      this._asyncRegHandle = null;
    }
    this._asyncRegQueue = [];
  }

  /**
   * Unregister a single object from the store.
   * Clears the `__r3fdom_tracked` flag.
   */
  unregister(obj: Object3D): void {
    const meta = this._metaByObject.get(obj);
    if (!meta) return;

    this._metaByObject.delete(obj);
    this._objectByUuid.delete(meta.uuid);
    this._dirtyQueue.delete(obj);
    this._flatListDirty = true;

    delete obj.userData.__r3fdom_tracked;
    delete obj.userData.__r3fdom_manual;

    if (meta.testId) {
      this._objectsByTestId.delete(meta.testId);
    }

    if (meta.name) {
      const nameSet = this._objectsByName.get(meta.name);
      if (nameSet) {
        nameSet.delete(obj);
        if (nameSet.size === 0) {
          this._objectsByName.delete(meta.name);
        }
      }
    }

    if (meta.testId) {
      r3fLog('store', `Unregistered "${meta.testId}" (${meta.type})`);
    }
    this._emit({ type: 'remove', object: obj, metadata: meta });
  }

  /**
   * Unregister an entire subtree (object + all descendants).
   */
  /** Mark a root as tracked without traversing/registering its children. */
  addTrackedRoot(root: Object3D): void {
    this._trackedRoots.add(root);
  }

  unregisterTree(root: Object3D): void {
    root.traverse((obj) => {
      this.unregister(obj);
    });
    this._trackedRoots.delete(root);
  }

  // -------------------------------------------------------------------------
  // Tier 1: Update (compare-and-set, returns true if changed)
  // -------------------------------------------------------------------------

  /**
   * Refresh dynamic Tier 1 fields from the live Three.js object.
   * Only reads transform, visibility, children count, and parent —
   * skips static fields (geometry, material) that don't change per-frame.
   * Mutates metadata in-place to avoid allocation.
   * Returns true if any values changed.
   */
  update(obj: Object3D): boolean {
    const meta = this._metaByObject.get(obj);
    if (!meta) return false;

    let changed: boolean;
    try {
      const prevTestId = meta.testId;
      const prevName = meta.name;

      changed = updateDynamicFields(obj, meta);

      if (changed) {
        if (prevTestId !== meta.testId) {
          r3fLog('store', `testId changed: "${prevTestId}" → "${meta.testId}" (${meta.type})`);
          if (prevTestId) this._objectsByTestId.delete(prevTestId);
          if (meta.testId) this._objectsByTestId.set(meta.testId, obj);
        }
        if (prevName !== meta.name) {
          if (prevName) {
            const nameSet = this._objectsByName.get(prevName);
            if (nameSet) {
              nameSet.delete(obj);
              if (nameSet.size === 0) this._objectsByName.delete(prevName);
            }
          }
          if (meta.name) {
            let nameSet = this._objectsByName.get(meta.name);
            if (!nameSet) {
              nameSet = new Set();
              this._objectsByName.set(meta.name, nameSet);
            }
            nameSet.add(obj);
          }
        }

        this._emit({ type: 'update', object: obj, metadata: meta });
      }
    } catch (err) {
      r3fLog('store', `update: updateDynamicFields failed for "${obj.name || obj.uuid}"`, err);
      return false;
    }

    return changed;
  }

  // -------------------------------------------------------------------------
  // Tier 2: On-demand inspection (never cached)
  // -------------------------------------------------------------------------

  /**
   * Compute full inspection data from a live Three.js object.
   * This reads geometry buffers, material properties, world bounds, etc.
   * Cost: 0.1–2ms depending on geometry complexity.
   * Pass { includeGeometryData: true } to include vertex positions and triangle indices (higher cost for large meshes).
   */
  inspect(idOrUuid: string, options?: InspectOptions): ObjectInspection | null {
    const obj = this.getObject3D(idOrUuid);
    if (!obj) return null;

    const meta = this._metaByObject.get(obj);
    if (!meta) return null;

    return inspectObject(obj, meta, options);
  }

  // -------------------------------------------------------------------------
  // Lookups (O(1))
  // -------------------------------------------------------------------------

  /** Get metadata by testId. O(1). */
  getByTestId(testId: string): ObjectMetadata | null {
    const obj = this._objectsByTestId.get(testId);
    if (!obj) return null;
    return this._metaByObject.get(obj) ?? null;
  }

  /** Get metadata by uuid. O(1). */
  getByUuid(uuid: string): ObjectMetadata | null {
    const obj = this._objectByUuid.get(uuid);
    if (!obj) return null;
    return this._metaByObject.get(obj) ?? null;
  }

  /** Get metadata by name (returns array since names aren't unique). O(1). */
  getByName(name: string): ObjectMetadata[] {
    const objs = this._objectsByName.get(name);
    if (!objs) return [];
    const results: ObjectMetadata[] = [];
    for (const obj of objs) {
      const meta = this._metaByObject.get(obj);
      if (meta) results.push(meta);
    }
    return results;
  }

  /** Get direct children of an object by testId or uuid. Returns empty array if not found. */
  getChildren(idOrUuid: string): ObjectMetadata[] {
    const meta = this.getByTestId(idOrUuid) ?? this.getByUuid(idOrUuid);
    if (!meta) return [];
    const results: ObjectMetadata[] = [];
    for (const childUuid of meta.childrenUuids) {
      const childMeta = this.getByUuid(childUuid);
      if (childMeta) results.push(childMeta);
    }
    return results;
  }

  /** Get parent of an object by testId or uuid. Returns null if not found or if root. */
  getParent(idOrUuid: string): ObjectMetadata | null {
    const meta = this.getByTestId(idOrUuid) ?? this.getByUuid(idOrUuid);
    if (!meta || meta.parentUuid === null) return null;
    return this.getByUuid(meta.parentUuid);
  }

  /**
   * Batch lookup: get metadata for multiple objects by testId or uuid.
   * Returns a Map from the requested id to its metadata (or null if not found).
   * Single round-trip — much more efficient than calling getByTestId/getByUuid
   * in a loop for BIM/CAD scenes with many objects.
   * O(k) where k is the number of requested ids.
   */
  getObjects(ids: string[]): Map<string, ObjectMetadata | null> {
    const results = new Map<string, ObjectMetadata | null>();
    for (const id of ids) {
      const meta = this.getByTestId(id) ?? this.getByUuid(id);
      results.set(id, meta);
    }
    return results;
  }

  /**
   * Get all objects of a given Three.js type (e.g. "Mesh", "Group", "Line").
   * Linear scan — O(n) where n is total tracked objects.
   */
  getByType(type: string): ObjectMetadata[] {
    const results: ObjectMetadata[] = [];
    for (const obj of this.getFlatList()) {
      const meta = this._metaByObject.get(obj);
      if (meta && meta.type === type) results.push(meta);
    }
    return results;
  }

  /**
   * Get all objects with a given geometry type (e.g. "BoxGeometry", "BufferGeometry").
   * Linear scan — O(n). Only meshes/points/lines have geometryType.
   */
  getByGeometryType(type: string): ObjectMetadata[] {
    const results: ObjectMetadata[] = [];
    for (const obj of this.getFlatList()) {
      const meta = this._metaByObject.get(obj);
      if (meta && meta.geometryType === type) results.push(meta);
    }
    return results;
  }

  /**
   * Get all objects with a given material type (e.g. "MeshStandardMaterial").
   * Linear scan — O(n). Only meshes/points/lines have materialType.
   */
  getByMaterialType(type: string): ObjectMetadata[] {
    const results: ObjectMetadata[] = [];
    for (const obj of this.getFlatList()) {
      const meta = this._metaByObject.get(obj);
      if (meta && meta.materialType === type) results.push(meta);
    }
    return results;
  }

  /**
   * Get all objects that have a specific userData key.
   * If `value` is provided, only returns objects where `userData[key]` matches.
   * Uses JSON.stringify for deep equality on complex values.
   * Linear scan — O(n).
   */
  getByUserData(key: string, value?: unknown): ObjectMetadata[] {
    const results: ObjectMetadata[] = [];
    const checkValue = value !== undefined;
    const valueJson = checkValue ? JSON.stringify(value) : '';
    for (const obj of this.getFlatList()) {
      if (!(key in obj.userData)) continue;
      if (checkValue && JSON.stringify(obj.userData[key]) !== valueJson) continue;
      const meta = this._metaByObject.get(obj);
      if (meta) results.push(meta);
    }
    return results;
  }

  /**
   * Count objects of a given Three.js type.
   * More efficient than getByType().length — no array allocation.
   * Linear scan — O(n).
   */
  getCountByType(type: string): number {
    let count = 0;
    for (const obj of this.getFlatList()) {
      const meta = this._metaByObject.get(obj);
      if (meta && meta.type === type) count++;
    }
    return count;
  }

  /** Get the raw Three.js Object3D by testId or uuid. */
  getObject3D(idOrUuid: string): Object3D | null {
    // Try testId first, then uuid
    return this._objectsByTestId.get(idOrUuid)
      ?? this._objectByUuid.get(idOrUuid)
      ?? null;
  }

  /** Get metadata for a known Object3D reference. */
  getMetadata(obj: Object3D): ObjectMetadata | null {
    return this._metaByObject.get(obj) ?? null;
  }

  /** Check if an object is registered. */
  has(obj: Object3D): boolean {
    return this._metaByObject.has(obj);
  }

  /** Total number of tracked objects. */
  getCount(): number {
    return this._objectByUuid.size;
  }

  /** Check if a root scene is tracked. */
  isTrackedRoot(obj: Object3D): boolean {
    return this._trackedRoots.has(obj);
  }

  /**
   * Check if an object belongs to a tracked scene.
   * Fast path: checks the `__r3fdom_tracked` flag set during register (O(1)).
   * Fallback: walks up the parent chain to find a tracked root.
   * The fallback is needed for newly added objects that aren't registered yet.
   */
  isInTrackedScene(obj: Object3D): boolean {
    if (obj.userData?.__r3fdom_tracked) return true;
    let current: Object3D | null = obj.parent;
    while (current) {
      if (current.userData?.__r3fdom_tracked) return true;
      if (this._trackedRoots.has(current)) return true;
      current = current.parent;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Flat list for amortized iteration
  // -------------------------------------------------------------------------

  /**
   * Get a flat array of all tracked objects for amortized batch processing.
   * Rebuilds lazily when the list is dirty (objects added/removed).
   */
  getFlatList(): Object3D[] {
    if (this._flatListDirty) {
      this._flatList = Array.from(this._objectByUuid.values());
      this._flatListDirty = false;
    }
    return this._flatList;
  }

  // -------------------------------------------------------------------------
  // Priority dirty queue
  // -------------------------------------------------------------------------

  /** Mark an object as dirty (needs priority sync next frame). */
  markDirty(obj: Object3D): void {
    if (this._metaByObject.has(obj)) {
      this._dirtyQueue.add(obj);
    }
  }

  /**
   * Drain the dirty queue, returning all objects that need priority sync.
   * Clears the queue after draining.
   */
  drainDirtyQueue(): Object3D[] {
    if (this._dirtyQueue.size === 0) return [];
    const objects = Array.from(this._dirtyQueue);
    this._dirtyQueue.clear();
    return objects;
  }

  /** Number of objects currently in the dirty queue. */
  getDirtyCount(): number {
    return this._dirtyQueue.size;
  }

  // -------------------------------------------------------------------------
  // Event system
  // -------------------------------------------------------------------------

  /** Subscribe to store events (add, remove, update). */
  subscribe(listener: StoreListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  private _emit(event: StoreEvent): void {
    for (const listener of this._listeners) {
      listener(event);
    }
  }

  // -------------------------------------------------------------------------
  // GC: sweep orphaned objects
  // -------------------------------------------------------------------------

  /**
   * Sweep objects in `_objectByUuid` that are no longer in any tracked scene.
   * This catches objects that were removed from the scene graph without
   * triggering the patched Object3D.remove (e.g. direct `.children` splice,
   * or the remove hook failing silently).
   *
   * At BIM scale, call this periodically (e.g. every 30s or after a floor
   * load/unload) to prevent memory leaks from retained Object3D references.
   *
   * Returns the number of orphans cleaned up.
   */
  sweepOrphans(): number {
    let swept = 0;
    for (const [uuid, obj] of this._objectByUuid) {
      if (!obj.parent && !this._trackedRoots.has(obj)) {
        this.unregister(obj);
        swept++;
        r3fLog('store', `sweepOrphans: removed orphan "${obj.name || uuid}"`);
      }
    }
    return swept;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /** Remove all tracked objects and reset state. */
  dispose(): void {
    this._cancelAsyncRegistration();
    for (const obj of this._objectByUuid.values()) {
      if (obj.userData) delete obj.userData.__r3fdom_tracked;
    }
    this._objectByUuid.clear();
    this._objectsByTestId.clear();
    this._objectsByName.clear();
    this._flatList = [];
    this._flatListDirty = true;
    this._dirtyQueue.clear();
    this._listeners = [];
  }
}
