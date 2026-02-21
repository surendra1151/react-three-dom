import { expect } from '@playwright/test';
import { test, r3fMatchers } from '@react-three-dom/playwright';

expect.extend(r3fMatchers);

test.describe('Basic example scene', () => {
  test.beforeEach(async ({ page, r3f }) => {
    await page.goto('/');
    await r3f.waitForSceneReady({ timeout: 15_000 });
  });

  test('bridge diagnostics are available', async ({ r3f }) => {
    const diag = await r3f.getDiagnostics();
    expect(diag).not.toBeNull();
    expect(diag!.ready).toBe(true);
    expect(diag!.objectCount).toBeGreaterThan(10);
    expect(diag!.meshCount).toBeGreaterThan(0);

    // Print full diagnostics to terminal
    await r3f.logDiagnostics();
  });

  test('scene tree is logged to terminal', async ({ r3f }) => {
    await r3f.logScene();
  });

  test('chair exists and is visible', async ({ r3f }) => {
    await expect(r3f).toExist('chair-primary');
    const chair = await r3f.getObject('chair-primary');
    expect(chair).not.toBeNull();
    expect(chair!.visible).toBe(true);
    await expect(r3f).toHaveType('chair-primary', 'Mesh');
    await expect(r3f).toHaveGeometryType('chair-primary', 'BoxGeometry');
  });

  test('table group has correct children', async ({ r3f }) => {
    await expect(r3f).toExist('table-group');
    await expect(r3f).toHaveChildCount('table-group', 5); // top + 4 legs
    await expect(r3f).toExist('table-top');
    await expect(r3f).toHaveParent('table-top', 'table-group');
  });

  test('orbiting sphere is a mesh with sphere geometry', async ({ r3f }) => {
    await expect(r3f).toExist('orbiting-sphere');
    await expect(r3f).toHaveType('orbiting-sphere', 'Mesh');
    await expect(r3f).toHaveGeometryType('orbiting-sphere', 'SphereGeometry');
    await expect(r3f).toHaveMaterialType('orbiting-sphere', 'MeshStandardMaterial');
  });

  test('floor exists with plane geometry', async ({ r3f }) => {
    await expect(r3f).toExist('floor');
    await expect(r3f).toHaveGeometryType('floor', 'PlaneGeometry');
  });

  test('lights are present', async ({ r3f }) => {
    await expect(r3f).toExist('sun-light');
    await expect(r3f).toExist('fill-light');
    await expect(r3f).toHaveType('sun-light', 'DirectionalLight');
    await expect(r3f).toHaveType('fill-light', 'PointLight');
  });

  test('stacked boxes hierarchy', async ({ r3f }) => {
    await expect(r3f).toExist('stacked-boxes');
    await expect(r3f).toHaveChildCount('stacked-boxes', 3);
    await expect(r3f).toExist('stacked-box-1');
    await expect(r3f).toExist('stacked-box-2');
    await expect(r3f).toExist('stacked-box-3');
    await expect(r3f).toHaveParent('stacked-box-1', 'stacked-boxes');
  });

  test('click interaction on chair', async ({ r3f }) => {
    await r3f.click('chair-primary');
  });

  test('hover interaction on vase', async ({ r3f }) => {
    await r3f.hover('vase');
  });

  test('fuzzy suggestion on typo shows in error', async ({ r3f }) => {
    // Use a partial substring that matches to verify fuzzy suggestions appear
    let errorMsg = '';
    try {
      await r3f.waitForObject('chair-primar', { objectTimeout: 2_000 });
    } catch (e) {
      errorMsg = (e as Error).message;
    }
    expect(errorMsg).toContain('chair-primar');
    expect(errorMsg).toContain('Did you mean');
  });

  test('scene object count is reasonable', async ({ r3f }) => {
    const count = await r3f.getCount();
    expect(count).toBeGreaterThan(15);
  });
});
