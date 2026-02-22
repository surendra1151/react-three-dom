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
| `mode` | `"auto" \| "manual"` | `"auto"` | `auto` registers all objects. `manual` requires explicit registration via `useR3FRegister` or `r3fRegister()`. |
| `filter` | `(obj: Object3D) => boolean` | — | Only register objects that pass the filter. Auto mode only. |
| `root` | `string \| HTMLElement` | `"#three-dom-root"` | CSS selector or element for the mirror DOM container. |
| `batchSize` | `number` | `500` | Objects to sync per amortized batch per frame. |
| `syncBudgetMs` | `number` | `0.5` | Max time (ms) for sync work per frame. |
| `maxDomNodes` | `number` | `2000` | Max materialized DOM nodes. LRU eviction when exceeded. |
| `initialDepth` | `number` | `3` | How deep to materialize the DOM tree on mount. |
| `enabled` | `boolean` | `true` | Master switch for all sync. |
| `debug` | `boolean` | `false` | Enable debug logging to browser console. |
| `inspect` | `boolean` | `false` | Enable inspect mode on mount (hover-to-highlight). |

## Registration Modes

### Auto (default)

Traverses the entire scene and registers every object. New objects added to the scene are automatically picked up via the `Object3D.add` patch.

```tsx
<ThreeDom />
```

### Auto with Filter

Only objects that pass the filter are registered. Useful when you want to exclude lights, helpers, or internal objects from the mirror DOM.

```tsx
<ThreeDom filter={(obj) => obj.type === 'Mesh' || obj.type === 'Group'} />
```

### Manual

Nothing is auto-registered. You control exactly which objects appear in the mirror DOM using the `useR3FRegister` hook or the `r3fRegister()` API.

```tsx
<ThreeDom mode="manual" />
```

## `useR3FRegister` Hook

Registers a Three.js object on mount and unregisters on unmount. Works in both modes.

```tsx
import { useR3FRegister } from '@react-three-dom/core';

function Wall({ geometry }) {
  const ref = useRef<Mesh>(null!);
  useR3FRegister(ref);
  return <mesh ref={ref} geometry={geometry} userData={{ testId: 'wall' }} />;
}
```

For multi-canvas setups, pass the canvas ID:

```tsx
useR3FRegister(ref, 'viewer2');
```

The hook automatically:
- Retries if the bridge isn't ready yet on mount
- Detects `ref.current` identity swaps and re-registers
- Skips unregistration for auto-registered objects (won't accidentally remove them)

## Error Handling

If WebGL is unavailable or setup fails, the bridge creates a **stub** with `_ready: false` and an `_error` message. All API methods become no-ops. This prevents silent hangs — test waiters will see the error and fail with a clear message.
