/// <reference types="cypress" />
import type { R3FDOM, BridgeDiagnostics, ObjectMetadata } from './types';

// ---------------------------------------------------------------------------
// ANSI colors for Node-side terminal output via cy.task()
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

const TAG = `${CYAN}[r3f-dom]${RESET}`;

function ok(msg: string): string { return `${TAG} ${GREEN}✓${RESET} ${msg}`; }
function fail(msg: string): string { return `${TAG} ${RED}✗${RESET} ${msg}`; }
function warn(msg: string): string { return `${TAG} ${YELLOW}⚠${RESET} ${msg}`; }
function info(msg: string): string { return `${TAG} ${DIM}${msg}${RESET}`; }
function heading(msg: string): string { return `\n${TAG} ${BOLD}${MAGENTA}${msg}${RESET}`; }

// ---------------------------------------------------------------------------
// Node-side task registration — call once in cypress.config.ts setupNodeEvents
// ---------------------------------------------------------------------------

/**
 * Register the `r3fLog` task in your `cypress.config.ts`:
 *
 * ```ts
 * import { registerR3FTasks } from '@react-three-dom/cypress/reporter';
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on) {
 *       registerR3FTasks(on);
 *     },
 *   },
 * });
 * ```
 */
export function registerR3FTasks(
  on: Cypress.PluginEvents,
): void {
  on('task', {
    r3fLog(message: string) {
      process.stdout.write(message + '\n');
      return null;
    },
  });
}

// ---------------------------------------------------------------------------
// Browser-side reporter — logs to both Cypress command log and terminal
// ---------------------------------------------------------------------------

let _enabled = true;

function termLog(message: string): void {
  if (!_enabled) return;
  cy.task('r3fLog', message, { log: false });
}

function cmdLog(name: string, message: string, props?: Record<string, unknown>): void {
  Cypress.log({
    name,
    message,
    consoleProps: () => props ?? {},
  });
}

