# react-three-dom

Developer tool & testing bridge for React Three Fiber — DOM mirror for DevTools inspection, stable selectors, deterministic 3D interactions, and production-grade E2E testing SDKs for Playwright & Cypress.

## Features

- **DOM Mirror** — Exposes your Three.js scene graph as a hidden DOM tree (`<three-mesh>`, `<three-group>`, etc.) for DevTools inspection
- **Stable Selectors** — Query objects by `testId`, `uuid`, `name`, type, or `userData`
- **Deterministic Interactions** — Click, hover, drag, wheel, double-click, right-click, and freeform drawing on 3D objects via synthetic pointer events
- **Scene Snapshots** — JSON representation of your entire scene for assertions and debugging
- **Inspector UI** — Built-in overlay panel with tree view, search, and property inspection
- **26 Auto-Retrying Matchers** — Comprehensive Playwright matchers covering position, rotation, scale, color, geometry, materials, hierarchy, performance budgets, and more
- **Auto-Waiting** — Interactions and waiters automatically wait for the bridge and objects, with rich diagnostics on failure
- **BIM/CAD Support** — Purpose-built queries (`getByType`, `getByUserData`, `getCountByType`) for architecture and engineering apps
- **Drawing App Support** — `drawPath()` interaction and `waitForNewObject()` waiter for canvas drawing/annotation tools
- **Debug Logging** — Three-layer logging system that surfaces browser-side logs in your test terminal
- **Error Resilience** — `try/catch` throughout the bridge, per-frame sync, and metadata extraction to prevent single-object crashes

## Packages

| Package | Description |
|---------|-------------|
| `@react-three-dom/core` | DOM mirror, snapshot API, interactions, and bridge component |
| `@react-three-dom/devtools` | Chrome DevTools extension — R3F scene inspector as a DevTools tab |
| `@react-three-dom/playwright` | Playwright E2E testing SDK with custom fixtures, matchers, and auto-waiting |
| `@react-three-dom/cypress` | Cypress E2E testing SDK with custom commands and assertions |

## Quick Start

### 1. Install

```bash
# Core (required)
npm install @react-three-dom/core

# Testing SDKs (dev dependencies)
npm install -D @react-three-dom/playwright  # for Playwright
npm install -D @react-three-dom/cypress     # for Cypress
```

### 2. Add the Bridge to Your App

