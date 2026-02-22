---
sidebar_position: 99
---

# Troubleshooting

## Common Issues

### R3F tab doesn't appear in DevTools

- Make sure `<ThreeDom />` is mounted inside R3F's `<Canvas>`
- Reload the page after installing the extension
- Check that `window.__R3F_DOM__` exists in the console

### `waitForSceneReady` times out

- Your scene may still be loading assets (models, textures). Increase the `timeout` option.
- Ensure `<ThreeDom />` is rendered — the bridge won't initialize without it.

### Objects not found by `testId`

- Set `userData.testId` on your Three.js objects:

```tsx
<mesh userData={{ testId: 'my-object' }}>
```

- `testId` lookups are case-sensitive.

### WebGL errors in CI (headless Chrome)

- Chromium needs SwiftShader for headless WebGL. Add these launch args:

```ts
// Playwright
use: {
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  },
},
```

```ts
// Cypress (cypress.config.ts)
setupNodeEvents(on) {
  on('before:browser:launch', (browser, launchOptions) => {
    if (browser.name === 'chrome') {
      launchOptions.args.push('--use-gl=angle', '--use-angle=swiftshader');
    }
    return launchOptions;
  });
},
```

### Mirror DOM not updating

- The bridge patches `Object3D.add`/`remove` at mount time. If you add objects before `<ThreeDom />` mounts, they won't be tracked.
- Mount `<ThreeDom />` early in your `<Canvas>` tree.

## Still stuck?

Open an issue on [GitHub](https://github.com/surendra1151/react-three-dom/issues) or reach out at **krishna.kalluri13@gmail.com**.
