/**
 * @module interactions
 *
 * Playwright interaction helpers — thin wrappers around `page.evaluate` calls
 * to the `window.__R3F_DOM__` bridge interaction methods.
 *
 * All object-targeted interactions auto-wait for:
 *   1. The bridge to be ready (`_ready === true`)
 *   2. The target object to exist (by testId or uuid)
 *
 * This mirrors Playwright's built-in auto-waiting on locators.
 *
 * Multi-canvas: pass `canvasId` to target a specific canvas instance.
 * When undefined, uses the default `window.__R3F_DOM__`.
 */

import type { Page } from '@playwright/test';
import type { CameraState } from './types';

/** Default timeout for auto-waiting (ms). */
const DEFAULT_AUTO_WAIT_TIMEOUT = 5_000;
const AUTO_WAIT_POLL_MS = 100;

/**
 * Resolve the bridge API for a given canvasId.
 * Injected into page.evaluate as a string snippet.
 */
export function resolveApiFn(canvasId?: string): string {
  if (!canvasId) return 'window.__R3F_DOM__';
  return `(window.__R3F_DOM_INSTANCES__ && window.__R3F_DOM_INSTANCES__[${JSON.stringify(canvasId)}])`;
}

/**
 * Auto-wait for bridge readiness AND a specific object to exist.
 * Replaces the old no-op `ensureBridge`. Throws descriptive errors
 * if bridge initialization failed or the object never appears.
 */
async function autoWaitForObject(
  page: Page,
  idOrUuid: string,
  timeout = DEFAULT_AUTO_WAIT_TIMEOUT,
  canvasId?: string,
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const state = await page.evaluate(
      ([id, cid]) => {
        const api = cid
          ? window.__R3F_DOM_INSTANCES__?.[cid]
          : window.__R3F_DOM__;
        if (!api) return { bridge: 'missing' as const };
        if (!api._ready) {
          return {
            bridge: 'not-ready' as const,
            error: api._error ?? null,
          };
        }
        const found = (api.getByTestId(id) ?? api.getByUuid(id)) !== null;
        return { bridge: 'ready' as const, found };
      },
      [idOrUuid, canvasId ?? null] as const,
    );

    if (state.bridge === 'ready' && state.found) {
      return;
    }

    if (state.bridge === 'not-ready' && state.error) {
      throw new Error(
        `[react-three-dom] Bridge initialization failed: ${state.error}\n` +
        `Cannot perform interaction on "${idOrUuid}"${canvasId ? ` (canvas: "${canvasId}")` : ''}.`,
      );
    }

    await page.waitForTimeout(AUTO_WAIT_POLL_MS);
  }

  const finalState = await page.evaluate(
    ([id, cid]) => {
      const api = cid
        ? window.__R3F_DOM_INSTANCES__?.[cid]
        : window.__R3F_DOM__;
      if (!api) return { bridge: false, ready: false, count: 0, error: null, found: false, suggestions: [] as Array<{ testId?: string; name: string; uuid: string }> };
      const suggestions = typeof api.fuzzyFind === 'function'
        ? api.fuzzyFind(id, 5).map((m: { testId?: string; name: string; uuid: string }) => ({ testId: m.testId, name: m.name, uuid: m.uuid }))
        : [];
      return {
        bridge: true,
        ready: api._ready,
        count: api.getCount(),
        error: api._error ?? null,
        found: (api.getByTestId(id) ?? api.getByUuid(id)) !== null,
        suggestions,
      };
    },
    [idOrUuid, canvasId ?? null] as const,
  );

  if (!finalState.bridge) {
    throw new Error(
      `[react-three-dom] Auto-wait timed out after ${timeout}ms: bridge not found${canvasId ? ` (canvas: "${canvasId}")` : ''}.\n` +
      `Ensure <ThreeDom${canvasId ? ` canvasId="${canvasId}"` : ''}> is mounted inside your <Canvas> component.`,
    );
  }

  let msg =
    `[react-three-dom] Auto-wait timed out after ${timeout}ms: object "${idOrUuid}" not found${canvasId ? ` (canvas: "${canvasId}")` : ''}.\n` +
    `Bridge: ready=${finalState.ready}, objectCount=${finalState.count}` +
    (finalState.error ? `, error=${finalState.error}` : '') + '.\n' +
    `Ensure the object has userData.testId="${idOrUuid}" or uuid="${idOrUuid}".`;

  if (finalState.suggestions.length > 0) {
    msg += '\nDid you mean:\n' +
      finalState.suggestions.map((s: { testId?: string; name: string; uuid: string }) => {
        const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
        return `  → ${s.name || '(unnamed)'} [${id}]`;
      }).join('\n');
  }

  throw new Error(msg);
}

/**
 * Auto-wait for bridge readiness only (no specific object).
 * Used by non-object interactions like pointerMiss and drawPath.
 */
