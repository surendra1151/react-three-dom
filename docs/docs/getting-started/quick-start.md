---
sidebar_position: 2
---

# Quick Start

Get a working test in under 5 minutes.

## 1. Add the Bridge

Drop `<ThreeDom />` inside your R3F `<Canvas>`. Tag objects you want to test with `userData.testId`.

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

That's it for the app side. The bridge automatically:
- Registers all objects in the scene
- Creates a hidden DOM mirror
- Exposes `window.__R3F_DOM__` for test frameworks

## 2. Write a Playwright Test

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

  // Material
  await expect(r3f).toHaveColor('hero-cube', '#ffa500');
  await expect(r3f).toHaveMaterialType('hero-cube', 'MeshStandardMaterial');
  await expect(r3f).toHaveGeometryType('hero-cube', 'BoxGeometry');

  // Interact
  await r3f.click('hero-cube');
  await r3f.hover('hero-cube');
});
```

## 3. Write a Cypress Test

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

  cy.wrap(null).should('r3fExist', 'hero-cube');
  cy.wrap(null).should('r3fVisible', 'hero-cube');
  cy.wrap(null).should('r3fPosition', 'hero-cube', [0, 1, 0], 0.01);
  cy.wrap(null).should('r3fColor', 'hero-cube', '#ffa500');
});
```

