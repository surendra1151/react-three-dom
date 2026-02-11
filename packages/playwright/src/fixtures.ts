import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ObjectMetadata, ObjectInspection, SceneSnapshot, SnapshotNode } from './types';
import { waitForSceneReady, waitForIdle, waitForObject, waitForNewObject } from './waiters';
import type { WaitForNewObjectOptions, WaitForNewObjectResult } from './waiters';
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
   * Get all objects of a given Three.js type (e.g. "Mesh", "Group", "Line").
   * Useful for BIM/CAD apps to find all walls, doors, etc. by object type.
   */
  async getByType(type: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate((t) => {
      const api = window.__R3F_DOM__;
      return api ? api.getByType(t) : [];
    }, type);
  }

  /**
   * Get objects that have a specific userData key (and optionally matching value).
   * Useful for BIM/CAD apps where objects are tagged with metadata like
   * `userData.category = "wall"` or `userData.floorId = 2`.
   */
  async getByUserData(key: string, value?: unknown): Promise<ObjectMetadata[]> {
    return this._page.evaluate(({ k, v }) => {
      const api = window.__R3F_DOM__;
      return api ? api.getByUserData(k, v) : [];
    }, { k: key, v: value });
  }

  /**
   * Count objects of a given Three.js type.
   * More efficient than `getByType(type).then(arr => arr.length)`.
   */
  async getCountByType(type: string): Promise<number> {
    return this._page.evaluate((t) => {
      const api = window.__R3F_DOM__;
      return api ? api.getCountByType(t) : 0;
    }, type);
  }

  /**
   * Batch lookup: get metadata for multiple objects by testId or uuid in a
   * single browser round-trip. Returns a record from id to metadata (or null).
   *
   * Much more efficient than calling `getObject()` in a loop for BIM/CAD
   * scenes with many objects.
   *
   * @example
   * ```typescript
   * const results = await r3f.getObjects(['wall-1', 'door-2', 'window-3']);
   * expect(results['wall-1']).not.toBeNull();
   * expect(results['door-2']?.type).toBe('Mesh');
   * ```
   */
  async getObjects(ids: string[]): Promise<Record<string, ObjectMetadata | null>> {
    return this._page.evaluate((idList) => {
      const api = window.__R3F_DOM__;
      if (!api) {
        const result: Record<string, null> = {};
        for (const id of idList) result[id] = null;
        return result;
      }
      return api.getObjects(idList);
    }, ids);
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

  /**
   * Click a 3D object by testId or uuid.
   * Auto-waits for the bridge and the object to exist before clicking.
   * @param timeout  Optional auto-wait timeout in ms. Default: 5000
   */
  async click(idOrUuid: string, timeout?: number): Promise<void> {
    return interactions.click(this._page, idOrUuid, timeout);
  }

  /**
   * Double-click a 3D object by testId or uuid.
   * Auto-waits for the object to exist.
   */
  async doubleClick(idOrUuid: string, timeout?: number): Promise<void> {
    return interactions.doubleClick(this._page, idOrUuid, timeout);
  }

  /**
   * Right-click / context-menu a 3D object by testId or uuid.
   * Auto-waits for the object to exist.
   */
  async contextMenu(idOrUuid: string, timeout?: number): Promise<void> {
    return interactions.contextMenu(this._page, idOrUuid, timeout);
  }

  /**
   * Hover over a 3D object by testId or uuid.
   * Auto-waits for the object to exist.
   */
  async hover(idOrUuid: string, timeout?: number): Promise<void> {
    return interactions.hover(this._page, idOrUuid, timeout);
  }

  /**
   * Drag a 3D object with a world-space delta vector.
   * Auto-waits for the object to exist.
   */
  async drag(
    idOrUuid: string,
    delta: { x: number; y: number; z: number },
    timeout?: number,
  ): Promise<void> {
    return interactions.drag(this._page, idOrUuid, delta, timeout);
  }

  /**
   * Dispatch a wheel/scroll event on a 3D object.
   * Auto-waits for the object to exist.
   */
  async wheel(
    idOrUuid: string,
    options?: { deltaY?: number; deltaX?: number },
    timeout?: number,
  ): Promise<void> {
    return interactions.wheel(this._page, idOrUuid, options, timeout);
  }

  /**
   * Click empty space to trigger onPointerMissed handlers.
   * Auto-waits for the bridge to be ready.
   */
  async pointerMiss(timeout?: number): Promise<void> {
    return interactions.pointerMiss(this._page, timeout);
  }

  /**
   * Draw a freeform path on the canvas. Dispatches pointerdown → N × pointermove → pointerup.
   * Designed for canvas drawing/annotation/whiteboard apps.
   * Auto-waits for the bridge to be ready.
   *
   * @param points  Array of screen-space points (min 2). { x, y } in CSS pixels relative to canvas.
   * @param options Drawing options (stepDelayMs, pointerType, clickAtEnd)
   * @param timeout Optional auto-wait timeout in ms. Default: 5000
   * @returns       { eventCount, pointCount }
   */
  async drawPath(
    points: Array<{ x: number; y: number; pressure?: number }>,
    options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
    timeout?: number,
  ): Promise<{ eventCount: number; pointCount: number }> {
    return interactions.drawPathOnCanvas(this._page, points, options, timeout);
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

  /**
   * Wait until one or more new objects appear in the scene that were not
   * present when this call was made. Perfect for drawing apps where
   * `drawPath()` creates new geometry asynchronously.
   *
   * @param options  Filter by type, nameContains, timeout, pollInterval
   * @returns        Metadata of the newly added object(s)
   */
  async waitForNewObject(options?: WaitForNewObjectOptions): Promise<WaitForNewObjectResult> {
    return waitForNewObject(this._page, options);
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
