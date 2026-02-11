import {
  Object3D,
  Mesh,
  InstancedMesh,
  BufferGeometry,
  Material,
  Box3,
  Color,
} from 'three';
import type {
  ObjectMetadata,
  ObjectInspection,
  GeometryInspection,
  MaterialInspection,
  StoreEvent,
  StoreListener,
} from '../types';
import { r3fLog } from '../debug';

// ---------------------------------------------------------------------------
// Helper: extract Tier 1 metadata from a live Three.js object
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

  // Geometry info (Mesh, SkinnedMesh, InstancedMesh, Points, Line, etc.)
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
    // Skip geometry fields if access fails (corrupted or disposed geometry)
    r3fLog('store', `extractMetadata: geometry access failed for "${obj.name || obj.uuid}"`);
  }

  // Material info
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
    // Skip material fields if access fails (disposed material)
    r3fLog('store', `extractMetadata: material access failed for "${obj.name || obj.uuid}"`);
  }

  // InstancedMesh count
  try {
    if (obj instanceof InstancedMesh) {
      meta.instanceCount = obj.count;
    }
  } catch {
    // Skip instance count if access fails
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Helper: compare two metadata objects for changes (Tier 1 only)
// Returns true if any values differ
// ---------------------------------------------------------------------------

function hasChanged(prev: ObjectMetadata, curr: ObjectMetadata): boolean {
  return (
    prev.visible !== curr.visible ||
    prev.name !== curr.name ||
    prev.testId !== curr.testId ||
    prev.position[0] !== curr.position[0] ||
    prev.position[1] !== curr.position[1] ||
    prev.position[2] !== curr.position[2] ||
    prev.rotation[0] !== curr.rotation[0] ||
    prev.rotation[1] !== curr.rotation[1] ||
    prev.rotation[2] !== curr.rotation[2] ||
    prev.scale[0] !== curr.scale[0] ||
    prev.scale[1] !== curr.scale[1] ||
    prev.scale[2] !== curr.scale[2] ||
    prev.parentUuid !== curr.parentUuid ||
    prev.childrenUuids.length !== curr.childrenUuids.length ||
    prev.instanceCount !== curr.instanceCount
  );
}

// ---------------------------------------------------------------------------
// Helper: Tier 2 on-demand inspection
// ---------------------------------------------------------------------------

const _box3 = new Box3();

function inspectObject(obj: Object3D, metadata: ObjectMetadata): ObjectInspection {
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
      if (geom instanceof BufferGeometry) {
        const geoInspection: GeometryInspection = {
          type: geom.type,
          attributes: {},
        };

        for (const [name, attr] of Object.entries(geom.attributes)) {
          geoInspection.attributes[name] = {
            itemSize: attr.itemSize,
            count: attr.count,
          };
        }

        if (geom.index) {
          geoInspection.index = { count: geom.index.count };
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
   */
  register(obj: Object3D): ObjectMetadata {
    // Skip internal highlight/label helpers created by Highlighter
    if (obj.userData?.__r3fdom_internal) {
      return extractMetadata(obj); // Return metadata but don't store it
    }

    // Skip if already registered
    const existing = this._metaByObject.get(obj);
    if (existing) return existing;

    const meta = extractMetadata(obj);
    this._metaByObject.set(obj, meta);
    this._objectByUuid.set(meta.uuid, obj);
    this._flatListDirty = true;

    // Index by testId
    if (meta.testId) {
      this._objectsByTestId.set(meta.testId, obj);
    }

    // Index by name
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
   * Register an entire subtree (object + all descendants).
   * Individual objects that fail to register are skipped (logged when debug
   * is enabled) so that one bad object doesn't prevent the rest from being
   * tracked.
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

  /**
   * Unregister a single object from the store.
   */
  unregister(obj: Object3D): void {
    const meta = this._metaByObject.get(obj);
    if (!meta) return;

    this._metaByObject.delete(obj);
    this._objectByUuid.delete(meta.uuid);
    this._dirtyQueue.delete(obj);
    this._flatListDirty = true;

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
   * Refresh Tier 1 metadata from the live Three.js object.
   * Returns true if any values changed.
   * Returns false (no change) if extracting metadata throws so that the
   * previous metadata is preserved.
   */
  update(obj: Object3D): boolean {
    const prev = this._metaByObject.get(obj);
    if (!prev) return false;

    let curr: ObjectMetadata;
    try {
      curr = extractMetadata(obj);
    } catch (err) {
      r3fLog('store', `update: extractMetadata failed for "${obj.name || obj.uuid}"`, err);
      return false;
    }

    if (hasChanged(prev, curr)) {
      // Update indexes if testId or name changed
      if (prev.testId !== curr.testId) {
        r3fLog('store', `testId changed: "${prev.testId}" → "${curr.testId}" (${curr.type})`);
        if (prev.testId) this._objectsByTestId.delete(prev.testId);
        if (curr.testId) this._objectsByTestId.set(curr.testId, obj);
      }
      if (prev.name !== curr.name) {
        if (prev.name) {
          const nameSet = this._objectsByName.get(prev.name);
          if (nameSet) {
            nameSet.delete(obj);
            if (nameSet.size === 0) this._objectsByName.delete(prev.name);
          }
        }
        if (curr.name) {
          let nameSet = this._objectsByName.get(curr.name);
          if (!nameSet) {
            nameSet = new Set();
            this._objectsByName.set(curr.name, nameSet);
          }
          nameSet.add(obj);
        }
      }

      this._metaByObject.set(obj, curr);
      this._emit({ type: 'update', object: obj, metadata: curr });
      return true;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Tier 2: On-demand inspection (never cached)
  // -------------------------------------------------------------------------

  /**
   * Compute full inspection data from a live Three.js object.
   * This reads geometry buffers, material properties, world bounds, etc.
   * Cost: 0.1–2ms depending on geometry complexity.
   */
  inspect(idOrUuid: string): ObjectInspection | null {
    const obj = this.getObject3D(idOrUuid);
    if (!obj) return null;

    const meta = this._metaByObject.get(obj);
    if (!meta) return null;

    return inspectObject(obj, meta);
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
   * Walk up from `obj` to see if any ancestor is a tracked root.
   * Used by Object3D.add/remove patch to determine if an object
   * belongs to a monitored scene.
   */
  isInTrackedScene(obj: Object3D): boolean {
    let current: Object3D | null = obj;
    while (current) {
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
  // Cleanup
  // -------------------------------------------------------------------------

  /** Remove all tracked objects and reset state. */
  dispose(): void {
    this._objectByUuid.clear();
    this._objectsByTestId.clear();
    this._objectsByName.clear();
    this._flatList = [];
    this._flatListDirty = true;
    this._dirtyQueue.clear();
    this._listeners = [];
    // WeakMap and WeakSet entries will be GC'd automatically
  }
}
