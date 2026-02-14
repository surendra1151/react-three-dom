// Pure scene-diff utility (mirrors @react-three-dom/playwright for Cypress parity).

import type { SceneSnapshot, SnapshotNode } from './types';

export interface SceneDiffChange {
  uuid: string;
  field: string;
  from: unknown;
  to: unknown;
}

export interface SceneDiff {
  added: SnapshotNode[];
  removed: SnapshotNode[];
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

export function diffSnapshots(before: SceneSnapshot, after: SceneSnapshot): SceneDiff {
  const beforeMap = flattenTree(before.tree);
  const afterMap = flattenTree(after.tree);

  const added: SnapshotNode[] = [];
  const removed: SnapshotNode[] = [];
  const changed: SceneDiffChange[] = [];

  for (const [, node] of afterMap) {
    if (!beforeMap.has(node.uuid)) added.push(node);
  }
  for (const [, node] of beforeMap) {
    if (!afterMap.has(node.uuid)) removed.push(node);
  }

  for (const [uuid, afterNode] of afterMap) {
    const beforeNode = beforeMap.get(uuid);
    if (!beforeNode) continue;

    for (const field of FIELDS_TO_COMPARE) {
      const from = (beforeNode as unknown as Record<string, unknown>)[field];
      const to = (afterNode as unknown as Record<string, unknown>)[field];
      if (!valueEqual(from, to)) {
        changed.push({ uuid, field, from, to });
      }
    }
  }

  return { added, removed, changed };
}
