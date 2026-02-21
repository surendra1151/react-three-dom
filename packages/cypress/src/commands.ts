/// <reference types="cypress" />
import type { R3FDOM, SnapshotNode, SceneSnapshot, BridgeDiagnostics, ObjectMetadata } from './types';
import { diffSnapshots } from './diffSnapshots';
import { R3FReporter } from './reporter';
import { _setReporter, _getReporter } from './reporterState';

// ---------------------------------------------------------------------------
// Multi-canvas support — active canvas ID
// ---------------------------------------------------------------------------

let _activeCanvasId: string | null = null;

/** @internal Get the currently active canvas ID. */
export function _getActiveCanvasId(): string | null { return _activeCanvasId; }

// ---------------------------------------------------------------------------
// Bridge access helpers
// ---------------------------------------------------------------------------

function getR3F(win: Cypress.AUTWindow): R3FDOM {
  const w = win as Window & { __R3F_DOM__?: R3FDOM; __R3F_DOM_INSTANCES__?: Record<string, R3FDOM> };
  const api = _activeCanvasId
    ? w.__R3F_DOM_INSTANCES__?.[_activeCanvasId]
    : w.__R3F_DOM__;
  if (!api) {
    throw new Error(
      `react-three-dom bridge not found${_activeCanvasId ? ` (canvas: "${_activeCanvasId}")` : ''}. Is <ThreeDom${_activeCanvasId ? ` canvasId="${_activeCanvasId}"` : ''}> mounted in your app?`,
    );
  }
  return api;
}

// ---------------------------------------------------------------------------
// Auto-wait: poll until bridge is ready + object exists
// ---------------------------------------------------------------------------

const AUTO_WAIT_TIMEOUT = 5_000;
const AUTO_WAIT_POLL_MS = 100;

function resolveApi(win: Cypress.AUTWindow): R3FDOM | undefined {
  const w = win as Window & { __R3F_DOM__?: R3FDOM; __R3F_DOM_INSTANCES__?: Record<string, R3FDOM> };
  return _activeCanvasId
    ? w.__R3F_DOM_INSTANCES__?.[_activeCanvasId]
    : w.__R3F_DOM__;
}

function autoWaitForBridge(timeout = AUTO_WAIT_TIMEOUT): Cypress.Chainable<R3FDOM> {
  const deadline = Date.now() + timeout;

  function poll(): Cypress.Chainable<R3FDOM> {
    return cy.window({ log: false }).then((win) => {
      const api = resolveApi(win);

      if (api && api._ready) return api;

      if (api && !api._ready && api._error) {
        throw new Error(
          `[react-three-dom] Bridge initialization failed: ${api._error}`,
        );
      }

      if (Date.now() > deadline) {
        throw new Error(
          `[react-three-dom] Auto-wait timed out after ${timeout}ms: bridge not ready${_activeCanvasId ? ` (canvas: "${_activeCanvasId}")` : ''}.\n` +
          `Ensure <ThreeDom${_activeCanvasId ? ` canvasId="${_activeCanvasId}"` : ''}> is mounted inside your <Canvas> component.`,
        );
      }

      return cy.wait(AUTO_WAIT_POLL_MS, { log: false }).then(() => poll());
    });
  }

  return poll();
}

