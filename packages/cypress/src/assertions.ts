/// <reference types="cypress" />
import type { R3FDOM, ObjectMetadata } from './types';

// ---------------------------------------------------------------------------
// Chai-based custom assertions for 3D scene testing
// ---------------------------------------------------------------------------

function getR3FFromWindow(): R3FDOM {
  const win = (cy as unknown as { state: (key: string) => { document: Document } })
    .state('window') as unknown as Window & { __R3F_DOM__?: R3FDOM };
  const api = win?.__R3F_DOM__;
  if (!api) {
    throw new Error('react-three-dom bridge not found. Is <ThreeDom> mounted?');
  }
  return api;
}

function resolveObject(api: R3FDOM, idOrUuid: string): ObjectMetadata | null {
  return api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid) ?? null;
}

export function registerAssertions(): void {
  chai.use((_chai) => {
    const { Assertion } = _chai;

    // -------------------------------------------------------------------
    // r3fExist — assert that a 3D object with the given id exists
    // -------------------------------------------------------------------
    Assertion.addMethod('r3fExist', function (this: Chai.AssertionStatic, idOrUuid: string) {
      const api = getR3FFromWindow();
      const meta = resolveObject(api, idOrUuid);

      (this as unknown as Chai.Assertion).assert(
        meta !== null,
        `expected 3D object "${idOrUuid}" to exist in the scene`,
        `expected 3D object "${idOrUuid}" to NOT exist in the scene`,
        'exists',
        meta === null ? 'not found' : 'found',
      );
    });

    // -------------------------------------------------------------------
    // r3fVisible — assert that a 3D object is visible
    // -------------------------------------------------------------------
    Assertion.addMethod('r3fVisible', function (this: Chai.AssertionStatic, idOrUuid: string) {
      const api = getR3FFromWindow();
      const meta = resolveObject(api, idOrUuid);

      if (!meta) {
        throw new Error(`3D object "${idOrUuid}" not found in the scene`);
      }

      (this as unknown as Chai.Assertion).assert(
        meta.visible,
        `expected 3D object "${idOrUuid}" to be visible`,
        `expected 3D object "${idOrUuid}" to NOT be visible`,
        true,
        meta.visible,
      );
    });

    // -------------------------------------------------------------------
    // r3fInFrustum — assert that a 3D object is in the camera frustum
    // -------------------------------------------------------------------
    Assertion.addMethod('r3fInFrustum', function (this: Chai.AssertionStatic, idOrUuid: string) {
      const api = getR3FFromWindow();
      const inspection = api.inspect(idOrUuid);

      if (!inspection) {
        throw new Error(`3D object "${idOrUuid}" not found in the scene`);
      }

      const { bounds } = inspection;
      const isFinite = (v: number[]) => v.every(Number.isFinite);
      const inFrustum = isFinite(bounds.min) && isFinite(bounds.max);

      (this as unknown as Chai.Assertion).assert(
        inFrustum,
        `expected 3D object "${idOrUuid}" to be in the camera frustum`,
        `expected 3D object "${idOrUuid}" to NOT be in the camera frustum`,
        'in frustum',
        inFrustum ? 'in frustum' : 'out of frustum / invalid bounds',
      );
    });

    // -------------------------------------------------------------------
    // r3fPosition — assert object position within tolerance
    // -------------------------------------------------------------------
    Assertion.addMethod(
      'r3fPosition',
      function (
        this: Chai.AssertionStatic,
        idOrUuid: string,
        expected: [number, number, number],
        tolerance = 0.01,
      ) {
        const api = getR3FFromWindow();
        const meta = resolveObject(api, idOrUuid);

        if (!meta) {
          throw new Error(`3D object "${idOrUuid}" not found in the scene`);
        }

        const [ex, ey, ez] = expected;
        const [ax, ay, az] = meta.position;
        const pass =
          Math.abs(ax - ex) <= tolerance &&
          Math.abs(ay - ey) <= tolerance &&
          Math.abs(az - ez) <= tolerance;

        (this as unknown as Chai.Assertion).assert(
          pass,
          `expected 3D object "${idOrUuid}" to be at [${expected}] (±${tolerance}), but was at [${meta.position}]`,
          `expected 3D object "${idOrUuid}" to NOT be at [${expected}] (±${tolerance})`,
          expected,
          meta.position,
        );
      },
    );

    // -------------------------------------------------------------------
    // r3fInstanceCount — assert InstancedMesh instance count
    // -------------------------------------------------------------------
    Assertion.addMethod(
      'r3fInstanceCount',
      function (this: Chai.AssertionStatic, idOrUuid: string, expectedCount: number) {
        const api = getR3FFromWindow();
        const meta = resolveObject(api, idOrUuid);

        if (!meta) {
          throw new Error(`3D object "${idOrUuid}" not found in the scene`);
        }

        const actual = meta.instanceCount ?? 0;

        (this as unknown as Chai.Assertion).assert(
          actual === expectedCount,
          `expected 3D object "${idOrUuid}" to have instance count ${expectedCount}, but had ${actual}`,
          `expected 3D object "${idOrUuid}" to NOT have instance count ${expectedCount}`,
          expectedCount,
          actual,
        );
      },
    );

    // -------------------------------------------------------------------
    // r3fBounds — assert world-space bounding box within tolerance
    // -------------------------------------------------------------------
    Assertion.addMethod(
      'r3fBounds',
      function (
        this: Chai.AssertionStatic,
        idOrUuid: string,
        expected: { min: [number, number, number]; max: [number, number, number] },
        tolerance = 0.1,
      ) {
        const api = getR3FFromWindow();
        const inspection = api.inspect(idOrUuid);

        if (!inspection) {
          throw new Error(`3D object "${idOrUuid}" not found in the scene`);
        }

        const { bounds } = inspection;
        const withinTol = (a: number[], b: number[]) =>
          a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
        const pass = withinTol(bounds.min, expected.min) && withinTol(bounds.max, expected.max);

        (this as unknown as Chai.Assertion).assert(
          pass,
          `expected 3D object "${idOrUuid}" bounds to be min:${JSON.stringify(expected.min)} max:${JSON.stringify(expected.max)} (±${tolerance}), but got min:${JSON.stringify(bounds.min)} max:${JSON.stringify(bounds.max)}`,
          `expected 3D object "${idOrUuid}" bounds to NOT match`,
          expected,
          bounds,
        );
      },
    );
  });
}
