---
sidebar_position: 1
---

# Installation

## Core Package

```bash
npm install @react-three-dom/core
```

### Peer Dependencies

You likely already have these:

```bash
npm install react react-dom three @react-three/fiber
```

| Peer Dependency | Minimum Version |
|----------------|-----------------|
| `react` | 18.0.0 |
| `react-dom` | 18.0.0 |
| `three` | 0.150.0 |
| `@react-three/fiber` | 8.0.0 |

### Vite Configuration

Exclude the core package from pre-bundling:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@react-three-dom/core'],
  },
});
```

### TypeScript

Add a type reference to pick up the `window.__R3F_DOM__` global augmentation:

```ts
// src/env.d.ts
/// <reference types="vite/client" />
import type {} from '@react-three-dom/core';
```

## Playwright SDK

```bash
npm install -D @react-three-dom/playwright
```

Requires Playwright 1.40+.

Add WebGL flags for headless browsers:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

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
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```


## Cypress SDK

```bash
npm install -D @react-three-dom/cypress
```

Requires Cypress 12+.

## DevTools Extension

The DevTools extension is built from source. See the [DevTools installation guide](../devtools/installation.md).
