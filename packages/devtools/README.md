# @react-three-dom/devtools

Chrome DevTools extension that adds an **R3F** tab to the DevTools toolbar. When the inspected page uses `@react-three-dom/core` (with `<ThreeDom />` inside R3F’s `<Canvas>`), the panel shows the scene tree, search, selection, and property inspection.

## Build

```bash
pnpm build
```

Output is in `dist/`. Load that folder as an unpacked extension in Chrome (`chrome://extensions/` → Developer mode → Load unpacked → select `dist`).

## Usage

1. Load the extension (see above).
2. Open a page that uses React Three Fiber and `@react-three-dom/core` with `<ThreeDom />` in the scene.
3. Open DevTools (F12) and click the **R3F** tab.
4. Use the tree to select objects; the property pane shows metadata and inspection. Selection in the panel highlights the object in the 3D scene.

The panel communicates with the page via `chrome.devtools.inspectedWindow.eval` and `window.__R3F_DOM__`. If the page doesn’t use the bridge, the panel shows a short message.
