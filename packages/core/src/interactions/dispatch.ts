import type { ScreenPoint } from './projection';

// ---------------------------------------------------------------------------
// Synthetic PointerEvent dispatch
//
// Dispatches DOM events on the canvas element at the projected screen
// coordinates, matching the exact sequence that a real browser interaction
// would produce. R3F's event system listens on the canvas, so these
// synthetic events flow through the full pointer → raycaster pipeline.
// ---------------------------------------------------------------------------

/** Monotonically increasing pointer ID for synthetic events. */
let _nextPointerId = 1000;

/** Get a fresh pointerId for each interaction sequence. */
function allocPointerId(): number {
  return _nextPointerId++;
}

/**
 * Compute clientX/clientY from a canvas-relative ScreenPoint.
 * Events need clientX/clientY (relative to viewport), not the canvas.
 */
function toClientCoords(
  canvas: HTMLCanvasElement,
  point: ScreenPoint,
): { clientX: number; clientY: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    clientX: rect.left + point.x,
    clientY: rect.top + point.y,
  };
}

/**
 * Build a PointerEvent init object with correct coordinates and metadata.
 */
function makePointerInit(
  canvas: HTMLCanvasElement,
  point: ScreenPoint,
  pointerId: number,
  overrides?: Partial<PointerEventInit>,
): PointerEventInit {
  const { clientX, clientY } = toClientCoords(canvas, point);
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
    pointerId,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    width: 1,
    height: 1,
    pressure: 0.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Click sequence
// ---------------------------------------------------------------------------

/**
 * Dispatch a full click sequence on the canvas at the given screen point.
 *
 * Sequence: pointerdown → pointerup → click
 *
 * This matches what R3F's event system expects. The canvas is the event
 * target because R3F attaches its listeners to the canvas element.
 */
export function dispatchClick(
  canvas: HTMLCanvasElement,
  point: ScreenPoint,
): void {
  withSafePointerCapture(() => {
    const pointerId = allocPointerId();

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', makePointerInit(canvas, point, pointerId)),
    );
    canvas.dispatchEvent(
      new PointerEvent(
        'pointerup',
        makePointerInit(canvas, point, pointerId, { buttons: 0, pressure: 0 }),
      ),
    );
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ...toClientCoords(canvas, point),
        button: 0,
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// Hover sequence
// ---------------------------------------------------------------------------

/**
 * Dispatch a hover sequence on the canvas at the given screen point.
 *
 * Sequence: pointermove → pointerover → pointerenter
 *
 * R3F translates pointermove into onPointerMove/onPointerOver/onPointerEnter
 * via its internal raycaster. We dispatch the raw DOM events and let R3F
 * do the rest.
 */
export function dispatchHover(
  canvas: HTMLCanvasElement,
  point: ScreenPoint,
): void {
  const pointerId = allocPointerId();
  const init = makePointerInit(canvas, point, pointerId, {
    buttons: 0,
    pressure: 0,
  });

  canvas.dispatchEvent(new PointerEvent('pointermove', init));
  canvas.dispatchEvent(new PointerEvent('pointerover', init));
  canvas.dispatchEvent(new PointerEvent('pointerenter', { ...init, bubbles: false }));
}

// ---------------------------------------------------------------------------
// Drag sequence
// ---------------------------------------------------------------------------

/** Options for a drag interaction. */
export interface DragOptions {
  /** Number of intermediate pointermove steps. Default: 10 */
  steps?: number;
  /** Delay between steps in ms (for requestAnimationFrame pacing). Default: 0 */
  stepDelayMs?: number;
}

/**
 * Dispatch a full drag sequence from `start` to `end` on the canvas.
 *
 * Sequence: pointerdown → N × pointermove (interpolated) → pointerup
 *
 * Returns a Promise that resolves when the drag is complete.
 * The async nature allows optional frame-pacing via stepDelayMs.
 */
export async function dispatchDrag(
  canvas: HTMLCanvasElement,
  start: ScreenPoint,
  end: ScreenPoint,
  options: DragOptions = {},
): Promise<void> {
  const { steps = 10, stepDelayMs = 0 } = options;
  const pointerId = allocPointerId();

  // Pointer down at start
  withSafePointerCapture(() => {
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', makePointerInit(canvas, start, pointerId)),
    );
  });

  // Interpolate intermediate moves
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const intermediate: ScreenPoint = {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };

    if (stepDelayMs > 0) {
      await sleep(stepDelayMs);
    }

    canvas.dispatchEvent(
      new PointerEvent(
        'pointermove',
        makePointerInit(canvas, intermediate, pointerId),
      ),
    );
  }

  // Pointer up at end
  withSafePointerCapture(() => {
    canvas.dispatchEvent(
      new PointerEvent(
        'pointerup',
        makePointerInit(canvas, end, pointerId, { buttons: 0, pressure: 0 }),
      ),
    );
  });
}

// ---------------------------------------------------------------------------
// Double-click sequence
// ---------------------------------------------------------------------------

/**
 * Dispatch a full double-click sequence on the canvas at the given screen point.
 *
 * Sequence: pointerdown → pointerup → click → pointerdown → pointerup → click → dblclick
 *
 * R3F translates the `dblclick` DOM event into `onDoubleClick` on the hit object.
 */
export function dispatchDoubleClick(
  canvas: HTMLCanvasElement,
  point: ScreenPoint,
): void {
  withSafePointerCapture(() => {
    const pointerId = allocPointerId();
    const coords = toClientCoords(canvas, point);

    // First click
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', makePointerInit(canvas, point, pointerId)),
    );
    canvas.dispatchEvent(
      new PointerEvent(
        'pointerup',
        makePointerInit(canvas, point, pointerId, { buttons: 0, pressure: 0 }),
      ),
    );
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ...coords,
        button: 0,
        detail: 1,
      }),
    );

    // Second click
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', makePointerInit(canvas, point, pointerId)),
    );
    canvas.dispatchEvent(
      new PointerEvent(
        'pointerup',
        makePointerInit(canvas, point, pointerId, { buttons: 0, pressure: 0 }),
      ),
    );
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ...coords,
        button: 0,
        detail: 2,
      }),
    );

    // dblclick
    canvas.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        ...coords,
        button: 0,
        detail: 2,
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// Context menu (right-click) sequence
// ---------------------------------------------------------------------------

