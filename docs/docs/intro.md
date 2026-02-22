---
sidebar_position: 1
slug: /
---

# Introduction

**react-three-dom** is an E2E testing and developer tools library for [React Three Fiber](https://github.com/pmndrs/react-three-fiber). It mirrors the Three.js scene graph into the DOM so you can test 3D applications with [Playwright](https://playwright.dev) or [Cypress](https://cypress.io), and inspect them in Chrome DevTools.

## The Problem

Three.js renders to a `<canvas>` — a single opaque pixel buffer. Traditional DOM-based testing tools (Playwright, Cypress, Testing Library) can't see inside it. You're left with screenshot diffing, which is flaky, slow, and tells you nothing about _why_ a test failed.

## The Solution

**react-three-dom** bridges that gap by:

- **Mirroring** every Three.js object as a custom HTML element (`<three-mesh>`, `<three-group>`, etc.) in a hidden, zero-layout DOM container
- **Exposing** a query/interaction API on `window.__R3F_DOM__` that test frameworks can call via `page.evaluate()`
- **Providing** first-class Playwright and Cypress SDKs with 27+ assertions, 8 interaction types, and 5 waiter strategies
- **Shipping** a Chrome DevTools extension for visual scene inspection

## Architecture

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

## Requirements

- React 18+
- Three.js 0.150+
- @react-three/fiber 8+
- Node.js 20+
- Playwright 1.40+ (for `@react-three-dom/playwright`)
- Cypress 12+ (for `@react-three-dom/cypress`)
