import { r3fLog } from '../debug';
import { getRenderer } from './resolve';

// ---------------------------------------------------------------------------
// drawPath — simulate a freeform drawing stroke on the canvas
//
// Dispatches a full pointer sequence:
//   pointerdown (at first point) → N × pointermove → pointerup (at last point)
//
// Designed for canvas drawing apps that listen to pointer events on the
// R3F canvas to create lines, paths, or annotations.
// ---------------------------------------------------------------------------

/** A 2D screen-space point in CSS pixels, relative to the canvas top-left. */
export interface DrawPoint {
  /** X coordinate in CSS pixels from canvas left edge. */
  x: number;
  /** Y coordinate in CSS pixels from canvas top edge. */
  y: number;
  /** Optional pressure (0–1). Default: 0.5 */
  pressure?: number;
}

/** Options for drawPath. */
export interface DrawPathOptions {
  /**
   * Delay in milliseconds between successive pointermove events.
   * Useful for apps that sample pointer events per-frame.
   * Default: 0 (dispatch all moves synchronously, which is fastest)
   */
  stepDelayMs?: number;

  /**
   * Pointer type. Some drawing apps differentiate between mouse and pen.
   * Default: 'mouse'
   */
  pointerType?: 'mouse' | 'pen' | 'touch';

  /**
   * If true, also dispatches a 'click' event at the end of the path.
   * Useful if the app interprets short strokes as clicks.
   * Default: false
   */
  clickAtEnd?: boolean;

  /**
   * If provided, draws on a specific canvas element.
   * Default: the R3F canvas (from the current renderer).
   */
  canvas?: HTMLCanvasElement;
}

/** Result of a drawPath operation. */
export interface DrawPathResult {
  /** Total number of pointer events dispatched. */
  eventCount: number;
  /** The number of points in the path. */
  pointCount: number;
  /** First point of the path. */
  startPoint: DrawPoint;
  /** Last point of the path. */
  endPoint: DrawPoint;
}

/** Monotonically increasing pointer ID for synthetic events. */
let _nextDrawPointerId = 5000;

/**
 * Build a PointerEvent init object for drawing.
 */
function makeDrawPointerInit(
  canvas: HTMLCanvasElement,
  point: DrawPoint,
  pointerId: number,
  pointerType: string,
  overrides?: Partial<PointerEventInit>,
): PointerEventInit {
  const rect = canvas.getBoundingClientRect();
  const clientX = rect.left + point.x;
  const clientY = rect.top + point.y;

  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
    pointerId,
    pointerType,
    isPrimary: true,
    button: 0,
    buttons: 1,
    width: 1,
    height: 1,
    pressure: point.pressure ?? 0.5,
    ...overrides,
  };
}

/**
 * Simulate a freeform drawing stroke on the canvas.
 *
 * Dispatches a full pointer sequence through the provided path of points:
 * `pointerdown` at the first point, `pointermove` at each subsequent point,
 * and `pointerup` at the last point.
 *
 * This is designed for canvas drawing applications (e.g. whiteboard, annotation
 * tools, CAD sketch mode) that respond to pointer events to create geometry.
 *
 * @param points    Array of screen-space points (min 2 required)
 * @param options   Drawing options
 * @returns         Result with event counts and start/end points
 * @throws          If fewer than 2 points are provided
 *
 * @example
 * ```typescript
 * // Draw a simple line from (100, 100) to (300, 200)
 * await drawPath([
 *   { x: 100, y: 100 },
 *   { x: 200, y: 150 },
 *   { x: 300, y: 200 },
 * ]);
 *
 * // Draw with pen pressure simulation
 * await drawPath([
 *   { x: 50, y: 50, pressure: 0.2 },
 *   { x: 100, y: 80, pressure: 0.6 },
 *   { x: 150, y: 70, pressure: 0.9 },
 *   { x: 200, y: 60, pressure: 0.4 },
 * ], { pointerType: 'pen', stepDelayMs: 16 });
 * ```
 */
