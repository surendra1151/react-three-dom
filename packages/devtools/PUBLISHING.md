# Publishing to the Chrome Web Store

The store-ready zip is built with:

```bash
pnpm run pack:store
```

Output: `r3f-devtools.zip` in this directory.

## Steps to publish

1. **Developer account**  
   Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).  
   Sign in with a Google account and pay the one-time **$5 developer registration** if you haven’t already.

2. **New item**  
   Click **New item**, then upload `r3f-devtools.zip` (from this package directory).

3. **Store listing**  
   Fill in:
   - **Name:** e.g. *React Three DOM DevTools*
   - **Short description:** e.g. *Inspect React Three Fiber scene graph in Chrome DevTools*
   - **Detailed description:** What the extension does, that it requires `@react-three-dom/core` with `<ThreeDom />` in the page, and how to use the R3F tab.
   - **Category:** Developer Tools
   - **Screenshots:** Add 1–2 screenshots of the DevTools panel (tree + details pane) for best visibility.

4. **Privacy**  
   If the extension does not collect user data, say so. You typically don’t need a separate privacy policy URL for a DevTools-only extension.

5. **Submit**  
   Submit for review. First review often takes a few days.

6. **After approval**  
   Copy the public store URL (e.g. `https://chrome.google.com/webstore/detail/react-three-dom-devtools/XXXXXXXX`) and replace `PLACEHOLDER` in:
   - `packages/devtools/README.md`
   - Root `README.md`  
   (Search for `PLACEHOLDER` to find both links.)

## Updating a published extension

1. Bump `version` in `manifest.json` (e.g. `0.1.0` → `0.1.1`).
2. Run `pnpm run pack:store`.
3. In the Developer Dashboard, open your extension → **Package** → upload the new zip → submit for review.
