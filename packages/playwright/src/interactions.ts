import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Interaction helpers — thin wrappers around page.evaluate calls to
// window.__R3F_DOM__ interaction methods.
// ---------------------------------------------------------------------------

function ensureBridge(page: Page): Page {
  // The bridge is guaranteed to exist after waitForSceneReady.
  // If users skip that, the evaluate calls will throw a clear error.
  return page;
}

/** Click a 3D object by its testId or uuid. */
export async function click(page: Page, idOrUuid: string): Promise<void> {
  ensureBridge(page);
  await page.evaluate((id) => {
    const api = window.__R3F_DOM__;
    if (!api) throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
    api.click(id);
  }, idOrUuid);
}

/** Double-click a 3D object by its testId or uuid. */
export async function doubleClick(page: Page, idOrUuid: string): Promise<void> {
  ensureBridge(page);
  await page.evaluate((id) => {
    const api = window.__R3F_DOM__;
    if (!api) throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
    api.doubleClick(id);
  }, idOrUuid);
}

/** Right-click / context-menu a 3D object by its testId or uuid. */
export async function contextMenu(page: Page, idOrUuid: string): Promise<void> {
  ensureBridge(page);
  await page.evaluate((id) => {
    const api = window.__R3F_DOM__;
    if (!api) throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
    api.contextMenu(id);
  }, idOrUuid);
}

/** Hover over a 3D object by its testId or uuid. */
export async function hover(page: Page, idOrUuid: string): Promise<void> {
  ensureBridge(page);
  await page.evaluate((id) => {
    const api = window.__R3F_DOM__;
    if (!api) throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
    api.hover(id);
  }, idOrUuid);
}

/** Drag a 3D object by its testId or uuid with a given world-space delta. */
export async function drag(
  page: Page,
  idOrUuid: string,
  delta: { x: number; y: number; z: number },
): Promise<void> {
  ensureBridge(page);
  await page.evaluate(
    ([id, d]) => {
      const api = window.__R3F_DOM__;
      if (!api) throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
      api.drag(id, d);
    },
    [idOrUuid, delta] as const,
  );
}

/** Dispatch a wheel/scroll event on a 3D object. */
export async function wheel(
  page: Page,
  idOrUuid: string,
  options?: { deltaY?: number; deltaX?: number },
): Promise<void> {
  ensureBridge(page);
  await page.evaluate(
    ([id, opts]) => {
      const api = window.__R3F_DOM__;
      if (!api) throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
      api.wheel(id, opts);
    },
    [idOrUuid, options] as const,
  );
}

/** Click empty space to trigger onPointerMissed handlers. */
export async function pointerMiss(page: Page): Promise<void> {
  ensureBridge(page);
  await page.evaluate(() => {
    const api = window.__R3F_DOM__;
    if (!api) throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
    api.pointerMiss();
  });
}