function getAPI(win: Cypress.AUTWindow): R3FDOM | null {
  return (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__ ?? null;
}

// ---------------------------------------------------------------------------
// R3FReporter — Cypress equivalent of Playwright's R3FReporter
// ---------------------------------------------------------------------------

export class R3FReporter {
  constructor(enabled = true) {
    _enabled = enabled;
  }

  enable(): void { _enabled = true; }
  disable(): void { _enabled = false; }

  // ---- Lifecycle ----

  logBridgeWaiting(): void {
    termLog(info('Waiting for bridge (window.__R3F_DOM__)...'));
    cmdLog('r3f', 'Waiting for bridge...');
  }

  logBridgeConnected(diag?: BridgeDiagnostics): void {
    if (diag) {
      termLog(ok(`Bridge connected — v${diag.version}, ${diag.objectCount} objects, ${diag.meshCount} meshes`));
      termLog(info(`  Canvas: ${diag.canvasWidth}×${diag.canvasHeight}  GPU: ${diag.webglRenderer}`));
      termLog(info(`  DOM nodes: ${diag.materializedDomNodes}/${diag.maxDomNodes}  Dirty queue: ${diag.dirtyQueueSize}`));
      cmdLog('r3f', `Bridge connected v${diag.version} — ${diag.objectCount} objects`, { diagnostics: diag });
    } else {
      termLog(ok('Bridge connected'));
      cmdLog('r3f', 'Bridge connected');
    }
  }

  logBridgeError(error: string): void {
    termLog(fail(`Bridge error: ${error}`));
    cmdLog('r3f', `Bridge error: ${error}`);
  }

  logSceneReady(objectCount: number): void {
    termLog(ok(`Scene ready — ${objectCount} objects stabilized`));
    cmdLog('r3f', `Scene ready — ${objectCount} objects`);
  }

  logObjectFound(idOrUuid: string, type: string, name?: string): void {
    const label = name ? `"${name}" (${type})` : type;
    termLog(ok(`Object found: "${idOrUuid}" → ${label}`));
    cmdLog('r3f', `Object found: "${idOrUuid}" → ${label}`);
  }

  logObjectNotFound(
    idOrUuid: string,
    suggestions?: Array<{ testId?: string; name: string; uuid: string }>,
  ): void {
    termLog(fail(`Object not found: "${idOrUuid}"`));
    if (suggestions && suggestions.length > 0) {
      termLog(warn('Did you mean:'));
      for (const s of suggestions.slice(0, 5)) {
        const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
        termLog(info(`  → ${s.name || '(unnamed)'} [${id}]`));
      }
    }
    cmdLog('r3f', `Object not found: "${idOrUuid}"`, { suggestions });
  }

  // ---- Interactions ----

  logInteraction(action: string, idOrUuid: string, extra?: string): void {
    const suffix = extra ? ` ${extra}` : '';
    termLog(info(`${action}("${idOrUuid}")${suffix}`));
  }

  logInteractionDone(action: string, idOrUuid: string, durationMs: number): void {
    termLog(ok(`${action}("${idOrUuid}") — ${durationMs}ms`));
  }

  // ---- Assertions ----

  logAssertionFailure(
    matcherName: string,
    id: string,
    detail: string,
    diag?: BridgeDiagnostics,
  ): void {
    termLog(heading(`Assertion failed: ${matcherName}("${id}")`));
    termLog(fail(detail));
    if (diag) {
      this._printDiagnosticsSummary(diag);
    }
  }

  // ---- Diagnostics ----

  logDiagnostics(): Cypress.Chainable<void> {
    return cy.window({ log: false }).then((win) => {
      const api = getAPI(win);
      if (!api || typeof api.getDiagnostics !== 'function') {
        termLog(fail('Cannot fetch diagnostics — bridge not available'));
        return;
      }
      const d = api.getDiagnostics();
      termLog(heading('Bridge Diagnostics'));
      this._printDiagnosticsFull(d);
      cmdLog('r3fDiagnostics', `v${d.version} ${d.objectCount} objects`, { diagnostics: d });
    });
  }

  fetchDiagnostics(): Cypress.Chainable<BridgeDiagnostics | null> {
    return cy.window({ log: false }).then((win) => {
      const api = getAPI(win);
      if (!api || typeof api.getDiagnostics !== 'function') return null;
      return api.getDiagnostics();
    });
  }

  fetchFuzzyMatches(
    query: string,
    limit = 5,
  ): Cypress.Chainable<Array<{ testId?: string; name: string; uuid: string }>> {
    return cy.window({ log: false }).then((win) => {
      const api = getAPI(win);
      if (!api || typeof api.fuzzyFind !== 'function') return [];
      return api.fuzzyFind(query, limit).map((m: ObjectMetadata) => ({
        testId: m.testId,
        name: m.name,
        uuid: m.uuid,
      }));
    });
  }

  // ---- Private formatting ----

  private _printDiagnosticsSummary(d: BridgeDiagnostics): void {
    termLog(info(`  Bridge: v${d.version} ready=${d.ready}${d.error ? ` error="${d.error}"` : ''}`));
    termLog(info(`  Scene: ${d.objectCount} objects (${d.meshCount} meshes, ${d.groupCount} groups, ${d.lightCount} lights)`));
    termLog(info(`  Canvas: ${d.canvasWidth}×${d.canvasHeight}  GPU: ${d.webglRenderer}`));
  }

  private _printDiagnosticsFull(d: BridgeDiagnostics): void {
    const status = d.ready ? `${GREEN}READY${RESET}` : `${RED}NOT READY${RESET}`;
    termLog(`  ${BOLD}Status:${RESET}    ${status}  v${d.version}`);
    if (d.error) termLog(`  ${BOLD}Error:${RESET}     ${RED}${d.error}${RESET}`);
    termLog(`  ${BOLD}Objects:${RESET}   ${d.objectCount} total`);
    termLog(`             ${d.meshCount} meshes, ${d.groupCount} groups, ${d.lightCount} lights, ${d.cameraCount} cameras`);
    termLog(`  ${BOLD}DOM:${RESET}       ${d.materializedDomNodes}/${d.maxDomNodes} materialized`);
    termLog(`  ${BOLD}Canvas:${RESET}    ${d.canvasWidth}×${d.canvasHeight}`);
    termLog(`  ${BOLD}GPU:${RESET}       ${d.webglRenderer}`);
    termLog(`  ${BOLD}Dirty:${RESET}     ${d.dirtyQueueSize} queued updates`);
  }
}
