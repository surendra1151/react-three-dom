/**
 * @module fixtures
 *
 * Playwright test fixture for react-three-dom. Provides the `R3FFixture` class
 * that exposes queries, interactions, waiters, snapshot diffing, and diagnostic
 * reporting against a live Three.js scene via the `window.__R3F_DOM__` bridge.
 *
 * Usage: import `test` (or `createR3FTest`) and destructure `{ r3f }` in your
 * test callbacks to get a pre-configured fixture bound to the current page.
 */

import { test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { ObjectMetadata, ObjectInspection, SceneSnapshot, SnapshotNode } from './types';
import { diffSnapshots as diffSnapshotsHelper } from './diffSnapshots';
import type { SceneDiff } from './diffSnapshots';
import { waitForSceneReady, waitForIdle, waitForObject, waitForNewObject, waitForObjectRemoved } from './waiters';
import type { WaitForNewObjectOptions, WaitForNewObjectResult } from './waiters';
import type {
  WaitForSceneReadyOptions,
  WaitForIdleOptions,
  WaitForObjectOptions,
  WaitForObjectRemovedOptions,
} from './waiters';
import * as interactions from './interactions';
import { R3FReporter } from './reporter';

// ---------------------------------------------------------------------------
// R3FFixture — the main API object provided to Playwright tests
// ---------------------------------------------------------------------------

/** Options for R3FFixture constructor. */
export interface R3FFixtureOptions {
  /** Auto-enable debug logging (forwards browser [r3f-dom:*] logs to test terminal). */
  debug?: boolean;
  /**
   * Enable rich diagnostic reporting in the terminal.
   * Logs bridge status, scene readiness, interaction details, and
   * failure context automatically. Default: true.
   */
  report?: boolean;
  /** Target a specific canvas by its canvasId. When omitted, uses the default bridge. */
  canvasId?: string;
}

/**
 * Main API object provided to Playwright tests for interacting with a
 * react-three-dom scene. Wraps queries, interactions, waiters, snapshot
 * diffing, and rich terminal diagnostics. Supports multi-canvas apps
 * via {@link R3FFixture.forCanvas}.
 */
export class R3FFixture {
  private _debugListenerAttached = false;
  private readonly _reporter: R3FReporter;
  /** Canvas ID for multi-canvas apps. Undefined = default bridge. */
  readonly canvasId?: string;

  constructor(
    private readonly _page: Page,
    opts?: R3FFixtureOptions,
  ) {
    this.canvasId = opts?.canvasId;
    this._reporter = new R3FReporter(_page, opts?.report !== false, this.canvasId);
    if (opts?.debug) {
      this._attachDebugListener();
    }
  }

  /** The underlying Playwright Page. */
  get page(): Page {
    return this._page;
  }

  /** Access the reporter for custom diagnostic logging. */
  get reporter(): R3FReporter {
    return this._reporter;
  }

  /**
   * Create a scoped fixture targeting a specific canvas instance.
   * All queries, interactions, and assertions on the returned fixture
   * will use `window.__R3F_DOM_INSTANCES__[canvasId]` instead of
   * `window.__R3F_DOM__`.
   *
   * @example
   * ```typescript
   * const mainR3f = r3f.forCanvas('main-viewport');
   * const minimapR3f = r3f.forCanvas('minimap');
   * await mainR3f.click('building-42');
   * await expect(minimapR3f).toExist('building-42-marker');
   * ```
   */
  forCanvas(canvasId: string): R3FFixture {
    return new R3FFixture(this._page, {
      canvasId,
      report: this._reporter !== null,
    });
  }

  /**
   * List all active canvas IDs registered on the page.
   * Returns an empty array if only the default (unnamed) bridge is active.
   */
  async getCanvasIds(): Promise<string[]> {
    return this._page.evaluate(() => {
      const instances = window.__R3F_DOM_INSTANCES__;
      return instances ? Object.keys(instances) : [];
    });
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
    return this._page.evaluate(([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api) return null;
      return api.getByTestId(id) ?? api.getByUuid(id) ?? null;
    }, [idOrUuid, this.canvasId ?? null] as const);
  }

  /** Get object metadata by testId (userData.testId). Returns null if not found. */
  async getByTestId(testId: string): Promise<ObjectMetadata | null> {
    return this._page.evaluate(([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getByTestId(id) : null;
    }, [testId, this.canvasId ?? null] as const);
  }

  /** Get object metadata by UUID. Returns null if not found. */
  async getByUuid(uuid: string): Promise<ObjectMetadata | null> {
    return this._page.evaluate(([u, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getByUuid(u) : null;
    }, [uuid, this.canvasId ?? null] as const);
  }

  /** Get all objects with the given name (names are not unique in Three.js). */
  async getByName(name: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate(([n, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getByName(n) : [];
    }, [name, this.canvasId ?? null] as const);
  }

  /** Get direct children of an object by testId or uuid. */
  async getChildren(idOrUuid: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate(([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getChildren(id) : [];
    }, [idOrUuid, this.canvasId ?? null] as const);
  }

  /** Get parent of an object by testId or uuid. Returns null if root or not found. */
  async getParent(idOrUuid: string): Promise<ObjectMetadata | null> {
    return this._page.evaluate(([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getParent(id) : null;
    }, [idOrUuid, this.canvasId ?? null] as const);
  }

  /** Get heavy inspection data (Tier 2) by testId or uuid. Pass { includeGeometryData: true } to include vertex positions and triangle indices. */
  async inspect(idOrUuid: string, options?: { includeGeometryData?: boolean }): Promise<ObjectInspection | null> {
    return this._page.evaluate(
      ({ id, opts, cid }: { id: string; opts?: { includeGeometryData?: boolean }; cid: string | null }) => {
        const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
        if (!api) return null;
        return api.inspect(id, opts);
      },
      { id: idOrUuid, opts: options, cid: this.canvasId ?? null },
    );
  }

  /**
   * Get world-space position [x, y, z] of an object (from its world matrix).
   * Use for nested objects where local position differs from world position.
   */
  async getWorldPosition(idOrUuid: string): Promise<[number, number, number] | null> {
    return this._page.evaluate(([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api) return null;
      const insp = api.inspect(id);
      if (!insp?.worldMatrix || insp.worldMatrix.length < 15) return null;
      const m = insp.worldMatrix;
      return [m[12], m[13], m[14]];
    }, [idOrUuid, this.canvasId ?? null] as const);
  }

  /** Take a full scene snapshot. */
  async snapshot(): Promise<SceneSnapshot | null> {
    return this._page.evaluate((cid) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.snapshot() : null;
    }, this.canvasId ?? null);
  }

  /**
   * Compare two scene snapshots: returns added nodes, removed nodes, and
   * property changes (name, type, testId, visible, position, rotation, scale).
   * Use after taking snapshots before/after an action to assert on scene changes.
   */
  diffSnapshots(before: SceneSnapshot, after: SceneSnapshot): SceneDiff {
    return diffSnapshotsHelper(before, after);
  }

  /**
   * Run an async action and return how many objects were added and removed
   * compared to before the action. Uses snapshots before/after so add and
   * remove are both counted correctly when both happen.
   */
  async trackObjectCount(action: () => Promise<void>): Promise<{ added: number; removed: number }> {
    const before = await this.snapshot();
    if (!before) throw new Error('trackObjectCount: no snapshot before (bridge not ready?)');
    await action();
    const after = await this.snapshot();
    if (!after) throw new Error('trackObjectCount: no snapshot after (bridge not ready?)');
    const diff = diffSnapshotsHelper(before, after);
    return { added: diff.added.length, removed: diff.removed.length };
  }

  /** Get the total number of tracked objects. */
  async getCount(): Promise<number> {
    return this._page.evaluate((cid) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getCount() : 0;
    }, this.canvasId ?? null);
  }

  /**
   * Return a Playwright locator for the R3F canvas element the bridge is attached to.
   * The canvas has `data-r3f-canvas` set by the bridge (value is the canvasId or "true").
   */
  getCanvasLocator(): Locator {
    if (this.canvasId) {
      return this._page.locator(`[data-r3f-canvas="${this.canvasId}"]`);
    }
    return this._page.locator('[data-r3f-canvas]');
  }

  /**
   * Get all objects of a given Three.js type (e.g. "Mesh", "Group", "Line").
   */
  async getByType(type: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate(([t, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getByType(t) : [];
    }, [type, this.canvasId ?? null] as const);
  }

  /**
   * Get all objects with a given geometry type (e.g. "BoxGeometry", "BufferGeometry").
   */
  async getByGeometryType(type: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate(([t, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getByGeometryType(t) : [];
    }, [type, this.canvasId ?? null] as const);
  }

  /**
   * Get all objects with a given material type (e.g. "MeshStandardMaterial").
   */
  async getByMaterialType(type: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate(([t, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getByMaterialType(t) : [];
    }, [type, this.canvasId ?? null] as const);
  }

  /**
   * Get objects that have a specific userData key (and optionally matching value).
   */
  async getByUserData(key: string, value?: unknown): Promise<ObjectMetadata[]> {
    return this._page.evaluate(({ k, v, cid }) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getByUserData(k, v) : [];
    }, { k: key, v: value, cid: this.canvasId ?? null });
  }

  /**
   * Count objects of a given Three.js type.
   */
  async getCountByType(type: string): Promise<number> {
    return this._page.evaluate(([t, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api ? api.getCountByType(t) : 0;
    }, [type, this.canvasId ?? null] as const);
  }

  /**
   * Batch lookup: get metadata for multiple objects by testId or uuid in a
   * single browser round-trip.
   */
  async getObjects(ids: string[]): Promise<Record<string, ObjectMetadata | null>> {
    return this._page.evaluate(([idList, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api) {
        const result: Record<string, null> = {};
        for (const id of idList) result[id] = null;
        return result;
      }
      return api.getObjects(idList);
    }, [ids, this.canvasId ?? null] as const);
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
    return interactions.click(this._page, idOrUuid, timeout, this.canvasId);
  }

  /**
   * Double-click a 3D object by testId or uuid.
   * Auto-waits for the object to exist.
   */
  async doubleClick(idOrUuid: string, timeout?: number): Promise<void> {
    return interactions.doubleClick(this._page, idOrUuid, timeout, this.canvasId);
  }

  /**
   * Right-click / context-menu a 3D object by testId or uuid.
   * Auto-waits for the object to exist.
   */
  async contextMenu(idOrUuid: string, timeout?: number): Promise<void> {
    return interactions.contextMenu(this._page, idOrUuid, timeout, this.canvasId);
  }

  /**
   * Hover over a 3D object by testId or uuid.
   * Auto-waits for the object to exist.
   */
  async hover(idOrUuid: string, timeout?: number): Promise<void> {
    return interactions.hover(this._page, idOrUuid, timeout, this.canvasId);
  }

  /**
   * Unhover / pointer-leave — resets hover state by moving pointer off-canvas.
   * Auto-waits for the bridge to be ready.
   */
  async unhover(timeout?: number): Promise<void> {
    return interactions.unhover(this._page, timeout, this.canvasId);
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
    return interactions.drag(this._page, idOrUuid, delta, timeout, this.canvasId);
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
    return interactions.wheel(this._page, idOrUuid, options, timeout, this.canvasId);
  }

  /**
   * Click empty space to trigger onPointerMissed handlers.
   * Auto-waits for the bridge to be ready.
   */
  async pointerMiss(timeout?: number): Promise<void> {
    return interactions.pointerMiss(this._page, timeout, this.canvasId);
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
    return interactions.drawPathOnCanvas(this._page, points, options, timeout, this.canvasId);
  }

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  /**
   * Get the current camera state (position, rotation, fov, near, far, zoom, target).
   * Auto-waits for the bridge to be ready.
   */
  async getCameraState(timeout?: number) {
    return interactions.getCameraState(this._page, timeout, this.canvasId);
  }

  // -----------------------------------------------------------------------
  // Waiters
  // -----------------------------------------------------------------------

  /**
   * Wait until the scene is ready — `window.__R3F_DOM__` is available and
   * the object count has stabilised across several consecutive checks.
   * Logs bridge connection and scene readiness to the terminal.
   */
  async waitForSceneReady(options?: WaitForSceneReadyOptions): Promise<void> {
    this._reporter.logBridgeWaiting();
    try {
      await waitForSceneReady(this._page, { ...options, canvasId: this.canvasId });
      const diag = await this._reporter.fetchDiagnostics();
      if (diag) {
        this._reporter.logBridgeConnected(diag);
        this._reporter.logSceneReady(diag.objectCount);
      }
    } catch (e) {
      const diag = await this._reporter.fetchDiagnostics();
      if (diag?.error) this._reporter.logBridgeError(diag.error);
      throw e;
    }
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
    this._reporter.logBridgeWaiting();
    try {
      await waitForObject(this._page, idOrUuid, { ...options, canvasId: this.canvasId });
      const meta = await this.getObject(idOrUuid);
      if (meta) {
        this._reporter.logObjectFound(idOrUuid, meta.type, meta.name || undefined);
      }
    } catch (e) {
      const suggestions = await this._reporter.fetchFuzzyMatches(idOrUuid);
      this._reporter.logObjectNotFound(idOrUuid, suggestions);
      throw e;
    }
  }

  /**
   * Wait until no object properties have changed for a number of consecutive
   * animation frames. Useful after triggering interactions or animations.
   */
  async waitForIdle(options?: WaitForIdleOptions): Promise<void> {
    return waitForIdle(this._page, { ...options, canvasId: this.canvasId });
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
    return waitForNewObject(this._page, { ...options, canvasId: this.canvasId });
  }

  /**
   * Wait until an object (by testId or uuid) is no longer in the scene.
   * Use for delete flows: trigger removal, then wait until the object is gone.
   */
  async waitForObjectRemoved(
    idOrUuid: string,
    options?: WaitForObjectRemovedOptions,
  ): Promise<void> {
    return waitForObjectRemoved(this._page, idOrUuid, { ...options, canvasId: this.canvasId });
  }

  // -----------------------------------------------------------------------
  // Selection (for inspector integration)
  // -----------------------------------------------------------------------

  /** Select a 3D object by testId or uuid (highlights in scene). */
  async select(idOrUuid: string): Promise<void> {
    await this._page.evaluate(([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api) throw new Error('react-three-dom bridge not found');
      api.select(id);
    }, [idOrUuid, this.canvasId ?? null] as const);
  }

  /** Clear the current selection. */
  async clearSelection(): Promise<void> {
    await this._page.evaluate((cid) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (api) api.clearSelection();
    }, this.canvasId ?? null);
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  /**
   * Fetch full bridge diagnostics (version, object counts, GPU info, etc.).
   * Returns null if the bridge is not available.
   */
  async getDiagnostics(): Promise<import('./reporter').BridgeDiagnostics | null> {
    return this._reporter.fetchDiagnostics();
  }

  /**
   * Print a full diagnostics report to the terminal.
   * Useful at the start of a test suite or when debugging failures.
   */
  async logDiagnostics(): Promise<void> {
    return this._reporter.logDiagnostics();
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
