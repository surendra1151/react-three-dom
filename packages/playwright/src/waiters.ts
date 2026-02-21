import type { Page } from '@playwright/test';
import type { ObjectMetadata } from './types';

// ---------------------------------------------------------------------------
// Shared: waitForReadyBridge — wait until __R3F_DOM__._ready === true
// ---------------------------------------------------------------------------

/**
 * Wait until the `window.__R3F_DOM__` bridge exists AND `_ready === true`.
 *
 * Fails fast with a rich diagnostic if the bridge is present but
 * `_ready === false` and `_error` is set (i.e. ThreeDom setup crashed).
 * This prevents all waiters from silently timing out when the bridge is
 * in an error state — the developer gets an immediate, actionable message.
 *
 * @internal Used by all public waiter functions.
 */
async function waitForReadyBridge(page: Page, timeout: number, canvasId?: string): Promise<void> {
  const deadline = Date.now() + timeout;
  const pollMs = 100;

  while (Date.now() < deadline) {
    const state = await page.evaluate((cid) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api) return { exists: false as const };
      return {
        exists: true as const,
        ready: api._ready,
        error: api._error ?? null,
        count: api.getCount(),
      };
    }, canvasId ?? null);

    if (state.exists && state.ready) {
      return;
    }

    if (state.exists && !state.ready && state.error) {
      throw new Error(
        `[react-three-dom] Bridge initialization failed: ${state.error}\n` +
        `The <ThreeDom> component mounted but threw during setup. ` +
        `Check the browser console for the full stack trace.`,
      );
    }

    await page.waitForTimeout(pollMs);
  }

  const finalState = await page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api) return { exists: false, ready: false, error: null };
    return { exists: true, ready: api._ready, error: api._error ?? null };
  }, canvasId ?? null);

  if (finalState.exists && finalState.error) {
    throw new Error(
      `[react-three-dom] Bridge initialization failed: ${finalState.error}\n` +
      `The <ThreeDom> component mounted but threw during setup.`,
    );
  }

  throw new Error(
    `[react-three-dom] Timed out after ${timeout}ms waiting for the bridge to be ready.\n` +
    `Bridge exists: ${finalState.exists}, ready: ${finalState.ready}.\n` +
    `Ensure <ThreeDom> is mounted inside your <Canvas> component.`,
  );
}

// ---------------------------------------------------------------------------
// waitForSceneReady — wait until the scene object count stabilises
// ---------------------------------------------------------------------------

export interface WaitForSceneReadyOptions {
  /** How many consecutive stable polls are required. Default: 3 */
  stableChecks?: number;
  /** Interval between polls in ms. Default: 100 */
  pollIntervalMs?: number;
  /** Overall timeout in ms. Default: 10_000 */
  timeout?: number;
}

/**
 * Wait until `window.__R3F_DOM__` is available, `_ready === true`, and the
 * scene's object count has stabilised over several consecutive checks.
 *
 * If the bridge exists but `_ready` is false and `_error` is set, this
 * fails immediately with a rich diagnostic message instead of timing out.
 */
export async function waitForSceneReady(
  page: Page,
  options: WaitForSceneReadyOptions & { canvasId?: string } = {},
): Promise<void> {
  const {
    stableChecks = 3,
    pollIntervalMs = 100,
    timeout = 10_000,
    canvasId,
  } = options;

  const deadline = Date.now() + timeout;

  await waitForReadyBridge(page, timeout, canvasId);

  let lastCount = -1;
  let stableRuns = 0;

  while (Date.now() < deadline) {
    const count = await page.evaluate((cid) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      return api!.getCount();
    }, canvasId ?? null);

    if (count === lastCount && count > 0) {
      stableRuns++;
      if (stableRuns >= stableChecks) return;
    } else {
      stableRuns = 0;
    }

    lastCount = count;
    await page.waitForTimeout(pollIntervalMs);
  }

  const state = await page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api)
      return { bridgeFound: false as const, ready: false, error: null, objectCount: 0 };
    return {
      bridgeFound: true as const,
      ready: api._ready,
      error: api._error ?? null,
      objectCount: api.getCount(),
    };
  }, canvasId ?? null);

  const stateLine = state.bridgeFound
    ? `Bridge found: yes, _ready: ${state.ready}, _error: ${state.error ?? 'none'}, objectCount: ${state.objectCount}`
    : 'Bridge found: no (ensure <ThreeDom /> is mounted inside <Canvas> and refresh)';

  throw new Error(
    `waitForSceneReady timed out after ${timeout}ms. ${stateLine}. Last count: ${lastCount}, stable runs: ${stableRuns}/${stableChecks}.`,
  );
}

