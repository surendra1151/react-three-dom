import type { ObjectStore } from '../store/ObjectStore';
import type { ObjectMetadata, SceneSnapshot, SnapshotNode } from '../types';

// ---------------------------------------------------------------------------
// Snapshot: builds a structured JSON tree from the ObjectStore
//
// Reads exclusively from Tier 1 metadata — no Three.js object access,
// no DOM reads. Cost scales linearly with object count but is cheap
// since it's just Map lookups and object construction.
// ---------------------------------------------------------------------------

/**
 * Build a recursive SnapshotNode tree from a metadata entry.
 */
function buildNodeTree(store: ObjectStore, meta: ObjectMetadata): SnapshotNode {
  const children: SnapshotNode[] = [];

  for (const childUuid of meta.childrenUuids) {
    const childMeta = store.getByUuid(childUuid);
    if (childMeta) {
      children.push(buildNodeTree(store, childMeta));
    }
  }

  return {
    uuid: meta.uuid,
    name: meta.name,
    type: meta.type,
    testId: meta.testId,
    visible: meta.visible,
    position: [...meta.position],
    rotation: [...meta.rotation],
    scale: [...meta.scale],
    children,
  };
}

/**
 * Find the root node (scene) in the store.
 * The root is the object whose parentUuid is null.
 */
function findRoot(store: ObjectStore): ObjectMetadata | null {
  const allObjects = store.getFlatList();
  for (const obj of allObjects) {
    const meta = store.getMetadata(obj);
    if (meta && meta.parentUuid === null) {
      return meta;
    }
  }
  return null;
}

/**
 * Create a full scene snapshot from the ObjectStore.
 *
 * Returns a structured JSON tree built entirely from Tier 1 cached metadata.
 * No Three.js objects or DOM nodes are accessed.
 *
 * @example
 * ```ts
 * const snap = createSnapshot(store);
 * console.log(snap.objectCount); // 1234
 * console.log(snap.tree.children[0].name); // "Furniture"
 * ```
 */
export function createSnapshot(store: ObjectStore): SceneSnapshot {
  const rootMeta = findRoot(store);

  const tree: SnapshotNode = rootMeta
    ? buildNodeTree(store, rootMeta)
    : {
        uuid: '',
        name: 'empty',
        type: 'Scene',
        visible: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        children: [],
      };

  return {
    timestamp: Date.now(),
    objectCount: store.getCount(),
    tree,
  };
}

/**
 * Create a flat snapshot — an array of all object metadata without tree structure.
 * Useful for searching/filtering without recursion.
 *
 * @example
 * ```ts
 * const flat = createFlatSnapshot(store);
 * const meshes = flat.objects.filter(m => m.type === 'Mesh');
 * ```
 */
export function createFlatSnapshot(store: ObjectStore): {
  timestamp: number;
  objectCount: number;
  objects: ObjectMetadata[];
} {
  const objects: ObjectMetadata[] = [];
  const allObjects = store.getFlatList();

  for (const obj of allObjects) {
    const meta = store.getMetadata(obj);
    if (meta) {
      objects.push({ ...meta });
    }
  }

  return {
    timestamp: Date.now(),
    objectCount: objects.length,
    objects,
  };
}
