---
sidebar_position: 8
---

# Diagnostics

Rich diagnostic tools for debugging test failures and understanding scene state.

## Bridge Diagnostics

```ts
// Playwright
const diag = await r3f.getDiagnostics();
console.log(diag);
// {
//   version: '0.2.0',
//   ready: true,
//   objectCount: 42,
//   meshCount: 15,
//   groupCount: 8,
//   lightCount: 3,
//   cameraCount: 1,
//   materializedDomNodes: 120,
//   maxDomNodes: 2000,
//   canvasWidth: 800,
//   canvasHeight: 600,
//   webglRenderer: 'ANGLE (SwiftShader)',
//   dirtyQueueSize: 0,
// }

// Cypress
cy.r3fGetDiagnostics().then((diag) => {
  expect(diag.ready).to.be.true;
});
```

## Terminal Reporter

The Playwright SDK includes a terminal reporter that logs bridge status, scene readiness, and failure context:

```
[r3f-dom] ℹ Waiting for bridge (window.__R3F_DOM__)...
[r3f-dom] ✓ Bridge connected — v0.2.0, 42 objects, 15 meshes
[r3f-dom]   Canvas: 800×600  GPU: ANGLE (SwiftShader)
[r3f-dom] ✓ Scene ready — 42 objects stabilized
[r3f-dom] ✗ Object not found: "nonexistent"
[r3f-dom] ⚠ Did you mean:
[r3f-dom]   → wall-1 [testId="wall-1"]
[r3f-dom]   → wall-2 [testId="wall-2"]
```

Disable with `report: false`:

```ts
import { createR3FTest } from '@react-three-dom/playwright';
const test = createR3FTest({ report: false });
```

## Logging Scene Tree

Print a human-readable scene tree to the terminal:

```ts
// Playwright
await r3f.logScene();
// Scene
//  ├─ Group "building" [testId=building]
//  │   ├─ Mesh "wall-1" (BoxGeometry, MeshStandardMaterial) [testId=wall-1]
//  │   └─ Mesh "floor" (PlaneGeometry, MeshStandardMaterial) [testId=floor]
//  └─ PerspectiveCamera

// Cypress
cy.r3fLogScene();
```

## Logging Diagnostics

Pretty-print full diagnostics to the terminal:

```ts
// Playwright
await r3f.logDiagnostics();

// Cypress
cy.r3fLogDiagnostics();
```

## Fuzzy Search

When an object isn't found, the bridge suggests similar matches. You can also search programmatically:

```ts
// Playwright
const suggestions = await r3f.fuzzyFind('hero');
// Returns objects whose testId or name contains "hero"

// Cypress
cy.r3fFuzzyFind('hero').then((results) => {
  console.log(results);
});
```
