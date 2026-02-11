/// <reference types="cypress" />
import type { R3FDOM, ObjectMetadata, SnapshotNode } from './types';

// ---------------------------------------------------------------------------
// r3fWaitForSceneReady — wait until the bridge is ready and object count
// has stabilised across several consecutive polls.
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
 * Get bridge state from the window for diagnostic purposes.
 */
function getBridgeState(win: Cypress.AUTWindow): {
  exists: boolean;
  ready: boolean;
  error: string | null;
  count: number;
} {
  const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
  if (!api) return { exists: false, ready: false, error: null, count: 0 };
  return {
    exists: true,
    ready: api._ready,
    error: api._error ?? null,
    count: api.getCount(),
  };
}

/**
 * Check if the bridge is in an error state and throw with diagnostics.
 */
function assertBridgeNotErrored(state: { exists: boolean; ready: boolean; error: string | null }): void {
  if (state.exists && !state.ready && state.error) {
    throw new Error(
      `[react-three-dom] Bridge initialization failed: ${state.error}\n` +
      `The <ThreeDom> component mounted but threw during setup. ` +
      `Check the browser console for the full stack trace.`,
    );
  }
}

export function registerWaiters(): void {
  Cypress.Commands.add(
    'r3fWaitForSceneReady',
    (options: WaitForSceneReadyOptions = {}) => {
      const {
        stableChecks = 3,
        pollIntervalMs = 100,
        timeout = 10_000,
      } = options;

      const startTime = Date.now();
      let lastCount = -1;
      let stableRuns = 0;

      function poll(): Cypress.Chainable<void> {
        if (Date.now() - startTime > timeout) {
          throw new Error(
            `r3fWaitForSceneReady timed out after ${timeout}ms. Last count: ${lastCount}, stable runs: ${stableRuns}/${stableChecks}`,
          );
        }

        return cy.window({ log: false }).then((win) => {
          const state = getBridgeState(win);

          // Fail fast if bridge errored
          assertBridgeNotErrored(state);

          if (!state.exists || !state.ready) {
            // Bridge not yet available or not ready, keep polling
            return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
          }

          const count = state.count;

          if (count === lastCount && count > 0) {
            stableRuns++;
            if (stableRuns >= stableChecks) {
              return; // Done — scene is ready
            }
          } else {
            stableRuns = 0;
          }

          lastCount = count;
          return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
        });
      }

      return poll();
    },
  );

  // -----------------------------------------------------------------------
  // r3fWaitForIdle — wait until no property changes for N polls
  // -----------------------------------------------------------------------

  Cypress.Commands.add(
    'r3fWaitForIdle',
    (options: { idleChecks?: number; pollIntervalMs?: number; timeout?: number } = {}) => {
      const {
        idleChecks = 10,
        pollIntervalMs = 50,
        timeout = 10_000,
      } = options;

      const startTime = Date.now();
      let lastJson = '';
      let stableCount = 0;

      function poll(): Cypress.Chainable<void> {
        if (Date.now() - startTime > timeout) {
          throw new Error(`r3fWaitForIdle timed out after ${timeout}ms`);
        }

        return cy.window({ log: false }).then((win) => {
          const state = getBridgeState(win);

          // Fail fast if bridge errored
          assertBridgeNotErrored(state);

          if (!state.exists || !state.ready) {
            return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
          }

          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__!;
          const snap = api.snapshot();
          const json = JSON.stringify(snap.tree);

          if (json === lastJson && json !== '') {
            stableCount++;
            if (stableCount >= idleChecks) {
              return; // Done — scene is idle
            }
          } else {
            stableCount = 0;
          }

          lastJson = json;
          return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
        });
      }

      return poll();
    },
  );

  // -----------------------------------------------------------------------
  // r3fWaitForObject — wait until a specific object exists in the scene
  // -----------------------------------------------------------------------

  Cypress.Commands.add(
    'r3fWaitForObject',
    (
      idOrUuid: string,
      options: {
        bridgeTimeout?: number;
        objectTimeout?: number;
        pollIntervalMs?: number;
      } = {},
    ) => {
      const {
        bridgeTimeout = 30_000,
        objectTimeout = 40_000,
        pollIntervalMs = 200,
      } = options;

      const bridgeStart = Date.now();

      // Phase 1: wait for bridge to be ready
      function waitForBridge(): Cypress.Chainable<void> {
        if (Date.now() - bridgeStart > bridgeTimeout) {
          throw new Error(
            `r3fWaitForObject("${idOrUuid}") timed out after ${bridgeTimeout}ms ` +
            `waiting for the bridge. Ensure <ThreeDom> is mounted inside your <Canvas>.`,
          );
        }

        return cy.window({ log: false }).then((win) => {
          const state = getBridgeState(win);
          assertBridgeNotErrored(state);

          if (state.exists && state.ready) {
            // Bridge ready — move to phase 2
            return pollForObject();
          }

          return cy.wait(pollIntervalMs, { log: false }).then(() => waitForBridge());
        });
      }

      // Phase 2: poll for the specific object
      const objectStart = Date.now();

      function pollForObject(): Cypress.Chainable<void> {
        if (Date.now() - objectStart > objectTimeout) {
          // Build diagnostic info for a helpful error
          return cy.window({ log: false }).then((win) => {
            const state = getBridgeState(win);
            throw new Error(
              `r3fWaitForObject("${idOrUuid}") timed out after ${objectTimeout}ms. ` +
              `Bridge: ${state.exists ? 'exists' : 'missing'}, ` +
              `ready: ${state.ready}, ` +
              `objectCount: ${state.count}. ` +
              `Is the object rendered with userData.testId="${idOrUuid}" or uuid="${idOrUuid}"?`,
            );
          });
        }

        return cy.window({ log: false }).then((win) => {
          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
          if (!api || !api._ready) {
            return cy.wait(pollIntervalMs, { log: false }).then(() => pollForObject());
          }

          const found = (api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid)) !== null;
          if (found) {
            Cypress.log({
              name: 'r3fWaitForObject',
              message: `"${idOrUuid}" found`,
            });
            return;
          }

          return cy.wait(pollIntervalMs, { log: false }).then(() => pollForObject());
        });
      }

      return waitForBridge();
    },
  );

  // -----------------------------------------------------------------------
  // r3fWaitForNewObject — wait until new objects appear in the scene
  // -----------------------------------------------------------------------

  Cypress.Commands.add(
    'r3fWaitForNewObject',
    (options: {
      type?: string;
      nameContains?: string;
      pollIntervalMs?: number;
      timeout?: number;
    } = {}) => {
      const {
        type: filterType,
        nameContains,
        pollIntervalMs = 100,
        timeout = 10_000,
      } = options;

      // Collect baseline UUIDs from the current snapshot
      const baselineUuids: string[] = [];

      function collectUuids(node: SnapshotNode): void {
        baselineUuids.push(node.uuid);
        for (const child of node.children) {
          collectUuids(child);
        }
      }

      // First, capture baseline synchronously from the window
      return cy.window({ log: false }).then((win) => {
        const state = getBridgeState(win);
        assertBridgeNotErrored(state);

        if (state.exists && state.ready) {
          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__!;
          const snap = api.snapshot();
          collectUuids(snap.tree);
        }

        const baselineSet = new Set(baselineUuids);
        const startTime = Date.now();

        function poll(): Cypress.Chainable<{ newObjects: ObjectMetadata[]; newUuids: string[]; count: number }> {
          if (Date.now() - startTime > timeout) {
            const filterDesc = [
              filterType ? `type="${filterType}"` : null,
              nameContains ? `nameContains="${nameContains}"` : null,
            ].filter(Boolean).join(', ');
            throw new Error(
              `r3fWaitForNewObject timed out after ${timeout}ms. ` +
              `No new objects appeared${filterDesc ? ` matching ${filterDesc}` : ''}. ` +
              `Baseline had ${baselineUuids.length} objects.`,
            );
          }

          return cy.wait(pollIntervalMs, { log: false }).then(() => {
            return cy.window({ log: false }).then((w) => {
              const bridgeState = getBridgeState(w);
              assertBridgeNotErrored(bridgeState);

              if (!bridgeState.exists || !bridgeState.ready) return poll();

              const bridge = (w as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__!;

              const snap = bridge.snapshot();
              const newObjects: ObjectMetadata[] = [];
              const newUuids: string[] = [];

              function scanForNew(node: SnapshotNode): void {
                if (!baselineSet.has(node.uuid)) {
                  const typeMatch = !filterType || node.type === filterType;
                  const nameMatch = !nameContains || node.name.includes(nameContains);
                  if (typeMatch && nameMatch) {
                    // Get full metadata from the bridge
                    const meta = bridge.getByUuid(node.uuid);
                    if (meta) {
                      newObjects.push(meta);
                      newUuids.push(node.uuid);
                    }
                  }
                }
                for (const child of node.children) {
                  scanForNew(child);
                }
              }

              scanForNew(snap.tree);

              if (newObjects.length > 0) {
                Cypress.log({
                  name: 'r3fWaitForNewObject',
                  message: `${newObjects.length} new object(s) found`,
                  consoleProps: () => ({ newObjects, newUuids }),
                });
                return { newObjects, newUuids, count: newObjects.length };
              }

              return poll();
            });
          });
        }

        return poll();
      });
    },
  );
}
