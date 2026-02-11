import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Interaction helpers — thin wrappers around page.evaluate calls to
// window.__R3F_DOM__ interaction methods.
//
// All object-targeted interactions auto-wait for:
//   1. The bridge to be ready (_ready === true)
//   2. The target object to exist (by testId or uuid)
// This mirrors Playwright's built-in auto-waiting on locators.
// ---------------------------------------------------------------------------

/** Default timeout for auto-waiting (ms). */
const DEFAULT_AUTO_WAIT_TIMEOUT = 5_000;
const AUTO_WAIT_POLL_MS = 100;

/**
 * Auto-wait for bridge readiness AND a specific object to exist.
 * Replaces the old no-op `ensureBridge`. Throws descriptive errors
 * if bridge initialization failed or the object never appears.
 */
async function autoWaitForObject(
  page: Page,
  idOrUuid: string,
  timeout = DEFAULT_AUTO_WAIT_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const state = await page.evaluate(
      (id) => {
        const api = window.__R3F_DOM__;
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
      idOrUuid,
    );

    if (state.bridge === 'ready' && state.found) {
      return; // Good to go
    }

    if (state.bridge === 'not-ready' && state.error) {
      throw new Error(
        `[react-three-dom] Bridge initialization failed: ${state.error}\n` +
        `Cannot perform interaction on "${idOrUuid}".`,
      );
    }

    await page.waitForTimeout(AUTO_WAIT_POLL_MS);
  }

  // Final diagnostic
  const finalState = await page.evaluate(
    (id) => {
      const api = window.__R3F_DOM__;
      if (!api) return { bridge: false, ready: false, count: 0, error: null, found: false };
      return {
        bridge: true,
        ready: api._ready,
        count: api.getCount(),
        error: api._error ?? null,
        found: (api.getByTestId(id) ?? api.getByUuid(id)) !== null,
      };
    },
    idOrUuid,
  );

  if (!finalState.bridge) {
    throw new Error(
      `[react-three-dom] Auto-wait timed out after ${timeout}ms: bridge not found.\n` +
      `Ensure <ThreeDom> is mounted inside your <Canvas> component.`,
    );
  }

  throw new Error(
    `[react-three-dom] Auto-wait timed out after ${timeout}ms: object "${idOrUuid}" not found.\n` +
    `Bridge: ready=${finalState.ready}, objectCount=${finalState.count}` +
    (finalState.error ? `, error=${finalState.error}` : '') + '.\n' +
    `Ensure the object has userData.testId="${idOrUuid}" or uuid="${idOrUuid}".`,
  );
}

/**
 * Auto-wait for bridge readiness only (no specific object).
 * Used by non-object interactions like pointerMiss and drawPath.
 */
async function autoWaitForBridge(
  page: Page,
  timeout = DEFAULT_AUTO_WAIT_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const api = window.__R3F_DOM__;
      if (!api) return { exists: false as const };
      return {
        exists: true as const,
        ready: api._ready,
        error: api._error ?? null,
      };
    });

    if (state.exists && state.ready) return;

    if (state.exists && !state.ready && state.error) {
      throw new Error(
        `[react-three-dom] Bridge initialization failed: ${state.error}`,
      );
    }

    await page.waitForTimeout(AUTO_WAIT_POLL_MS);
  }

  throw new Error(
    `[react-three-dom] Auto-wait timed out after ${timeout}ms: bridge not ready.\n` +
    `Ensure <ThreeDom> is mounted inside your <Canvas> component.`,
  );
}

// ---------------------------------------------------------------------------
// Object-targeted interactions (auto-wait for object)
// ---------------------------------------------------------------------------

/** Click a 3D object by its testId or uuid. Auto-waits for the object. */
export async function click(page: Page, idOrUuid: string, timeout?: number): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout);
  await page.evaluate((id) => {
    window.__R3F_DOM__!.click(id);
  }, idOrUuid);
}

/** Double-click a 3D object by its testId or uuid. Auto-waits for the object. */
export async function doubleClick(page: Page, idOrUuid: string, timeout?: number): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout);
  await page.evaluate((id) => {
    window.__R3F_DOM__!.doubleClick(id);
  }, idOrUuid);
}

/** Right-click / context-menu a 3D object. Auto-waits for the object. */
export async function contextMenu(page: Page, idOrUuid: string, timeout?: number): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout);
  await page.evaluate((id) => {
    window.__R3F_DOM__!.contextMenu(id);
  }, idOrUuid);
}

/** Hover over a 3D object. Auto-waits for the object. */
export async function hover(page: Page, idOrUuid: string, timeout?: number): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout);
  await page.evaluate((id) => {
    window.__R3F_DOM__!.hover(id);
  }, idOrUuid);
}

/** Drag a 3D object with a world-space delta. Auto-waits for the object. */
export async function drag(
  page: Page,
  idOrUuid: string,
  delta: { x: number; y: number; z: number },
  timeout?: number,
): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout);
  await page.evaluate(
    async ([id, d]) => {
      await window.__R3F_DOM__!.drag(id, d);
    },
    [idOrUuid, delta] as const,
  );
}

/** Dispatch a wheel/scroll event on a 3D object. Auto-waits for the object. */
export async function wheel(
  page: Page,
  idOrUuid: string,
  options?: { deltaY?: number; deltaX?: number },
  timeout?: number,
): Promise<void> {
  await autoWaitForObject(page, idOrUuid, timeout);
  await page.evaluate(
    ([id, opts]) => {
      window.__R3F_DOM__!.wheel(id, opts);
    },
    [idOrUuid, options] as const,
  );
}

// ---------------------------------------------------------------------------
// Non-object interactions (auto-wait for bridge only)
// ---------------------------------------------------------------------------

/** Click empty space to trigger onPointerMissed handlers. Auto-waits for bridge. */
export async function pointerMiss(page: Page, timeout?: number): Promise<void> {
  await autoWaitForBridge(page, timeout);
  await page.evaluate(() => {
    window.__R3F_DOM__!.pointerMiss();
  });
}

/** Draw a freeform path on the canvas. Auto-waits for bridge. */
export async function drawPathOnCanvas(
  page: Page,
  points: Array<{ x: number; y: number; pressure?: number }>,
  options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
  timeout?: number,
): Promise<{ eventCount: number; pointCount: number }> {
  await autoWaitForBridge(page, timeout);
  return page.evaluate(
    async ([pts, opts]) => {
      return window.__R3F_DOM__!.drawPath(pts, opts ?? undefined);
    },
    [points, options ?? null] as const,
  );
}
