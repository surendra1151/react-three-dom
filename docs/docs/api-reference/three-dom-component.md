---
sidebar_position: 1
---

# `<ThreeDom />` Component

The main bridge component. Place it inside your R3F `<Canvas>`.

```tsx
import { Canvas } from '@react-three/fiber';
import { ThreeDom } from '@react-three-dom/core';

<Canvas>
  <ThreeDom />
  {/* your scene */}
</Canvas>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `canvasId` | `string` | — | Unique ID for multi-canvas apps. Registers in `window.__R3F_DOM_INSTANCES__[canvasId]`. |
| `primary` | `boolean` | `true` when no canvasId | Whether `window.__R3F_DOM__` points to this instance. |
| `root` | `string \| HTMLElement` | `"#three-dom-root"` | CSS selector or element for the mirror DOM container. |
| `batchSize` | `number` | `500` | Objects to sync per amortized batch per frame. |
| `syncBudgetMs` | `number` | `0.5` | Max time (ms) for sync work per frame. |
| `maxDomNodes` | `number` | `2000` | Max materialized DOM nodes. LRU eviction when exceeded. |
| `initialDepth` | `number` | `3` | How deep to materialize the DOM tree on mount. |
| `enabled` | `boolean` | `true` | Master switch for all sync. |
| `debug` | `boolean` | `false` | Enable debug logging to browser console. |
| `inspect` | `boolean` | `false` | Enable inspect mode on mount (hover-to-highlight). |



## Error Handling

If WebGL is unavailable or setup fails, the bridge creates a **stub** with `_ready: false` and an `_error` message. All API methods become no-ops. This prevents silent hangs — test waiters will see the error and fail with a clear message.
