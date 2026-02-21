/// <reference types="cypress" />
import type { R3FDOM, ObjectMetadata, ObjectInspection, SnapshotNode } from './types';
import { _getActiveCanvasId } from './commands';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getR3FFromWindow(): R3FDOM {
  const win = (cy as unknown as { state: (key: string) => unknown })
    .state('window') as unknown as Window & { __R3F_DOM__?: R3FDOM; __R3F_DOM_INSTANCES__?: Record<string, R3FDOM> };
  const cid = _getActiveCanvasId();
  const api = cid
    ? win?.__R3F_DOM_INSTANCES__?.[cid]
    : win?.__R3F_DOM__;
  if (!api) {
    throw new Error(
      `react-three-dom bridge not found${cid ? ` (canvas: "${cid}")` : ''}. Is <ThreeDom${cid ? ` canvasId="${cid}"` : ''}> mounted?`,
    );
  }
  return api;
}

function resolveObject(api: R3FDOM, idOrUuid: string): ObjectMetadata | null {
  return api.getByTestId(idOrUuid) ?? api.getByUuid(idOrUuid) ?? null;
}

function requireObject(api: R3FDOM, idOrUuid: string, matcherName: string): ObjectMetadata {
  const meta = resolveObject(api, idOrUuid);
  if (!meta) {
    let msg = `[${matcherName}] 3D object "${idOrUuid}" not found in the scene`;
    if (typeof api.fuzzyFind === 'function') {
      const suggestions = api.fuzzyFind(idOrUuid, 5);
      if (suggestions.length > 0) {
        msg += '\nDid you mean:\n' + suggestions.map((s) => {
          const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
          return `  → ${s.name || '(unnamed)'} [${id}]`;
        }).join('\n');
      }
    }
    throw new Error(msg);
  }
  return meta;
}

function requireInspection(api: R3FDOM, idOrUuid: string, matcherName: string): ObjectInspection {
  const insp = api.inspect(idOrUuid);
  if (!insp) {
    throw new Error(`[${matcherName}] 3D object "${idOrUuid}" not found for inspection`);
  }
  return insp;
}

function collectTriangles(api: R3FDOM): number {
  const snap = api.snapshot();
  let total = 0;
  function walk(node: SnapshotNode) {
    const meta = api.getByUuid(node.uuid);
    if (meta?.triangleCount) total += meta.triangleCount;
    for (const child of node.children) walk(child);
  }
  walk(snap.tree);
  return total;
}

// ---------------------------------------------------------------------------
// All 27 Chai assertions
// ---------------------------------------------------------------------------

