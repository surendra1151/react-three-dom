import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ObjectMetadata, ObjectInspection, SceneSnapshot, SnapshotNode } from './types';
import { waitForSceneReady, waitForIdle, waitForObject } from './waiters';
import type {
  WaitForSceneReadyOptions,
  WaitForIdleOptions,
  WaitForObjectOptions,
} from './waiters';
import * as interactions from './interactions';

// ---------------------------------------------------------------------------
// R3FFixture — the main API object provided to Playwright tests
// ---------------------------------------------------------------------------

/** Options for R3FFixture constructor. */
export interface R3FFixtureOptions {
  /** Auto-enable debug logging (forwards browser [r3f-dom:*] logs to test terminal). */
  debug?: boolean;
}

export class R3FFixture {
  private _debugListenerAttached = false;

  constructor(
    private readonly _page: Page,
    opts?: R3FFixtureOptions,
  ) {
    if (opts?.debug) {
      this._attachDebugListener();
    }
  }

  /** The underlying Playwright Page. */
  get page(): Page {
    return this._page;
  }

  // -----------------------------------------------------------------------
  // Debug logging
  // -----------------------------------------------------------------------

  /**
   * Enable debug logging. Turns on `window.__R3F_DOM_DEBUG__` in the browser
   * and forwards all `[r3f-dom:*]` console messages to the Node.js test terminal.
   *
   * Call before `page.goto()` to capture setup logs, or after to capture
   * interaction logs.
   */
  async enableDebug(): Promise<void> {
    this._attachDebugListener();
    await this._page.evaluate(() => {
      window.__R3F_DOM_DEBUG__ = true;
    });
  }

  private _attachDebugListener(): void {
    if (this._debugListenerAttached) return;
    this._debugListenerAttached = true;
    this._page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith('[r3f-dom:')) {
        console.log(text);
      }
    });
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

  /**
   * Log the scene tree to the test terminal for debugging.
   *
   * Prints a human-readable tree like:
   * ```
   * Scene "root"
   * ├─ Mesh "chair-primary" [testId: chair-primary] visible
   * │  └─ BoxGeometry
   * ├─ DirectionalLight "sun-light" [testId: sun-light] visible
   * └─ Group "furniture"
   *    ├─ Mesh "table-top" [testId: table-top] visible
   *    └─ Mesh "vase" [testId: vase] visible
   * ```
   */
  async logScene(): Promise<void> {
    const snap = await this.snapshot();
    if (!snap) {
      console.log('[r3f-dom] logScene: no scene snapshot available (bridge not ready?)');
      return;
    }
    const lines = formatSceneTree(snap.tree);
    console.log(`\n[r3f-dom] Scene tree (${snap.objectCount} objects):\n${lines}\n`);
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
   * Wait until the bridge is available and an object with the given testId or
   * uuid exists. Use this instead of waitForSceneReady when the scene count
   * never stabilizes (e.g. async model loading, continuous animations).
   */
  async waitForObject(
    idOrUuid: string,
    options?: WaitForObjectOptions,
  ): Promise<void> {
    return waitForObject(this._page, idOrUuid, options);
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
// Scene tree formatter — used by logScene()
// ---------------------------------------------------------------------------

function formatSceneTree(node: SnapshotNode, prefix = '', isLast = true): string {
  const connector = prefix === '' ? '' : isLast ? '└─ ' : '├─ ';
  const childPrefix = prefix === '' ? '' : prefix + (isLast ? '   ' : '│  ');

  // Build the label: "Type "name" [testId: x] visible/hidden"
  let label = node.type;
  if (node.name) label += ` "${node.name}"`;
  if (node.testId) label += ` [testId: ${node.testId}]`;
  label += node.visible ? ' visible' : ' HIDDEN';

  let result = prefix + connector + label + '\n';

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const last = i === node.children.length - 1;
    result += formatSceneTree(child, childPrefix, last);
  }

  return result;
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

/**
 * Create a custom test.extend with debug enabled for all tests:
 *
 * ```typescript
 * import { createR3FTest } from '@react-three-dom/playwright';
 * export const test = createR3FTest({ debug: true });
 * ```
 */
export function createR3FTest(options?: R3FFixtureOptions) {
  return base.extend<{ r3f: R3FFixture }>({
    r3f: async ({ page }, use) => {
      const fixture = new R3FFixture(page, options);
      await use(fixture);
    },
  });
}
