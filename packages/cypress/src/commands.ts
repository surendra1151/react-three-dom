/// <reference types="cypress" />
import type { R3FDOM, SnapshotNode } from './types';

// ---------------------------------------------------------------------------
// Helper to get the R3F DOM bridge from the current window
// ---------------------------------------------------------------------------

function getR3F(win: Cypress.AUTWindow): R3FDOM {
  const api = (win as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
  if (!api) {
    throw new Error(
      'react-three-dom bridge not found. Is <ThreeDom> mounted in your app?',
    );
  }
  return api;
}

// ---------------------------------------------------------------------------
// Scene tree formatter — used by r3fLogScene
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
// Custom commands — all prefixed with `r3f` for clarity
// ---------------------------------------------------------------------------

export function registerCommands(): void {
  // ---- Debug logging ----
  Cypress.Commands.add('r3fEnableDebug', () => {
    cy.window({ log: false }).then((win) => {
      (win as Window).__R3F_DOM_DEBUG__ = true;
    });
    // Mirror [r3f-dom:*] browser console messages to the Cypress command log
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

  // ---- Interactions ----
  Cypress.Commands.add('r3fClick', (idOrUuid: string) => {
    cy.window({ log: false }).then((win) => {
      getR3F(win).click(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fDoubleClick', (idOrUuid: string) => {
    cy.window({ log: false }).then((win) => {
      getR3F(win).doubleClick(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fContextMenu', (idOrUuid: string) => {
    cy.window({ log: false }).then((win) => {
      getR3F(win).contextMenu(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fHover', (idOrUuid: string) => {
    cy.window({ log: false }).then((win) => {
      getR3F(win).hover(idOrUuid);
    });
  });

  Cypress.Commands.add(
    'r3fDrag',
    (idOrUuid: string, delta: { x: number; y: number; z: number }) => {
      cy.window({ log: false }).then((win) => {
        return getR3F(win).drag(idOrUuid, delta);
      });
    },
  );

  Cypress.Commands.add(
    'r3fWheel',
    (idOrUuid: string, options?: { deltaY?: number; deltaX?: number }) => {
      cy.window({ log: false }).then((win) => {
        getR3F(win).wheel(idOrUuid, options);
      });
    },
  );

  Cypress.Commands.add('r3fPointerMiss', () => {
    cy.window({ log: false }).then((win) => {
      getR3F(win).pointerMiss();
    });
  });

  Cypress.Commands.add('r3fSelect', (idOrUuid: string) => {
    cy.window({ log: false }).then((win) => {
      getR3F(win).select(idOrUuid);
    });
  });

  Cypress.Commands.add('r3fClearSelection', () => {
    cy.window({ log: false }).then((win) => {
      getR3F(win).clearSelection();
    });
  });

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

      // Also log to browser console for visibility
      // eslint-disable-next-line no-console
      console.log(`[r3f-dom] ${output}`);
    });
  });

  // ---- Queries ----
  Cypress.Commands.add('r3fGetObject', (idOrUuid: string) => {
    return cy.window({ log: false }).then((win) => {
      const api = getR3F(win);
      return api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid) ?? null;
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

  // ---- Drawing interactions ----

  Cypress.Commands.add(
    'r3fDrawPath',
    (
      points: Array<{ x: number; y: number; pressure?: number }>,
      options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
    ) => {
      return cy.window({ log: false }).then(async (win) => {
        const api = getR3F(win);
        return api.drawPath(points, options);
      });
    },
  );

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
}
