# react-three-dom

Developer tool and E2E testing bridge for React Three Fiber: DOM mirror for DevTools, stable selectors, and deterministic 3D interactions. Test with Playwright or Cypress.

## Features

- **DOM mirror** — Scene graph as inspectable DOM (custom elements) for DevTools
- **Stable selectors** — Query by `testId`, `uuid`, `name`, type, geometry, material, or `userData`
- **Deterministic interactions** — Click, hover, drag, wheel, draw on 3D objects via pointer events
- **Scene snapshots** — JSON scene tree for assertions and diffing
- **Chrome DevTools tab** — R3F inspector (tree, search, selection) via extension
- **Playwright & Cypress** — Fixtures, commands, matchers, waiters, auto-waiting
- **BIM/CAD friendly** — Queries by type, geometry, material, `userData`; hierarchy helpers

## Packages

| Package | Description |
|---------|-------------|
| `@react-three-dom/core` | Bridge component, scene mirror, snapshot API, interactions |
| `@react-three-dom/devtools` | Chrome DevTools extension — R3F scene inspector tab |
| `@react-three-dom/playwright` | Playwright SDK: fixture, matchers, waiters |
| `@react-three-dom/cypress` | Cypress SDK: commands and assertions |

## How it works

1. Add `<ThreeDom />` inside your R3F `<Canvas>`. The bridge tracks the scene and exposes it via `window.__R3F_DOM__`.
2. Use `userData.testId` on 3D objects for stable selectors (no extra DOM or `data-testid`).
3. In E2E tests, use the Playwright fixture or Cypress commands to query objects and interact (click, hover, drag, etc.).

### Install

```bash
npm install @react-three-dom/core
npm install -D @react-three-dom/playwright   # for Playwright
npm install -D @react-three-dom/cypress      # for Cypress
```

### Add the bridge

```tsx
import { Canvas } from '@react-three/fiber';
import { ThreeDom } from '@react-three-dom/core';

function App() {
  return (
    <Canvas>
      <ThreeDom />
      <mesh userData={{ testId: 'cube' }}>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Canvas>
  );
}
```

### Example: Playwright

```ts
import { expect } from '@playwright/test';
import { test, r3fMatchers } from '@react-three-dom/playwright';
expect.extend(r3fMatchers);

test('click and assert', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();
  await expect(r3f).toExist('cube');
  await r3f.click('cube');
  await expect(r3f).toHavePosition('cube', [0, 0, 0], 0.1);
  await expect(r3f).toHaveColor('cube', '#ff6600');
});
```

### Example: Cypress

```ts
import '@react-three-dom/cypress';

it('click and assert', () => {
  cy.visit('/');
  cy.r3fWaitForSceneReady();
  cy.r3fGetObject('cube').should('not.be.null');
  cy.r3fClick('cube');
  cy.r3fGetObject('cube').its('position').should('deep.equal', [0, 0, 0]);
});
```

---

## Queries & selectors

Objects are selected by **testId** (`userData.testId`), **uuid**, **name**, **type**, or **userData** keys. All return metadata (position, rotation, type, etc.) unless noted.

### Playwright (`r3f` fixture)

| Method | Returns | Description |
|--------|---------|-------------|
| `getObject(id)` | `ObjectMetadata \| null` | By testId or uuid |
| `getByTestId(id)` | `ObjectMetadata \| null` | By testId only |
| `getByUuid(uuid)` | `ObjectMetadata \| null` | By uuid only |
| `getByName(name)` | `ObjectMetadata[]` | By object name |
| `getChildren(id)` | `ObjectMetadata[]` | Direct children |
| `getParent(id)` | `ObjectMetadata \| null` | Parent |
| `getByType(type)` | `ObjectMetadata[]` | e.g. `'Mesh'`, `'Group'` |
| `getByGeometryType(type)` | `ObjectMetadata[]` | e.g. `'BoxGeometry'` |
| `getByMaterialType(type)` | `ObjectMetadata[]` | e.g. `'MeshStandardMaterial'` |
| `getByUserData(key, value?)` | `ObjectMetadata[]` | userData key (and optional value) |
| `getCount()`, `getCountByType(type)` | `number` | Object counts |
| `getObjects(ids[])` | `Record<string, ObjectMetadata \| null>` | Batch lookup |
| `snapshot()` | `SceneSnapshot` | Full scene tree |
| `inspect(id, options?)` | `ObjectInspection \| null` | Heavy inspection (bounds, material, etc.). `{ includeGeometryData: true }` for vertex/index buffers. |
| `getWorldPosition(id)` | `[x,y,z] \| null` | World-space position |
| `diffSnapshots(before, after)` | `SceneDiff` | Added/removed/changed nodes |
| `trackObjectCount(async fn)` | `{ added, removed }` | Run action, get count delta |
| `getCanvasLocator()` | `Locator` | Canvas element for screenshot/click |