function autoWaitForObject(
  idOrUuid: string,
  timeout = AUTO_WAIT_TIMEOUT,
): Cypress.Chainable<R3FDOM> {
  const deadline = Date.now() + timeout;

  function poll(): Cypress.Chainable<R3FDOM> {
    return cy.window({ log: false }).then((win) => {
      const api = resolveApi(win);

      if (!api) {
        if (Date.now() > deadline) {
          throw new Error(
            `[react-three-dom] Auto-wait timed out after ${timeout}ms: bridge not found${_activeCanvasId ? ` (canvas: "${_activeCanvasId}")` : ''}.`,
          );
        }
        return cy.wait(AUTO_WAIT_POLL_MS, { log: false }).then(() => poll());
      }

      if (!api._ready && api._error) {
        throw new Error(
          `[react-three-dom] Bridge initialization failed: ${api._error}`,
        );
      }

      if (api._ready) {
        const found = (api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid)) !== null;
        if (found) return api;
      }

      if (Date.now() > deadline) {
        let msg =
          `[react-three-dom] Auto-wait timed out after ${timeout}ms: object "${idOrUuid}" not found${_activeCanvasId ? ` (canvas: "${_activeCanvasId}")` : ''}.\n` +
          `Bridge: ready=${api._ready}, objectCount=${api.getCount()}.\n` +
          `Ensure the object has userData.testId="${idOrUuid}" or uuid="${idOrUuid}".`;

        if (typeof api.fuzzyFind === 'function') {
          const suggestions = api.fuzzyFind(idOrUuid, 5);
          if (suggestions.length > 0) {
            msg += '\nDid you mean:\n' + suggestions.map((s) => {
              const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
              return `  → ${s.name || '(unnamed)'} [${id}]`;
            }).join('\n');
          }
        }

        throw new Error(msg);
      }

      return cy.wait(AUTO_WAIT_POLL_MS, { log: false }).then(() => poll());
    });
  }

  return poll();
}

// ---------------------------------------------------------------------------
// Scene tree formatter
// ---------------------------------------------------------------------------