/**
 * Dispatch a right-click / context menu sequence on the canvas.
 *
 * Sequence: pointerdown (button=2) → pointerup (button=2) → contextmenu
 *
 * R3F translates the `contextmenu` DOM event into `onContextMenu`.
 */
export function dispatchContextMenu(
  canvas: HTMLCanvasElement,
  point: ScreenPoint,
): void {
  withSafePointerCapture(() => {
    const pointerId = allocPointerId();

    canvas.dispatchEvent(
      new PointerEvent(
        'pointerdown',
        makePointerInit(canvas, point, pointerId, { button: 2, buttons: 2 }),
      ),
    );
    canvas.dispatchEvent(
      new PointerEvent(
        'pointerup',
        makePointerInit(canvas, point, pointerId, {
          button: 2,
          buttons: 0,
          pressure: 0,
        }),
      ),
    );
    canvas.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        ...toClientCoords(canvas, point),
        button: 2,
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// Wheel event
// ---------------------------------------------------------------------------

/** Options for a wheel dispatch. */
export interface WheelOptions {
  /** Vertical scroll delta (positive = scroll down). Default: 100 */
  deltaY?: number;
  /** Horizontal scroll delta. Default: 0 */
  deltaX?: number;
  /** DOM_DELTA_PIXEL (0), DOM_DELTA_LINE (1), or DOM_DELTA_PAGE (2). Default: 0 */
  deltaMode?: number;
}

/**
 * Dispatch a wheel event on the canvas at the given screen point.
 *
 * R3F translates the `wheel` DOM event into `onWheel` on the hit object.
 */
export function dispatchWheel(
  canvas: HTMLCanvasElement,
  point: ScreenPoint,
  options: WheelOptions = {},
): void {
  const { deltaY = 100, deltaX = 0, deltaMode = 0 } = options;
  const coords = toClientCoords(canvas, point);

  canvas.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ...coords,
      deltaX,
      deltaY,
      deltaZ: 0,
      deltaMode,
    }),
  );
}

// ---------------------------------------------------------------------------
// Pointer miss (click on empty space)
// ---------------------------------------------------------------------------

/**
 * Dispatch a click on the canvas at a point where no meshes are present.
 *
 * R3F fires `onPointerMissed` on all objects that have that handler when
 * a click lands on empty space. This dispatches a click at a configurable
 * point (default: top-left corner, which is very unlikely to hit a mesh).
 *
 * @param canvas  The canvas element
 * @param point   Optional specific screen point. Default: { x: 1, y: 1 }
 */
export function dispatchPointerMiss(
  canvas: HTMLCanvasElement,
  point: ScreenPoint = { x: 1, y: 1 },
): void {
  dispatchClick(canvas, point);
}

// ---------------------------------------------------------------------------
// Unhover (pointer leave)
// ---------------------------------------------------------------------------

/**
 * Dispatch an unhover sequence — moves the pointer off-canvas.
 * Useful for cleaning up hover state between interactions.
 */
export function dispatchUnhover(canvas: HTMLCanvasElement): void {
  const pointerId = allocPointerId();
  const offScreen: ScreenPoint = { x: -9999, y: -9999 };
  const init = makePointerInit(canvas, offScreen, pointerId, {
    buttons: 0,
    pressure: 0,
  });

  canvas.dispatchEvent(new PointerEvent('pointermove', init));
  canvas.dispatchEvent(new PointerEvent('pointerout', init));
  canvas.dispatchEvent(new PointerEvent('pointerleave', { ...init, bubbles: false }));
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Guard against `releasePointerCapture` throwing when no pointer capture
 * is active. Libraries like @react-three/drei register global pointerup
 * handlers that call `releasePointerCapture`, which throws a `NotFoundError`
 * when the pointer was never captured (as with our synthetic events).
 *
 * This wrapper patches `Element.prototype.releasePointerCapture` for the
 * duration of `fn()` so that the `NotFoundError` is silently swallowed.
 */
function withSafePointerCapture<T>(fn: () => T): T {
  const original = Element.prototype.releasePointerCapture;
  Element.prototype.releasePointerCapture = function safeRelease(
    this: Element,
    pointerId: number,
  ) {
    try {
      original.call(this, pointerId);
    } catch {
      // Swallow NotFoundError — no active pointer with the given id
    }
  };
  try {
    return fn();
  } finally {
    Element.prototype.releasePointerCapture = original;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
