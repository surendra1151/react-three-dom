/**
 * @module reporter
 *
 * Rich terminal reporter for Playwright tests. Outputs ANSI-colored status
 * messages for bridge lifecycle events (waiting, connected, error), scene
 * readiness, object lookups (with fuzzy-match suggestions on miss),
 * interaction timings, assertion failures, and full bridge diagnostics.
 */

import type { Page } from '@playwright/test';
import type { BridgeDiagnostics } from './types';

export type { BridgeDiagnostics };

// ---------------------------------------------------------------------------
// Formatting helpers
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
// R3FReporter — formatted terminal output for test lifecycle
// ---------------------------------------------------------------------------

/**
 * Formatted terminal reporter for react-three-dom Playwright tests.
 * Logs bridge lifecycle, scene readiness, interaction timings, assertion
 * failures, and full diagnostics with ANSI colors.
 */
export class R3FReporter {
  private _enabled = true;
  private _canvasId?: string;

  constructor(private readonly _page: Page, enabled = true, canvasId?: string) {
    this._enabled = enabled;
    this._canvasId = canvasId;
  }

  // -----------------------------------------------------------------------
  // Lifecycle events
  // -----------------------------------------------------------------------

  logBridgeWaiting(): void {
    if (!this._enabled) return;
    console.log(info('Waiting for bridge (window.__R3F_DOM__)...'));
  }

  logBridgeConnected(diag?: BridgeDiagnostics): void {
    if (!this._enabled) return;
    if (diag) {
      console.log(ok(`Bridge connected — v${diag.version}, ${diag.objectCount} objects, ${diag.meshCount} meshes`));
      console.log(info(`  Canvas: ${diag.canvasWidth}×${diag.canvasHeight}  GPU: ${diag.webglRenderer}`));
      console.log(info(`  DOM nodes: ${diag.materializedDomNodes}/${diag.maxDomNodes}  Dirty queue: ${diag.dirtyQueueSize}`));
    } else {
      console.log(ok('Bridge connected'));
    }
  }

  logBridgeError(error: string): void {
    if (!this._enabled) return;
    console.log(fail(`Bridge error: ${error}`));
  }

  logSceneReady(objectCount: number): void {
    if (!this._enabled) return;
    console.log(ok(`Scene ready — ${objectCount} objects stabilized`));
  }

  logObjectFound(idOrUuid: string, type: string, name?: string): void {
    if (!this._enabled) return;
    const label = name ? `"${name}" (${type})` : type;
    console.log(ok(`Object found: "${idOrUuid}" → ${label}`));
  }

  logObjectNotFound(idOrUuid: string, suggestions?: Array<{ testId?: string; name: string; uuid: string }>): void {
    if (!this._enabled) return;
    console.log(fail(`Object not found: "${idOrUuid}"`));
    if (suggestions && suggestions.length > 0) {
      console.log(warn('Did you mean:'));
      for (const s of suggestions.slice(0, 5)) {
        const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
        console.log(info(`  → ${s.name || '(unnamed)'} [${id}]`));
      }
    }
  }

  // -----------------------------------------------------------------------
  // Interaction events
  // -----------------------------------------------------------------------

  logInteraction(action: string, idOrUuid: string, extra?: string): void {
    if (!this._enabled) return;
    const suffix = extra ? ` ${DIM}${extra}${RESET}` : '';
    console.log(info(`${action}("${idOrUuid}")${suffix}`));
  }

  logInteractionDone(action: string, idOrUuid: string, durationMs: number): void {
    if (!this._enabled) return;
    console.log(ok(`${action}("${idOrUuid}") — ${durationMs}ms`));
  }

  // -----------------------------------------------------------------------
  // Assertion context
  // -----------------------------------------------------------------------