export async function drawPath(
  points: DrawPoint[],
  options: DrawPathOptions = {},
): Promise<DrawPathResult> {
  if (points.length < 2) {
    throw new Error(
      `[react-three-dom] drawPath requires at least 2 points, got ${points.length}.`,
    );
  }

  const {
    stepDelayMs = 0,
    pointerType = 'mouse',
    clickAtEnd = false,
    canvas: explicitCanvas,
  } = options;

  // Resolve the canvas
  const canvas = explicitCanvas ?? getRenderer().domElement;
  const pointerId = _nextDrawPointerId++;
  let eventCount = 0;

  r3fLog('draw', `drawPath — ${points.length} points, delay=${stepDelayMs}ms, pointerType=${pointerType}`);

  // 1. Pointer down at first point
  const first = points[0];
  canvas.dispatchEvent(
    new PointerEvent('pointerdown', makeDrawPointerInit(canvas, first, pointerId, pointerType)),
  );
  eventCount++;

  // 2. Pointer moves through all intermediate points (including last)
  for (let i = 1; i < points.length; i++) {
    if (stepDelayMs > 0) {
      await sleep(stepDelayMs);
    }

    canvas.dispatchEvent(
      new PointerEvent(
        'pointermove',
        makeDrawPointerInit(canvas, points[i], pointerId, pointerType),
      ),
    );
    eventCount++;
  }

  // 3. Pointer up at last point
  const last = points[points.length - 1];
  canvas.dispatchEvent(
    new PointerEvent(
      'pointerup',
      makeDrawPointerInit(canvas, last, pointerId, pointerType, {
        buttons: 0,
        pressure: 0,
      }),
    ),
  );
  eventCount++;

  // 4. Optional click at end
  if (clickAtEnd) {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + last.x,
        clientY: rect.top + last.y,
        button: 0,
      }),
    );
    eventCount++;
  }

  r3fLog('draw', `drawPath complete — ${eventCount} events dispatched`);

  return {
    eventCount,
    pointCount: points.length,
    startPoint: first,
    endPoint: last,
  };
}

/**
 * Generate an array of DrawPoints along a straight line.
 * Useful for creating uniform stroke paths programmatically.
 *
 * @param start     Start point (screen-space CSS pixels)
 * @param end       End point (screen-space CSS pixels)
 * @param steps     Number of intermediate points (excluding start/end). Default: 10
 * @param pressure  Uniform pressure for all points. Default: 0.5
 * @returns         Array of DrawPoints including start and end
 *
 * @example
 * ```typescript
 * const points = linePath({ x: 0, y: 0 }, { x: 200, y: 200 }, 20);
 * await drawPath(points);
 * ```
 */
export function linePath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps = 10,
  pressure = 0.5,
): DrawPoint[] {
  const points: DrawPoint[] = [];
  const totalSteps = steps + 1; // +1 because we include start and end

  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    points.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      pressure,
    });
  }

  return points;
}

/**
 * Generate an array of DrawPoints along a quadratic bezier curve.
 * Great for simulating smooth freehand drawing strokes.
 *
 * @param start     Start point
 * @param control   Control point (determines curve shape)
 * @param end       End point
 * @param steps     Number of steps. Default: 20
 * @param pressure  Uniform pressure. Default: 0.5
 * @returns         Array of DrawPoints along the curve
 *
 * @example
 * ```typescript
 * const points = curvePath(
 *   { x: 50, y: 200 },   // start
 *   { x: 150, y: 50 },   // control (peak of the curve)
 *   { x: 250, y: 200 },  // end
 *   30,
 * );
 * await drawPath(points);
 * ```
 */
export function curvePath(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  steps = 20,
  pressure = 0.5,
): DrawPoint[] {
  const points: DrawPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const invT = 1 - t;
    // Quadratic bezier: B(t) = (1-t)²·P0 + 2·(1-t)·t·P1 + t²·P2
    points.push({
      x: invT * invT * start.x + 2 * invT * t * control.x + t * t * end.x,
      y: invT * invT * start.y + 2 * invT * t * control.y + t * t * end.y,
      pressure,
    });
  }

  return points;
}

/**
 * Generate an array of DrawPoints forming a rectangle.
 * Useful for drawing rectangular selections or bounding boxes.
 *
 * @param topLeft      Top-left corner
 * @param bottomRight  Bottom-right corner
 * @param pointsPerSide  Number of points per side. Default: 5
 * @param pressure     Uniform pressure. Default: 0.5
 * @returns            Array of DrawPoints tracing the rectangle
 */
export function rectPath(
  topLeft: { x: number; y: number },
  bottomRight: { x: number; y: number },
  pointsPerSide = 5,
  pressure = 0.5,
): DrawPoint[] {
  const topRight = { x: bottomRight.x, y: topLeft.y };
  const bottomLeft = { x: topLeft.x, y: bottomRight.y };

  const sides = [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ] as const;

  const points: DrawPoint[] = [];

  for (const [from, to] of sides) {
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        pressure,
      });
    }
  }

  // Close the path by returning to start
  points.push({ x: topLeft.x, y: topLeft.y, pressure });

  return points;
}

/**
 * Generate an array of DrawPoints forming a circle/ellipse.
 *
 * @param center   Center of the circle (screen-space)
 * @param radiusX  Horizontal radius in CSS pixels
 * @param radiusY  Vertical radius in CSS pixels. Default: same as radiusX (circle)
 * @param steps    Number of points. Default: 36 (10° increments)
 * @param pressure Uniform pressure. Default: 0.5
 * @returns        Array of DrawPoints forming the circle
 */
export function circlePath(
  center: { x: number; y: number },
  radiusX: number,
  radiusY?: number,
  steps = 36,
  pressure = 0.5,
): DrawPoint[] {
  const ry = radiusY ?? radiusX;
  const points: DrawPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * ry,
      pressure,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