async function autoWaitForBridge(
  page: Page,
  timeout = DEFAULT_AUTO_WAIT_TIMEOUT,
  canvasId?: string,
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const state = await page.evaluate((cid) => {
      const api = cid
        ? window.__R3F_DOM_INSTANCES__?.[cid]
        : window.__R3F_DOM__;
      if (!api) return { exists: false as const };
      return {
        exists: true as const,
        ready: api._ready,
        error: api._error ?? null,
      };
    }, canvasId ?? null);

    if (state.exists && state.ready) return;

    if (state.exists && !state.ready && state.error) {
      throw new Error(
        `[react-three-dom] Bridge initialization failed: ${state.error}`,
      );
    }

    await page.waitForTimeout(AUTO_WAIT_POLL_MS);
  }

  throw new Error(
    `[react-three-dom] Auto-wait timed out after ${timeout}ms: bridge not ready${canvasId ? ` (canvas: "${canvasId}")` : ''}.\n` +
    `Ensure <ThreeDom${canvasId ? ` canvasId="${canvasId}"` : ''}> is mounted inside your <Canvas> component.`,
  );
}

// ---------------------------------------------------------------------------
// Object-targeted interactions (auto-wait for object)
// ---------------------------------------------------------------------------

/** Click a 3D object by its testId or uuid. Auto-waits for the object. */
export async function click(page: Page, idOrUuid: string, timeout?: number, canvasId?: string): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout, canvasId);
  await page.evaluate(([id, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
    api.click(id);
  }, [idOrUuid, canvasId ?? null] as const);
}

/** Double-click a 3D object by its testId or uuid. Auto-waits for the object. */
export async function doubleClick(page: Page, idOrUuid: string, timeout?: number, canvasId?: string): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout, canvasId);
  await page.evaluate(([id, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
    api.doubleClick(id);
  }, [idOrUuid, canvasId ?? null] as const);
}

/** Right-click / context-menu a 3D object. Auto-waits for the object. */
export async function contextMenu(page: Page, idOrUuid: string, timeout?: number, canvasId?: string): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout, canvasId);
  await page.evaluate(([id, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
    api.contextMenu(id);
  }, [idOrUuid, canvasId ?? null] as const);
}

/** Hover over a 3D object. Auto-waits for the object. */
export async function hover(page: Page, idOrUuid: string, timeout?: number, canvasId?: string): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout, canvasId);
  await page.evaluate(([id, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
    api.hover(id);
  }, [idOrUuid, canvasId ?? null] as const);
}

/** Unhover / pointer-leave — resets hover state by moving pointer off-canvas. Auto-waits for bridge. */
export async function unhover(page: Page, timeout?: number, canvasId?: string): Promise<void> {
  await autoWaitForBridge(page, timeout, canvasId);
  await page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
    api.unhover();
  }, canvasId ?? null);
}

/** Drag a 3D object with a world-space delta. Auto-waits for the object. */
export async function drag(
  page: Page,
  idOrUuid: string,
  delta: { x: number; y: number; z: number },
  timeout?: number,
  canvasId?: string,
): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout, canvasId);
  await page.evaluate(
    async ([id, d, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
      await api.drag(id, d);
    },
    [idOrUuid, delta, canvasId ?? null] as const,
  );
}

/** Dispatch a wheel/scroll event on a 3D object. Auto-waits for the object. */
export async function wheel(
  page: Page,
  idOrUuid: string,
  options?: { deltaY?: number; deltaX?: number },
  timeout?: number,
  canvasId?: string,
): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout, canvasId);
  await page.evaluate(
    ([id, opts, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
      api.wheel(id, opts);
    },
    [idOrUuid, options, canvasId ?? null] as const,
  );
}

// ---------------------------------------------------------------------------
// Non-object interactions (auto-wait for bridge only)
// ---------------------------------------------------------------------------

/** Click empty space to trigger onPointerMissed handlers. Auto-waits for bridge. */
export async function pointerMiss(page: Page, timeout?: number, canvasId?: string): Promise<void> {
  await autoWaitForBridge(page, timeout, canvasId);
  await page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
    api.pointerMiss();
  }, canvasId ?? null);
}

/** Draw a freeform path on the canvas. Auto-waits for bridge. */
export async function drawPathOnCanvas(
  page: Page,
  points: Array<{ x: number; y: number; pressure?: number }>,
  options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
  timeout?: number,
  canvasId?: string,
): Promise<{ eventCount: number; pointCount: number }> {
  await autoWaitForBridge(page, timeout, canvasId);
  return page.evaluate(
    async ([pts, opts, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
      return api.drawPath(pts, opts ?? undefined);
    },
    [points, options ?? null, canvasId ?? null] as const,
  );
}

// ---------------------------------------------------------------------------
// Camera state
// ---------------------------------------------------------------------------

/** Get the current camera state (position, rotation, fov, near, far, zoom). Auto-waits for bridge. */
export async function getCameraState(page: Page, timeout?: number, canvasId?: string): Promise<CameraState> {
  await autoWaitForBridge(page, timeout, canvasId);
  return page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__![cid] : window.__R3F_DOM__!;
    return api.getCameraState();
  }, canvasId ?? null);
}