// ---------------------------------------------------------------------------
// waitForObject — wait for bridge + a specific object (when count never stabilizes)
// ---------------------------------------------------------------------------

export interface WaitForObjectOptions {
  /** Time to wait for the bridge to appear. Default: 30_000 */
  bridgeTimeout?: number;
  /** Time to wait for the object to appear after bridge is ready. Default: 40_000 */
  objectTimeout?: number;
  /** Poll interval in ms. Default: 200 */
  pollIntervalMs?: number;
}

/**
 * Wait until `window.__R3F_DOM__` is ready and an object with the given
 * testId or uuid exists in the scene.
 *
 * Use this instead of `waitForSceneReady` when the scene object count never
 * stabilizes (e.g. continuous loading, animations adding/removing objects,
 * or GLTF/models loading asynchronously).
 *
 * Fails fast if the bridge reports `_ready: false` with an `_error`.
 */
export async function waitForObject(
  page: Page,
  idOrUuid: string,
  options: WaitForObjectOptions & { canvasId?: string } = {},
): Promise<void> {
  const {
    bridgeTimeout = 30_000,
    objectTimeout = 40_000,
    pollIntervalMs = 200,
    canvasId,
  } = options;

  await waitForReadyBridge(page, bridgeTimeout, canvasId);

  const deadline = Date.now() + objectTimeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      ([id, cid]) => {
        const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
        if (!api || !api._ready) return false;
        return (api.getByTestId(id) ?? api.getByUuid(id)) !== null;
      },
      [idOrUuid, canvasId ?? null] as const,
    );
    if (found) return;
    await page.waitForTimeout(pollIntervalMs);
  }

  const diagnostics = await page.evaluate(
    ([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api) return { bridgeExists: false, ready: false, count: 0, error: null, suggestions: [] as Array<{ testId?: string; name: string; uuid: string }> };
      const suggestions = typeof api.fuzzyFind === 'function'
        ? api.fuzzyFind(id, 5).map((m: { testId?: string; name: string; uuid: string }) => ({ testId: m.testId, name: m.name, uuid: m.uuid }))
        : [];
      return {
        bridgeExists: true,
        ready: api._ready,
        count: api.getCount(),
        error: api._error ?? null,
        suggestions,
      };
    },
    [idOrUuid, canvasId ?? null] as const,
  );

  let msg =
    `waitForObject("${idOrUuid}") timed out after ${objectTimeout}ms. ` +
    `Bridge: ${diagnostics.bridgeExists ? 'exists' : 'missing'}, ` +
    `ready: ${diagnostics.ready}, ` +
    `objectCount: ${diagnostics.count}` +
    (diagnostics.error ? `, error: ${diagnostics.error}` : '') + '. ' +
    `Is the object rendered with userData.testId="${idOrUuid}" or uuid="${idOrUuid}"?`;

  if (diagnostics.suggestions.length > 0) {
    msg += '\nDid you mean:\n' +
      diagnostics.suggestions.map((s: { testId?: string; name: string; uuid: string }) => {
        const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
        return `  → ${s.name || '(unnamed)'} [${id}]`;
      }).join('\n');
  }

  throw new Error(msg);
}

// ---------------------------------------------------------------------------
// waitForIdle — wait until no property changes for N consecutive frames
// ---------------------------------------------------------------------------

export interface WaitForIdleOptions {
  /** Number of consecutive idle frames required. Default: 10 */
  idleFrames?: number;
  /** Overall timeout in ms. Default: 10_000 */
  timeout?: number;
}

/**
 * Wait until no object properties have changed for a number of consecutive
 * animation frames. Useful after triggering animations or interactions.
 *
 * This works by taking successive snapshots and comparing them. When the
 * JSON representation is unchanged for `idleFrames` consecutive rAF
 * callbacks, the scene is considered idle.
 *
 * Checks `_ready === true` before starting. Fails fast if `_error` is set.
 */
