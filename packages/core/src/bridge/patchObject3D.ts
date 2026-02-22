import { Object3D } from 'three';
import type { ObjectStore } from '../store/ObjectStore';
import type { DomMirror } from '../mirror/DomMirror';
import { r3fLog } from '../debug';
import { shouldRegister, ensureAncestorChain } from './ThreeDom';

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
const _activePairs: Array<{ store: ObjectStore; mirror: DomMirror; instanceKey: string }> = [];

/**
 * Find the store/mirror pair that tracks the scene containing this object.
 * Walks up the parent chain to check each ancestor against tracked roots.
 */
function findTrackingPair(
  obj: Object3D,
): { store: ObjectStore; mirror: DomMirror; instanceKey: string } | null {
  for (const pair of _activePairs) {
    if (pair.store.isInTrackedScene(obj)) {
      return pair;
    }
  }
  return null;
}

/**
 * Register an object and all its descendants into the store and mirror.
 * Respects the mode/filter settings for the instance.
 */
function registerSubtree(
  obj: Object3D,
  store: ObjectStore,
  mirror: DomMirror,
  instanceKey: string,
): void {
  obj.traverse((child) => {
    if (!store.has(child) && shouldRegister(instanceKey, child)) {
      ensureAncestorChain(child, store, mirror);
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
  instanceKey = '',
): () => void {
  // Register this store/mirror pair
  _activePairs.push({ store, mirror, instanceKey });

  // Only patch the prototype once (supports multiple store/mirror pairs)
  if (!_patched) {
    r3fLog('patch', 'Patching Object3D.prototype.add and .remove');
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
          try {
            r3fLog('patch', `patchedAdd: "${obj.name || obj.type}" added to "${this.name || this.type}"`);
            registerSubtree(obj, pair.store, pair.mirror, pair.instanceKey);
          } catch (err) {
            r3fLog('patch', `patchedAdd: failed to register "${obj.name || obj.type}"`, err);
          }
        }
        // Immediately update the parent's metadata (so childrenUuids is
        // current for any snapshot() call in the same frame) and also mark
        // it dirty for the DOM position sync on the next useFrame.
        pair.store.update(this);
        pair.store.markDirty(this);
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
          try {
            r3fLog('patch', `patchedRemove: "${obj.name || obj.type}" removed from "${this.name || this.type}"`);

            // Notify mirror first (it needs to traverse for DOM cleanup)
            pair.mirror.onObjectRemoved(obj);

            // Then unregister from store (traverses descendants)
            obj.traverse((child) => {
              pair.store.unregister(child);
            });
          } catch (err) {
            r3fLog('patch', `patchedRemove: failed to unregister "${obj.name || obj.type}"`, err);
          }
        }
        // Immediately update the parent's metadata (so childrenUuids is
        // current for any snapshot() call in the same frame) and also mark
        // it dirty for the DOM position sync on the next useFrame.
        pair.store.update(this);
        pair.store.markDirty(this);
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
  r3fLog('patch', 'Restoring original Object3D.prototype.add and .remove');

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
