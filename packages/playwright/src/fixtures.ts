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

  /** Get object metadata by testId (userData.testId). Returns null if not found. */
  async getByTestId(testId: string): Promise<ObjectMetadata | null> {
    return this._page.evaluate((id) => {
      const api = window.__R3F_DOM__;
      return api ? api.getByTestId(id) : null;
    }, testId);
  }

  /** Get object metadata by UUID. Returns null if not found. */
  async getByUuid(uuid: string): Promise<ObjectMetadata | null> {
    return this._page.evaluate((u) => {
      const api = window.__R3F_DOM__;
      return api ? api.getByUuid(u) : null;
    }, uuid);
  }

  /** Get all objects with the given name (names are not unique in Three.js). */
  async getByName(name: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate((n) => {
      const api = window.__R3F_DOM__;
      return api ? api.getByName(n) : [];
    }, name);
  }

  /** Get direct children of an object by testId or uuid. */
  async getChildren(idOrUuid: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate((id) => {
      const api = window.__R3F_DOM__;
      return api ? api.getChildren(id) : [];
    }, idOrUuid);
  }

  /** Get parent of an object by testId or uuid. Returns null if root or not found. */
  async getParent(idOrUuid: string): Promise<ObjectMetadata | null> {
    return this._page.evaluate((id) => {
      const api = window.__R3F_DOM__;
      return api ? api.getParent(id) : null;
    }, idOrUuid);
  }

  /** Get heavy inspection data (Tier 2) by testId or uuid. Pass { includeGeometryData: true } to include vertex positions and triangle indices. */
  async inspect(idOrUuid: string, options?: { includeGeometryData?: boolean }): Promise<ObjectInspection | null> {
    return this._page.evaluate(
      ({ id, opts }: { id: string; opts?: { includeGeometryData?: boolean } }) => {
        const api = window.__R3F_DOM__;
        if (!api) return null;
        return api.inspect(id, opts);
      },
      { id: idOrUuid, opts: options },
    );
  }

  /**
   * Get world-space position [x, y, z] of an object (from its world matrix).
   * Use for nested objects where local position differs from world position.
   */
  async getWorldPosition(idOrUuid: string): Promise<[number, number, number] | null> {
    return this._page.evaluate((id) => {
      const api = window.__R3F_DOM__;
      if (!api) return null;
      const insp = api.inspect(id);
      if (!insp?.worldMatrix || insp.worldMatrix.length < 15) return null;
      const m = insp.worldMatrix;
      return [m[12], m[13], m[14]];
    }, idOrUuid);
  }

  /** Take a full scene snapshot. */
  async snapshot(): Promise<SceneSnapshot | null> {
    return this._page.evaluate(() => {
      const api = window.__R3F_DOM__;
      return api ? api.snapshot() : null;
    });
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
    return this._page.evaluate(() => {
      const api = window.__R3F_DOM__;
      return api ? api.getCount() : 0;
    });
  }

  /**
   * Return a Playwright locator for the R3F canvas element the bridge is attached to.
   * Use for canvas-level actions (e.g. click at a position, screenshot the canvas).
   * The canvas has `data-r3f-canvas="true"` set by the bridge.
   */
  getCanvasLocator(): Locator {
    return this._page.locator('[data-r3f-canvas]');
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
   * Get all objects with a given geometry type (e.g. "BoxGeometry", "BufferGeometry").
   * Only meshes/points/lines have geometryType.
   */
  async getByGeometryType(type: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate((t) => {
      const api = window.__R3F_DOM__;
      return api ? api.getByGeometryType(t) : [];
    }, type);
  }

  /**
   * Get all objects with a given material type (e.g. "MeshStandardMaterial").
   * Only meshes/points/lines have materialType.
   */
  async getByMaterialType(type: string): Promise<ObjectMetadata[]> {
    return this._page.evaluate((t) => {
      const api = window.__R3F_DOM__;
      return api ? api.getByMaterialType(t) : [];
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

  /**
   * Wait until an object (by testId or uuid) is no longer in the scene.
   * Use for delete flows: trigger removal, then wait until the object is gone.
   */
  async waitForObjectRemoved(
    idOrUuid: string,
    options?: WaitForObjectRemovedOptions,
  ): Promise<void> {
    return waitForObjectRemoved(this._page, idOrUuid, options);
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
