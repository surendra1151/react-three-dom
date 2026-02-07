import {
  Raycaster,
  Vector2,
  Object3D,
  Camera,
  Scene,
} from 'three';
import type { ScreenPoint, CanvasSize } from './projection';

// ---------------------------------------------------------------------------
// Raycast hit verification
//
// After dispatching a synthetic event at projected screen coordinates,
// cast a ray to verify the intended object is actually the first hit.
// This catches occlusion and provides clear error messages.
// ---------------------------------------------------------------------------

const _raycaster = /* @__PURE__ */ new Raycaster();
const _ndc = /* @__PURE__ */ new Vector2();

/** Result of a raycast verification. */
export interface RaycastResult {
  /** Whether the intended object was hit. */
  hit: boolean;
  /** If not hit, the object that was hit instead (occluder). */
  occluder?: Object3D;
  /** Name or testId of the occluder, for error messages. */
  occluderLabel?: string;
}

/**
 * Convert a screen-space point to NDC coordinates for raycasting.
 */
function screenToNdc(point: ScreenPoint, size: CanvasSize): Vector2 {
  _ndc.set(
    (point.x / size.width) * 2 - 1,
    -(point.y / size.height) * 2 + 1,
  );
  return _ndc;
}

/**
 * Get a human-readable label for an Object3D (for error messages).
 */
function getObjectLabel(obj: Object3D): string {
  const testId = obj.userData?.testId;
  if (testId) return `testId="${testId}"`;
  if (obj.name) return `name="${obj.name}"`;
  return `uuid="${obj.uuid.slice(0, 8)}…"`;
}

/**
 * Walk up the parent chain to check if `candidate` is the target or
 * a descendant of the target. This is needed because raycaster returns
 * the specific sub-mesh (e.g. a merged geometry child) rather than
 * the logical parent group.
 */
function isTargetOrDescendant(candidate: Object3D, target: Object3D): boolean {
  let current: Object3D | null = candidate;
  while (current) {
    if (current === target) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Find the scene root by walking up the parent chain.
 */
function findScene(obj: Object3D): Scene | null {
  let current: Object3D | null = obj;
  while (current) {
    if ((current as Scene).isScene) return current as Scene;
    current = current.parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Verify that a raycast from the given screen point hits the intended object.
 *
 * Returns a RaycastResult indicating success or failure with details about
 * what was hit instead (for useful error messages).
 *
 * @param point   Screen-space coordinates (CSS pixels relative to canvas)
 * @param target  The intended Object3D to hit
 * @param camera  The active camera
 * @param size    Canvas size in CSS pixels
 */
export function verifyRaycastHit(
  point: ScreenPoint,
  target: Object3D,
  camera: Camera,
  size: CanvasSize,
): RaycastResult {
  const scene = findScene(target);
  if (!scene) {
    return { hit: false, occluderLabel: 'object not in scene' };
  }

  const ndc = screenToNdc(point, size);
  _raycaster.setFromCamera(ndc, camera);

  // Raycast against the entire scene
  const intersections = _raycaster.intersectObjects(scene.children, true);

  if (intersections.length === 0) {
    // No hits at all — object might be transparent, or a light/helper
    // For non-mesh objects (lights, cameras), this is expected
    return { hit: true };
  }

  // Check if the first hit is our target (or a child of our target)
  const firstHit = intersections[0].object;
  if (isTargetOrDescendant(firstHit, target)) {
    return { hit: true };
  }

  // Check if our target appears anywhere in the intersections
  // (it might be behind something but still hit)
  const targetHit = intersections.find((i) =>
    isTargetOrDescendant(i.object, target),
  );

  if (targetHit) {
    // Target was hit but is behind another object
    return {
      hit: false,
      occluder: firstHit,
      occluderLabel: getObjectLabel(firstHit),
    };
  }

  // Target was not hit at all at this point
  return {
    hit: false,
    occluder: firstHit,
    occluderLabel: getObjectLabel(firstHit),
  };
}

/**
 * Verify a hit, trying multiple sample points if the first fails.
 * This is more robust than single-point verification for objects
 * that are partially occluded.
 *
 * @param points  Array of screen-space points to try
 * @param target  The intended Object3D to hit
 * @param camera  The active camera
 * @param size    Canvas size in CSS pixels
 */
export function verifyRaycastHitMultiPoint(
  points: ScreenPoint[],
  target: Object3D,
  camera: Camera,
  size: CanvasSize,
): RaycastResult {
  let lastResult: RaycastResult = { hit: false };

  for (const point of points) {
    const result = verifyRaycastHit(point, target, camera, size);
    if (result.hit) return result;
    lastResult = result;
  }

  return lastResult;
}
