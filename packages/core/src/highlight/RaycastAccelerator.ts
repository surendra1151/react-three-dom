import {
  Raycaster,
  Vector2,
  Object3D,
  Camera,
  Mesh,
  Line,
  Points,
  BufferGeometry,
  Intersection,
} from 'three';
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from 'three-mesh-bvh';
import type { ObjectStore } from '../store/ObjectStore';
import { r3fLog } from '../debug';

// ---------------------------------------------------------------------------
// RaycastAccelerator
//
// Two-layer acceleration for BIM-scale raycasting (100k-200k objects):
//
// Layer 1 — Flat target list:
//   Maintains a pre-filtered array of only raycastable meshes from the
//   ObjectStore. Avoids the recursive scene graph traverse that makes
//   Three.js's default `intersectObjects(scene.children, true)` O(n).
//
// Layer 2 — Per-geometry BVH (three-mesh-bvh):
//   Patches Three.js so each BufferGeometry builds a Bounding Volume
//   Hierarchy on first raycast. For high-poly BIM meshes (50k-500k
//   triangles), this turns per-mesh triangle intersection from O(t)
//   brute-force into O(log t) tree traversal.
//
// Combined: ~0.01-0.1ms at 200k objects vs ~200ms without.
// ---------------------------------------------------------------------------

let _bvhPatched = false;

function ensureBVHPatched(): void {
  if (_bvhPatched) return;
  _bvhPatched = true;

  BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  Mesh.prototype.raycast = acceleratedRaycast;

  r3fLog('raycast', 'three-mesh-bvh patched into Three.js');
}

const _raycaster = /* @__PURE__ */ new Raycaster();
const _mouse = /* @__PURE__ */ new Vector2();

function isRaycastable(obj: Object3D): boolean {
  if (obj.userData?.__r3fdom_internal) return false;
  if (!obj.visible) return false;
  const isMeshLike =
    (obj as Mesh).isMesh === true ||
    (obj as Line).isLine === true ||
    (obj as Points).isPoints === true;
  if (!isMeshLike) return false;
  // Skip objects with disposed geometry (position attribute array is null after dispose)
  const geom = (obj as Mesh).geometry;
  if (geom) {
    const posAttr = geom.getAttribute('position');
    if (posAttr && !posAttr.array) return false;
  }
  return true;
}

export class RaycastAccelerator {
  private _store: ObjectStore;
  private _targets: Object3D[] = [];
  private _dirty = true;
  private _unsubscribe: (() => void) | null = null;
  private _bvhBuiltFor = new WeakSet<BufferGeometry>();

  constructor(store: ObjectStore) {
    this._store = store;
    ensureBVHPatched();

    this._unsubscribe = store.subscribe(() => {
      this._dirty = true;
    });
  }

  markDirty(): void {
    this._dirty = true;
  }

  private _rebuild(): void {
    this._dirty = false;
    const flatList = this._store.getFlatList();
    const targets: Object3D[] = [];

    for (let i = 0; i < flatList.length; i++) {
      const obj = flatList[i];
      if (isRaycastable(obj)) {
        targets.push(obj);
      }
    }

    this._targets = targets;

    // Build BVHs incrementally — only for meshes not yet processed.
    // Spread across frames: cap at 50 BVH builds per rebuild to avoid
    // blocking the main thread when a large model first loads.
    let bvhBudget = 50;
    for (let i = 0; i < targets.length && bvhBudget > 0; i++) {
      const obj = targets[i];
      if ((obj as Mesh).isMesh) {
        const geom = (obj as Mesh).geometry;
        if (geom && !this._bvhBuiltFor.has(geom) && !geom.boundsTree) {
          this._ensureBVH(obj);
          bvhBudget--;
        }
      }
    }

    // If we hit the budget, stay dirty so remaining BVHs are built next call
    if (bvhBudget === 0) {
      this._dirty = true;
    }
  }

  /**
   * Build a BVH for a mesh's geometry if it doesn't have one yet.
   * Uses indirect mode to avoid modifying the index buffer.
   * Skips disposed geometries and does NOT mark failed builds so they
   * can be retried (e.g. after geometry is re-uploaded).
   */
  private _ensureBVH(obj: Object3D): void {
    if (!(obj as Mesh).isMesh) return;
    const geom = (obj as Mesh).geometry;
    if (!geom || this._bvhBuiltFor.has(geom)) return;

    // Skip disposed geometries — position attribute is null after dispose
    const posAttr = geom.getAttribute('position');
    if (!posAttr || !posAttr.array) return;

    if (geom.boundsTree) {
      this._bvhBuiltFor.add(geom);
      return;
    }

    try {
      geom.computeBoundsTree({ indirect: true });
      this._bvhBuiltFor.add(geom);
    } catch {
      r3fLog('raycast', `BVH build failed for geometry, will retry next rebuild`);
    }
  }

  /**
   * Raycast from mouse position against only raycastable meshes.
   * Returns the closest non-internal hit, or null.
   */
  raycastAtMouse(
    e: MouseEvent,
    camera: Camera,
    canvas: HTMLCanvasElement,
  ): Object3D | null {
    if (this._dirty) this._rebuild();

    const rect = canvas.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    _raycaster.firstHitOnly = true;

    const intersections = _raycaster.intersectObjects(this._targets, false);

    _raycaster.firstHitOnly = false;

    for (const intersection of intersections) {
      if (intersection.object.userData?.__r3fdom_internal) continue;
      return intersection.object;
    }

    return null;
  }

  /**
   * Raycast from NDC coordinates. Used by raycastVerify.
   */
  raycastAtNdc(
    ndcX: number,
    ndcY: number,
    camera: Camera,
  ): Intersection[] {
    if (this._dirty) this._rebuild();

    _mouse.set(ndcX, ndcY);
    _raycaster.setFromCamera(_mouse, camera);

    return _raycaster.intersectObjects(this._targets, false);
  }

  /** Current number of raycastable targets. */
  get targetCount(): number {
    if (this._dirty) this._rebuild();
    return this._targets.length;
  }

  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._targets = [];
  }
}
