# @react-three-dom/cypress

Cypress E2E testing SDK for [React Three Fiber](https://github.com/pmndrs/react-three-fiber) apps. Custom commands and Chai assertions to query and interact with 3D objects by test ID and wait for scene readiness.

## Install

```bash
npm install @react-three-dom/core
npm install -D @react-three-dom/cypress cypress
```

**Peer:** `cypress` ≥12.

## Setup

1. **App:** Use `@react-three-dom/core` with `<ThreeDom />` inside your `<Canvas>` and set `userData.testId` (or similar) on objects you want to target.

2. **Cypress support:** Import the package so it registers commands and assertions:

In `cypress/support/e2e.ts` (or your support file):

```ts
import '@react-three-dom/cypress';
```

3. **Test:** Use the custom commands and assertions:

```ts
it('scene works', () => {
  cy.visit('/');
  cy.r3fWaitForSceneReady();
  cy.r3f().r3fExist('hero-cube');
  cy.r3f().r3fHaveColor('hero-cube', '#ffa500');
  cy.r3f().r3fClick('hero-cube');
});
```

## Documentation

Full docs: **[surendra1151.github.io/react-three-dom](https://surendra1151.github.io/react-three-dom/)**

## License

MIT
