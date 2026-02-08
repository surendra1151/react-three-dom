# react-three-dom

Developer tool & testing bridge for React Three Fiber — DOM mirror for DevTools inspection, stable selectors, deterministic 3D interactions, and E2E testing SDKs for Playwright & Cypress.

## Features

- **DOM Mirror** — Exposes your Three.js scene graph as a hidden DOM tree (`<three-mesh>`, `<three-group>`, etc.) for DevTools inspection
- **Stable Selectors** — Query objects by `testId`, `uuid`, or `name` across test runs
- **Deterministic Interactions** — Click, hover, drag, wheel, and double-click on 3D objects via synthetic pointer events
- **Scene Snapshots** — JSON representation of your entire scene for assertions and debugging
- **Inspector UI** — Built-in overlay panel with tree view, search, and property inspection
- **E2E Testing SDKs** — First-class support for Playwright and Cypress with custom matchers

## Packages

| Package | Description |
|---------|-------------|
| `@react-three-dom/core` | DOM mirror, snapshot API, interactions, and bridge component |
| `@react-three-dom/inspector` | In-app inspector UI overlay |
| `@react-three-dom/playwright` | Playwright E2E testing SDK with custom fixtures and matchers |
| `@react-three-dom/cypress` | Cypress E2E testing SDK with custom commands and assertions |

## Quick Start

### 1. Install

```bash
# Core (required)
npm install @react-three-dom/core

# Inspector UI (optional)
npm install @react-three-dom/inspector

# Testing SDKs (dev dependencies)
npm install -D @react-three-dom/playwright  # for Playwright
npm install -D @react-three-dom/cypress     # for Cypress
```

### 2. Add the Bridge to Your App

```tsx
import { Canvas } from '@react-three/fiber';
import { ThreeDom } from '@react-three-dom/core';
import { ThreeDomInspector } from '@react-three-dom/inspector';

function App() {
  return (
    <>
      {/* Optional: Inspector panel (toggle with Ctrl+Shift+I) */}
      <ThreeDomInspector position="right" defaultOpen={false} />
      
      <Canvas>
        {/* Add ThreeDom anywhere inside Canvas */}
        <ThreeDom />
        
        {/* Your scene */}
        <mesh userData={{ testId: 'my-cube' }}>
          <boxGeometry />
          <meshStandardMaterial color="orange" />
        </mesh>
      </Canvas>
    </>
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
```

### 4. Write E2E Tests

#### Playwright

```ts
// tests/scene.spec.ts
import { test, expect } from '@react-three-dom/playwright';

test('player can click on enemy', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();
  
  // Verify objects exist
  await expect(r3f).toExist('player-character');
  await expect(r3f).toExist('enemy-1');
  
  // Click on 3D object
  await r3f.click('enemy-1');
  
  // Check position
  await expect(r3f).toHavePosition('enemy-1', [0, 0, 5], 0.1);
});
```

#### Cypress

```ts
// cypress/e2e/scene.cy.ts
describe('Game scene', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.r3fWaitForSceneReady();
  });

  it('player can click on enemy', () => {
    // Verify objects exist
    cy.r3fGetObject('player-character').should('not.be.null');
    cy.r3fGetObject('enemy-1').should('not.be.null');
    
    // Click on 3D object
    cy.r3fClick('enemy-1');
    
    // Check position
    cy.r3fGetObject('enemy-1').then((meta) => {
      expect(meta.position[2]).to.be.closeTo(5, 0.1);
    });
  });
});
```

## API Reference

### @react-three-dom/core

#### `<ThreeDom />`

The bridge component. Renders nothing visible but wires up:
- DOM mirror (creates `#three-dom-root` with custom elements)
- Object store (tracks all scene objects)
- `window.__R3F_DOM__` global API for testing

```tsx
<Canvas>
  <ThreeDom />
  {/* ... */}
</Canvas>
```

#### Global API (`window.__R3F_DOM__`)

Available after ThreeDom mounts:

```ts
interface R3FDOM {
  // Queries
  getByTestId(id: string): ObjectMetadata | null;
  getByUuid(uuid: string): ObjectMetadata | null;
  getByName(name: string): ObjectMetadata[];
  getCount(): number;
  
  // Inspection
  snapshot(): SceneSnapshot;
  inspect(idOrUuid: string): ObjectInspection | null;
  getObject3D(idOrUuid: string): Object3D | null;
  
  // Interactions
  click(idOrUuid: string): void;
  doubleClick(idOrUuid: string): void;
  contextMenu(idOrUuid: string): void;
  hover(idOrUuid: string): void;
  drag(idOrUuid: string, delta: { x: number; y: number; z: number }): void;
  wheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): void;
  pointerMiss(): void;
  
  // Selection (for inspector)
  select(idOrUuid: string): void;
  clearSelection(): void;
  
  version: string;
}
```

#### Types