export async function waitForIdle(
  page: Page,
  options: WaitForIdleOptions & { canvasId?: string } = {},
): Promise<void> {
  const {
    idleFrames = 10,
    timeout = 10_000,
    canvasId,
  } = options;

  await waitForReadyBridge(page, timeout, canvasId);

  const settled = await page.evaluate(
    ([frames, timeoutMs, cid]) => {
      return new Promise<boolean | string>((resolve) => {
        const deadline = Date.now() + timeoutMs;
        let lastJson = '';
        let stableCount = 0;

        function check() {
          if (Date.now() > deadline) {
            resolve(false);
            return;
          }

          const api = cid
            ? (window as unknown as { __R3F_DOM_INSTANCES__?: Record<string, { _ready: boolean; _error?: string; snapshot(): { tree: unknown } }> }).__R3F_DOM_INSTANCES__?.[cid]
            : (window as unknown as { __R3F_DOM__?: { _ready: boolean; _error?: string; snapshot(): { tree: unknown } } }).__R3F_DOM__;
          if (!api || !api._ready) {
            if (api && api._error) {
              resolve(`Bridge error: ${api._error}`);
              return;
            }
            requestAnimationFrame(check);
            return;
          }

          const snap = api.snapshot();
          const json = JSON.stringify(snap.tree);

          if (json === lastJson && json !== '') {
            stableCount++;
            if (stableCount >= frames) {
              resolve(true);
              return;
            }
          } else {
            stableCount = 0;
          }

          lastJson = json;
          requestAnimationFrame(check);
        }

        requestAnimationFrame(check);
      });
    },
    [idleFrames, timeout, canvasId ?? null] as const,
  );

  if (typeof settled === 'string') {
    throw new Error(`waitForIdle failed: ${settled}`);
  }
  if (!settled) {
    throw new Error(`waitForIdle timed out after ${timeout}ms`);
  }
}

// ---------------------------------------------------------------------------
// waitForNewObject — wait until a new object appears in the scene
// ---------------------------------------------------------------------------

export interface WaitForNewObjectOptions {
  /**
   * Only consider new objects of this Three.js type (e.g. "Mesh", "Line").
   * If not set, any new object type qualifies.
   */
  type?: string;

  /**
   * If provided, the new object's name must contain this substring.
   * Useful for apps that name objects predictably (e.g. "stroke-", "wall-").
   */
  nameContains?: string;

  /**
   * Poll interval in ms. Default: 100
   */
  pollIntervalMs?: number;

  /**
   * Overall timeout in ms. Default: 10_000
   */
  timeout?: number;
}

/** Result returned when new objects are detected. */
export interface WaitForNewObjectResult {
  /** Metadata of all newly added objects (matching the filter). */
  newObjects: ObjectMetadata[];
  /** UUIDs of the newly added objects. */
  newUuids: string[];
  /** Total number of new objects detected. */
  count: number;
}

/**
 * Wait until one or more new objects appear in the scene that were not present
 * at the time this function was called.
 *
 * This is designed for drawing/annotation apps where user interactions
 * (like `drawPath`) create new Three.js objects asynchronously.
 *
 * @param page      Playwright Page instance
 * @param options   Filter and timing options
 * @returns         Metadata of the newly added object(s)
 * @throws          If no new objects appear within the timeout
 *
 * @example
 * ```typescript
 * // Draw a stroke, then wait for the new Line object
 * const before = await r3f.getCount();
 * await r3f.drawPath(points);
 * const result = await waitForNewObject(page, { type: 'Line' });
 * expect(result.count).toBe(1);
 * ```
 */
