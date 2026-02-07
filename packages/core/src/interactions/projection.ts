import {
  Object3D,
  Camera,
  Vector3,
  Box3,
  Frustum,
  Matrix4,
} from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Screen-space coordinates in CSS pixels relative to the canvas. */
export interface ScreenPoint {
  /** X coordinate in CSS pixels, left = 0. */
  x: number;
  /** Y coordinate in CSS pixels, top = 0. */
  y: number;
}

/** Canvas dimensions in CSS pixels. */
export interface CanvasSize {
  width: number;
  height: number;
}

/** Result of a projection attempt. */
export interface ProjectionResult {
  /** The screen-space point (CSS pixels relative to the canvas element). */
  point: ScreenPoint;
  /** Which strategy produced the result. */
  strategy: 'center' | 'corner' | 'face-center' | 'fallback-origin';
  /** NDC coordinates (-1..+1 range) for the projected point. */
  ndc: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Reusable temporaries (avoids GC pressure in hot paths)
// ---------------------------------------------------------------------------

const _vec3 = /* @__PURE__ */ new Vector3();
const _vec3B = /* @__PURE__ */ new Vector3();
const _box3 = /* @__PURE__ */ new Box3();
const _frustum = /* @__PURE__ */ new Frustum();
const _projMatrix = /* @__PURE__ */ new Matrix4();

// ---------------------------------------------------------------------------
// NDC → screen helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Vector3 in NDC (after `vector.project(camera)`) to CSS-pixel
 * coordinates relative to the canvas.
 *
 * NDC convention: x ∈ [-1, +1], y ∈ [-1, +1], z ∈ [-1, +1]
 * Screen convention: x ∈ [0, width], y ∈ [0, height] (top-left origin)
 */
function ndcToScreen(ndc: Vector3, size: CanvasSize): ScreenPoint {
  return {
    x: ((ndc.x + 1) / 2) * size.width,
    y: ((-ndc.y + 1) / 2) * size.height,
  };
}

/**
 * Returns true if the NDC coordinate is within the visible viewport.
 * Z check: z ∈ (-1, 1) means in front of camera and within far plane.
 */
function isNdcOnScreen(ndc: Vector3): boolean {
  return (
    ndc.x >= -1 && ndc.x <= 1 &&
    ndc.y >= -1 && ndc.y <= 1 &&
    ndc.z >= -1 && ndc.z <= 1
  );
}

/**
 * Returns true if the NDC coordinate is in front of the camera.
 * After `vector.project(camera)`, z < 1 means in front of the camera.
 * A point behind the camera gets z > 1.
 */
function isInFrontOfCamera(ndc: Vector3): boolean {
  return ndc.z >= -1 && ndc.z <= 1;
}

// ---------------------------------------------------------------------------
// Candidate point generators
// ---------------------------------------------------------------------------

/**
 * Compute the world-space bounding box center of an Object3D.
 * Falls back to the object's world position if the bbox is empty.
 */
function getWorldCenter(obj: Object3D): Vector3 {
  _box3.setFromObject(obj);
  if (_box3.isEmpty()) {
    obj.getWorldPosition(_vec3);
    return _vec3;
  }
  _box3.getCenter(_vec3);
  return _vec3;
}

/**
 * Get the 8 corners of the world-space bounding box.
 * Returns an empty array if the bbox is degenerate.
 */
function getBboxCorners(obj: Object3D): Vector3[] {
  _box3.setFromObject(obj);
  if (_box3.isEmpty()) return [];

  const { min, max } = _box3;
  return [
    new Vector3(min.x, min.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(min.x, max.y, max.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
  ];
}

/**
 * Get the 6 face centers of the world-space bounding box.
 * These are better click targets than corners for many geometries.
 */
function getBboxFaceCenters(obj: Object3D): Vector3[] {
  _box3.setFromObject(obj);
  if (_box3.isEmpty()) return [];

  const center = _box3.getCenter(new Vector3());
  const { min, max } = _box3;

  return [
    new Vector3(min.x, center.y, center.z), // -X face
    new Vector3(max.x, center.y, center.z), // +X face
    new Vector3(center.x, min.y, center.z), // -Y face
    new Vector3(center.x, max.y, center.z), // +Y face
    new Vector3(center.x, center.y, min.z), // -Z face
    new Vector3(center.x, center.y, max.z), // +Z face
  ];
}

// ---------------------------------------------------------------------------
// Core projection
// ---------------------------------------------------------------------------

/**
 * Try to project a single world-space point to screen coordinates.
 * Returns null if the point is behind the camera.
 */
function tryProjectPoint(
  worldPoint: Vector3,
  camera: Camera,
  size: CanvasSize,
): { screen: ScreenPoint; ndc: { x: number; y: number }; ndcZ: number; onScreen: boolean } | null {
  // Clone to avoid mutating the input
  _vec3B.copy(worldPoint).project(camera);

  if (!isInFrontOfCamera(_vec3B)) return null;

  const screen = ndcToScreen(_vec3B, size);
  return {
    screen,
    ndc: { x: _vec3B.x, y: _vec3B.y },
    ndcZ: _vec3B.z,
    onScreen: isNdcOnScreen(_vec3B),
  };
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Project a 3D object to screen coordinates using a multi-strategy approach:
 *
 * 1. **Center**: Try the bounding box center (most natural click target).
 * 2. **Face centers**: Try the 6 face centers (better for large/flat objects).
 * 3. **Corners**: Try the 8 bbox corners (catches partially visible objects).
 * 4. **Fallback origin**: Try the object's world position (lights, empty groups).
 *
 * For each strategy, we prefer points that are both on-screen AND closest to
 * the viewport center (most reliable for event dispatch).
 *
 * Returns `null` if no part of the object is visible on screen.
 */
export function projectToScreen(
  obj: Object3D,
  camera: Camera,
  size: CanvasSize,
): ProjectionResult | null {
  // Ensure world matrices are up to date
  obj.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);

  // Strategy 1: Bounding box center
  const center = getWorldCenter(obj);
  const centerResult = tryProjectPoint(center, camera, size);

  if (centerResult && centerResult.onScreen) {
    return {
      point: centerResult.screen,
      strategy: 'center',
      ndc: centerResult.ndc,
    };
  }

  // Strategy 2: Face centers — better fallback for large objects
  const faceCenters = getBboxFaceCenters(obj);
  const faceResult = findBestOnScreenPoint(faceCenters, camera, size);
  if (faceResult) {
    return {
      point: faceResult.screen,
      strategy: 'face-center',
      ndc: faceResult.ndc,
    };
  }

  // Strategy 3: Bbox corners — catches partially visible objects
  const corners = getBboxCorners(obj);
  const cornerResult = findBestOnScreenPoint(corners, camera, size);
  if (cornerResult) {
    return {
      point: cornerResult.screen,
      strategy: 'corner',
      ndc: cornerResult.ndc,
    };
  }

  // Strategy 4: Fallback to world position (lights, helpers, empty groups)
  obj.getWorldPosition(_vec3);
  const originResult = tryProjectPoint(_vec3.clone(), camera, size);
  if (originResult && originResult.onScreen) {
    return {
      point: originResult.screen,
      strategy: 'fallback-origin',
      ndc: originResult.ndc,
    };
  }

  // If center projected but was off-screen, still return it as a best-effort
  // (useful for drag targets that are partially off-screen)
  if (centerResult) {
    return {
      point: centerResult.screen,
      strategy: 'center',
      ndc: centerResult.ndc,
    };
  }

  // Object is entirely behind the camera or degenerate
  return null;
}

/**
 * From a list of candidate world-space points, find the one that projects
 * on-screen and is closest to the viewport center (most reliable dispatch).
 */
function findBestOnScreenPoint(
  candidates: Vector3[],
  camera: Camera,
  size: CanvasSize,
): { screen: ScreenPoint; ndc: { x: number; y: number } } | null {
  let bestResult: { screen: ScreenPoint; ndc: { x: number; y: number } } | null = null;
  let bestDistSq = Infinity;
  const halfW = size.width / 2;
  const halfH = size.height / 2;

  for (const point of candidates) {
    const result = tryProjectPoint(point, camera, size);
    if (!result || !result.onScreen) continue;

    // Distance from viewport center — prefer more central points
    const dx = result.screen.x - halfW;
    const dy = result.screen.y - halfH;
    const distSq = dx * dx + dy * dy;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestResult = { screen: result.screen, ndc: result.ndc };
    }
  }

  return bestResult;
}

// ---------------------------------------------------------------------------
// Frustum visibility check
// ---------------------------------------------------------------------------

/**
 * Check whether any part of an Object3D is within the camera frustum.
 * Uses the bounding box intersection test (fast, conservative).
 */
export function isInFrustum(obj: Object3D, camera: Camera): boolean {
  camera.updateWorldMatrix(true, false);
  obj.updateWorldMatrix(true, false);

  _projMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  _frustum.setFromProjectionMatrix(_projMatrix);

  _box3.setFromObject(obj);

  // Empty bbox (lights, empties) — fall back to position check
  if (_box3.isEmpty()) {
    obj.getWorldPosition(_vec3);
    return _frustum.containsPoint(_vec3);
  }

  return _frustum.intersectsBox(_box3);
}

// ---------------------------------------------------------------------------
// Screen-to-world projection (for drag deltas)
// ---------------------------------------------------------------------------

/**
 * Convert a screen-space delta (CSS pixels) to a world-space displacement
 * vector on the plane perpendicular to the camera at the given depth.
 *
 * Used by drag3D to convert pixel movements to 3D movements that feel
 * natural regardless of camera position/zoom.
 */
export function screenDeltaToWorld(
  dx: number,
  dy: number,
  obj: Object3D,
  camera: Camera,
  size: CanvasSize,
): Vector3 {
  // Get the object's depth in NDC
  obj.getWorldPosition(_vec3);
  _vec3.project(camera);
  const depth = _vec3.z;

  // Unproject two points at the same depth to get world-space scale
  const start = new Vector3(0, 0, depth).unproject(camera);
  const right = new Vector3(2 / size.width, 0, depth).unproject(camera);
  const up = new Vector3(0, -2 / size.height, depth).unproject(camera);

  // World-space pixels per CSS pixel
  const rightDir = right.sub(start);
  const upDir = up.sub(start);

  return new Vector3()
    .addScaledVector(rightDir, dx)
    .addScaledVector(upDir, dy);
}

// ---------------------------------------------------------------------------
// Multi-point projection (for assertions / testing)
// ---------------------------------------------------------------------------

/**
 * Project multiple sample points of an object to screen space.
 * Returns all on-screen points, useful for assertions like
 * "object covers at least 50px² of screen area".
 */
export function projectAllSamplePoints(
  obj: Object3D,
  camera: Camera,
  size: CanvasSize,
): ScreenPoint[] {
  obj.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);

  const points: ScreenPoint[] = [];

  // Collect all candidate world-space points
  const candidates: Vector3[] = [];

  // Center
  candidates.push(getWorldCenter(obj).clone());

  // Face centers
  candidates.push(...getBboxFaceCenters(obj));

  // Corners
  candidates.push(...getBboxCorners(obj));

  // Project each
  for (const wsPt of candidates) {
    const result = tryProjectPoint(wsPt, camera, size);
    if (result && result.onScreen) {
      points.push(result.screen);
    }
  }

  return points;
}
