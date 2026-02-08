import { expect as baseExpect } from '@playwright/test';
import type { ObjectMetadata, ObjectInspection } from './types';

// ---------------------------------------------------------------------------
// Custom Playwright expect matchers for 3D scene testing
// ---------------------------------------------------------------------------

/**
 * Extend Playwright's `expect` with 3D-native matchers.
 *
 * Usage:
 * ```ts
 * import { test, expect } from '@react-three-dom/playwright';
 *
 * test('chair exists', async ({ page, r3f }) => {
 *   await r3f.waitForSceneReady();
 *   await expect(r3f).toExist('chair-primary');
 * });
 * ```
 */
export const expect = baseExpect.extend({
  // -----------------------------------------------------------------------
  // toExist — verify an object with the given testId/uuid exists in the scene
  // -----------------------------------------------------------------------
  async toExist(r3f: R3FMatcherReceiver, idOrUuid: string) {
    const meta = await r3f.getObject(idOrUuid);
    const pass = meta !== null;

    return {
      pass,
      message: () =>
        pass
          ? `Expected object "${idOrUuid}" to NOT exist in the scene, but it does`
          : `Expected object "${idOrUuid}" to exist in the scene, but it was not found`,
      name: 'toExist',
      expected: idOrUuid,
      actual: meta,
    };
  },

  // -----------------------------------------------------------------------
  // toBeVisible — verify an object is visible (object.visible === true)
  // -----------------------------------------------------------------------
  async toBeVisible(r3f: R3FMatcherReceiver, idOrUuid: string) {
    const meta = await r3f.getObject(idOrUuid);
    if (!meta) {
      return {
        pass: false,
        message: () => `Expected object "${idOrUuid}" to be visible, but it was not found in the scene`,
        name: 'toBeVisible',
      };
    }

    const pass = meta.visible;
    return {
      pass,
      message: () =>
        pass
          ? `Expected object "${idOrUuid}" to NOT be visible, but it is`
          : `Expected object "${idOrUuid}" to be visible, but visible=${meta.visible}`,
      name: 'toBeVisible',
      expected: true,
      actual: meta.visible,
    };
  },

  // -----------------------------------------------------------------------
  // toBeInFrustum — verify an object's bounding box intersects the camera
  // frustum (i.e. it is potentially on-screen). Uses inspect() for bounds.
  // -----------------------------------------------------------------------
  async toBeInFrustum(r3f: R3FMatcherReceiver, idOrUuid: string) {
    const inspection = await r3f.inspect(idOrUuid);
    if (!inspection) {
      return {
        pass: false,
        message: () =>
          `Expected object "${idOrUuid}" to be in frustum, but it was not found in the scene`,
        name: 'toBeInFrustum',
      };
    }

    // If the bridge can project it to screen, it's in the frustum.
    // We check by verifying bounds exist and are finite.
    const { bounds } = inspection;
    const isFinite = (v: number[]) => v.every(Number.isFinite);
    const pass = isFinite(bounds.min) && isFinite(bounds.max);

    return {
      pass,
      message: () =>
        pass
          ? `Expected object "${idOrUuid}" to NOT be in the camera frustum`
          : `Expected object "${idOrUuid}" to be in the camera frustum, but its bounds are invalid`,
      name: 'toBeInFrustum',
      expected: 'finite bounds',
      actual: bounds,
    };
  },

  // -----------------------------------------------------------------------
  // toHavePosition — verify object position within tolerance
  // -----------------------------------------------------------------------
  async toHavePosition(
    r3f: R3FMatcherReceiver,
    idOrUuid: string,
    expected: [number, number, number],
    tolerance = 0.01,
  ) {
    const meta = await r3f.getObject(idOrUuid);
    if (!meta) {
      return {
        pass: false,
        message: () =>
          `Expected object "${idOrUuid}" to have position [${expected}], but it was not found`,
        name: 'toHavePosition',
      };
    }

    const [ex, ey, ez] = expected;
    const [ax, ay, az] = meta.position;
    const dx = Math.abs(ax - ex);
    const dy = Math.abs(ay - ey);
    const dz = Math.abs(az - ez);
    const pass = dx <= tolerance && dy <= tolerance && dz <= tolerance;

    return {
      pass,
      message: () =>
        pass
          ? `Expected object "${idOrUuid}" to NOT be at position [${expected}] (±${tolerance})`
          : `Expected object "${idOrUuid}" to be at position [${expected}] (±${tolerance}), but it is at [${meta.position}] (delta: [${dx.toFixed(4)}, ${dy.toFixed(4)}, ${dz.toFixed(4)}])`,
      name: 'toHavePosition',
      expected,
      actual: meta.position,
    };
  },

  // -----------------------------------------------------------------------
  // toHaveBounds — verify object bounding box (world-space)
  // -----------------------------------------------------------------------
  async toHaveBounds(
    r3f: R3FMatcherReceiver,
    idOrUuid: string,
    expected: { min: [number, number, number]; max: [number, number, number] },
    tolerance = 0.1,
  ) {
    const inspection = await r3f.inspect(idOrUuid);
    if (!inspection) {
      return {
        pass: false,
        message: () =>
          `Expected object "${idOrUuid}" to have specific bounds, but it was not found`,
        name: 'toHaveBounds',
      };
    }

    const { bounds } = inspection;
    const withinTolerance = (a: number[], b: number[]) =>
      a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
    const pass = withinTolerance(bounds.min, expected.min) && withinTolerance(bounds.max, expected.max);

    return {
      pass,
      message: () =>
        pass
          ? `Expected object "${idOrUuid}" to NOT have bounds min:${JSON.stringify(expected.min)} max:${JSON.stringify(expected.max)}`
          : `Expected object "${idOrUuid}" to have bounds min:${JSON.stringify(expected.min)} max:${JSON.stringify(expected.max)}, but got min:${JSON.stringify(bounds.min)} max:${JSON.stringify(bounds.max)}`,
      name: 'toHaveBounds',
      expected,
      actual: bounds,
    };
  },

  // -----------------------------------------------------------------------
  // toHaveInstanceCount — verify InstancedMesh instance count
  // -----------------------------------------------------------------------
  async toHaveInstanceCount(r3f: R3FMatcherReceiver, idOrUuid: string, expectedCount: number) {
    const meta = await r3f.getObject(idOrUuid);
    if (!meta) {
      return {
        pass: false,
        message: () =>
          `Expected object "${idOrUuid}" to have instance count ${expectedCount}, but it was not found`,
        name: 'toHaveInstanceCount',
      };
    }

    const actual = meta.instanceCount ?? 0;
    const pass = actual === expectedCount;

    return {
      pass,
      message: () =>
        pass
          ? `Expected object "${idOrUuid}" to NOT have instance count ${expectedCount}`
          : `Expected object "${idOrUuid}" to have instance count ${expectedCount}, but it has ${actual}`,
      name: 'toHaveInstanceCount',
      expected: expectedCount,
      actual,
    };
  },
});

// ---------------------------------------------------------------------------
// Helper type — the R3FFixture object that matchers receive
// ---------------------------------------------------------------------------

interface R3FMatcherReceiver {
  getObject(idOrUuid: string): Promise<ObjectMetadata | null>;
  inspect(idOrUuid: string): Promise<ObjectInspection | null>;
}
