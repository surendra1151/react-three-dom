/// <reference types="cypress" />
import type { R3FDOM, ObjectMetadata, SnapshotNode, BridgeDiagnostics } from './types';
import { _getReporter } from './reporterState';

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

function assertBridgeNotErrored(state: { exists: boolean; ready: boolean; error: string | null }): void {
  if (state.exists && !state.ready && state.error) {
    const reporter = _getReporter();
    reporter?.logBridgeError(state.error);
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

      const reporter = _getReporter();
      reporter?.logBridgeWaiting();

      const startTime = Date.now();
      let lastCount = -1;
      let stableRuns = 0;
      let bridgeLogged = false;

      function poll(): Cypress.Chainable<void> {
        if (Date.now() - startTime > timeout) {
          reporter?.logBridgeError(
            `Timed out after ${timeout}ms. Last count: ${lastCount}, stable: ${stableRuns}/${stableChecks}`,
          );
          throw new Error(
            `r3fWaitForSceneReady timed out after ${timeout}ms. Last count: ${lastCount}, stable runs: ${stableRuns}/${stableChecks}`,
          );
        }

        return cy.window({ log: false }).then((win) => {
          const state = getBridgeState(win);
          assertBridgeNotErrored(state);

          if (!state.exists || !state.ready) {
            return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
          }

          if (!bridgeLogged) {
            bridgeLogged = true;
            const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__!;
            let diag: BridgeDiagnostics | undefined;
            if (typeof api.getDiagnostics === 'function') {
              diag = api.getDiagnostics();
            }
            reporter?.logBridgeConnected(diag);
          }

          const count = state.count;

          if (count === lastCount && count > 0) {
            stableRuns++;
            if (stableRuns >= stableChecks) {
              reporter?.logSceneReady(count);
              return;
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
      let lastHash = '';
      let stableCount = 0;

      function hashTree(node: SnapshotNode): string {
        let h = `${node.uuid}:${node.visible ? 1 : 0}:${node.position[0].toFixed(3)},${node.position[1].toFixed(3)},${node.position[2].toFixed(3)}:${node.children.length}`;
        for (const c of node.children) h += '|' + hashTree(c);
        return h;
      }

      function poll(): Cypress.Chainable<void> {
        if (Date.now() - startTime > timeout) {
          throw new Error(`r3fWaitForIdle timed out after ${timeout}ms`);
        }

        return cy.window({ log: false }).then((win) => {
          const state = getBridgeState(win);
          assertBridgeNotErrored(state);

          if (!state.exists || !state.ready) {
            return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
          }

          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__!;
          const snap = api.snapshot();
          const hash = hashTree(snap.tree);

          if (hash === lastHash && hash !== '') {
            stableCount++;
            if (stableCount >= idleChecks) {
              return;
            }
          } else {
            stableCount = 0;
          }

          lastHash = hash;
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

      const reporter = _getReporter();
      const bridgeStart = Date.now();

      function waitForBridge(): Cypress.Chainable<void> {
        if (Date.now() - bridgeStart > bridgeTimeout) {
          reporter?.logBridgeError(
            `Timed out after ${bridgeTimeout}ms waiting for bridge`,
          );
          throw new Error(
            `r3fWaitForObject("${idOrUuid}") timed out after ${bridgeTimeout}ms ` +
            `waiting for the bridge. Ensure <ThreeDom> is mounted inside your <Canvas>.`,
          );
        }

        return cy.window({ log: false }).then((win) => {
          const state = getBridgeState(win);
          assertBridgeNotErrored(state);

          if (state.exists && state.ready) {
            return pollForObject();
          }

          return cy.wait(pollIntervalMs, { log: false }).then(() => waitForBridge());
        });
      }

      const objectStart = Date.now();

      function pollForObject(): Cypress.Chainable<void> {
        if (Date.now() - objectStart > objectTimeout) {
          return cy.window({ log: false }).then((win) => {
            const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
            const state = getBridgeState(win);
            let msg =
              `r3fWaitForObject("${idOrUuid}") timed out after ${objectTimeout}ms.\n` +
              `Bridge: ${state.exists ? 'exists' : 'missing'}, ` +
              `ready: ${state.ready}, objectCount: ${state.count}.\n` +
              `Ensure the object has userData.testId="${idOrUuid}" or uuid="${idOrUuid}".`;

            let suggestions: ObjectMetadata[] = [];
            if (api && typeof api.fuzzyFind === 'function') {
              suggestions = api.fuzzyFind(idOrUuid, 5);
              if (suggestions.length > 0) {
                msg += '\nDid you mean:\n' + suggestions.map((s: ObjectMetadata) => {
                  const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
                  return `  → ${s.name || '(unnamed)'} [${id}]`;
                }).join('\n');
              }
            }

            reporter?.logObjectNotFound(idOrUuid, suggestions);
            throw new Error(msg);
          });
        }

        return cy.window({ log: false }).then((win) => {
          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
          if (!api || !api._ready) {
            return cy.wait(pollIntervalMs, { log: false }).then(() => pollForObject());
          }

          const meta = api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid);
          if (meta) {
            reporter?.logObjectFound(idOrUuid, meta.type, meta.name || undefined);
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

      const baselineUuids: string[] = [];

      function collectUuids(node: SnapshotNode): void {
        baselineUuids.push(node.uuid);
        for (const child of node.children) {
          collectUuids(child);
        }
      }

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

  // -----------------------------------------------------------------------
  // r3fWaitForObjectRemoved — wait until an object is no longer in the scene
  // -----------------------------------------------------------------------

  Cypress.Commands.add(
    'r3fWaitForObjectRemoved',
    (
      idOrUuid: string,
      options: { bridgeTimeout?: number; pollIntervalMs?: number; timeout?: number } = {},
    ) => {
      const {
        bridgeTimeout = 30_000,
        pollIntervalMs = 100,
        timeout = 10_000,
      } = options;

      const bridgeStart = Date.now();

      function waitForBridge(): Cypress.Chainable<void> {
        if (Date.now() - bridgeStart > bridgeTimeout) {
          throw new Error(
            `r3fWaitForObjectRemoved("${idOrUuid}") timed out after ${bridgeTimeout}ms ` +
            `waiting for the bridge.`,
          );
        }

        return cy.window({ log: false }).then((win) => {
          const state = getBridgeState(win);
          assertBridgeNotErrored(state);

          if (state.exists && state.ready) {
            return pollForRemoved();
          }

          return cy.wait(pollIntervalMs, { log: false }).then(() => waitForBridge());
        });
      }

      const removeDeadline = Date.now() + timeout;

      function pollForRemoved(): Cypress.Chainable<void> {
        if (Date.now() > removeDeadline) {
          throw new Error(
            `r3fWaitForObjectRemoved("${idOrUuid}") timed out after ${timeout}ms. Object is still in the scene.`,
          );
        }

        return cy.window({ log: false }).then((win) => {
          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
          if (!api || !api._ready) {
            return cy.wait(pollIntervalMs, { log: false }).then(() => pollForRemoved());
          }

          const stillPresent = (api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid)) !== null;
          if (!stillPresent) {
            Cypress.log({
              name: 'r3fWaitForObjectRemoved',
              message: `"${idOrUuid}" removed`,
            });
            return;
          }

          return cy.wait(pollIntervalMs, { log: false }).then(() => pollForRemoved());
        });
      }

      return waitForBridge();
    },
  );
}
