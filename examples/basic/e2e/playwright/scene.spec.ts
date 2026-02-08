import { test, expect } from '@react-three-dom/playwright';
import type { R3FFixture } from '@react-three-dom/playwright';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Playwright E2E tests for the basic example scene
//
// All tests share a single browser page to avoid re-opening Chrome for every
// test. The page navigates once, waits for the scene, then runs all checks.
// ---------------------------------------------------------------------------

let sharedPage: Page;
let sharedR3F: R3FFixture;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  sharedPage = await context.newPage();
  sharedR3F = new (await import('@react-three-dom/playwright')).R3FFixture(sharedPage);
  await sharedPage.goto('/');
  await sharedR3F.waitForSceneReady();
});

test.afterAll(async () => {
  await sharedPage.close();
});

// ---------------------------------------------------------------------------
// Scene bootstrap
// ---------------------------------------------------------------------------

test('bridge is available on the page', async () => {
  const hasAPI = await sharedPage.evaluate(() => typeof window.__R3F_DOM__ !== 'undefined');
  expect(hasAPI).toBe(true);
});

test('scene has expected number of objects', async () => {
  const count = await sharedR3F.getCount();
  expect(count).toBeGreaterThan(10);
});

test('snapshot returns a valid tree', async () => {
  const snap = await sharedR3F.snapshot();
  expect(snap).not.toBeNull();
  expect(snap!.objectCount).toBeGreaterThan(0);
  expect(snap!.tree).toBeDefined();
  expect(snap!.tree.type).toBe('Scene');
});

// ---------------------------------------------------------------------------
// Object queries
// ---------------------------------------------------------------------------

test('chair-primary exists', async () => {
  await expect(sharedR3F).toExist('chair-primary');
});

test('table-top exists', async () => {
  await expect(sharedR3F).toExist('table-top');
});

test('floor exists', async () => {
  await expect(sharedR3F).toExist('floor');
});

test('sun-light exists', async () => {
  await expect(sharedR3F).toExist('sun-light');
});

test('orbiting-sphere exists', async () => {
  await expect(sharedR3F).toExist('orbiting-sphere');
});

test('vase exists', async () => {
  await expect(sharedR3F).toExist('vase');
});

test('stacked boxes exist', async () => {
  await expect(sharedR3F).toExist('stacked-box-1');
  await expect(sharedR3F).toExist('stacked-box-2');
  await expect(sharedR3F).toExist('stacked-box-3');
});

test('nonexistent object does not exist', async () => {
  const obj = await sharedR3F.getObject('does-not-exist');
  expect(obj).toBeNull();
});

// ---------------------------------------------------------------------------
// Object visibility
// ---------------------------------------------------------------------------

test('chair is visible', async () => {
  await expect(sharedR3F).toBeVisible('chair-primary');
});

test('floor is visible', async () => {
  await expect(sharedR3F).toBeVisible('floor');
});

test('table-top is visible', async () => {
  await expect(sharedR3F).toBeVisible('table-top');
});

// ---------------------------------------------------------------------------
// Object positions
// ---------------------------------------------------------------------------

test('table-top is at expected position', async () => {
  await expect(sharedR3F).toHavePosition('table-top', [2, 0.75, 0], 0.01);
});

test('floor is at origin', async () => {
  await expect(sharedR3F).toHavePosition('floor', [0, 0, 0], 0.01);
});

test('vase is above the table', async () => {
  await expect(sharedR3F).toHavePosition('vase', [2, 0.95, 0], 0.01);
});

test('sun-light is elevated', async () => {
  await expect(sharedR3F).toHavePosition('sun-light', [5, 10, 5], 0.01);
});

// ---------------------------------------------------------------------------
// Object inspection (Tier 2)
// ---------------------------------------------------------------------------

test('chair inspection returns geometry data', async () => {
  const inspection = await sharedR3F.inspect('chair-primary');
  expect(inspection).not.toBeNull();
  expect(inspection!.metadata.type).toBe('Mesh');
  expect(inspection!.geometry).toBeDefined();
  expect(inspection!.geometry!.type).toBe('BoxGeometry');
  expect(inspection!.material).toBeDefined();
  expect(inspection!.material!.type).toBe('MeshStandardMaterial');
});

test('chair is in frustum', async () => {
  await expect(sharedR3F).toBeInFrustum('chair-primary');
});

test('chair bounds are valid', async () => {
  const inspection = await sharedR3F.inspect('chair-primary');
  expect(inspection).not.toBeNull();
  const { bounds } = inspection!;
  expect(bounds.min.every(Number.isFinite)).toBe(true);
  expect(bounds.max.every(Number.isFinite)).toBe(true);
  for (let i = 0; i < 3; i++) {
    expect(bounds.max[i]).toBeGreaterThanOrEqual(bounds.min[i]);
  }
});

test('floor geometry is a PlaneGeometry', async () => {
  const inspection = await sharedR3F.inspect('floor');
  expect(inspection).not.toBeNull();
  expect(inspection!.geometry!.type).toBe('PlaneGeometry');
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

test('click on chair does not throw', async () => {
  await sharedR3F.click('chair-primary');
});

test('hover on table-top does not throw', async () => {
  await sharedR3F.hover('table-top');
});

test('double-click on vase does not throw', async () => {
  await sharedR3F.doubleClick('vase');
});

test('context-menu on floor does not throw', async () => {
  await sharedR3F.contextMenu('floor');
});

test('wheel on chair does not throw', async () => {
  await sharedR3F.wheel('chair-primary', { deltaY: 100 });
});

test('pointer-miss does not throw', async () => {
  await sharedR3F.pointerMiss();
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

test('select and clear selection work', async () => {
  await sharedR3F.select('chair-primary');
  await sharedR3F.clearSelection();
});