export function registerAssertions(): void {
  chai.use((_chai) => {
    const { Assertion } = _chai;

    // ======================= TIER 1 — Metadata ============================

    Assertion.addMethod('r3fExist', function (this: Chai.AssertionStatic, idOrUuid: string) {
      const api = getR3FFromWindow();
      const meta = resolveObject(api, idOrUuid);
      (this as unknown as Chai.Assertion).assert(
        meta !== null,
        `expected 3D object "${idOrUuid}" to exist in the scene`,
        `expected 3D object "${idOrUuid}" to NOT exist in the scene`,
        'exists', meta === null ? 'not found' : 'found',
      );
    });

    Assertion.addMethod('r3fVisible', function (this: Chai.AssertionStatic, idOrUuid: string) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fVisible');
      (this as unknown as Chai.Assertion).assert(
        meta.visible,
        `expected "${idOrUuid}" to be visible`,
        `expected "${idOrUuid}" to NOT be visible`,
        true, meta.visible,
      );
    });

    Assertion.addMethod('r3fPosition', function (
      this: Chai.AssertionStatic, idOrUuid: string,
      expected: [number, number, number], tolerance = 0.01,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fPosition');
      const pass = expected.every((v, i) => Math.abs(meta.position[i] - v) <= tolerance);
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" at [${expected}] (±${tolerance}), got [${meta.position}]`,
        `expected "${idOrUuid}" to NOT be at [${expected}] (±${tolerance})`,
        expected, meta.position,
      );
    });

    Assertion.addMethod('r3fWorldPosition', function (
      this: Chai.AssertionStatic, idOrUuid: string,
      expected: [number, number, number], tolerance = 0.01,
    ) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fWorldPosition');
      const m = insp.worldMatrix;
      const wp: [number, number, number] = [m[12], m[13], m[14]];
      const pass = expected.every((v, i) => Math.abs(wp[i] - v) <= tolerance);
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" world position [${expected}] (±${tolerance}), got [${wp.map(v => v.toFixed(4))}]`,
        `expected "${idOrUuid}" to NOT have world position [${expected}] (±${tolerance})`,
        expected, wp,
      );
    });

    Assertion.addMethod('r3fRotation', function (
      this: Chai.AssertionStatic, idOrUuid: string,
      expected: [number, number, number], tolerance = 0.01,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fRotation');
      const pass = expected.every((v, i) => Math.abs(meta.rotation[i] - v) <= tolerance);
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" rotation [${expected}] (±${tolerance}), got [${meta.rotation}]`,
        `expected "${idOrUuid}" to NOT have rotation [${expected}] (±${tolerance})`,
        expected, meta.rotation,
      );
    });

    Assertion.addMethod('r3fScale', function (
      this: Chai.AssertionStatic, idOrUuid: string,
      expected: [number, number, number], tolerance = 0.01,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fScale');
      const pass = expected.every((v, i) => Math.abs(meta.scale[i] - v) <= tolerance);
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" scale [${expected}] (±${tolerance}), got [${meta.scale}]`,
        `expected "${idOrUuid}" to NOT have scale [${expected}] (±${tolerance})`,
        expected, meta.scale,
      );
    });

    Assertion.addMethod('r3fType', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedType: string,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fType');
      (this as unknown as Chai.Assertion).assert(
        meta.type === expectedType,
        `expected "${idOrUuid}" type "${expectedType}", got "${meta.type}"`,
        `expected "${idOrUuid}" to NOT have type "${expectedType}"`,
        expectedType, meta.type,
      );
    });

    Assertion.addMethod('r3fName', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedName: string,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fName');
      (this as unknown as Chai.Assertion).assert(
        meta.name === expectedName,
        `expected "${idOrUuid}" name "${expectedName}", got "${meta.name}"`,
        `expected "${idOrUuid}" to NOT have name "${expectedName}"`,
        expectedName, meta.name,
      );
    });

    Assertion.addMethod('r3fGeometryType', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedGeo: string,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fGeometryType');
      (this as unknown as Chai.Assertion).assert(
        meta.geometryType === expectedGeo,
        `expected "${idOrUuid}" geometry "${expectedGeo}", got "${meta.geometryType ?? 'none'}"`,
        `expected "${idOrUuid}" to NOT have geometry "${expectedGeo}"`,
        expectedGeo, meta.geometryType,
      );
    });

    Assertion.addMethod('r3fMaterialType', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedMat: string,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fMaterialType');
      (this as unknown as Chai.Assertion).assert(
        meta.materialType === expectedMat,
        `expected "${idOrUuid}" material "${expectedMat}", got "${meta.materialType ?? 'none'}"`,
        `expected "${idOrUuid}" to NOT have material "${expectedMat}"`,
        expectedMat, meta.materialType,
      );
    });

    Assertion.addMethod('r3fChildCount', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedCount: number,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fChildCount');
      const actual = meta.childrenUuids.length;
      (this as unknown as Chai.Assertion).assert(
        actual === expectedCount,
        `expected "${idOrUuid}" ${expectedCount} children, got ${actual}`,
        `expected "${idOrUuid}" to NOT have ${expectedCount} children`,
        expectedCount, actual,
      );
    });

    Assertion.addMethod('r3fParent', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedParent: string,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fParent');
      if (!meta.parentUuid) {
        throw new Error(`[r3fParent] "${idOrUuid}" has no parent (is scene root)`);
      }
      const parentMeta = api.getByUuid(meta.parentUuid);
      const pass = parentMeta !== null && (
        parentMeta.uuid === expectedParent ||
        parentMeta.testId === expectedParent ||
        parentMeta.name === expectedParent
      );
      const parentLabel = parentMeta?.testId ?? parentMeta?.name ?? meta.parentUuid;
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" parent "${expectedParent}", got "${parentLabel}"`,
        `expected "${idOrUuid}" to NOT have parent "${expectedParent}"`,
        expectedParent, parentLabel,
      );
    });

    Assertion.addMethod('r3fInstanceCount', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedCount: number,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fInstanceCount');
      const actual = meta.instanceCount ?? 0;
      (this as unknown as Chai.Assertion).assert(
        actual === expectedCount,
        `expected "${idOrUuid}" instance count ${expectedCount}, got ${actual}`,
        `expected "${idOrUuid}" to NOT have instance count ${expectedCount}`,
        expectedCount, actual,
      );
    });

    // ======================= TIER 2 — Inspection ==========================

    Assertion.addMethod('r3fInFrustum', function (this: Chai.AssertionStatic, idOrUuid: string) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fInFrustum');
      const fin = (v: number[]) => v.every(Number.isFinite);
      const pass = fin(insp.bounds.min) && fin(insp.bounds.max);
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" to be in the camera frustum`,
        `expected "${idOrUuid}" to NOT be in the camera frustum`,
        'in frustum', pass ? 'in frustum' : 'invalid bounds',
      );
    });

    Assertion.addMethod('r3fBounds', function (
      this: Chai.AssertionStatic, idOrUuid: string,
      expected: { min: [number, number, number]; max: [number, number, number] },
      tolerance = 0.1,
    ) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fBounds');
      const w = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
      const pass = w(insp.bounds.min, expected.min) && w(insp.bounds.max, expected.max);
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" bounds min:${JSON.stringify(expected.min)} max:${JSON.stringify(expected.max)} (±${tolerance}), got min:${JSON.stringify(insp.bounds.min)} max:${JSON.stringify(insp.bounds.max)}`,
        `expected "${idOrUuid}" bounds to NOT match`,
        expected, insp.bounds,
      );
    });

    Assertion.addMethod('r3fColor', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedColor: string,
    ) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fColor');
      const norm = expectedColor.startsWith('#') ? expectedColor.toLowerCase() : `#${expectedColor.toLowerCase()}`;
      const actual = insp.material?.color?.toLowerCase();
      (this as unknown as Chai.Assertion).assert(
        actual === norm,
        `expected "${idOrUuid}" color "${norm}", got "${actual ?? 'no color'}"`,
        `expected "${idOrUuid}" to NOT have color "${norm}"`,
        norm, actual,
      );
    });

    Assertion.addMethod('r3fOpacity', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedOpacity: number, tolerance = 0.01,
    ) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fOpacity');
      const actual = insp.material?.opacity;
      const pass = actual !== undefined && Math.abs(actual - expectedOpacity) <= tolerance;
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" opacity ${expectedOpacity} (±${tolerance}), got ${actual ?? 'no material'}`,
        `expected "${idOrUuid}" to NOT have opacity ${expectedOpacity} (±${tolerance})`,
        expectedOpacity, actual,
      );
    });

    Assertion.addMethod('r3fTransparent', function (this: Chai.AssertionStatic, idOrUuid: string) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fTransparent');
      const pass = insp.material?.transparent === true;
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected "${idOrUuid}" transparent=true, got ${insp.material?.transparent ?? 'no material'}`,
        `expected "${idOrUuid}" to NOT be transparent`,
        true, insp.material?.transparent,
      );
    });

    Assertion.addMethod('r3fVertexCount', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedCount: number,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fVertexCount');
      const actual = meta.vertexCount ?? 0;
      (this as unknown as Chai.Assertion).assert(
        actual === expectedCount,
        `expected "${idOrUuid}" ${expectedCount} vertices, got ${actual}`,
        `expected "${idOrUuid}" to NOT have ${expectedCount} vertices`,
        expectedCount, actual,
      );
    });

    Assertion.addMethod('r3fTriangleCount', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedCount: number,
    ) {
      const api = getR3FFromWindow();
      const meta = requireObject(api, idOrUuid, 'r3fTriangleCount');
      const actual = meta.triangleCount ?? 0;
      (this as unknown as Chai.Assertion).assert(
        actual === expectedCount,
        `expected "${idOrUuid}" ${expectedCount} triangles, got ${actual}`,
        `expected "${idOrUuid}" to NOT have ${expectedCount} triangles`,
        expectedCount, actual,
      );
    });

    Assertion.addMethod('r3fUserData', function (
      this: Chai.AssertionStatic, idOrUuid: string, key: string, expectedValue?: unknown,
    ) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fUserData');
      const hasKey = key in insp.userData;
      if (expectedValue === undefined) {
        (this as unknown as Chai.Assertion).assert(
          hasKey,
          `expected "${idOrUuid}" to have userData key "${key}"`,
          `expected "${idOrUuid}" to NOT have userData key "${key}"`,
          `key "${key}"`, hasKey ? 'present' : 'missing',
        );
      } else {
        const actual = insp.userData[key];
        const pass = hasKey && JSON.stringify(actual) === JSON.stringify(expectedValue);
        (this as unknown as Chai.Assertion).assert(
          pass,
          `expected "${idOrUuid}" userData.${key} = ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual)}`,
          `expected "${idOrUuid}" to NOT have userData.${key} = ${JSON.stringify(expectedValue)}`,
          expectedValue, actual,
        );
      }
    });

    Assertion.addMethod('r3fMapTexture', function (
      this: Chai.AssertionStatic, idOrUuid: string, expectedName?: string,
    ) {
      const api = getR3FFromWindow();
      const insp = requireInspection(api, idOrUuid, 'r3fMapTexture');
      const actual = insp.material?.map;
      if (!expectedName) {
        (this as unknown as Chai.Assertion).assert(
          actual !== undefined && actual !== null,
          `expected "${idOrUuid}" to have a map texture`,
          `expected "${idOrUuid}" to NOT have a map texture`,
          'any map', actual,
        );
      } else {
        (this as unknown as Chai.Assertion).assert(
          actual === expectedName,
          `expected "${idOrUuid}" map "${expectedName}", got "${actual ?? 'none'}"`,
          `expected "${idOrUuid}" to NOT have map "${expectedName}"`,
          expectedName, actual,
        );
      }
    });

    // ===================== Scene-level assertions =========================

    Assertion.addMethod('r3fObjectCount', function (
      this: Chai.AssertionStatic, expected: number,
    ) {
      const api = getR3FFromWindow();
      const actual = api.getCount();
      (this as unknown as Chai.Assertion).assert(
        actual === expected,
        `expected scene to have ${expected} objects, got ${actual}`,
        `expected scene to NOT have ${expected} objects`,
        expected, actual,
      );
    });

    Assertion.addMethod('r3fObjectCountGreaterThan', function (
      this: Chai.AssertionStatic, min: number,
    ) {
      const api = getR3FFromWindow();
      const actual = api.getCount();
      (this as unknown as Chai.Assertion).assert(
        actual > min,
        `expected scene to have more than ${min} objects, got ${actual}`,
        `expected scene to have at most ${min} objects, but has ${actual}`,
        `> ${min}`, actual,
      );
    });

    Assertion.addMethod('r3fCountByType', function (
      this: Chai.AssertionStatic, type: string, expected: number,
    ) {
      const api = getR3FFromWindow();
      const actual = api.getCountByType(type);
      (this as unknown as Chai.Assertion).assert(
        actual === expected,
        `expected ${expected} "${type}" objects, got ${actual}`,
        `expected scene to NOT have ${expected} "${type}" objects`,
        expected, actual,
      );
    });

    Assertion.addMethod('r3fTotalTriangleCount', function (
      this: Chai.AssertionStatic, expected: number,
    ) {
      const api = getR3FFromWindow();
      const actual = collectTriangles(api);
      (this as unknown as Chai.Assertion).assert(
        actual === expected,
        `expected ${expected} total triangles, got ${actual}`,
        `expected scene to NOT have ${expected} total triangles`,
        expected, actual,
      );
    });

    Assertion.addMethod('r3fTotalTriangleCountLessThan', function (
      this: Chai.AssertionStatic, max: number,
    ) {
      const api = getR3FFromWindow();
      const actual = collectTriangles(api);
      (this as unknown as Chai.Assertion).assert(
        actual < max,
        `expected fewer than ${max} total triangles, got ${actual}`,
        `expected at least ${max} total triangles, but has ${actual}`,
        `< ${max}`, actual,
      );
    });

    // ===================== Camera assertions ===============================

    Assertion.addMethod('r3fCameraPosition', function (
      this: Chai.AssertionStatic,
      expected: [number, number, number], tolerance = 0.1,
    ) {
      const api = getR3FFromWindow();
      const cam = api.getCameraState();
      const pass = expected.every((v, i) => Math.abs(cam.position[i] - v) <= tolerance);
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected camera at [${expected}], got [${cam.position}] (tol=${tolerance})`,
        `expected camera NOT at [${expected}]`,
        expected, cam.position,
      );
    });

    Assertion.addMethod('r3fCameraFov', function (
      this: Chai.AssertionStatic, expected: number, tolerance = 0.1,
    ) {
      const api = getR3FFromWindow();
      const cam = api.getCameraState();
      const actual = cam.fov;
      const pass = actual !== undefined && Math.abs(actual - expected) <= tolerance;
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected camera fov ${expected}, got ${actual ?? 'N/A'} (tol=${tolerance})`,
        `expected camera fov NOT ${expected}`,
        expected, actual,
      );
    });

    Assertion.addMethod('r3fCameraNear', function (
      this: Chai.AssertionStatic, expected: number, tolerance = 0.01,
    ) {
      const api = getR3FFromWindow();
      const cam = api.getCameraState();
      const pass = Math.abs(cam.near - expected) <= tolerance;
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected camera near ${expected}, got ${cam.near} (tol=${tolerance})`,
        `expected camera near NOT ${expected}`,
        expected, cam.near,
      );
    });

    Assertion.addMethod('r3fCameraFar', function (
      this: Chai.AssertionStatic, expected: number, tolerance = 1,
    ) {
      const api = getR3FFromWindow();
      const cam = api.getCameraState();
      const pass = Math.abs(cam.far - expected) <= tolerance;
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected camera far ${expected}, got ${cam.far} (tol=${tolerance})`,
        `expected camera far NOT ${expected}`,
        expected, cam.far,
      );
    });

    Assertion.addMethod('r3fCameraZoom', function (
      this: Chai.AssertionStatic, expected: number, tolerance = 0.01,
    ) {
      const api = getR3FFromWindow();
      const cam = api.getCameraState();
      const pass = Math.abs(cam.zoom - expected) <= tolerance;
      (this as unknown as Chai.Assertion).assert(
        pass,
        `expected camera zoom ${expected}, got ${cam.zoom} (tol=${tolerance})`,
        `expected camera zoom NOT ${expected}`,
        expected, cam.zoom,
      );
    });

    // ===================== Batch assertions ================================

    Assertion.addMethod('r3fAllExist', function (
      this: Chai.AssertionStatic, idsOrPattern: string[] | string,
    ) {
      const api = getR3FFromWindow();
      const ids = typeof idsOrPattern === 'string'
        ? resolvePatternSync(api, idsOrPattern)
        : idsOrPattern;
      const missing = ids.filter((id) => resolveObject(api, id) === null);
      (this as unknown as Chai.Assertion).assert(
        missing.length === 0 && ids.length > 0,
        `expected all objects to exist, missing: [${missing.join(', ')}]`,
        `expected some objects to NOT exist, but all do`,
        ids, { missing },
      );
    });

    Assertion.addMethod('r3fAllVisible', function (
      this: Chai.AssertionStatic, idsOrPattern: string[] | string,
    ) {
      const api = getR3FFromWindow();
      const ids = typeof idsOrPattern === 'string'
        ? resolvePatternSync(api, idsOrPattern)
        : idsOrPattern;
      const hidden = ids.filter((id) => {
        const m = resolveObject(api, id);
        return !m || !m.visible;
      });
      (this as unknown as Chai.Assertion).assert(
        hidden.length === 0 && ids.length > 0,
        `expected all objects to be visible, hidden/missing: [${hidden.join(', ')}]`,
        `expected some objects to NOT be visible, but all are`,
        ids, { hidden },
      );
    });

    Assertion.addMethod('r3fNoneExist', function (
      this: Chai.AssertionStatic, idsOrPattern: string[] | string,
    ) {
      const api = getR3FFromWindow();
      const ids = typeof idsOrPattern === 'string'
        ? resolvePatternSync(api, idsOrPattern)
        : idsOrPattern;
      const found = ids.filter((id) => resolveObject(api, id) !== null);
      (this as unknown as Chai.Assertion).assert(
        found.length === 0,
        `expected no objects to exist, but found: [${found.join(', ')}]`,
        `expected some objects to exist, but none do`,
        ids, { found },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Batch helper — resolve glob/wildcard patterns to matching testIds
// ---------------------------------------------------------------------------

function resolvePatternSync(api: R3FDOM, pattern: string): string[] {
  const snap = api.snapshot();
  const ids: string[] = [];
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  function walk(node: SnapshotNode) {
    const testId = (node as SnapshotNode & { testId?: string }).testId ?? node.name;
    if (regex.test(testId) || regex.test(node.uuid)) ids.push(testId || node.uuid);
    for (const child of node.children) walk(child);
  }
  walk(snap.tree);
  return ids;
}
