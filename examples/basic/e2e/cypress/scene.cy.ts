// ---------------------------------------------------------------------------
// Cypress E2E tests for the basic example scene
// ---------------------------------------------------------------------------

describe('Scene bootstrap', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('bridge is available on the page', () => {
    cy.window().then((win) => {
      expect(win.__R3F_DOM__).to.not.be.undefined;
    });
  });

  it('scene has expected number of objects', () => {
    cy.r3fGetCount().then((count) => {
      expect(count).to.be.greaterThan(10);
    });
  });

  it('snapshot returns a valid tree', () => {
    cy.r3fSnapshot().then((snap) => {
      expect(snap).to.not.be.null;
      expect(snap.objectCount).to.be.greaterThan(0);
      expect(snap.tree).to.exist;
      expect(snap.tree.type).to.equal('Scene');
    });
  });
});

describe('Object queries', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('chair-primary exists', () => {
    cy.r3fGetObject('chair-primary').should('not.be.null');
  });

  it('table-top exists', () => {
    cy.r3fGetObject('table-top').should('not.be.null');
  });

  it('floor exists', () => {
    cy.r3fGetObject('floor').should('not.be.null');
  });

  it('sun-light exists', () => {
    cy.r3fGetObject('sun-light').should('not.be.null');
  });

  it('orbiting-sphere exists', () => {
    cy.r3fGetObject('orbiting-sphere').should('not.be.null');
  });

  it('vase exists', () => {
    cy.r3fGetObject('vase').should('not.be.null');
  });

  it('stacked boxes exist', () => {
    cy.r3fGetObject('stacked-box-1').should('not.be.null');
    cy.r3fGetObject('stacked-box-2').should('not.be.null');
    cy.r3fGetObject('stacked-box-3').should('not.be.null');
  });

  it('nonexistent object returns null', () => {
    cy.r3fGetObject('does-not-exist').should('be.null');
  });
});

describe('Object visibility', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('chair is visible', () => {
    cy.r3fGetObject('chair-primary').then((meta) => {
      expect(meta).to.not.be.null;
      expect(meta!.visible).to.be.true;
    });
  });

  it('floor is visible', () => {
    cy.r3fGetObject('floor').then((meta) => {
      expect(meta).to.not.be.null;
      expect(meta!.visible).to.be.true;
    });
  });

  it('table-top is visible', () => {
    cy.r3fGetObject('table-top').then((meta) => {
      expect(meta).to.not.be.null;
      expect(meta!.visible).to.be.true;
    });
  });
});

describe('Object positions', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('table-top is at expected position', () => {
    cy.r3fGetObject('table-top').then((meta) => {
      expect(meta).to.not.be.null;
      const [x, y, z] = meta!.position;
      expect(x).to.be.closeTo(2, 0.01);
      expect(y).to.be.closeTo(0.75, 0.01);
      expect(z).to.be.closeTo(0, 0.01);
    });
  });

  it('floor is at origin', () => {
    cy.r3fGetObject('floor').then((meta) => {
      expect(meta).to.not.be.null;
      const [x, y, z] = meta!.position;
      expect(x).to.be.closeTo(0, 0.01);
      expect(y).to.be.closeTo(0, 0.01);
      expect(z).to.be.closeTo(0, 0.01);
    });
  });

  it('vase is above the table', () => {
    cy.r3fGetObject('vase').then((meta) => {
      expect(meta).to.not.be.null;
      const [x, y, z] = meta!.position;
      expect(x).to.be.closeTo(2, 0.01);
      expect(y).to.be.closeTo(0.95, 0.01);
      expect(z).to.be.closeTo(0, 0.01);
    });
  });

  it('sun-light is elevated', () => {
    cy.r3fGetObject('sun-light').then((meta) => {
      expect(meta).to.not.be.null;
      const [x, y, z] = meta!.position;
      expect(x).to.be.closeTo(5, 0.01);
      expect(y).to.be.closeTo(10, 0.01);
      expect(z).to.be.closeTo(5, 0.01);
    });
  });
});

describe('Object inspection (Tier 2)', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('chair inspection returns geometry data', () => {
    cy.r3fInspect('chair-primary').then((inspection) => {
      expect(inspection).to.not.be.null;
      expect(inspection!.metadata.type).to.equal('Mesh');
      expect(inspection!.geometry).to.exist;
      expect(inspection!.geometry!.type).to.equal('BoxGeometry');
      expect(inspection!.material).to.exist;
      expect(inspection!.material!.type).to.equal('MeshStandardMaterial');
    });
  });

  it('chair bounds are valid', () => {
    cy.r3fInspect('chair-primary').then((inspection) => {
      expect(inspection).to.not.be.null;
      const { bounds } = inspection!;
      expect(bounds.min.every(Number.isFinite)).to.be.true;
      expect(bounds.max.every(Number.isFinite)).to.be.true;
      for (let i = 0; i < 3; i++) {
        expect(bounds.max[i]).to.be.at.least(bounds.min[i]);
      }
    });
  });

  it('floor geometry is a PlaneGeometry', () => {
    cy.r3fInspect('floor').then((inspection) => {
      expect(inspection).to.not.be.null;
      expect(inspection!.geometry!.type).to.equal('PlaneGeometry');
    });
  });
});

describe('Interactions', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('click on chair does not throw', () => {
    cy.r3fClick('chair-primary');
  });

  it('hover on table-top does not throw', () => {
    cy.r3fHover('table-top');
  });

  it('double-click on vase does not throw', () => {
    cy.r3fDoubleClick('vase');
  });

  it('context-menu on floor does not throw', () => {
    cy.r3fContextMenu('floor');
  });

  it('wheel on chair does not throw', () => {
    cy.r3fWheel('chair-primary', { deltaY: 100 });
  });

  it('pointer-miss does not throw', () => {
    cy.r3fPointerMiss();
  });
});

describe('Selection', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('select and clear selection work', () => {
    cy.r3fSelect('chair-primary');
    cy.r3fClearSelection();
  });
});
