/// <reference types="cypress" />
import type { R3FDOM } from './types';

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
// Custom commands — all prefixed with `r3f` for clarity
// ---------------------------------------------------------------------------

export function registerCommands(): void {
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
        getR3F(win).drag(idOrUuid, delta);
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
}