function formatCypressSceneTree(node: SnapshotNode, prefix = '', isLast = true): string {
  const connector = prefix === '' ? '' : isLast ? '└─ ' : '├─ ';
  const childPrefix = prefix === '' ? '' : prefix + (isLast ? '   ' : '│  ');

  let label = node.type;
  if (node.name) label += ` "${node.name}"`;
  if (node.testId) label += ` [testId: ${node.testId}]`;
  label += node.visible ? ' visible' : ' HIDDEN';

  let result = prefix + connector + label + '\n';

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const last = i === node.children.length - 1;
    result += formatCypressSceneTree(child, childPrefix, last);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Custom commands
// ---------------------------------------------------------------------------

export function registerCommands(): void {
  // ---- Multi-canvas ----
  Cypress.Commands.add('r3fUseCanvas', (canvasId: string | null) => {
    _activeCanvasId = canvasId;
    Cypress.log({
      name: 'r3fUseCanvas',
      message: canvasId ? `Switched to canvas "${canvasId}"` : 'Switched to default canvas',
    });
  });

  Cypress.Commands.add('r3fGetCanvasIds', () => {
    return cy.window({ log: false }).then((win) => {
      const instances = (win as Window & { __R3F_DOM_INSTANCES__?: Record<string, R3FDOM> }).__R3F_DOM_INSTANCES__;
      return instances ? Object.keys(instances) : [];
    });
  });

  // ---- Reporter ----
  Cypress.Commands.add('r3fEnableReporter', (enabled = true) => {
    if (enabled) {
      _setReporter(new R3FReporter(true));
    } else {
      _setReporter(null);
    }
  });

  // ---- Debug logging ----
  Cypress.Commands.add('r3fEnableDebug', () => {
    cy.window({ log: false }).then((win) => {
      (win as Window).__R3F_DOM_DEBUG__ = true;
    });
    Cypress.on('window:before:load', (win) => {
      const origLog = win.console.log;
      win.console.log = (...args: unknown[]) => {
        origLog.apply(win.console, args);
        const text = String(args[0]);
        if (text.startsWith('[r3f-dom:')) {
          Cypress.log({
            name: 'r3f-dom',
            message: args.slice(1).map(String).join(' '),
            consoleProps: () => ({ raw: args }),
          });
        }
      };
    });
  });

  // ---- Interactions (all auto-wait for bridge + object) ----

  Cypress.Commands.add('r3fClick', (idOrUuid: string) => {
    const reporter = _getReporter();
    const t0 = Date.now();
    reporter?.logInteraction('click', idOrUuid);
    return autoWaitForObject(idOrUuid).then((api) => {
      api.click(idOrUuid);
      reporter?.logInteractionDone('click', idOrUuid, Date.now() - t0);
    });
  });

  Cypress.Commands.add('r3fDoubleClick', (idOrUuid: string) => {
    const reporter = _getReporter();
    const t0 = Date.now();
    reporter?.logInteraction('doubleClick', idOrUuid);
    return autoWaitForObject(idOrUuid).then((api) => {
      api.doubleClick(idOrUuid);
      reporter?.logInteractionDone('doubleClick', idOrUuid, Date.now() - t0);
    });
  });

  Cypress.Commands.add('r3fContextMenu', (idOrUuid: string) => {
    const reporter = _getReporter();
    const t0 = Date.now();
    reporter?.logInteraction('contextMenu', idOrUuid);
    return autoWaitForObject(idOrUuid).then((api) => {
      api.contextMenu(idOrUuid);
      reporter?.logInteractionDone('contextMenu', idOrUuid, Date.now() - t0);
    });
  });

  Cypress.Commands.add('r3fHover', (idOrUuid: string) => {
    const reporter = _getReporter();
    const t0 = Date.now();
    reporter?.logInteraction('hover', idOrUuid);
    return autoWaitForObject(idOrUuid).then((api) => {
      api.hover(idOrUuid);
      reporter?.logInteractionDone('hover', idOrUuid, Date.now() - t0);
    });
  });

  Cypress.Commands.add('r3fUnhover', () => {
    const reporter = _getReporter();
    const t0 = Date.now();
    reporter?.logInteraction('unhover', '(canvas)');
    return autoWaitForBridge().then((api) => {
      api.unhover();
      reporter?.logInteractionDone('unhover', '(canvas)', Date.now() - t0);
    });
  });

  Cypress.Commands.add(
    'r3fDrag',
    (idOrUuid: string, delta: { x: number; y: number; z: number }) => {
      return autoWaitForObject(idOrUuid).then((api) => {
        return Cypress.Promise.resolve(api.drag(idOrUuid, delta));
      });
    },
  );

  Cypress.Commands.add(
    'r3fWheel',
    (idOrUuid: string, options?: { deltaY?: number; deltaX?: number }) => {
      return autoWaitForObject(idOrUuid).then((api) => {
        api.wheel(idOrUuid, options);
      });
    },
  );

  Cypress.Commands.add('r3fPointerMiss', () => {
    return autoWaitForBridge().then((api) => {
      api.pointerMiss();
    });
  });

  Cypress.Commands.add('r3fSelect', (idOrUuid: string) => {
    return autoWaitForObject(idOrUuid).then((api) => {
      api.select(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fClearSelection', () => {
    return autoWaitForBridge().then((api) => {
      api.clearSelection();
    });
  });

  // ---- Drawing (auto-wait for bridge, uses Cypress.Promise for async) ----

  Cypress.Commands.add(
    'r3fDrawPath',
    (
      points: Array<{ x: number; y: number; pressure?: number }>,
      options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
    ) => {
      return autoWaitForBridge().then((api) => {
        return Cypress.Promise.resolve(api.drawPath(points, options));
      });
    },
  );

  // ---- Diagnostics ----

  Cypress.Commands.add('r3fLogScene', () => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      const snap = api.snapshot();
      const lines = formatCypressSceneTree(snap.tree);
      const output = `Scene tree (${snap.objectCount} objects):\n${lines}`;

      Cypress.log({
        name: 'r3fLogScene',
        message: `${snap.objectCount} objects`,
        consoleProps: () => ({ snapshot: snap, tree: output }),
      });

      // eslint-disable-next-line no-console
      console.log(`[r3f-dom] ${output}`);
    });
  });

  Cypress.Commands.add('r3fGetDiagnostics', () => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      if (typeof api.getDiagnostics !== 'function') return null;
      return api.getDiagnostics();
    });
  });

  Cypress.Commands.add('r3fLogDiagnostics', () => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      if (typeof api.getDiagnostics !== 'function') {
        Cypress.log({ name: 'r3fLogDiagnostics', message: 'getDiagnostics not available' });
        return;
      }
      const d = api.getDiagnostics();
      const lines = [
        `Bridge Diagnostics`,
        `  Status:    ${d.ready ? 'READY' : 'NOT READY'}  v${d.version}`,
        d.error ? `  Error:     ${d.error}` : null,
        `  Objects:   ${d.objectCount} total`,
        `             ${d.meshCount} meshes, ${d.groupCount} groups, ${d.lightCount} lights, ${d.cameraCount} cameras`,
        `  DOM:       ${d.materializedDomNodes}/${d.maxDomNodes} materialized`,
        `  Canvas:    ${d.canvasWidth}×${d.canvasHeight}`,
        `  GPU:       ${d.webglRenderer}`,
        `  Dirty:     ${d.dirtyQueueSize} queued updates`,
      ].filter(Boolean).join('\n');

      Cypress.log({
        name: 'r3fLogDiagnostics',
        message: `v${d.version} ${d.objectCount} objects`,
        consoleProps: () => ({ diagnostics: d, formatted: lines }),
      });

      // eslint-disable-next-line no-console
      console.log(`[r3f-dom] ${lines}`);
    });
  });

  // ---- Queries ----

  Cypress.Commands.add('r3fGetObject', (idOrUuid: string) => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      return api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid) ?? null;
    });
  });

  Cypress.Commands.add('r3fGetByTestId', (testId: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getByTestId(testId);
    });
  });

  Cypress.Commands.add('r3fGetByName', (name: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getByName(name);
    });
  });

  Cypress.Commands.add('r3fGetByUuid', (uuid: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getByUuid(uuid);
    });
  });

  Cypress.Commands.add('r3fGetChildren', (idOrUuid: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getChildren(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fGetParent', (idOrUuid: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getParent(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fGetCanvas', () => {
    return cy.get('[data-r3f-canvas]');
  });

  Cypress.Commands.add('r3fGetWorldPosition', (idOrUuid: string) => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      const insp = api.inspect(idOrUuid);
      if (!insp?.worldMatrix || insp.worldMatrix.length < 15) return null;
      const m = insp.worldMatrix;
      return [m[12], m[13], m[14]] as [number, number, number];
    });
  });

  Cypress.Commands.add('r3fDiffSnapshots', (before: SceneSnapshot, after: SceneSnapshot) => {
    return cy.wrap(diffSnapshots(before, after), { log: false });
  });

  Cypress.Commands.add('r3fTrackObjectCount', (action: () => Cypress.Chainable<unknown>) => {
    return cy.window({ log: false }).then((win) => {
      const before = getR3F(win).snapshot();
      return action().then(() =>
        cy.window({ log: false }).then((w) => {
          const after = getR3F(w).snapshot();
          const d = diffSnapshots(before, after);
          return { added: d.added.length, removed: d.removed.length };
        }),
      );
    });
  });

  Cypress.Commands.add('r3fInspect', (idOrUuid: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).inspect(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fSnapshot', () => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).snapshot();
    });
  });

  Cypress.Commands.add('r3fGetCount', () => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getCount();
    });
  });

  // ---- BIM/CAD queries ----

  Cypress.Commands.add('r3fGetByType', (type: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getByType(type);
    });
  });

  Cypress.Commands.add('r3fGetByUserData', (key: string, value?: unknown) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getByUserData(key, value);
    });
  });

  Cypress.Commands.add('r3fGetCountByType', (type: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getCountByType(type);
    });
  });

  Cypress.Commands.add('r3fGetObjects', (ids: string[]) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getObjects(ids);
    });
  });

  Cypress.Commands.add('r3fGetByGeometryType', (type: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getByGeometryType(type);
    });
  });

  Cypress.Commands.add('r3fGetByMaterialType', (type: string) => {
    return cy.window({ log: false }).then((win) => {
      return getR3F(win).getByMaterialType(type);
    });
  });

  Cypress.Commands.add('r3fFuzzyFind', (query: string, limit?: number) => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      if (typeof api.fuzzyFind !== 'function') return [];
      return api.fuzzyFind(query, limit);
    });
  });

  // ---- Camera ----

  Cypress.Commands.add('r3fGetCameraState', () => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      return api.getCameraState();
    });
  });
}
