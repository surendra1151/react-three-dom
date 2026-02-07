import { projectToScreen } from './projection';
import { dispatchWheel, type WheelOptions } from './dispatch';
import { resolveObject, getCamera, getRenderer, getCanvasSize } from './resolve';

// ---------------------------------------------------------------------------
// wheel3D — deterministic wheel/scroll on a 3D object
//
// Projects the object to screen space and dispatches a WheelEvent on the
// canvas at the projected coordinates. Triggers R3F's onWheel handler.
// ---------------------------------------------------------------------------

/** Options for wheel3D. */
export interface Wheel3DOptions extends WheelOptions {}

/** Result of a wheel3D operation. */
export interface Wheel3DResult {
  /** Whether the wheel event was dispatched. */
  dispatched: true;
  /** The screen point where the wheel was dispatched. */
  screenPoint: { x: number; y: number };
  /** Which projection strategy was used. */
  strategy: string;
}

/**
 * Programmatically scroll the wheel over a 3D object by its testId or uuid.
 *
 * Projects the object to screen space and dispatches a synthetic WheelEvent
 * on the canvas. Triggers R3F's `onWheel` handler on the hit object.
 *
 * @param idOrUuid  The object's testId or uuid
 * @param options   Wheel options (deltaY, deltaX, deltaMode)
 * @returns         Wheel result with screen point info
 * @throws          If the object is not found or not visible on screen
 *
 * @example
 * ```typescript
 * // Scroll down 200 units over the chair
 * wheel3D('chair-primary', { deltaY: 200 });
 *
 * // Scroll up
 * wheel3D('chair-primary', { deltaY: -100 });
 * ```
 */
export function wheel3D(
  idOrUuid: string,
  options: Wheel3DOptions = {},
): Wheel3DResult {
  const obj = resolveObject(idOrUuid);
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();

  const projection = projectToScreen(obj, camera, size);
  if (!projection) {
    throw new Error(
      `[react-three-dom] wheel3D("${idOrUuid}") failed: object is not visible on screen.`,
    );
  }

  const canvas = gl.domElement;
  dispatchWheel(canvas, projection.point, options);

  return {
    dispatched: true,
    screenPoint: projection.point,
    strategy: projection.strategy,
  };
}
