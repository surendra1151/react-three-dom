# react-three-dom

E2E testing and developer tools for [React Three Fiber](https://github.com/pmndrs/react-three-fiber). Mirrors the Three.js scene graph into the DOM so you can test 3D applications with [Playwright](https://playwright.dev) or [Cypress](https://cypress.io), and inspect them with a [Chrome DevTools extension](https://chromewebstore.google.com/detail/react-three-dom/knmbpbojmdgjgjijbepkmgpdklndlfkn).

Three.js renders everything to a `<canvas>` — invisible to traditional DOM-based testing and inspection tools. **react-three-dom** bridges that gap by mirroring every Three.js object as a custom HTML element, exposing a query/interaction API for test frameworks, and shipping a DevTools extension for visual scene inspection.

## Documentation

**[surendra1151.github.io/react-three-dom](https://surendra1151.github.io/react-three-dom/)**

## Quick Start

```bash
npm install @react-three-dom/core
npm install -D @react-three-dom/playwright   # or @react-three-dom/cypress
```

```tsx
import { Canvas } from '@react-three/fiber';
import { ThreeDom } from '@react-three-dom/core';

<Canvas>
  <ThreeDom />
  <mesh userData={{ testId: 'hero-cube' }}>
    <boxGeometry />
    <meshStandardMaterial color="orange" />
  </mesh>
</Canvas>
```

```ts
import { test } from '@react-three-dom/playwright';
import { expect } from '@playwright/test';

test('scene works', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();
  await expect(r3f).toExist('hero-cube');
  await expect(r3f).toHaveColor('hero-cube', '#ffa500');
  await r3f.click('hero-cube');
});
```

## Packages

| Package | Description |
|---------|-------------|
| `@react-three-dom/core` | Bridge component, scene mirror, object store, interaction engine |
| `@react-three-dom/playwright` | Playwright SDK — fixture, 27+ matchers, waiters, reporter |
| `@react-three-dom/cypress` | Cypress SDK — custom commands, Chai assertions, waiters |
| `@react-three-dom/devtools` | [Chrome DevTools extension](https://chromewebstore.google.com/detail/react-three-dom/knmbpbojmdgjgjijbepkmgpdklndlfkn) — R3F scene inspector tab |

## License

MIT