```ts
interface ObjectMetadata {
  uuid: string;
  name: string;
  type: string;           // "Mesh", "Group", "DirectionalLight", etc.
  visible: boolean;
  testId?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  geometryType?: string;  // "BoxGeometry", "SphereGeometry", etc.
  materialType?: string;  // "MeshStandardMaterial", etc.
  vertexCount?: number;
  triangleCount?: number;
  instanceCount?: number; // For InstancedMesh
  parentUuid: string | null;
  childrenUuids: string[];
}

interface ObjectInspection {
  metadata: ObjectMetadata;
  worldMatrix: number[];  // 16-element array
  bounds: { min: [number, number, number]; max: [number, number, number] };
  geometry?: { type: string; attributes: Record<string, { itemSize: number; count: number }> };
  material?: { type: string; color?: string; map?: string; transparent?: boolean; opacity?: number };
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

### @react-three-dom/inspector

#### `<ThreeDomInspector />`

Overlay panel for inspecting the scene graph.

```tsx
<ThreeDomInspector
  position="right"      // "left" | "right" | "bottom"
  defaultOpen={false}   // Start collapsed
  width={320}           // Panel width in pixels
  hotkey="ctrl+shift+i" // Toggle hotkey
/>
```

### @react-three-dom/playwright

#### Setup

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'http://localhost:5173',
  },
});
```

#### Test Fixture

```ts
import { test, expect } from '@react-three-dom/playwright';

test('example', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();
  
  // r3f is an R3FFixture instance
});
```

#### R3FFixture Methods

```ts
class R3FFixture {
  // Queries
  getByTestId(id: string): Promise<ObjectMetadata | null>;
  getByUuid(uuid: string): Promise<ObjectMetadata | null>;
  getCount(): Promise<number>;
  snapshot(): Promise<SceneSnapshot>;
  inspect(idOrUuid: string): Promise<ObjectInspection | null>;
  
  // Interactions
  click(idOrUuid: string): Promise<void>;
  doubleClick(idOrUuid: string): Promise<void>;
  contextMenu(idOrUuid: string): Promise<void>;
  hover(idOrUuid: string): Promise<void>;
  drag(idOrUuid: string, delta: { x: number; y: number; z: number }): Promise<void>;
  wheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): Promise<void>;
  pointerMiss(): Promise<void>;
  
  // Waiters
  waitForSceneReady(options?: { stableChecks?: number; timeout?: number }): Promise<void>;
  waitForIdle(options?: { idleChecks?: number; timeout?: number }): Promise<void>;
}
```

#### Custom Matchers

```ts
await expect(r3f).toExist('my-object');
await expect(r3f).toBeVisible('my-object');
await expect(r3f).toBeInFrustum('my-object');
await expect(r3f).toHavePosition('my-object', [x, y, z], tolerance);
await expect(r3f).toHaveBounds('my-object', { min: [...], max: [...] }, tolerance);
await expect(r3f).toHaveInstanceCount('my-instanced-mesh', 100);
```

### @react-three-dom/cypress

#### Setup

```ts
// cypress/support/e2e.ts
import '@react-three-dom/cypress';
```

```ts
// cypress.config.ts
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
  },
});
```

#### Custom Commands

```ts
// Waiters
cy.r3fWaitForSceneReady(options?: { stableChecks?: number; timeout?: number });
cy.r3fWaitForIdle(options?: { idleChecks?: number; timeout?: number });

// Queries
cy.r3fGetObject(idOrUuid: string): Chainable<ObjectMetadata | null>;
cy.r3fInspect(idOrUuid: string): Chainable<ObjectInspection | null>;
cy.r3fSnapshot(): Chainable<SceneSnapshot>;
cy.r3fGetCount(): Chainable<number>;

// Interactions
cy.r3fClick(idOrUuid: string);
cy.r3fDoubleClick(idOrUuid: string);
cy.r3fContextMenu(idOrUuid: string);
cy.r3fHover(idOrUuid: string);
cy.r3fDrag(idOrUuid: string, delta: { x: number; y: number; z: number });
cy.r3fWheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number });
cy.r3fPointerMiss();

// Selection
cy.r3fSelect(idOrUuid: string);
cy.r3fClearSelection();
```

#### Chai Assertions

```ts
expect(scene).to.r3fExist('my-object');
expect(scene).to.r3fVisible('my-object');
expect(scene).to.r3fInFrustum('my-object');
expect(scene).to.r3fPosition('my-object', [x, y, z], tolerance);
expect(scene).to.r3fBounds('my-object', { min: [...], max: [...] }, tolerance);
expect(scene).to.r3fInstanceCount('my-instanced-mesh', 100);
```

## DevTools Integration

After adding `<ThreeDom />`, open browser DevTools → Elements tab. You'll see a hidden `#three-dom-root` element containing your scene graph as custom elements:

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

## Requirements

- React 18+
- Three.js 0.150+
- @react-three/fiber 8+

## License

MIT