### Cypress

Same concepts, prefixed with `cy.r3f`:

- **Queries:** `r3fGetObject`, `r3fGetByName`, `r3fGetByUuid`, `r3fGetChildren`, `r3fGetParent`, `r3fGetCanvas`, `r3fGetWorldPosition`, `r3fGetByType`, `r3fGetByGeometryType`, `r3fGetByMaterialType`, `r3fGetByUserData`, `r3fGetCount`, `r3fGetCountByType`, `r3fGetObjects`, `r3fSnapshot`, `r3fInspect`, `r3fDiffSnapshots`, `r3fTrackObjectCount`
- **Interactions:** `r3fClick`, `r3fDoubleClick`, `r3fContextMenu`, `r3fHover`, `r3fDrag`, `r3fWheel`, `r3fPointerMiss`, `r3fDrawPath`
- **Waiters:** `r3fWaitForSceneReady`, `r3fWaitForObject`, `r3fWaitForIdle`, `r3fWaitForNewObject`, `r3fWaitForObjectRemoved`

---

## Interactions

Playwright: `r3f.click(id)`, `r3f.doubleClick(id)`, `r3f.contextMenu(id)`, `r3f.hover(id)`, `r3f.drag(id, { x, y, z })`, `r3f.wheel(id, options)`, `r3f.pointerMiss()`, `r3f.drawPath(points, options)`. All auto-wait for the bridge and object.

Cypress: same via `cy.r3fClick('id')`, etc.

---

## Assertions (Playwright)

Extend Playwright’s `expect` with `expect.extend(r3fMatchers)`, then use:

- **Object:** `toExist`, `toBeVisible`, `toHavePosition`, `toHaveWorldPosition`, `toHaveRotation`, `toHaveScale`, `toHaveType`, `toHaveName`, `toHaveGeometryType`, `toHaveMaterialType`, `toHaveChildCount`, `toHaveParent`, `toHaveInstanceCount`, `toBeInFrustum`, `toHaveBounds`, `toHaveColor`, `toHaveOpacity`, `toBeTransparent`, `toHaveVertexCount`, `toHaveTriangleCount`, `toHaveUserData`, `toHaveMapTexture`
- **Scene:** `toHaveObjectCount`, `toHaveObjectCountGreaterThan`, `toHaveCountByType`, `toHaveTotalTriangleCount`, `toHaveTotalTriangleCountLessThan`

All support `.not` and `{ timeout }`.

---

## DevTools

Install the [Chrome extension](https://chrome.google.com/webstore/detail/knmbpbojmdgjgjijbepkmgpdklndlfkn) to inspect the R3F scene in a DevTools tab (tree, search, selection). Optional; the bridge works without it.

To select 3D objects with the **Elements** panel’s “Select an element” picker, open the **R3F** DevTools tab, turn **"Select on canvas"** on, then switch to the Elements tab and use the picker—the mirror DOM becomes hit-testable so the picker selects `three-mesh` / `three-group` nodes. Turn it off when done. (Holding Command (⌘) on the page also works when the page has focus.)

---

## CI (headless WebGL)

For Playwright in CI, enable WebGL in `playwright.config.ts`:

```ts
launchOptions: {
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-gpu'],
},
```

---

## Requirements

- React 18+
- Three.js 0.150+
- @react-three/fiber 8+

## License

MIT
