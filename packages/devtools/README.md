# @react-three-dom/devtools

Chrome DevTools extension that adds an **R3F** tab to the DevTools toolbar. When the inspected page uses `@react-three-dom/core` (with `<ThreeDom />` inside R3F’s `<Canvas>`), the panel shows the scene tree, search, selection, and property inspection.

## Install (recommended)

Install the extension from the Chrome Web Store (one click):

**[Install React Three DOM DevTools](https://chrome.google.com/webstore/detail/knmbpbojmdgjgjijbepkmgpdklndlfkn)**

After installing, open your R3F app, open DevTools (F12), and click the **R3F** tab.

## Build and load unpacked (developers)

If you’re contributing or need a local build:

```bash
pnpm build
```

Output is in `dist/`. Load that folder as an unpacked extension in Chrome: `chrome://extensions/` → **Developer mode** → **Load unpacked** → select `dist`.

## Usage

1. Load the extension (Chrome Web Store or unpacked from `dist/`).
2. Open a page that uses React Three Fiber and `@react-three-dom/core` with `<ThreeDom />` in the scene.
3. Open DevTools (F12) and click the **R3F** tab.
4. Use the tree to select objects; the property pane shows metadata and inspection. Selection in the panel highlights the object in the 3D scene.

The panel communicates with the page via `chrome.devtools.inspectedWindow.eval` and `window.__R3F_DOM__`. If the page doesn’t use the bridge, the panel shows a short message.

## Publishing to the Chrome Web Store (maintainers)

1. Build: `pnpm build` in this package.
2. Zip the **contents** of `dist/` (so `manifest.json` is at the root):  
   `cd dist && zip -r ../r3f-devtools.zip .`
3. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **New item** → upload the zip.
4. Fill in the store listing (name, description, category, screenshots), then submit for review.
5. After approval, replace the placeholder link above with your extension’s store URL.
