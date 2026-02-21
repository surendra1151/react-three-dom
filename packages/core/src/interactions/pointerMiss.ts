/**
 * @module pointerMiss
 *
 * Simulates a click on empty canvas space to trigger R3F's onPointerMissed
 * handler on all objects. Commonly used for deselection workflows in
 * editor-type applications.
 */
import { dispatchPointerMiss } from './dispatch';
import { getRenderer } from './resolve';
import type { ScreenPoint } from './projection';

// ---------------------------------------------------------------------------
// pointerMiss3D — click on empty canvas space
//
// Dispatches a click at a point unlikely to hit any mesh, causing R3F
// to fire onPointerMissed on all objects that have that handler.
// Commonly used for deselection in editor-type applications.
// ---------------------------------------------------------------------------

/** Options for pointerMiss3D. */
export interface PointerMiss3DOptions {
  /**
   * Specific screen point to click. If not provided, clicks at (1, 1)
   * which is the top-left corner — very unlikely to hit any mesh.
   */
  point?: ScreenPoint;
}

/**
 * Dispatch a click on empty canvas space, triggering `onPointerMissed`.
 *
 * R3F fires `onPointerMissed` on all objects that have that handler
 * when a click doesn't hit any mesh. This is commonly used for
 * deselection workflows.
 *
 * @param options  Optional point to click at
 *
 * @example
 * ```typescript
 * // Click empty space to deselect
 * pointerMiss3D();
 *
 * // Click at a specific empty spot
 * pointerMiss3D({ point: { x: 10, y: 10 } });
 * ```
 */
export function pointerMiss3D(options: PointerMiss3DOptions = {}): void {
  const gl = getRenderer();
  const canvas = gl.domElement;
  dispatchPointerMiss(canvas, options.point);
}
