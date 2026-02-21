import type { Object3D } from 'three';
import { getTagForType } from '../mirror/CustomElements';

/**
 * When a mesh is the "main" geometry of its parent group (e.g. table top for a table group),
 * we show the group as highlighted so the whole table is selected. When the mesh is a
 * "detail" (e.g. a table leg), we show the mesh itself.
 * Heuristic: the first mesh child of a Group is treated as the main one → promote to group.
 */
function isFirstMeshInGroup(obj: Object3D): boolean {
  const parent = obj.parent;
  if (!parent || parent.type !== 'Group') return false;
  const firstMesh = parent.children.find((c) => getTagForType(c.type) === 'three-mesh');
  return firstMesh === obj;
}

/**
 * Resolve the uuid to use for display/selection.
 * If the object is a mesh and is the first (main) mesh of its parent Group, returns the parent's uuid.
 * Otherwise returns the given uuid.
 */
export function resolveSelectionDisplayTarget(
  getObject3D: (id: string) => Object3D | null,
  uuid: string,
): string | null {
  const obj = getObject3D(uuid);
  if (!obj) return null;
  if (getTagForType(obj.type) !== 'three-mesh') return uuid;
  if (isFirstMeshInGroup(obj) && obj.parent) return obj.parent.uuid;
  return uuid;
}
