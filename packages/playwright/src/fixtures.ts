import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ObjectMetadata, ObjectInspection, SceneSnapshot } from './types';
import { waitForSceneReady, waitForIdle } from './waiters';
import type { WaitForSceneReadyOptions, WaitForIdleOptions } from './waiters';
import * as interactions from './interactions';

// ---------------------------------------------------------------------------
// R3FFixture — the main API object provided to Playwright tests
// ---------------------------------------------------------------------------

export class R3FFixture {
  constructor(private readonly _page: Page) {}

  /** The underlying Playwright Page. */
  get page(): Page {
    return this._page;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** Get object metadata by testId or uuid. Returns null if not found. */
  async getObject(idOrUuid: string): Promise<ObjectMetadata | null> {
    return this._page.evaluate((id) => {
      const api = window.__R3F_DOM__;
      if (!api) return null;
      return api.getByTestId(id) ?? api.getByUuid(id) ?? null;
    }, idOrUuid);
  }

  /** Get heavy inspection data (Tier 2) by testId or uuid. */
  async inspect(idOrUuid: string): Promise<ObjectInspection | null> {
    return this._page.evaluate((id) => {
      const api = window.__R3F_DOM__;
      if (!api) return null;
      return api.inspect(id);
    }, idOrUuid);
  }

  /** Take a full scene snapshot. */
  async snapshot(): Promise<SceneSnapshot | null> {
    return this._page.evaluate(() => {
      const api = window.__R3F_DOM__;
      return api ? api.snapshot() : null;
    });
  }

  /** Get the total number of tracked objects. */
  async getCount(): Promise<number> {
    return this._page.evaluate(() => {
      const api = window.__R3F_DOM__;
      return api ? api.getCount() : 0;
    });
  }

  // -----------------------------------------------------------------------
  // Interactions
  // -----------------------------------------------------------------------

  /** Click a 3D object by testId or uuid. */
  async click(idOrUuid: string): Promise<void> {
    return interactions.click(this._page, idOrUuid);
  }

  /** Double-click a 3D object by testId or uuid. */
  async doubleClick(idOrUuid: string): Promise<void> {
    return interactions.doubleClick(this._page, idOrUuid);
  }

  /** Right-click / context-menu a 3D object by testId or uuid. */
  async contextMenu(idOrUuid: string): Promise<void> {
    return interactions.contextMenu(this._page, idOrUuid);
  }

  /** Hover over a 3D object by testId or uuid. */
  async hover(idOrUuid: string): Promise<void> {
    return interactions.hover(this._page, idOrUuid);
  }

  /** Drag a 3D object with a world-space delta vector. */
  async drag(
    idOrUuid: string,
    delta: { x: number; y: number; z: number },
  ): Promise<void> {
    return interactions.drag(this._page, idOrUuid, delta);
  }

  /** Dispatch a wheel/scroll event on a 3D object. */
  async wheel(
    idOrUuid: string,
    options?: { deltaY?: number; deltaX?: number },
  ): Promise<void> {
    return interactions.wheel(this._page, idOrUuid, options);
  }

  /** Click empty space to trigger onPointerMissed handlers. */
  async pointerMiss(): Promise<void> {
    return interactions.pointerMiss(this._page);
  }

  // -----------------------------------------------------------------------
  // Waiters
  // -----------------------------------------------------------------------

  /**
   * Wait until the scene is ready — `window.__R3F_DOM__` is available and
   * the object count has stabilised across several consecutive checks.
   */
  async waitForSceneReady(options?: WaitForSceneReadyOptions): Promise<void> {
    return waitForSceneReady(this._page, options);
  }

  /**
   * Wait until no object properties have changed for a number of consecutive
   * animation frames. Useful after triggering interactions or animations.
   */
  async waitForIdle(options?: WaitForIdleOptions): Promise<void> {
    return waitForIdle(this._page, options);
  }

  // -----------------------------------------------------------------------
  // Selection (for inspector integration)
  // -----------------------------------------------------------------------

  /** Select a 3D object by testId or uuid (highlights in scene). */
  async select(idOrUuid: string): Promise<void> {
    await this._page.evaluate((id) => {
      const api = window.__R3F_DOM__;
      if (!api) throw new Error('react-three-dom bridge not found');
      api.select(id);
    }, idOrUuid);
  }

  /** Clear the current selection. */
  async clearSelection(): Promise<void> {
    await this._page.evaluate(() => {
      const api = window.__R3F_DOM__;
      if (api) api.clearSelection();
    });
  }
}

// ---------------------------------------------------------------------------
// test.extend — add the `r3f` fixture to Playwright's test runner
// ---------------------------------------------------------------------------

export const test = base.extend<{ r3f: R3FFixture }>({
  r3f: async ({ page }, use) => {
    const fixture = new R3FFixture(page);
    await use(fixture);
  },
});
