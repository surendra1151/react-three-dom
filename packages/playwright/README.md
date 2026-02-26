# @react-three-dom/playwright

Playwright E2E testing SDK for [React Three Fiber](https://github.com/pmndrs/react-three-fiber) apps. Query and interact with 3D objects by test ID, run matchers (e.g. `toExist`, `toHaveColor`, `toBeInViewport`), and wait for scene readiness.

## Install

```bash
npm install @react-three-dom/core
npm install -D @react-three-dom/playwright @playwright/test
```

**Peer:** `@playwright/test` ≥1.40.

## Setup

1. **App:** Use `@react-three-dom/core` with `<ThreeDom />` inside your `<Canvas>` and set `userData.testId` (or similar) on objects you want to target.

2. **Playwright config:** Use the provided fixture (e.g. in `playwright.config.ts` set `projects` that use the R3F fixture).

3. **Test file:** Import the custom test and matchers:

```ts
import { test, r3fMatchers } from '@react-three-dom/playwright';
import { expect } from '@playwright/test';

expect.extend(r3fMatchers);

test('scene works', async ({ page, r3f }) => {
  await page.goto('/');
  await r3f.waitForSceneReady();
  await expect(r3f).toExist('hero-cube');
  await expect(r3f).toHaveColor('hero-cube', '#ffa500');
  await r3f.click('hero-cube');
});
```

## Documentation

Full docs: **[surendra1151.github.io/react-three-dom](https://surendra1151.github.io/react-three-dom/)**

## License

MIT
