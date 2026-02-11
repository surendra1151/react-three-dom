// ---------------------------------------------------------------------------
// Path generators for drawPath — pure geometry utilities
//
// These generate arrays of screen-space points that can be passed to
// r3f.drawPath(). Identical to the functions in @react-three-dom/core
// but duplicated here to avoid a runtime dependency on the core package.
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

/**
 * Generate points along a straight line.
 *
 * @param start     Start point
 * @param end       End point
 * @param steps     Intermediate points (excluding start/end). Default: 10
 * @param pressure  Uniform pressure. Default: 0.5
 */
export function linePath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps = 10,
  pressure = 0.5,
): DrawPoint[] {
  const points: DrawPoint[] = [];
  const totalSteps = steps + 1;
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
 * Generate points along a quadratic bezier curve.
 *
 * @param start     Start point
 * @param control   Control point
 * @param end       End point
 * @param steps     Number of steps. Default: 20
 * @param pressure  Uniform pressure. Default: 0.5
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
    points.push({
      x: invT * invT * start.x + 2 * invT * t * control.x + t * t * end.x,
      y: invT * invT * start.y + 2 * invT * t * control.y + t * t * end.y,
      pressure,
    });
  }
  return points;
}

/**
 * Generate points forming a rectangle.
 *
 * @param topLeft      Top-left corner
 * @param bottomRight  Bottom-right corner
 * @param pointsPerSide  Points per side. Default: 5
 * @param pressure     Uniform pressure. Default: 0.5
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
  points.push({ x: topLeft.x, y: topLeft.y, pressure });
  return points;
}

/**
 * Generate points forming a circle/ellipse.
 *
 * @param center   Center point
 * @param radiusX  Horizontal radius in CSS pixels
 * @param radiusY  Vertical radius. Default: same as radiusX
 * @param steps    Number of points. Default: 36
 * @param pressure Uniform pressure. Default: 0.5
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
