import type { Page } from '@playwright/test';

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
 * Wait until `window.__R3F_DOM__` is available and the scene's object count
 * has stabilised (no additions or removals) over several consecutive checks.
 */
export async function waitForSceneReady(
  page: Page,
  options: WaitForSceneReadyOptions = {},
): Promise<void> {
  const {
    stableChecks = 3,
    pollIntervalMs = 100,
    timeout = 10_000,
  } = options;

  const deadline = Date.now() + timeout;

  // First, wait for __R3F_DOM__ to exist
  await page.waitForFunction(() => typeof window.__R3F_DOM__ !== 'undefined', undefined, {
    timeout,
  });

  let lastCount = -1;
  let stableRuns = 0;

  while (Date.now() < deadline) {
    const count = await page.evaluate(() => window.__R3F_DOM__!.getCount());

    if (count === lastCount && count > 0) {
      stableRuns++;
      if (stableRuns >= stableChecks) return;
    } else {
      stableRuns = 0;
    }

    lastCount = count;
    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error(
    `waitForSceneReady timed out after ${timeout}ms. Last count: ${lastCount}, stable runs: ${stableRuns}/${stableChecks}`,
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
 * Wait until `window.__R3F_DOM__` is available and an object with the given
 * testId or uuid exists in the scene.
 *
 * Use this instead of `waitForSceneReady` when the scene object count never
 * stabilizes (e.g. continuous loading, animations adding/removing objects,
 * or GLTF/models loading asynchronously).
 */
export async function waitForObject(
  page: Page,
  idOrUuid: string,
  options: WaitForObjectOptions = {},
): Promise<void> {
  const {
    bridgeTimeout = 30_000,
    objectTimeout = 40_000,
    pollIntervalMs = 200,
  } = options;

  await page.waitForFunction(() => typeof window.__R3F_DOM__ !== 'undefined', undefined, {
    timeout: bridgeTimeout,
  });

  const deadline = Date.now() + objectTimeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      (id) => {
        const api = window.__R3F_DOM__;
        if (!api) return false;
        return (api.getByTestId(id) ?? api.getByUuid(id)) !== null;
      },
      idOrUuid,
    );
    if (found) return;
    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error(
    `waitForObject("${idOrUuid}") timed out after ${objectTimeout}ms. Is the object rendered with userData.testId or this uuid?`,
  );
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
 */
export async function waitForIdle(
  page: Page,
  options: WaitForIdleOptions = {},
): Promise<void> {
  const {
    idleFrames = 10,
    timeout = 10_000,
  } = options;

  const settled = await page.evaluate(
    ([frames, timeoutMs]) => {
      return new Promise<boolean>((resolve) => {
        const deadline = Date.now() + timeoutMs;
        let lastJson = '';
        let stableCount = 0;

        function check() {
          if (Date.now() > deadline) {
            resolve(false);
            return;
          }

          const snap = window.__R3F_DOM__?.snapshot();
          const json = snap ? JSON.stringify(snap.tree) : '';

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
    [idleFrames, timeout] as const,
  );

  if (!settled) {
    throw new Error(`waitForIdle timed out after ${timeout}ms`);
  }
}
