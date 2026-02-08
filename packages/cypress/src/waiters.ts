/// <reference types="cypress" />
import type { R3FDOM } from './types';

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
          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
          if (!api) {
            // Bridge not yet available, keep polling
            return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
          }

          const count = api.getCount();

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
          const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
          if (!api) {
            return cy.wait(pollIntervalMs, { log: false }).then(() => poll());
          }

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
}
