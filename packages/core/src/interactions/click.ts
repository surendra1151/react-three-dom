import { projectToScreen } from './projection';
import { dispatchClick, dispatchDoubleClick, dispatchContextMenu } from './dispatch';
import { verifyRaycastHit } from './raycastVerify';
import { resolveObject, getCamera, getRenderer, getCanvasSize } from './resolve';
import type { RaycastResult } from './raycastVerify';

// ---------------------------------------------------------------------------
// click3D — deterministic click on a 3D object
//
// 1. Resolve the object by testId or uuid
// 2. Project its center to screen coordinates
// 3. Dispatch pointerdown → pointerup → click on the canvas
// 4. Verify the raycast hit (optional)
// ---------------------------------------------------------------------------

/** Options for click3D. */
export interface Click3DOptions {
  /**
   * Whether to verify the click hit via raycast.
   * Set to false for non-mesh objects (lights, cameras, groups).
   * Default: true
   */
  verify?: boolean;
}

/** Result of a click3D operation. */
export interface Click3DResult {
  /** Whether the click was dispatched. Always true if no error thrown. */
  dispatched: true;
  /** Raycast verification result (only if verify: true). */
  raycast?: RaycastResult;
  /** The screen point where the click was dispatched. */
  screenPoint: { x: number; y: number };
  /** Which projection strategy was used. */
  strategy: string;
}

/**
 * Programmatically click a 3D object by its testId or uuid.
 *
 * Projects the object to screen space, dispatches a synthetic click event
 * on the canvas at the projected coordinates, and optionally verifies
 * the click hit the intended object via raycasting.
 *
 * @param idOrUuid  The object's testId or uuid
 * @param options   Click options
 * @returns         Click result with dispatch and verification info
 * @throws          If the object is not found or not visible on screen
 *
 * @example
 * ```typescript
 * // From the global API
 * window.__R3F_DOM__.click('chair-primary');
 *
 * // With verification disabled (for lights, cameras)
 * click3D('sun-light', { verify: false });
 * ```
 */
export function click3D(
  idOrUuid: string,
  options: Click3DOptions = {},
): Click3DResult {
  const { verify = true } = options;

  // 1. Resolve object
  const obj = resolveObject(idOrUuid);
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();

  // 2. Project to screen
  const projection = projectToScreen(obj, camera, size);
  if (!projection) {
    throw new Error(
      `[react-three-dom] click3D("${idOrUuid}") failed: object is not visible on screen. ` +
      `It may be behind the camera or outside the viewport.`,
    );
  }

  // 3. Dispatch click on canvas
  const canvas = gl.domElement;
  dispatchClick(canvas, projection.point);

  // 4. Optional raycast verification
  let raycast: RaycastResult | undefined;
  if (verify) {
    raycast = verifyRaycastHit(projection.point, obj, camera, size);
    if (!raycast.hit && raycast.occluderLabel) {
      console.warn(
        `[react-three-dom] click3D("${idOrUuid}") dispatched at ` +
        `(${Math.round(projection.point.x)}, ${Math.round(projection.point.y)}) ` +
        `but raycast hit ${raycast.occluderLabel} instead. ` +
        `The object may be occluded.`,
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

// ---------------------------------------------------------------------------
// doubleClick3D — deterministic double-click on a 3D object
// ---------------------------------------------------------------------------

/**
 * Programmatically double-click a 3D object by its testId or uuid.
 *
 * Dispatches the full double-click sequence:
 * pointerdown → pointerup → click → pointerdown → pointerup → click → dblclick
 *
 * Triggers R3F's `onDoubleClick` handler on the hit object.
 *
 * @param idOrUuid  The object's testId or uuid
 * @param options   Same options as click3D
 * @returns         Click result with dispatch and verification info
 * @throws          If the object is not found or not visible on screen
 */
export function doubleClick3D(
  idOrUuid: string,
  options: Click3DOptions = {},
): Click3DResult {
  const { verify = true } = options;

  const obj = resolveObject(idOrUuid);
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();

  const projection = projectToScreen(obj, camera, size);
  if (!projection) {
    throw new Error(
      `[react-three-dom] doubleClick3D("${idOrUuid}") failed: object is not visible on screen.`,
    );
  }

  const canvas = gl.domElement;
  dispatchDoubleClick(canvas, projection.point);

  let raycast: RaycastResult | undefined;
  if (verify) {
    raycast = verifyRaycastHit(projection.point, obj, camera, size);
    if (!raycast.hit && raycast.occluderLabel) {
      console.warn(
        `[react-three-dom] doubleClick3D("${idOrUuid}") dispatched at ` +
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

// ---------------------------------------------------------------------------
// contextMenu3D — deterministic right-click on a 3D object
// ---------------------------------------------------------------------------

/**
 * Programmatically right-click a 3D object by its testId or uuid.
 *
 * Dispatches: pointerdown (button=2) → pointerup (button=2) → contextmenu
 *
 * Triggers R3F's `onContextMenu` handler on the hit object.
 *
 * @param idOrUuid  The object's testId or uuid
 * @param options   Same options as click3D
 * @returns         Click result with dispatch and verification info
 * @throws          If the object is not found or not visible on screen
 */
export function contextMenu3D(
  idOrUuid: string,
  options: Click3DOptions = {},
): Click3DResult {
  const { verify = true } = options;

  const obj = resolveObject(idOrUuid);
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();

  const projection = projectToScreen(obj, camera, size);
  if (!projection) {
    throw new Error(
      `[react-three-dom] contextMenu3D("${idOrUuid}") failed: object is not visible on screen.`,
    );
  }

  const canvas = gl.domElement;
  dispatchContextMenu(canvas, projection.point);

  let raycast: RaycastResult | undefined;
  if (verify) {
    raycast = verifyRaycastHit(projection.point, obj, camera, size);
    if (!raycast.hit && raycast.occluderLabel) {
      console.warn(
        `[react-three-dom] contextMenu3D("${idOrUuid}") dispatched at ` +
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
