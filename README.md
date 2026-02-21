# react-three-dom

E2E testing and developer tools for [React Three Fiber](https://github.com/pmndrs/react-three-fiber). Mirrors the Three.js scene graph into the DOM so you can test 3D applications with [Playwright](https://playwright.dev) or [Cypress](https://cypress.io), and inspect them in Chrome DevTools.

## Why?

Three.js renders to a `<canvas>` — invisible to traditional DOM-based testing tools. **react-three-dom** bridges that gap:

- Mirrors every Three.js object as a custom HTML element (`<three-mesh>`, `<three-group>`, etc.)
- Exposes a query/interaction API on `window.__R3F_DOM__` for E2E test frameworks
- Provides first-class Playwright and Cypress SDKs with 27+ assertions, 8 interaction types, and 5 waiter strategies
- Ships a Chrome DevTools extension for visual scene inspection

```
┌─────────────────────────────────────────────────┐
│  R3F Canvas                                     │
│  ┌───────────────────────────────────────────┐  │
│  │ Three.js Scene Graph                      │  │
│  │  Scene                                    │  │
│  │   ├─ Group "building"                     │  │
│  │   │   ├─ Mesh "wall-1"                    │  │
│  │   │   └─ Mesh "floor"                     │  │
│  │   └─ PerspectiveCamera                    │  │
│  └───────────────────────────────────────────┘  │
│                    ↕ sync                        │
│  ┌───────────────────────────────────────────┐  │
│  │ DOM Mirror (hidden, zero-layout)          │  │
│  │  <three-scene>                            │  │
│  │   ├─ <three-group data-name="building">   │  │
│  │   │   ├─ <three-mesh data-name="wall-1">  │  │
│  │   │   └─ <three-mesh data-name="floor">   │  │
│  │   └─ <three-camera>                       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         ↕ window.__R3F_DOM__
┌─────────────────────────────────────────────────┐
│  Playwright / Cypress / DevTools Extension      │
└─────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@react-three-dom/core` | Bridge component, scene mirror, object store, interaction engine |
| `@react-three-dom/playwright` | Playwright SDK — fixture, 27+ matchers, waiters, reporter |
| `@react-three-dom/cypress` | Cypress SDK — custom commands, Chai assertions, waiters |
| `@react-three-dom/devtools` | Chrome DevTools extension — R3F scene inspector tab |

---

## Quick Start

### 1. Install

```bash
# Core (required in your app)
npm install @react-three-dom/core

# Test framework (pick one, dev dependency)
npm install -D @react-three-dom/playwright   # for Playwright
npm install -D @react-three-dom/cypress      # for Cypress
```

### 2. Add the bridge to your app

Drop `<ThreeDom />` inside your R3F `<Canvas>`. Use `userData.testId` on objects you want to query in tests.

```tsx
import { Canvas } from '@react-three/fiber';
import { ThreeDom } from '@react-three-dom/core';

function App() {
  return (
    <Canvas>
      <ThreeDom />
      <ambientLight />
      <mesh userData={{ testId: 'hero-cube' }} position={[0, 1, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      <mesh userData={{ testId: 'floor' }} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#888" />
      </mesh>
    </Canvas>
  );
}
```

### 3. Write tests

#### Playwright

```ts
// playwright.config.ts — extend expect once
import { expect } from '@playwright/test';
import { r3fMatchers } from '@react-three-dom/playwright';
expect.extend(r3fMatchers);
```

```ts
// tests/scene.spec.ts
import { expect } from '@playwright/test';
import { test } from '@react-three-dom/playwright';

test('hero cube exists and has correct material', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();

  // Query
  await expect(r3f).toExist('hero-cube');
  await expect(r3f).toBeVisible('hero-cube');
  await expect(r3f).toHaveType('hero-cube', 'Mesh');

  // Spatial
  await expect(r3f).toHavePosition('hero-cube', [0, 1, 0], 0.01);
  await expect(r3f).toHaveScale('hero-cube', [1, 1, 1]);

  // Material
  await expect(r3f).toHaveColor('hero-cube', '#ffa500');
  await expect(r3f).toHaveMaterialType('hero-cube', 'MeshStandardMaterial');
  await expect(r3f).toHaveGeometryType('hero-cube', 'BoxGeometry');

  // Interact
  await r3f.click('hero-cube');
  await r3f.hover('hero-cube');

  // Scene-level
  await expect(r3f).toHaveObjectCountGreaterThan(3);
});
```

#### Cypress

```ts
// cypress/support/e2e.ts
import '@react-three-dom/cypress';
```

```ts
// cypress/e2e/scene.cy.ts
it('hero cube exists and is visible', () => {
  cy.visit('/');
  cy.r3fWaitForSceneReady();

  cy.r3fGetObject('hero-cube').should('not.be.null');
  cy.r3fClick('hero-cube');
  cy.r3fHover('hero-cube');

  // Chai assertions
  cy.wrap(null).should('r3fExist', 'hero-cube');
  cy.wrap(null).should('r3fVisible', 'hero-cube');
  cy.wrap(null).should('r3fPosition', 'hero-cube', [0, 1, 0], 0.01);
  cy.wrap(null).should('r3fColor', 'hero-cube', '#ffa500');
});
```

---

## ThreeDom Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `canvasId` | `string` | — | Unique ID for multi-canvas apps. Registers in `window.__R3F_DOM_INSTANCES__[canvasId]`. |
| `primary` | `boolean` | `true` when no canvasId | Whether `window.__R3F_DOM__` points to this instance. |
| `root` | `string \| HTMLElement` | `"#three-dom-root"` | CSS selector or element for the mirror DOM container. |
| `batchSize` | `number` | `500` | Objects to sync per amortized batch per frame. |
| `syncBudgetMs` | `number` | `0.5` | Max time (ms) for sync work per frame. Increase for large scenes. |
| `maxDomNodes` | `number` | `2000` | Max materialized DOM nodes. LRU eviction when exceeded. |
| `initialDepth` | `number` | `3` | How deep to materialize the DOM tree on mount. |
| `enabled` | `boolean` | `true` | Master switch for all sync. |
| `debug` | `boolean` | `false` | Enable debug logging to browser console. |
| `inspect` | `boolean` | `false` | Enable inspect mode on mount (hover-to-highlight). |

---

## Selectors

Objects are identified by **testId** (`userData.testId`), **uuid**, or **name**. Set `testId` in your R3F JSX:

```tsx
<mesh userData={{ testId: 'my-wall' }}>
```

All query methods accept either a testId or uuid string.

---

## Queries

### Playwright (`r3f` fixture)

| Method | Returns | Description |
|--------|---------|-------------|
| `getObject(id)` | `ObjectMetadata \| null` | By testId or uuid |
| `getByTestId(id)` | `ObjectMetadata \| null` | By testId only |
| `getByUuid(uuid)` | `ObjectMetadata \| null` | By uuid only |
| `getByName(name)` | `ObjectMetadata[]` | All objects with this name |
| `getChildren(id)` | `ObjectMetadata[]` | Direct children |
| `getParent(id)` | `ObjectMetadata \| null` | Parent object |
| `getByType(type)` | `ObjectMetadata[]` | e.g. `'Mesh'`, `'Group'`, `'PointLight'` |
| `getByGeometryType(type)` | `ObjectMetadata[]` | e.g. `'BoxGeometry'`, `'BufferGeometry'` |
| `getByMaterialType(type)` | `ObjectMetadata[]` | e.g. `'MeshStandardMaterial'` |
| `getByUserData(key, value?)` | `ObjectMetadata[]` | By userData key (and optional value) |
| `getCount()` | `number` | Total object count |
| `getCountByType(type)` | `number` | Count by Three.js type |
| `getObjects(ids[])` | `Record<string, ObjectMetadata \| null>` | Batch lookup |
| `getWorldPosition(id)` | `[x,y,z] \| null` | World-space position |
| `inspect(id, options?)` | `ObjectInspection \| null` | Deep inspection (bounds, material, geometry). Pass `{ includeGeometryData: true }` for vertex/index buffers. |
| `snapshot()` | `SceneSnapshot` | Full scene tree as JSON |
| `diffSnapshots(before, after)` | `SceneDiff` | Added/removed/changed nodes |
| `trackObjectCount(fn)` | `{ added, removed }` | Run action, get count delta |
| `getCameraState()` | `CameraState` | Camera position, rotation, fov, near, far, zoom |
| `getCanvasLocator()` | `Locator` | Playwright locator for the canvas element |
| `getCanvasIds()` | `string[]` | All active canvas IDs (multi-canvas) |

### Cypress

Same concepts, prefixed with `cy.r3f`:

`r3fGetObject`, `r3fGetByTestId`, `r3fGetByName`, `r3fGetByUuid`, `r3fGetChildren`, `r3fGetParent`, `r3fGetByType`, `r3fGetByGeometryType`, `r3fGetByMaterialType`, `r3fGetByUserData`, `r3fGetCount`, `r3fGetCountByType`, `r3fGetObjects`, `r3fGetWorldPosition`, `r3fInspect`, `r3fSnapshot`, `r3fDiffSnapshots`, `r3fTrackObjectCount`, `r3fGetCameraState`, `r3fGetCanvas`, `r3fFuzzyFind`, `r3fLogScene`, `r3fLogDiagnostics`, `r3fGetDiagnostics`

---

## Interactions

All interactions auto-wait for the bridge and target object. They dispatch real pointer events on the canvas at the object's projected screen position.

### Playwright

```ts
await r3f.click('my-object');
await r3f.doubleClick('my-object');
await r3f.contextMenu('my-object');
await r3f.hover('my-object');
await r3f.unhover();
await r3f.drag('my-object', { x: 100, y: 0 });       // screen-space delta
await r3f.wheel('my-object', { deltaY: -120 });
await r3f.pointerMiss();                               // click empty space
await r3f.drawPath([                                    // freehand drawing
  { x: 100, y: 100 },
  { x: 200, y: 150 },
  { x: 300, y: 100 },
]);
```

### Cypress

```ts
cy.r3fClick('my-object');
cy.r3fDoubleClick('my-object');
cy.r3fContextMenu('my-object');
cy.r3fHover('my-object');
cy.r3fUnhover();
cy.r3fDrag('my-object', { x: 100, y: 0 });
cy.r3fWheel('my-object', { deltaY: -120 });
cy.r3fPointerMiss();
cy.r3fDrawPath([{ x: 100, y: 100 }, { x: 200, y: 150 }]);
```

---

## Assertions

### Playwright (27+ matchers)

Extend Playwright's `expect` with `expect.extend(r3fMatchers)`, then:

#### Object assertions

| Matcher | Example |
|---------|---------|
| `toExist(id)` | `await expect(r3f).toExist('cube')` |
| `toBeVisible(id)` | `await expect(r3f).toBeVisible('cube')` |
| `toHavePosition(id, [x,y,z], tol?)` | `await expect(r3f).toHavePosition('cube', [0, 1, 0], 0.01)` |
| `toHaveWorldPosition(id, [x,y,z], tol?)` | World-space position (includes parent transforms) |
| `toHaveRotation(id, [x,y,z], tol?)` | Euler rotation in radians |
| `toHaveScale(id, [x,y,z], tol?)` | Local scale |
| `toHaveType(id, type)` | `'Mesh'`, `'Group'`, `'PointLight'`, etc. |
| `toHaveName(id, name)` | Object name |
| `toHaveGeometryType(id, type)` | `'BoxGeometry'`, `'SphereGeometry'`, etc. |
| `toHaveMaterialType(id, type)` | `'MeshStandardMaterial'`, etc. |
| `toHaveChildCount(id, count)` | Number of direct children |
| `toHaveParent(id, parentId)` | Parent by testId, uuid, or name |
| `toHaveInstanceCount(id, count)` | For InstancedMesh |
| `toBeInFrustum(id)` | Object has valid (finite) bounds |
| `toHaveBounds(id, { min, max }, tol?)` | Bounding box |
| `toHaveColor(id, '#hex')` | Material color |
| `toHaveOpacity(id, value, tol?)` | Material opacity |
| `toBeTransparent(id)` | `material.transparent === true` |
| `toHaveVertexCount(id, count)` | Geometry vertex count |
| `toHaveTriangleCount(id, count)` | Geometry triangle count |
| `toHaveUserData(id, key, value?)` | userData key (and optional value) |
| `toHaveMapTexture(id, name?)` | Has a map texture (optional name match) |

#### Scene-level assertions

| Matcher | Example |
|---------|---------|
| `toHaveObjectCount(count)` | `await expect(r3f).toHaveObjectCount(15)` |
| `toHaveObjectCountGreaterThan(min)` | `await expect(r3f).toHaveObjectCountGreaterThan(5)` |
| `toHaveCountByType(type, count)` | `await expect(r3f).toHaveCountByType('Mesh', 10)` |
| `toHaveTotalTriangleCount(count)` | Total triangles across all meshes |
| `toHaveTotalTriangleCountLessThan(max)` | Performance budget assertion |

#### Camera assertions

| Matcher | Example |
|---------|---------|
| `toHaveCameraPosition([x,y,z], tol?)` | `await expect(r3f).toHaveCameraPosition([0, 5, 10], 0.1)` |
| `toHaveCameraFov(fov, tol?)` | PerspectiveCamera field of view |
| `toHaveCameraNear(near, tol?)` | Near clipping plane |
| `toHaveCameraFar(far, tol?)` | Far clipping plane |
| `toHaveCameraZoom(zoom, tol?)` | Camera zoom level |

#### Batch assertions

| Matcher | Example |
|---------|---------|
| `toAllExist(ids \| pattern)` | `await expect(r3f).toAllExist('wall-*')` |
| `toAllBeVisible(ids \| pattern)` | `await expect(r3f).toAllBeVisible(['wall-1', 'wall-2'])` |
| `toNoneExist(ids \| pattern)` | `await expect(r3f).toNoneExist('temp-*')` |

All matchers support `.not` and `{ timeout }` options.

### Cypress (Chai assertions)

Same matchers, prefixed with `r3f`:

`r3fExist`, `r3fVisible`, `r3fPosition`, `r3fWorldPosition`, `r3fRotation`, `r3fScale`, `r3fType`, `r3fName`, `r3fGeometryType`, `r3fMaterialType`, `r3fChildCount`, `r3fParent`, `r3fInstanceCount`, `r3fInFrustum`, `r3fBounds`, `r3fColor`, `r3fOpacity`, `r3fTransparent`, `r3fVertexCount`, `r3fTriangleCount`, `r3fUserData`, `r3fMapTexture`, `r3fObjectCount`, `r3fObjectCountGreaterThan`, `r3fCountByType`, `r3fTotalTriangleCount`, `r3fTotalTriangleCountLessThan`, `r3fCameraPosition`, `r3fCameraFov`, `r3fCameraNear`, `r3fCameraFar`, `r3fCameraZoom`, `r3fAllExist`, `r3fAllVisible`, `r3fNoneExist`

---

## Waiters

### Playwright

```ts
// Wait for bridge + stable object count (most common)
await r3f.waitForSceneReady();
await r3f.waitForSceneReady({ stableChecks: 5, timeout: 15_000 });

// Wait for a specific object (when count never stabilizes)
await r3f.waitForObject('my-model', { objectTimeout: 60_000 });

// Wait for scene to stop changing (after animations/interactions)
await r3f.waitForIdle({ idleFrames: 10, timeout: 10_000 });

// Wait for new objects to appear (drawing/annotation apps)
const result = await r3f.waitForNewObject({ type: 'Line', timeout: 5_000 });
console.log(result.count, result.newUuids);

// Wait for an object to be removed (delete flows)
await r3f.waitForObjectRemoved('deleted-item');
```

### Cypress

```ts
cy.r3fWaitForSceneReady();
cy.r3fWaitForSceneReady({ stableChecks: 5, timeout: 15_000 });
cy.r3fWaitForObject('my-model', { objectTimeout: 60_000 });
cy.r3fWaitForIdle({ idleChecks: 10, timeout: 10_000 });
cy.r3fWaitForNewObject({ type: 'Line' });
cy.r3fWaitForObjectRemoved('deleted-item');
```

---

## Multi-Canvas Support

For apps with multiple `<Canvas>` elements, give each a unique `canvasId`:

```tsx
<Canvas>
  <ThreeDom canvasId="viewport-3d" primary />
  {/* ... */}
</Canvas>

<Canvas>
  <ThreeDom canvasId="minimap" />
  {/* ... */}
</Canvas>
```

### Playwright

```ts
test('multi-canvas', async ({ page, r3f }) => {
  await page.goto('/');

  // Default fixture targets the primary canvas
  await r3f.waitForSceneReady();

  // Scope to a specific canvas
  const minimap = r3f.forCanvas('minimap');
  await minimap.waitForSceneReady();
  await expect(minimap).toExist('minimap-marker');

  // List all canvases
  const ids = await r3f.getCanvasIds(); // ['viewport-3d', 'minimap']
});
```

### Cypress

```ts
it('multi-canvas', () => {
  cy.visit('/');
  cy.r3fWaitForSceneReady(); // targets primary

  cy.r3fUseCanvas('minimap'); // switch context
  cy.r3fWaitForSceneReady();
  cy.r3fGetObject('minimap-marker').should('not.be.null');

  cy.r3fUseCanvas(null); // back to primary
});
```

---

## Snapshot Diffing

Track scene changes across interactions:

```ts
// Playwright
const before = await r3f.snapshot();
await r3f.click('add-button');
const after = await r3f.snapshot();
const diff = r3f.diffSnapshots(before, after);
console.log(diff.added);   // newly added nodes
console.log(diff.removed); // removed nodes
console.log(diff.changed); // nodes with property changes

// Or use the shorthand:
const delta = await r3f.trackObjectCount(async () => {
  await r3f.click('add-button');
});
expect(delta.added).toBe(1);
```

---

## Drawing / Annotation Testing

For apps with freehand drawing (strokes, annotations):

```ts
import { linePath, curvePath, rectPath, circlePath } from '@react-three-dom/playwright';

// Draw a straight line
await r3f.drawPath(linePath({ x: 100, y: 100 }, { x: 300, y: 200 }));

// Draw a curve (Bezier)
await r3f.drawPath(curvePath(
  { x: 100, y: 100 },
  { x: 200, y: 50 },
  { x: 300, y: 100 },
));

// Draw a rectangle
await r3f.drawPath(rectPath(100, 100, 200, 150));

// Draw a circle
await r3f.drawPath(circlePath(200, 200, 80));

// Wait for the new geometry
const result = await r3f.waitForNewObject({ type: 'Line' });
```

---

## DevTools Extension

The Chrome DevTools extension adds an **R3F** tab for visual scene inspection.

### Features

- Scene tree with search
- Click to select objects (highlights in 3D)
- Bidirectional sync: select in DevTools ↔ highlight in scene
- Multi-canvas selector dropdown
- Inspect mode: hover over 3D objects to highlight and reveal in Elements tab

### Usage

1. Build: `cd packages/devtools && pnpm build`
2. Load in Chrome: `chrome://extensions` → "Load unpacked" → select `packages/devtools/dist`
3. Open DevTools → **R3F** tab

Toggle inspect mode from the console:

```js
window.__R3F_DOM__.setInspectMode(true);
```

---

## Performance Tuning

For large scenes (1000+ objects), tune these `<ThreeDom>` props:

| Scenario | Recommendation |
|----------|---------------|
| Large static scene | Increase `batchSize` to `1000`+, increase `syncBudgetMs` to `1`-`2` |
| Frequent animations | Keep `syncBudgetMs` low (`0.3`-`0.5`) to avoid frame drops |
| Deep hierarchy | Increase `initialDepth` to `5`+ |
| Memory constrained | Lower `maxDomNodes` to `500`-`1000` |
| CI / headless | `syncBudgetMs: 2` is fine since there's no visual frame budget |

```tsx
<ThreeDom
  batchSize={1000}
  syncBudgetMs={1.5}
  maxDomNodes={5000}
  initialDepth={5}
/>
```

---

## CI / Headless WebGL

Playwright in CI needs WebGL flags. Add to `playwright.config.ts`:

```ts
export default defineConfig({
  use: {
    launchOptions: {
      args: [
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader-webgl',
        '--enable-gpu',
      ],
    },
  },
});
```

If WebGL is unavailable, the bridge still mounts but with `_ready: false` and a diagnostic error message — tests will get a clear failure instead of a silent hang.

---

## Diagnostic Reporting

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
const r3f = new R3FFixture(page, { report: false });
```

---

## API Reference: `ObjectMetadata`

Every query returns metadata with these fields:

```ts
interface ObjectMetadata {
  uuid: string;
  name: string;
  type: string;                          // 'Mesh', 'Group', 'PointLight', etc.
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];    // Euler (radians)
  scale: [number, number, number];
  parentUuid: string;
  childrenUuids: string[];
  testId?: string;                       // from userData.testId
  geometryType?: string;                 // 'BoxGeometry', etc.
  materialType?: string;                 // 'MeshStandardMaterial', etc.
  vertexCount?: number;
  triangleCount?: number;
  instanceCount?: number;                // for InstancedMesh
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  renderOrder: number;
  layers: number;
}
```

---

## API Reference: `ObjectInspection`

Deep inspection via `r3f.inspect(id)`:

```ts
interface ObjectInspection {
  metadata: ObjectMetadata;
  worldMatrix: number[];                 // column-major 4×4
  bounds: { min: [x,y,z]; max: [x,y,z] };
  userData: Record<string, unknown>;
  geometry?: {
    type: string;
    attributes: Record<string, { itemSize: number; count: number }>;
    index?: { count: number };
    boundingSphere?: { center: [x,y,z]; radius: number };
    positionData?: number[];             // when includeGeometryData: true
    indexData?: number[];
  };
  material?: {
    type: string;
    color?: string;                      // '#rrggbb'
    opacity: number;
    transparent: boolean;
    side: number;
    map?: string;                        // texture name
    uniforms?: Record<string, unknown>;  // ShaderMaterial only
  };
}
```

---

## Requirements

- React 18+
- Three.js 0.150+
- @react-three/fiber 8+
- Playwright 1.40+ (for `@react-three-dom/playwright`)
- Cypress 12+ (for `@react-three-dom/cypress`)

## License

MIT