export async function waitForNewObject(
  page: Page,
  options: WaitForNewObjectOptions & { canvasId?: string } = {},
): Promise<WaitForNewObjectResult> {
  const {
    type,
    nameContains,
    pollIntervalMs = 100,
    timeout = 10_000,
    canvasId,
  } = options;

  const baselineUuids: string[] = await page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api) return [];
    const snap = api.snapshot();
    const uuids: string[] = [];
    function collect(node: { uuid: string; children: Array<{ uuid: string; children: unknown[] }> }) {
      uuids.push(node.uuid);
      for (const child of node.children) {
        collect(child as typeof node);
      }
    }
    collect(snap.tree as unknown as { uuid: string; children: Array<{ uuid: string; children: unknown[] }> });
    return uuids;
  }, canvasId ?? null);

  const deadline = Date.now() + timeout;

  // 2. Poll until new objects appear
  while (Date.now() < deadline) {
    await page.waitForTimeout(pollIntervalMs);

    const result = await page.evaluate(
      ([filterType, filterName, knownUuids, cid]) => {
        const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
        if (!api) return null;

        const snap = api.snapshot();
        const known = new Set(knownUuids);
        const newObjects: Array<{
          uuid: string;
          name: string;
          type: string;
          visible: boolean;
          testId?: string;
          position: [number, number, number];
          rotation: [number, number, number];
          scale: [number, number, number];
        }> = [];

        function scan(node: {
          uuid: string;
          name: string;
          type: string;
          visible: boolean;
          testId?: string;
          position: [number, number, number];
          rotation: [number, number, number];
          scale: [number, number, number];
          children: unknown[];
        }) {
          if (!known.has(node.uuid)) {
            // New object — check filters
            const typeMatch = !filterType || node.type === filterType;
            const nameMatch = !filterName || node.name.includes(filterName);
            if (typeMatch && nameMatch) {
              newObjects.push({
                uuid: node.uuid,
                name: node.name,
                type: node.type,
                visible: node.visible,
                testId: node.testId,
                position: node.position,
                rotation: node.rotation,
                scale: node.scale,
              });
            }
          }
          for (const child of node.children) {
            scan(child as typeof node);
          }
        }

        scan(snap.tree as unknown as Parameters<typeof scan>[0]);

        if (newObjects.length === 0) return null;

        return {
          newObjects,
          newUuids: newObjects.map((o) => o.uuid),
          count: newObjects.length,
        };
      },
      [type ?? null, nameContains ?? null, baselineUuids, canvasId ?? null] as const,
    );

    if (result) {
      return result as WaitForNewObjectResult;
    }
  }

  // 3. Timeout — build a descriptive error
  const filterDesc = [
    type ? `type="${type}"` : null,
    nameContains ? `nameContains="${nameContains}"` : null,
  ].filter(Boolean).join(', ');

  throw new Error(
    `waitForNewObject timed out after ${timeout}ms. ` +
    `No new objects appeared${filterDesc ? ` matching ${filterDesc}` : ''}. ` +
    `Baseline had ${baselineUuids.length} objects.`,
  );
}

// ---------------------------------------------------------------------------
// waitForObjectRemoved — wait until an object is no longer in the scene
// ---------------------------------------------------------------------------

export interface WaitForObjectRemovedOptions {
  /** Time to wait for the bridge to appear. Default: 30_000 */
  bridgeTimeout?: number;
  /** Poll interval in ms. Default: 100 */
  pollIntervalMs?: number;
  /** Overall timeout in ms (after bridge is ready). Default: 10_000 */
  timeout?: number;
}

/**
 * Wait until the bridge is ready and an object with the given testId or uuid
 * is no longer in the scene. Use for delete flows (e.g. user deletes an object,
 * then you assert it's gone).
 *
 * @param page      Playwright Page instance
 * @param idOrUuid  testId or uuid of the object that should be removed
 * @param options   Timing options
 * @throws          If the object is still present after the timeout
 *
 * @example
 * ```ts
 * await r3f.click('delete-button');
 * await r3f.waitForObjectRemoved('item-to-delete');
 * await expect(r3f).not.toExist('item-to-delete');
 * ```
 */
export async function waitForObjectRemoved(
  page: Page,
  idOrUuid: string,
  options: WaitForObjectRemovedOptions & { canvasId?: string } = {},
): Promise<void> {
  const {
    bridgeTimeout = 30_000,
    pollIntervalMs = 100,
    timeout = 10_000,
    canvasId,
  } = options;

  await waitForReadyBridge(page, bridgeTimeout, canvasId);

  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const stillPresent = await page.evaluate(([id, cid]) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api) return true;
      const meta = api.getByTestId(id) ?? api.getByUuid(id);
      return meta !== null;
    }, [idOrUuid, canvasId ?? null] as const);

    if (!stillPresent) return;

    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error(
    `waitForObjectRemoved timed out after ${timeout}ms. Object "${idOrUuid}" is still in the scene.`,
  );
}
