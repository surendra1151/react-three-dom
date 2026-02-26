# @react-three-dom/core

DOM mirror, snapshot API, and interaction bridge for [React Three Fiber](https://github.com/pmndrs/react-three-fiber). Mirrors the Three.js scene graph into the DOM so you can query and interact with 3D objects from tests or the [Chrome DevTools extension](https://chromewebstore.google.com/detail/react-three-dom/knmbpbojmdgjgjijbepkmgpdklndlfkn).

## Install

```bash
npm install @react-three-dom/core
```

**Peer dependencies:** `react` (≥18), `@react-three/fiber` (≥8), `three` (≥0.150).

## Quick Start

Add `<ThreeDom />` inside your R3F `<Canvas>` so the scene is mirrored and the bridge is available to tests and DevTools:

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

Use `userData.testId` (or other keys) to identify objects in tests. The bridge exposes `window.__R3F_DOM__` for programmatic access and powers the Playwright/Cypress SDKs and the DevTools extension.

## Documentation

Full docs: **[surendra1151.github.io/react-three-dom](https://surendra1151.github.io/react-three-dom/)**

## License

MIT
