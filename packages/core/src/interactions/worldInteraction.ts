/**
 * @module worldInteraction
 *
 * Position-centric interactions: click/hover/doubleClick at arbitrary world
 * coordinates. Projects the 3D point to screen space and dispatches synthetic
 * pointer events on the canvas. Complements the object-centric APIs
 * (click3D, hover3D, etc.) for use cases like BIM drawing tools, waypoint
 * placement, and spatial testing.
 */
import { Vector3 } from 'three';
import { dispatchClick, dispatchDoubleClick, dispatchContextMenu, dispatchHover } from './dispatch';
import { getCamera, getRenderer, getCanvasSize } from './resolve';
import type { ScreenPoint, CanvasSize } from './projection';
import { r3fLog } from '../debug';
import type { Camera } from 'three';

// Reusable vector to avoid per-call allocation
const _v = new Vector3();

/** A 3D world-space coordinate. */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/** Options shared by all world-coordinate interactions. */
export interface WorldInteractionOptions {
  /** Modifier keys to include on the synthetic events. */
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/** Result returned by world-coordinate interactions. */
export interface WorldInteractionResult {
  dispatched: boolean;
  screenPoint: ScreenPoint;
  behindCamera: boolean;
}

/**
 * Project a world point to canvas-relative screen coordinates.
 * Returns null if the point is behind the camera.
 */
function projectWorld(
  point: WorldPoint,
  camera: Camera,
  size: CanvasSize,
): ScreenPoint | null {
  _v.set(point.x, point.y, point.z).project(camera);

  // Behind camera
  if (_v.z > 1) return null;

  return {
    x: ((_v.x + 1) / 2) * size.width,
    y: ((-_v.y + 1) / 2) * size.height,
  };
}

/**
 * Click at an arbitrary world coordinate.
 *
 * Projects the point to screen space and dispatches a full click sequence
 * (pointerdown → pointerup → click) on the canvas. R3F's event system will
 * raycast from that screen position and fire onClick on whatever mesh is hit.
 *
 * @returns Result with the screen point used and whether the point was behind the camera.
 */
export function clickAtWorld(
  point: WorldPoint,
  _options: WorldInteractionOptions = {},
): WorldInteractionResult {
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();
  const canvas = gl.domElement;

  const screen = projectWorld(point, camera, size);
  if (!screen) {
    r3fLog('interaction', `clickAtWorld(${point.x}, ${point.y}, ${point.z}) — behind camera, skipped`);
    return { dispatched: false, screenPoint: { x: 0, y: 0 }, behindCamera: true };
  }

  r3fLog('interaction', `clickAtWorld(${point.x}, ${point.y}, ${point.z}) → screen(${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  dispatchClick(canvas, screen);

  return { dispatched: true, screenPoint: screen, behindCamera: false };
}

/**
 * Double-click at an arbitrary world coordinate.
 */
export function doubleClickAtWorld(
  point: WorldPoint,
  _options: WorldInteractionOptions = {},
): WorldInteractionResult {
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();
  const canvas = gl.domElement;

  const screen = projectWorld(point, camera, size);
  if (!screen) {
    r3fLog('interaction', `doubleClickAtWorld(${point.x}, ${point.y}, ${point.z}) — behind camera, skipped`);
    return { dispatched: false, screenPoint: { x: 0, y: 0 }, behindCamera: true };
  }

  r3fLog('interaction', `doubleClickAtWorld(${point.x}, ${point.y}, ${point.z}) → screen(${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  dispatchDoubleClick(canvas, screen);

  return { dispatched: true, screenPoint: screen, behindCamera: false };
}

/**
 * Right-click (context menu) at an arbitrary world coordinate.
 */
export function contextMenuAtWorld(
  point: WorldPoint,
  _options: WorldInteractionOptions = {},
): WorldInteractionResult {
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();
  const canvas = gl.domElement;

  const screen = projectWorld(point, camera, size);
  if (!screen) {
    r3fLog('interaction', `contextMenuAtWorld(${point.x}, ${point.y}, ${point.z}) — behind camera, skipped`);
    return { dispatched: false, screenPoint: { x: 0, y: 0 }, behindCamera: true };
  }

  r3fLog('interaction', `contextMenuAtWorld(${point.x}, ${point.y}, ${point.z}) → screen(${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  dispatchContextMenu(canvas, screen);

  return { dispatched: true, screenPoint: screen, behindCamera: false };
}

/**
 * Hover at an arbitrary world coordinate.
 *
 * Dispatches pointermove → pointerover → pointerenter at the projected
 * screen position. R3F will raycast and fire onPointerEnter/onPointerOver
 * on whatever mesh is at that position.
 */
export function hoverAtWorld(
  point: WorldPoint,
  _options: WorldInteractionOptions = {},
): WorldInteractionResult {
  const camera = getCamera();
  const gl = getRenderer();
  const size = getCanvasSize();
  const canvas = gl.domElement;

  const screen = projectWorld(point, camera, size);
  if (!screen) {
    r3fLog('interaction', `hoverAtWorld(${point.x}, ${point.y}, ${point.z}) — behind camera, skipped`);
    return { dispatched: false, screenPoint: { x: 0, y: 0 }, behindCamera: true };
  }

  r3fLog('interaction', `hoverAtWorld(${point.x}, ${point.y}, ${point.z}) → screen(${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  dispatchHover(canvas, screen);

  return { dispatched: true, screenPoint: screen, behindCamera: false };
}

/**
 * Click a sequence of world coordinates with optional delay between each.
 * Useful for BIM drawing tools (polyline, measurement, etc.).
 *
 * @returns Array of results, one per point.
 */
export async function clickAtWorldSequence(
  points: WorldPoint[],
  options: { delayMs?: number } & WorldInteractionOptions = {},
): Promise<WorldInteractionResult[]> {
  const { delayMs = 50, ...interactionOpts } = options;
  const results: WorldInteractionResult[] = [];

  for (let i = 0; i < points.length; i++) {
    results.push(clickAtWorld(points[i], interactionOpts));
    if (delayMs > 0 && i < points.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
