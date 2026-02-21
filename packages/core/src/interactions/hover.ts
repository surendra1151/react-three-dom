/**
 * @module hover
 *
 * Deterministic hover and unhover interactions on 3D objects. Projects the
 * target object to screen space and dispatches synthetic pointermove/pointerover
 * events on the canvas, triggering R3F's onPointerOver/onPointerEnter handlers.
 */
import { projectToScreen } from './projection';
import { dispatchHover, dispatchUnhover } from './dispatch';
import { verifyRaycastHit } from './raycastVerify';
import { resolveObject, getCamera, getRenderer, getCanvasSize } from './resolve';
import type { RaycastResult } from './raycastVerify';
import { r3fLog } from '../debug';

// ---------------------------------------------------------------------------
// hover3D — deterministic hover on a 3D object
//
// 1. Resolve the object by testId or uuid
// 2. Project its center to screen coordinates
// 3. Dispatch pointermove → pointerover → pointerenter on the canvas
// 4. Verify the raycast hit (optional)
// ---------------------------------------------------------------------------

/** Options for hover3D. */
export interface Hover3DOptions {
  /**
   * Whether to verify the hover hit via raycast.
   * Default: true
   */
  verify?: boolean;
}

/** Result of a hover3D operation. */
export interface Hover3DResult {
  /** Whether the hover was dispatched. Always true if no error thrown. */
  dispatched: true;
  /** Raycast verification result (only if verify: true). */
  raycast?: RaycastResult;
  /** The screen point where the hover was dispatched. */
  screenPoint: { x: number; y: number };
  /** Which projection strategy was used. */
  strategy: string;
}

/**
 * Programmatically hover over a 3D object by its testId or uuid.
 *
 * Projects the object to screen space, dispatches a synthetic hover event
 * sequence on the canvas, and optionally verifies the hit.
 *
 * @param idOrUuid  The object's testId or uuid
 * @param options   Hover options
 * @returns         Hover result with dispatch and verification info
 * @throws          If the object is not found or not visible on screen
 *
 * @example
 * ```typescript
 * window.__R3F_DOM__.hover('chair-primary');
 * ```
 */
export function hover3D(
  idOrUuid: string,
  options: Hover3DOptions = {},
): Hover3DResult {
  const { verify = true } = options;

  // 1. Resolve object
  const obj = resolveObject(idOrUuid);
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();
  r3fLog('hover', `hover3D("${idOrUuid}") — resolving projection`);

  // 2. Project to screen
  const projection = projectToScreen(obj, camera, size);
  if (!projection) {
    throw new Error(
      `[react-three-dom] hover3D("${idOrUuid}") failed: object is not visible on screen. ` +
      `It may be behind the camera or outside the viewport.`,
    );
  }

  // 3. Dispatch hover on canvas
  const canvas = gl.domElement;
  dispatchHover(canvas, projection.point);

  // 4. Optional raycast verification
  let raycast: RaycastResult | undefined;
  if (verify) {
    raycast = verifyRaycastHit(projection.point, obj, camera, size);
    if (!raycast.hit && raycast.occluderLabel) {
      console.warn(
        `[react-three-dom] hover3D("${idOrUuid}") dispatched at ` +
        `(${Math.round(projection.point.x)}, ${Math.round(projection.point.y)}) ` +
        `but raycast hit ${raycast.occluderLabel} instead.`,
      );
    }
  }

  return {
    dispatched: true,
    raycast,
    screenPoint: projection.point,
    strategy: projection.strategy,
  };
}

/**
 * Clear hover state by moving the pointer off-canvas.
 * Call between hover/click interactions to reset R3F's internal pointer state.
 */
export function unhover3D(): void {
  const gl = getRenderer();
  dispatchUnhover(gl.domElement);
}
