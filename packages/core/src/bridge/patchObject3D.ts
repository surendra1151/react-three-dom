import { Object3D } from 'three';
import type { ObjectStore } from '../store/ObjectStore';
import type { DomMirror } from '../mirror/DomMirror';

// ---------------------------------------------------------------------------
// Object3D.add / Object3D.remove monkey-patch
//
// Intercepts structural changes (add/remove children) on Object3D so the
// ObjectStore and DomMirror are updated instantly (event-driven, O(1) per
// change) without requiring per-frame traversal.
//
// Scoping: only fires for objects that belong to a tracked scene.
// This avoids interfering with other Three.js scenes on the same page.
// ---------------------------------------------------------------------------

/** Tracks whether the patch has been applied. */
let _patched = false;

/** Original methods saved for restoration. */
let _originalAdd: typeof Object3D.prototype.add | null = null;
let _originalRemove: typeof Object3D.prototype.remove | null = null;

/** Active store/mirror pairs (supports multiple tracked scenes). */
const _activePairs: Array<{ store: ObjectStore; mirror: DomMirror }> = [];

/**
 * Find the store/mirror pair that tracks the scene containing this object.
 * Walks up the parent chain to check each ancestor against tracked roots.
 */
function findTrackingPair(
  obj: Object3D,
): { store: ObjectStore; mirror: DomMirror } | null {
  for (const pair of _activePairs) {
    if (pair.store.isInTrackedScene(obj)) {
      return pair;
    }
  }
  return null;
}

/**
 * Register an object and all its descendants into the store and mirror.
 */
function registerSubtree(
  obj: Object3D,
  store: ObjectStore,
  mirror: DomMirror,
): void {
  obj.traverse((child) => {
    if (!store.has(child)) {
      store.register(child);
      mirror.onObjectAdded(child);
    }
  });
}

/**
 * Patch Object3D.prototype.add and Object3D.prototype.remove to intercept
 * structural changes for tracked scenes.
 *
 * @param store - The ObjectStore managing scene metadata
 * @param mirror - The DomMirror managing the parallel DOM tree
 * @returns A cleanup function that unregisters this store/mirror pair
 */
export function patchObject3D(
  store: ObjectStore,
  mirror: DomMirror,
): () => void {
  // Register this store/mirror pair
  _activePairs.push({ store, mirror });

  // Only patch the prototype once (supports multiple store/mirror pairs)
  if (!_patched) {
    _originalAdd = Object3D.prototype.add;
    _originalRemove = Object3D.prototype.remove;

    Object3D.prototype.add = function patchedAdd(
      this: Object3D,
      ...objects: Object3D[]
    ) {
      // Call the original add first
      _originalAdd!.call(this, ...objects);

      // Check if this parent belongs to a tracked scene
      const pair = findTrackingPair(this);
      if (pair) {
        for (const obj of objects) {
          // Skip if it's the object adding itself (Three.js guard)
          if (obj === this) continue;
          registerSubtree(obj, pair.store, pair.mirror);
        }
      }

      return this;
    };

    Object3D.prototype.remove = function patchedRemove(
      this: Object3D,
      ...objects: Object3D[]
    ) {
      // Check tracking BEFORE removal (parent is still set)
      const pair = findTrackingPair(this);

      // Notify store/mirror before actual removal
      if (pair) {
        for (const obj of objects) {
          if (obj === this) continue;

          // Notify mirror first (it needs to traverse for DOM cleanup)
          pair.mirror.onObjectRemoved(obj);

          // Then unregister from store (traverses descendants)
          obj.traverse((child) => {
            pair.store.unregister(child);
          });
        }
      }

      // Call the original remove
      _originalRemove!.call(this, ...objects);

      return this;
    };

    _patched = true;
  }

  // Return cleanup function
  return () => {
    const idx = _activePairs.findIndex(
      (p) => p.store === store && p.mirror === mirror,
    );
    if (idx !== -1) {
      _activePairs.splice(idx, 1);
    }

    // If no more active pairs, restore original methods
    if (_activePairs.length === 0 && _patched) {
      restoreObject3D();
    }
  };
}

/**
 * Restore the original Object3D.prototype.add and remove methods.
 * Called automatically when the last store/mirror pair is removed.
 * Can also be called manually for testing.
 */
export function restoreObject3D(): void {
  if (!_patched) return;

  if (_originalAdd) {
    Object3D.prototype.add = _originalAdd;
    _originalAdd = null;
  }
  if (_originalRemove) {
    Object3D.prototype.remove = _originalRemove;
    _originalRemove = null;
  }

  _patched = false;
}

/**
 * Check if Object3D prototype is currently patched.
 */
export function isPatched(): boolean {
  return _patched;
}
