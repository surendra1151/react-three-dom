// Pure scene-diff utility: compare two SceneSnapshots by UUID and key fields.

import type { SceneSnapshot, SnapshotNode } from './types';

/** Describes a single property change on an object that exists in both snapshots. */
export interface SceneDiffChange {
  uuid: string;
  field: string;
  from: unknown;
  to: unknown;
}

/** Result of diffing two scene snapshots. */
export interface SceneDiff {
  /** Nodes present in `after` but not in `before` (from `after` tree). */
  added: SnapshotNode[];
  /** Nodes present in `before` but not in `after` (from `before` tree). */
  removed: SnapshotNode[];
  /** Property changes for nodes that exist in both; each entry is one field that changed. */
  changed: SceneDiffChange[];
}

const FIELDS_TO_COMPARE: (keyof SnapshotNode)[] = [
  'name',
  'type',
  'testId',
  'visible',
  'position',
  'rotation',
  'scale',
];

function flattenTree(node: SnapshotNode): Map<string, SnapshotNode> {
  const map = new Map<string, SnapshotNode>();
  function walk(n: SnapshotNode) {
    map.set(n.uuid, n);
    n.children.forEach(walk);
  }
  walk(node);
  return map;
}

function valueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => valueEqual(v, b[i]));
  }
  return false;
}

/**
 * Compare two scene snapshots and return added nodes, removed nodes, and
 * property changes for nodes that exist in both.
 *
 * - **added**: nodes in `after` whose uuid was not in `before`.
 * - **removed**: nodes in `before` whose uuid was not in `after`.
 * - **changed**: for each uuid present in both, lists field-level changes
 *   (name, type, testId, visible, position, rotation, scale).
 */
export function diffSnapshots(before: SceneSnapshot, after: SceneSnapshot): SceneDiff {
  const beforeMap = flattenTree(before.tree);
  const afterMap = flattenTree(after.tree);

  const added: SnapshotNode[] = [];
  const removed: SnapshotNode[] = [];
  const changed: SceneDiffChange[] = [];

  for (const [uuid, node] of afterMap) {
    if (!beforeMap.has(uuid)) added.push(node);
  }
  for (const [uuid, node] of beforeMap) {
    if (!afterMap.has(uuid)) removed.push(node);
  }

  for (const [uuid, afterNode] of afterMap) {
    const beforeNode = beforeMap.get(uuid);
    if (!beforeNode) continue;

    for (const field of FIELDS_TO_COMPARE) {
      const from = (beforeNode as Record<string, unknown>)[field];
      const to = (afterNode as Record<string, unknown>)[field];
      if (!valueEqual(from, to)) {
        changed.push({ uuid, field, from, to });
      }
    }
  }

  return { added, removed, changed };
}
