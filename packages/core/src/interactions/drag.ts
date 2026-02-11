import { Vector3 } from 'three';
import { projectToScreen, screenDeltaToWorld } from './projection';
import { dispatchDrag, type DragOptions } from './dispatch';
import { resolveObject, getCamera, getRenderer, getCanvasSize } from './resolve';
import { r3fLog } from '../debug';

// ---------------------------------------------------------------------------
// drag3D — deterministic drag on a 3D object
//
// Supports two modes:
// 1. World-space delta: drag by { x, y, z } in world units
// 2. Screen-space delta: drag by { dx, dy } in CSS pixels
//
// Both modes dispatch a pointerdown → N × pointermove → pointerup sequence.
// ---------------------------------------------------------------------------

/** World-space drag delta. */
export interface WorldDelta {
  x: number;
  y: number;
  z: number;
}

/** Screen-space drag delta (CSS pixels). */
export interface ScreenDelta {
  dx: number;
  dy: number;
}

/** Options for drag3D. */
export interface Drag3DOptions extends DragOptions {
  /**
   * If 'world', the delta is interpreted as world units.
   * If 'screen', the delta is interpreted as CSS pixels.
   * Default: 'world'
   */
  mode?: 'world' | 'screen';
}

/** Result of a drag3D operation. */
export interface Drag3DResult {
  /** Whether the drag was dispatched. */
  dispatched: true;
  /** Start screen point. */
  startPoint: { x: number; y: number };
  /** End screen point. */
  endPoint: { x: number; y: number };
  /** Which projection strategy was used for the start point. */
  strategy: string;
}

/**
 * Programmatically drag a 3D object by its testId or uuid.
 *
 * Projects the object to screen space for the start point, then computes
 * the end point based on the delta (world-space or screen-space), and
 * dispatches a full drag sequence on the canvas.
 *
 * @param idOrUuid  The object's testId or uuid
 * @param delta     Drag delta (world-space { x, y, z } or screen-space { dx, dy })
 * @param options   Drag options (steps, delay, mode)
 * @returns         Drag result with start/end points
 * @throws          If the object is not found or not visible on screen
 *
 * @example
 * ```typescript
 * // World-space drag: move 2 units on X axis
 * window.__R3F_DOM__.drag('chair-primary', { x: 2, y: 0, z: 0 });
 *
 * // Screen-space drag: move 100px right, 50px down
 * drag3D('chair-primary', { dx: 100, dy: 50 }, { mode: 'screen' });
 * ```
 */
export async function drag3D(
  idOrUuid: string,
  delta: WorldDelta | ScreenDelta,
  options: Drag3DOptions = {},
): Promise<Drag3DResult> {
  const { mode = 'world', ...dragOptions } = options;

  // 1. Resolve object
  const obj = resolveObject(idOrUuid);
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();
  r3fLog('drag', `drag3D("${idOrUuid}") mode=${mode}`, delta);

  // 2. Project start point
  const projection = projectToScreen(obj, camera, size);
  if (!projection) {
    throw new Error(
      `[react-three-dom] drag3D("${idOrUuid}") failed: object is not visible on screen. ` +
      `It may be behind the camera or outside the viewport.`,
    );
  }

  const startPoint = projection.point;
  let endPoint: { x: number; y: number };

  if (mode === 'screen' && 'dx' in delta) {
    // Screen-space mode: directly add pixel delta
    const screenDelta = delta as ScreenDelta;
    endPoint = {
      x: startPoint.x + screenDelta.dx,
      y: startPoint.y + screenDelta.dy,
    };
  } else {
    // World-space mode: convert world delta to screen delta
    const worldDelta = delta as WorldDelta;

    // Get the object's current world position
    const worldPos = new Vector3();
    obj.getWorldPosition(worldPos);

    // Compute the target world position
    const targetPos = worldPos.clone().add(new Vector3(worldDelta.x, worldDelta.y, worldDelta.z));

    // Project target position to screen space
    targetPos.project(camera);
    endPoint = {
      x: ((targetPos.x + 1) / 2) * size.width,
      y: ((-targetPos.y + 1) / 2) * size.height,
    };
  }

  // 3. Dispatch drag sequence
  const canvas = gl.domElement;
  await dispatchDrag(canvas, startPoint, endPoint, dragOptions);

  return {
    dispatched: true,
    startPoint,
    endPoint,
    strategy: projection.strategy,
  };
}

/**
 * Compute what world-space displacement a screen-space drag would produce.
 * Useful for previewing drag effects before committing.
 */
export function previewDragWorldDelta(
  idOrUuid: string,
  screenDx: number,
  screenDy: number,
): Vector3 {
  const obj = resolveObject(idOrUuid);
  const camera = getCamera();
  const size = getCanvasSize();
  return screenDeltaToWorld(screenDx, screenDy, obj, camera, size);
}