  logAssertionFailure(
    matcherName: string,
    id: string,
    detail: string,
    diag?: BridgeDiagnostics,
  ): void {
    if (!this._enabled) return;
    console.log(heading(`Assertion failed: ${matcherName}("${id}")`));
    console.log(fail(detail));
    if (diag) {
      this._printDiagnosticsSummary(diag);
    }
  }

  // -----------------------------------------------------------------------
  // Full diagnostics dump
  // -----------------------------------------------------------------------

  async logDiagnostics(): Promise<void> {
    if (!this._enabled) return;
    const diag = await this.fetchDiagnostics();
    if (!diag) {
      console.log(fail('Cannot fetch diagnostics — bridge not available'));
      return;
    }
    console.log(heading('Bridge Diagnostics'));
    this._printDiagnosticsFull(diag);
  }

  async fetchDiagnostics(): Promise<BridgeDiagnostics | null> {
    return this._page.evaluate((cid) => {
      type ApiLike = { getDiagnostics?(): unknown };
      const api = cid
        ? (window as unknown as { __R3F_DOM_INSTANCES__?: Record<string, ApiLike> }).__R3F_DOM_INSTANCES__?.[cid]
        : (window as unknown as { __R3F_DOM__?: ApiLike }).__R3F_DOM__;
      if (!api || typeof api.getDiagnostics !== 'function') return null;
      return api.getDiagnostics() as BridgeDiagnostics;
    }, this._canvasId ?? null);
  }

  async fetchFuzzyMatches(query: string, limit = 5): Promise<Array<{ testId?: string; name: string; uuid: string }>> {
    return this._page.evaluate(
      ({ q, lim, cid }) => {
        type ApiLike = { fuzzyFind?(q: string, l: number): Array<{ testId?: string; name: string; uuid: string }> };
        const api = cid
          ? (window as unknown as { __R3F_DOM_INSTANCES__?: Record<string, ApiLike> }).__R3F_DOM_INSTANCES__?.[cid]
          : (window as unknown as { __R3F_DOM__?: ApiLike }).__R3F_DOM__;
        if (!api || typeof api.fuzzyFind !== 'function') return [];
        return api.fuzzyFind(q, lim);
      },
      { q: query, lim: limit, cid: this._canvasId ?? null },
    );
  }

  // -----------------------------------------------------------------------
  // Private formatting
  // -----------------------------------------------------------------------

  private _printDiagnosticsSummary(d: BridgeDiagnostics): void {
    console.log(info(`  Bridge: v${d.version} ready=${d.ready}${d.error ? ` error="${d.error}"` : ''}`));
    console.log(info(`  Scene: ${d.objectCount} objects (${d.meshCount} meshes, ${d.groupCount} groups, ${d.lightCount} lights)`));
    console.log(info(`  Canvas: ${d.canvasWidth}×${d.canvasHeight}  GPU: ${d.webglRenderer}`));
  }

  private _printDiagnosticsFull(d: BridgeDiagnostics): void {
    const status = d.ready ? `${GREEN}READY${RESET}` : `${RED}NOT READY${RESET}`;
    console.log(`  ${BOLD}Status:${RESET}    ${status}  v${d.version}`);
    if (d.error) console.log(`  ${BOLD}Error:${RESET}     ${RED}${d.error}${RESET}`);
    console.log(`  ${BOLD}Objects:${RESET}   ${d.objectCount} total`);
    console.log(`             ${d.meshCount} meshes, ${d.groupCount} groups, ${d.lightCount} lights, ${d.cameraCount} cameras`);
    console.log(`  ${BOLD}DOM:${RESET}       ${d.materializedDomNodes}/${d.maxDomNodes} materialized`);
    console.log(`  ${BOLD}Canvas:${RESET}    ${d.canvasWidth}×${d.canvasHeight}`);
    console.log(`  ${BOLD}GPU:${RESET}       ${d.webglRenderer}`);
    console.log(`  ${BOLD}Dirty:${RESET}     ${d.dirtyQueueSize} queued updates`);
  }
}