Include `<ThreeDom />` inside `<Canvas>` so the scene is tracked. For the **R3F tab in Chrome DevTools**, install the extension once (see [DevTools extension](#devtools-extension) below).

```tsx
import { Canvas } from '@react-three/fiber';
import { ThreeDom } from '@react-three-dom/core';

function App() {
  return (
    <Canvas>
      {/* Add ThreeDom anywhere inside Canvas */}
      <ThreeDom />

      {/* Your scene */}
      <mesh userData={{ testId: 'my-cube' }}>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Canvas>
  );
}
```

### 3. Add Test IDs to Your Objects

Use `userData.testId` for stable selectors in tests:

```tsx
<mesh userData={{ testId: 'player-character' }}>
  <capsuleGeometry />
  <meshStandardMaterial />
</mesh>

<group userData={{ testId: 'enemy-spawner' }}>
  {enemies.map((e) => (
    <mesh key={e.id} userData={{ testId: `enemy-${e.id}` }} />
  ))}
</group>

{/* BIM/CAD: tag objects with custom userData for querying */}
<mesh userData={{ testId: 'wall-north', category: 'wall', floorId: 2 }}>
  <boxGeometry />
  <meshStandardMaterial />
</mesh>
```

### 4. Write E2E Tests

#### Playwright

```ts
import { test, expect } from '@react-three-dom/playwright';

test('player can click on enemy', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();
  
  // Verify objects exist
  await expect(r3f).toExist('player-character');
  await expect(r3f).toExist('enemy-1');
  
  // Click on 3D object (auto-waits for the object)
  await r3f.click('enemy-1');
  
  // Check position, rotation, scale
  await expect(r3f).toHavePosition('enemy-1', [0, 0, 5], 0.1);
  await expect(r3f).toHaveRotation('enemy-1', [0, Math.PI / 2, 0], 0.01);
  
  // Check material color
  await expect(r3f).toHaveColor('enemy-1', '#ff0000');
  
  // Performance budget — scene under 100k triangles
  await expect(r3f).toHaveTotalTriangleCountLessThan(100_000);
});
```

#### Cypress

```ts
describe('Game scene', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('player can click on enemy', () => {
    cy.r3fGetObject('player-character').should('not.be.null');
    cy.r3fGetObject('enemy-1').should('not.be.null');
    cy.r3fClick('enemy-1');
    cy.r3fGetObject('enemy-1').then((meta) => {
      expect(meta.position[2]).to.be.closeTo(5, 0.1);
    });
  });
});
```

---

## DevTools extension

When your app uses `@react-three-dom/core` (with `<ThreeDom />` inside `<Canvas>`), you can inspect the scene from a **dedicated R3F tab in Chrome DevTools**, like React DevTools or Redux DevTools.

### Install the extension (recommended)

Install from the Chrome Web Store (one click):

**[Install React Three DOM DevTools](https://chrome.google.com/webstore/detail/react-three-dom-devtools/PLACEHOLDER)** *(replace with your store listing URL after publishing)*

Then open your R3F app, open DevTools (F12 or Cmd+Option+I), and click the **R3F** tab.

### Build and load unpacked (alternative)

1. **Build the extension** (from this repo):
   ```bash
   cd packages/devtools && pnpm build
   ```
   This produces `packages/devtools/dist/` with the unpackable extension.

2. **Load in Chrome**:
   - Open `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `packages/devtools/dist` folder

3. **Use it**:
   - Open your R3F app in a tab
   - Open DevTools (F12 or Cmd+Option+I)
   - Click the **R3F** tab in the DevTools toolbar
   - The panel shows the scene tree, search, selection, and property inspection. Selection in the panel highlights the object in the scene.

The extension talks to the page via `window.__R3F_DOM__`; if the page doesn’t use the library, the panel shows a short message asking you to add `<ThreeDom />` and refresh.

---

## Playwright API

### Setup

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'http://localhost:5173',
    // Headless Chromium needs WebGL
    launchOptions: {
      args: ['--enable-webgl', '--enable-gpu'],
    },
  },
});
```

### Test Fixture

```ts
import { test, expect } from '@react-three-dom/playwright';

test('example', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();
  // r3f is an R3FFixture instance with all methods below
});
```

### Queries

```ts
// Single object lookups
await r3f.getByTestId('my-object');     // ObjectMetadata | null
await r3f.getByUuid('abc-123');         // ObjectMetadata | null
await r3f.getCount();                    // number

// BIM/CAD queries
await r3f.getByType('Mesh');            // ObjectMetadata[]
await r3f.getByUserData('category', 'wall');  // ObjectMetadata[]
await r3f.getCountByType('Mesh');       // number

// Batch query (single round-trip for multiple objects)
const results = await r3f.getObjects(['wall-1', 'door-2', 'window-3']);
// results: Record<string, ObjectMetadata | null>

// Full scene
await r3f.snapshot();                    // SceneSnapshot
await r3f.inspect('my-object');          // ObjectInspection | null
```

### Interactions

All object-targeted interactions **auto-wait** for the bridge and object to exist (default 5s timeout):

```ts
await r3f.click('my-button');
await r3f.doubleClick('my-button');
await r3f.contextMenu('my-button');
await r3f.hover('my-button');
await r3f.drag('my-object', { x: 2, y: 0, z: 0 });
await r3f.wheel('my-object', { deltaY: 100 });
await r3f.pointerMiss();  // click empty space

// Custom auto-wait timeout
await r3f.click('slow-loading-object', 15_000);
```

#### Drawing on Canvas

For drawing, annotation, and whiteboard apps:

```ts
import { linePath, curvePath, circlePath, rectPath } from '@react-three-dom/playwright';

// Draw a straight line
await r3f.drawPath(linePath({ x: 100, y: 100 }, { x: 400, y: 300 }, 20));

// Draw a quadratic bezier curve
await r3f.drawPath(curvePath(
  { x: 50, y: 200 },    // start
  { x: 150, y: 50 },    // control point
  { x: 250, y: 200 },   // end
  30,
));

// Draw a circle
await r3f.drawPath(circlePath({ x: 200, y: 200 }, 80));

// Draw a rectangle
await r3f.drawPath(rectPath({ x: 50, y: 50 }, { x: 250, y: 200 }));

// Pen pressure simulation
await r3f.drawPath(
  [
    { x: 50, y: 50, pressure: 0.2 },
    { x: 100, y: 80, pressure: 0.6 },
    { x: 150, y: 70, pressure: 0.9 },
  ],
  { pointerType: 'pen', stepDelayMs: 16 },
);
```

### Waiters

```ts
// Wait for scene to stabilize (object count stable for N checks)
await r3f.waitForSceneReady({ stableChecks: 3, timeout: 10_000 });

// Wait for a specific object (useful when scene count never stabilizes)
await r3f.waitForObject('my-object', {
  bridgeTimeout: 30_000,
  objectTimeout: 40_000,
});

// Wait for scene to stop changing (no property changes for N frames)
await r3f.waitForIdle({ idleFrames: 10, timeout: 10_000 });

// Wait for new objects to appear (for drawing apps)
await r3f.drawPath(points);
const { newObjects, count } = await r3f.waitForNewObject({
  type: 'Line',          // optional: filter by Three.js type
  nameContains: 'stroke', // optional: filter by name substring
  timeout: 10_000,
});
```

All waiters check `_ready === true` on the bridge and **fail fast** with rich diagnostics if the bridge is in an error state, instead of silently timing out.

### Matchers (26 total)

All matchers auto-retry using `expect.poll()` until they pass or timeout (default 5s).

#### Object-Level (Tier 1 — metadata, lightweight)

```ts
await expect(r3f).toExist('my-object');
await expect(r3f).toBeVisible('my-object');
await expect(r3f).toHavePosition('id', [x, y, z], tolerance?);
await expect(r3f).toHaveRotation('id', [x, y, z], tolerance?);
await expect(r3f).toHaveScale('id', [x, y, z], tolerance?);
await expect(r3f).toHaveType('id', 'Mesh');
await expect(r3f).toHaveName('id', 'Chair');
await expect(r3f).toHaveGeometryType('id', 'BoxGeometry');
await expect(r3f).toHaveMaterialType('id', 'MeshStandardMaterial');
await expect(r3f).toHaveChildCount('id', 3);
await expect(r3f).toHaveParent('id', 'parent-testId');
await expect(r3f).toHaveInstanceCount('id', 100);
```

#### Object-Level (Tier 2 — inspection, heavier)

```ts
await expect(r3f).toBeInFrustum('id');
await expect(r3f).toHaveBounds('id', { min: [..], max: [..] }, tolerance?);
await expect(r3f).toHaveColor('id', '#ff0000');
await expect(r3f).toHaveOpacity('id', 0.5, tolerance?);
await expect(r3f).toBeTransparent('id');
await expect(r3f).toHaveVertexCount('id', 24);
await expect(r3f).toHaveTriangleCount('id', 12);
await expect(r3f).toHaveUserData('id', 'category', 'wall');
await expect(r3f).toHaveMapTexture('id', 'brick-diffuse.png');
```

#### Scene-Level (performance budgets)

```ts
await expect(r3f).toHaveObjectCount(42);
await expect(r3f).toHaveObjectCountGreaterThan(10);
await expect(r3f).toHaveCountByType('Mesh', 5);
await expect(r3f).toHaveTotalTriangleCount(50000);
await expect(r3f).toHaveTotalTriangleCountLessThan(100_000);
```

All matchers support `.not` negation and `{ timeout, interval }` options:

```ts
await expect(r3f).not.toBeVisible('hidden-object');
await expect(r3f).toExist('slow-object', { timeout: 15_000 });
```

### Debug Logging

```ts
test('with debug logs', async ({ page, r3f }) => {
  // Enable debug logging — browser-side [r3f-dom:*] logs appear in test output
  await r3f.enableDebug();
  
  await page.goto('/');
  await r3f.waitForSceneReady();
  
  // Print the full scene tree to the test terminal
  await r3f.logScene();
});
```

---

## Cypress API

### Setup

```ts
// cypress/support/e2e.ts
import '@react-three-dom/cypress';
```

### Commands

#### Queries

```ts
cy.r3fGetObject('id');                       // ObjectMetadata | null
cy.r3fInspect('id');                         // ObjectInspection | null
cy.r3fSnapshot();                            // SceneSnapshot
cy.r3fGetCount();                            // number
cy.r3fGetByType('Mesh');                     // ObjectMetadata[]
cy.r3fGetByUserData('category', 'wall');     // ObjectMetadata[]
cy.r3fGetCountByType('Mesh');                // number
cy.r3fGetObjects(['id1', 'id2', 'id3']);     // Record<string, ObjectMetadata | null>
```

#### Interactions

```ts
cy.r3fClick('id');
cy.r3fDoubleClick('id');
cy.r3fContextMenu('id');
cy.r3fHover('id');
cy.r3fDrag('id', { x: 2, y: 0, z: 0 });
cy.r3fWheel('id', { deltaY: 100 });
cy.r3fPointerMiss();
cy.r3fDrawPath([{ x: 100, y: 100 }, { x: 200, y: 150 }, { x: 300, y: 200 }]);
```

#### Waiters

```ts
cy.r3fWaitForSceneReady({ stableChecks: 3, timeout: 10_000 });
cy.r3fWaitForObject('id', { bridgeTimeout: 30_000, objectTimeout: 40_000 });
cy.r3fWaitForIdle({ idleChecks: 10, timeout: 10_000 });
cy.r3fWaitForNewObject({ type: 'Line', timeout: 10_000 });
```

#### Diagnostics

```ts
cy.r3fEnableDebug();  // Forward browser logs to Cypress command log
cy.r3fLogScene();     // Print scene tree to command log and console
```

#### Selection

```ts
cy.r3fSelect('id');
cy.r3fClearSelection();
```

---

## Global API (`window.__R3F_DOM__`)

Available after `<ThreeDom />` mounts. The `_ready` flag indicates whether initialization completed successfully:

```ts
interface R3FDOM {
  _ready: boolean;
  _error?: string;  // set when _ready is false and setup failed
  
  // Queries
  getByTestId(id: string): ObjectMetadata | null;
  getByUuid(uuid: string): ObjectMetadata | null;
  getByName(name: string): ObjectMetadata[];
  getCount(): number;
  getByType(type: string): ObjectMetadata[];
  getByUserData(key: string, value?: unknown): ObjectMetadata[];
  getCountByType(type: string): number;
  getObjects(ids: string[]): Record<string, ObjectMetadata | null>;
  
  // Inspection
  snapshot(): SceneSnapshot;
  inspect(idOrUuid: string): ObjectInspection | null;
  getObject3D(idOrUuid: string): Object3D | null;
  
  // Interactions
  click(idOrUuid: string): void;
  doubleClick(idOrUuid: string): void;
  contextMenu(idOrUuid: string): void;
  hover(idOrUuid: string): void;
  drag(idOrUuid: string, delta: { x; y; z }): Promise<void>;
  wheel(idOrUuid: string, options?: { deltaY?; deltaX? }): void;
  pointerMiss(): void;
  drawPath(points: Array<{ x; y; pressure? }>, options?): Promise<{ eventCount; pointCount }>;
  
  // Selection
  select(idOrUuid: string): void;
  clearSelection(): void;
  
  version: string;
}
```

---

## Types

```ts
interface ObjectMetadata {
  uuid: string;
  name: string;
  type: string;           // "Mesh", "Group", "Line", "Points", "InstancedMesh", etc.
  visible: boolean;
  testId?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  geometryType?: string;  // "BoxGeometry", "BufferGeometry", etc.
  materialType?: string;  // "MeshStandardMaterial", "ShaderMaterial", etc.
  vertexCount?: number;
  triangleCount?: number;
  instanceCount?: number; // For InstancedMesh
  parentUuid: string | null;
  childrenUuids: string[];
}

interface ObjectInspection {
  metadata: ObjectMetadata;
  worldMatrix: number[];  // 16-element column-major matrix
  bounds: { min: [number, number, number]; max: [number, number, number] };
  geometry?: {
    type: string;
    attributes: Record<string, { itemSize: number; count: number }>;
    index?: { count: number };
    boundingSphere?: { center: [number, number, number]; radius: number };
  };
  material?: {
    type: string;
    color?: string;         // hex e.g. "#ff0000"
    map?: string;           // texture name
    uniforms?: Record<string, unknown>;
    transparent?: boolean;
    opacity?: number;
    side?: number;
  };
  userData: Record<string, unknown>;
}

interface SceneSnapshot {
  timestamp: number;
  objectCount: number;
  tree: SnapshotNode;
}

interface SnapshotNode {
  uuid: string;
  name: string;
  type: string;
  testId?: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  children: SnapshotNode[];
}
```

---

## Application Examples

### BIM / Architecture

```ts
test('BIM floor plan loads correctly', async ({ page, r3f }) => {
  await page.goto('/floor-plan');
  await r3f.waitForSceneReady();
  
  // Query by userData
  const walls = await r3f.getByUserData('category', 'wall');
  expect(walls.length).toBeGreaterThan(0);
  
  // Verify specific elements
  await expect(r3f).toExist('door-main');
  await expect(r3f).toHaveType('door-main', 'Mesh');
  await expect(r3f).toHaveColor('door-main', '#8b4513');
  
  // Count by type
  await expect(r3f).toHaveCountByType('Mesh', 24);
  
  // Performance budget
  await expect(r3f).toHaveTotalTriangleCountLessThan(500_000);
});
```

### GLB Model Viewer

```ts
test('GLB model loads and displays', async ({ page, r3f }) => {
  await page.goto('/model-viewer');
  await r3f.waitForObject('building-model', { objectTimeout: 60_000 });
  
  await expect(r3f).toBeVisible('building-model');
  await expect(r3f).toHaveObjectCountGreaterThan(10);
  
  // Inspect geometry
  await expect(r3f).toHaveGeometryType('wall-north', 'BufferGeometry');
  await expect(r3f).toHaveMapTexture('wall-north', 'brick.jpg');
});
```

### Drawing / Whiteboard App

```ts
import { test, expect, linePath, circlePath } from '@react-three-dom/playwright';

test('user can draw shapes', async ({ page, r3f }) => {
  await page.goto('/whiteboard');
  await r3f.waitForSceneReady();
  
  // Draw a line
  await r3f.drawPath(linePath({ x: 100, y: 100 }, { x: 400, y: 300 }, 20));
  const { count } = await r3f.waitForNewObject({ type: 'Line' });
  expect(count).toBe(1);
  
  // Draw a circle
  await r3f.drawPath(circlePath({ x: 300, y: 300 }, 50));
  await r3f.waitForNewObject({ type: 'Line' });
  
  // Verify total strokes
  await expect(r3f).toHaveObjectCountGreaterThan(2);
});
```

### CAD Application

```ts
test('CAD object manipulation', async ({ page, r3f }) => {
  await page.goto('/cad');
  await r3f.waitForSceneReady();
  
  // Click to select
  await r3f.click('gear-assembly');
  
  // Drag to reposition
  await r3f.drag('gear-assembly', { x: 5, y: 0, z: 0 });
  await expect(r3f).toHavePosition('gear-assembly', [5, 0, 0], 0.5);
  
  // Batch verify multiple components
  const parts = await r3f.getObjects(['shaft', 'bearing-left', 'bearing-right', 'housing']);
  expect(Object.values(parts).every(Boolean)).toBe(true);
  
  // Verify hierarchy
  await expect(r3f).toHaveParent('shaft', 'gear-assembly');
  await expect(r3f).toHaveChildCount('gear-assembly', 4);
});
```

---

## DevTools Integration

After adding `<ThreeDom />`, open browser DevTools (Elements tab). You'll see a hidden `#three-dom-root` element containing your scene graph as custom elements:

```html
<div id="three-dom-root" style="display:none">
  <three-scene uuid="abc123" name="Scene">
    <three-group uuid="def456" name="Furniture" data-testid="furniture-group">
      <three-mesh uuid="ghi789" name="Chair" data-testid="chair-primary" type="Mesh">
      </three-mesh>
    </three-group>
  </three-scene>
</div>
```

Select any element and use `$0.inspect()` in the console for detailed info, or `$0.click()` to trigger a click interaction.

## Performance

The bridge is designed to scale to 100k+ objects:

- **Tier 1 metadata** (~120 bytes/object) — Always in memory, updated every frame
- **Tier 2 inspection** — On-demand deep inspection, not cached
- **Lazy DOM** — Only materializes DOM nodes when needed (LRU eviction at 2,000 nodes)
- **Priority queue** — Changed objects sync first, then amortized batch with 0.5ms time budget
- **Error resilience** — `try/catch` around metadata extraction, per-frame sync, and patchedAdd/Remove prevents single-object failures from crashing the scene

## Debug Logging

Enable the three-layer debug logging system for diagnosing test failures:

```ts
// Playwright — logs appear in your test terminal
await r3f.enableDebug();

// Cypress — logs appear in the Cypress command log
cy.r3fEnableDebug();

// Browser console — set before the app loads
window.__R3F_DOM_DEBUG__ = true;
```

Debug logs are prefixed with `[r3f-dom:area]` (e.g. `[r3f-dom:store]`, `[r3f-dom:click]`, `[r3f-dom:drag]`).

## Requirements

- React 18+
- Three.js 0.150+
- @react-three/fiber 8+

## License

MIT
