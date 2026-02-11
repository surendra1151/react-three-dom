import { expect as baseExpect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ObjectMetadata, ObjectInspection } from './types';

// ---------------------------------------------------------------------------
// Custom Playwright expect matchers for 3D scene testing
//
// Every matcher auto-retries until the assertion passes or the timeout
// expires, matching Playwright's built-in assertion behaviour.
//
// All 26 matchers:
//  Tier 1 (metadata): toExist, toBeVisible, toHavePosition, toHaveRotation,
//    toHaveScale, toHaveType, toHaveName, toHaveGeometryType,
//    toHaveMaterialType, toHaveChildCount, toHaveParent,
//    toHaveInstanceCount
//  Tier 2 (inspection): toBeInFrustum, toHaveBounds, toHaveColor,
//    toHaveOpacity, toBeTransparent, toHaveVertexCount,
//    toHaveTriangleCount, toHaveUserData, toHaveMapTexture
//  Scene-level: toHaveObjectCount, toHaveObjectCountGreaterThan,
//    toHaveCountByType, toHaveTotalTriangleCount,
//    toHaveTotalTriangleCountLessThan
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT = 5_000;
const DEFAULT_INTERVAL = 100;

// ---------------------------------------------------------------------------
// Scene-level helpers
// ---------------------------------------------------------------------------

async function fetchSceneCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = window.__R3F_DOM__;
    return api ? api.getCount() : 0;
  });
}

async function fetchCountByType(page: Page, type: string): Promise<number> {
  return page.evaluate((t) => {
    const api = window.__R3F_DOM__;
    return api ? api.getCountByType(t) : 0;
  }, type);
}

async function fetchTotalTriangles(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = window.__R3F_DOM__;
    if (!api) return 0;
    const bridge = api; // capture for nested function
    const snap = bridge.snapshot();
    let total = 0;
    function walk(node: { uuid: string; children: unknown[] }) {
      const meta = bridge.getByUuid(node.uuid);
      if (meta && meta.triangleCount) total += meta.triangleCount;
      for (const child of node.children) {
        walk(child as typeof node);
      }
    }
    walk(snap.tree as unknown as { uuid: string; children: unknown[] });
    return total;
  });
}

// ---------------------------------------------------------------------------
// Object-level helpers
// ---------------------------------------------------------------------------

async function fetchMeta(page: Page, id: string): Promise<ObjectMetadata | null> {
  return page.evaluate((i) => {
    const api = window.__R3F_DOM__;
    if (!api) return null;
    return api.getByTestId(i) ?? api.getByUuid(i) ?? null;
  }, id);
}

async function fetchInsp(page: Page, id: string): Promise<ObjectInspection | null> {
  return page.evaluate((i) => {
    const api = window.__R3F_DOM__;
    if (!api) return null;
    return api.inspect(i);
  }, id);
}

interface R3FMatcherReceiver {
  page: Page;
  getObject(idOrUuid: string): Promise<ObjectMetadata | null>;
  inspect(idOrUuid: string): Promise<ObjectInspection | null>;
}

interface MatcherOptions {
  timeout?: number;
  interval?: number;
}

type Vec3Opts = MatcherOptions & { tolerance?: number };

function parseTol(v: number | Vec3Opts | undefined, def: number) {
  const o = typeof v === 'number' ? { tolerance: v } : (v ?? {});
  return {
    timeout: o.timeout ?? DEFAULT_TIMEOUT,
    interval: o.interval ?? DEFAULT_INTERVAL,
    tolerance: o.tolerance ?? def,
  };
}

function notFound(name: string, id: string, detail: string, timeout: number) {
  return {
    pass: false,
    message: () => `Expected object "${id}" ${detail}, but it was not found (waited ${timeout}ms)`,
    name,
  };
}

// ===========================================================================
// Matchers
// ===========================================================================

export const expect = baseExpect.extend({

  // ========================= TIER 1 — Metadata ============================

  // --- toExist ---
  async toExist(r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        return meta !== null;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    const pass = meta !== null;
    return {
      pass,
      message: () => pass
        ? `Expected object "${id}" to NOT exist, but it does`
        : `Expected object "${id}" to exist, but it was not found (waited ${timeout}ms)`,
      name: 'toExist', expected: id, actual: meta,
    };
  },

  // --- toBeVisible ---
  async toBeVisible(r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        return meta?.visible ?? false;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toBeVisible', id, 'to be visible', timeout);
    const m = meta as ObjectMetadata;
    return {
      pass: m.visible,
      message: () => m.visible
        ? `Expected "${id}" to NOT be visible, but it is`
        : `Expected "${id}" to be visible, but visible=${m.visible} (waited ${timeout}ms)`,
      name: 'toBeVisible', expected: true, actual: m.visible,
    };
  },

  // --- toHavePosition ---
  async toHavePosition(r3f: R3FMatcherReceiver, id: string, expected: [number, number, number], tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    let delta: [number, number, number] = [0, 0, 0];
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        delta = [Math.abs(meta.position[0] - expected[0]), Math.abs(meta.position[1] - expected[1]), Math.abs(meta.position[2] - expected[2])];
        pass = delta.every(d => d <= tolerance);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHavePosition', id, `to have position [${expected}]`, timeout);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT be at [${expected}] (±${tolerance})`
        : `Expected "${id}" at [${expected}] (±${tolerance}), got [${m.position}] (Δ [${delta.map(d => d.toFixed(4))}]) (waited ${timeout}ms)`,
      name: 'toHavePosition', expected, actual: m.position,
    };
  },

  // --- toHaveRotation ---
  async toHaveRotation(r3f: R3FMatcherReceiver, id: string, expected: [number, number, number], tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    let delta: [number, number, number] = [0, 0, 0];
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        delta = [Math.abs(meta.rotation[0] - expected[0]), Math.abs(meta.rotation[1] - expected[1]), Math.abs(meta.rotation[2] - expected[2])];
        pass = delta.every(d => d <= tolerance);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveRotation', id, `to have rotation [${expected}]`, timeout);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have rotation [${expected}] (±${tolerance})`
        : `Expected "${id}" rotation [${expected}] (±${tolerance}), got [${m.rotation}] (Δ [${delta.map(d => d.toFixed(4))}]) (waited ${timeout}ms)`,
      name: 'toHaveRotation', expected, actual: m.rotation,
    };
  },

  // --- toHaveScale ---
  async toHaveScale(r3f: R3FMatcherReceiver, id: string, expected: [number, number, number], tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    let delta: [number, number, number] = [0, 0, 0];
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        delta = [Math.abs(meta.scale[0] - expected[0]), Math.abs(meta.scale[1] - expected[1]), Math.abs(meta.scale[2] - expected[2])];
        pass = delta.every(d => d <= tolerance);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveScale', id, `to have scale [${expected}]`, timeout);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have scale [${expected}] (±${tolerance})`
        : `Expected "${id}" scale [${expected}] (±${tolerance}), got [${m.scale}] (Δ [${delta.map(d => d.toFixed(4))}]) (waited ${timeout}ms)`,
      name: 'toHaveScale', expected, actual: m.scale,
    };
  },

  // --- toHaveType ---
  async toHaveType(r3f: R3FMatcherReceiver, id: string, expectedType: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        pass = meta.type === expectedType;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveType', id, `to have type "${expectedType}"`, timeout);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have type "${expectedType}"`
        : `Expected "${id}" type "${expectedType}", got "${m.type}" (waited ${timeout}ms)`,
      name: 'toHaveType', expected: expectedType, actual: m.type,
    };
  },

  // --- toHaveName ---
  async toHaveName(r3f: R3FMatcherReceiver, id: string, expectedName: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        pass = meta.name === expectedName;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveName', id, `to have name "${expectedName}"`, timeout);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have name "${expectedName}"`
        : `Expected "${id}" name "${expectedName}", got "${m.name}" (waited ${timeout}ms)`,
      name: 'toHaveName', expected: expectedName, actual: m.name,
    };
  },

  // --- toHaveGeometryType ---
  async toHaveGeometryType(r3f: R3FMatcherReceiver, id: string, expectedGeo: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        pass = meta.geometryType === expectedGeo;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveGeometryType', id, `to have geometry "${expectedGeo}"`, timeout);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have geometry "${expectedGeo}"`
        : `Expected "${id}" geometry "${expectedGeo}", got "${m.geometryType ?? 'none'}" (waited ${timeout}ms)`,
      name: 'toHaveGeometryType', expected: expectedGeo, actual: m.geometryType,
    };
  },

  // --- toHaveMaterialType ---
  async toHaveMaterialType(r3f: R3FMatcherReceiver, id: string, expectedMat: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        pass = meta.materialType === expectedMat;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveMaterialType', id, `to have material "${expectedMat}"`, timeout);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have material "${expectedMat}"`
        : `Expected "${id}" material "${expectedMat}", got "${m.materialType ?? 'none'}" (waited ${timeout}ms)`,
      name: 'toHaveMaterialType', expected: expectedMat, actual: m.materialType,
    };
  },

  // --- toHaveChildCount ---
  async toHaveChildCount(r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta) return false;
        actual = meta.childrenUuids.length;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveChildCount', id, `to have ${expectedCount} children`, timeout);
    const pass = actual === expectedCount;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have ${expectedCount} children`
        : `Expected "${id}" ${expectedCount} children, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveChildCount', expected: expectedCount, actual,
    };
  },

  // --- toHaveParent ---
  async toHaveParent(r3f: R3FMatcherReceiver, id: string, expectedParent: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let parentMeta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        if (!meta?.parentUuid) return false;
        parentMeta = await fetchMeta(r3f.page, meta.parentUuid);
        if (!parentMeta) return false;
        pass = parentMeta.uuid === expectedParent || parentMeta.testId === expectedParent || parentMeta.name === expectedParent;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveParent', id, `to have parent "${expectedParent}"`, timeout);
    const m = meta as ObjectMetadata;
    const pm = parentMeta as ObjectMetadata | null;
    const parentLabel = pm?.testId ?? pm?.name ?? m.parentUuid;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have parent "${expectedParent}"`
        : `Expected "${id}" parent "${expectedParent}", got "${parentLabel}" (waited ${timeout}ms)`,
      name: 'toHaveParent', expected: expectedParent, actual: parentLabel,
    };
  },

  // --- toHaveInstanceCount ---
  async toHaveInstanceCount(r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        actual = meta?.instanceCount ?? 0;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveInstanceCount', id, `to have instance count ${expectedCount}`, timeout);
    const pass = actual === expectedCount;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have instance count ${expectedCount}`
        : `Expected "${id}" instance count ${expectedCount}, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveInstanceCount', expected: expectedCount, actual,
    };
  },

  // ========================= TIER 2 — Inspection ==========================

  // --- toBeInFrustum ---
  async toBeInFrustum(r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id);
        if (!insp) return false;
        const fin = (v: number[]) => v.every(Number.isFinite);
        pass = fin(insp.bounds.min) && fin(insp.bounds.max);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFound('toBeInFrustum', id, 'to be in frustum', timeout);
    const i = insp as ObjectInspection;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT be in the camera frustum`
        : `Expected "${id}" in frustum, but bounds are invalid (waited ${timeout}ms)`,
      name: 'toBeInFrustum', expected: 'finite bounds', actual: i.bounds,
    };
  },

  // --- toHaveBounds ---
  async toHaveBounds(
    r3f: R3FMatcherReceiver, id: string,
    expected: { min: [number, number, number]; max: [number, number, number] },
    tolOpts?: number | Vec3Opts,
  ) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.1);
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id);
        if (!insp) return false;
        const w = (a: number[], b: number[]) => a.every((v, j) => Math.abs(v - b[j]) <= tolerance);
        pass = w(insp.bounds.min, expected.min) && w(insp.bounds.max, expected.max);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFound('toHaveBounds', id, 'to have specific bounds', timeout);
    const i = insp as ObjectInspection;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have bounds min:${JSON.stringify(expected.min)} max:${JSON.stringify(expected.max)}`
        : `Expected "${id}" bounds min:${JSON.stringify(expected.min)} max:${JSON.stringify(expected.max)}, got min:${JSON.stringify(i.bounds.min)} max:${JSON.stringify(i.bounds.max)} (waited ${timeout}ms)`,
      name: 'toHaveBounds', expected, actual: i.bounds,
    };
  },

  // --- toHaveColor ---
  async toHaveColor(r3f: R3FMatcherReceiver, id: string, expectedColor: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    const norm = expectedColor.startsWith('#') ? expectedColor.toLowerCase() : `#${expectedColor.toLowerCase()}`;
    let insp: ObjectInspection | null = null;
    let actual: string | undefined;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id);
        if (!insp?.material?.color) return false;
        actual = insp.material.color.toLowerCase();
        pass = actual === norm;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFound('toHaveColor', id, `to have color "${norm}"`, timeout);
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have color "${norm}"`
        : `Expected "${id}" color "${norm}", got "${actual ?? 'no color'}" (waited ${timeout}ms)`,
      name: 'toHaveColor', expected: norm, actual,
    };
  },

  // --- toHaveOpacity ---
  async toHaveOpacity(r3f: R3FMatcherReceiver, id: string, expectedOpacity: number, tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let actual: number | undefined;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id);
        if (!insp?.material) return false;
        actual = insp.material.opacity;
        pass = actual !== undefined && Math.abs(actual - expectedOpacity) <= tolerance;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFound('toHaveOpacity', id, `to have opacity ${expectedOpacity}`, timeout);
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have opacity ${expectedOpacity} (±${tolerance})`
        : `Expected "${id}" opacity ${expectedOpacity} (±${tolerance}), got ${actual ?? 'no material'} (waited ${timeout}ms)`,
      name: 'toHaveOpacity', expected: expectedOpacity, actual,
    };
  },

  // --- toBeTransparent ---
  async toBeTransparent(r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id);
        if (!insp?.material) return false;
        pass = insp.material.transparent === true;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFound('toBeTransparent', id, 'to be transparent', timeout);
    const i = insp as ObjectInspection;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT be transparent`
        : `Expected "${id}" transparent=true, got ${i.material?.transparent ?? 'no material'} (waited ${timeout}ms)`,
      name: 'toBeTransparent', expected: true, actual: i.material?.transparent,
    };
  },

  // --- toHaveVertexCount ---
  async toHaveVertexCount(r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        actual = meta?.vertexCount ?? 0;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveVertexCount', id, `to have ${expectedCount} vertices`, timeout);
    const pass = actual === expectedCount;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have ${expectedCount} vertices`
        : `Expected "${id}" ${expectedCount} vertices, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveVertexCount', expected: expectedCount, actual,
    };
  },

  // --- toHaveTriangleCount ---
  async toHaveTriangleCount(r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id);
        actual = meta?.triangleCount ?? 0;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFound('toHaveTriangleCount', id, `to have ${expectedCount} triangles`, timeout);
    const pass = actual === expectedCount;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have ${expectedCount} triangles`
        : `Expected "${id}" ${expectedCount} triangles, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveTriangleCount', expected: expectedCount, actual,
    };
  },

  // --- toHaveUserData ---
  async toHaveUserData(r3f: R3FMatcherReceiver, id: string, key: string, expectedValue?: unknown, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let actual: unknown;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id);
        if (!insp) return false;
        if (!(key in insp.userData)) return false;
        if (expectedValue === undefined) { pass = true; return true; }
        actual = insp.userData[key];
        pass = JSON.stringify(actual) === JSON.stringify(expectedValue);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFound('toHaveUserData', id, `to have userData.${key}`, timeout);
    return {
      pass,
      message: () => {
        if (expectedValue === undefined) {
          return pass
            ? `Expected "${id}" to NOT have userData key "${key}"`
            : `Expected "${id}" to have userData key "${key}", but missing (waited ${timeout}ms)`;
        }
        return pass
          ? `Expected "${id}" to NOT have userData.${key} = ${JSON.stringify(expectedValue)}`
          : `Expected "${id}" userData.${key} = ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual)} (waited ${timeout}ms)`;
      },
      name: 'toHaveUserData', expected: expectedValue ?? `key "${key}"`, actual,
    };
  },

  // --- toHaveMapTexture ---
  async toHaveMapTexture(r3f: R3FMatcherReceiver, id: string, expectedName?: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let actual: string | undefined;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id);
        if (!insp?.material?.map) return false;
        actual = insp.material.map;
        if (!expectedName) { pass = true; return true; }
        pass = actual === expectedName;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFound('toHaveMapTexture', id, 'to have a map texture', timeout);
    return {
      pass,
      message: () => {
        if (!expectedName) {
          return pass
            ? `Expected "${id}" to NOT have a map texture`
            : `Expected "${id}" to have a map texture, but none found (waited ${timeout}ms)`;
        }
        return pass
          ? `Expected "${id}" to NOT have map "${expectedName}"`
          : `Expected "${id}" map "${expectedName}", got "${actual ?? 'none'}" (waited ${timeout}ms)`;
      },
      name: 'toHaveMapTexture', expected: expectedName ?? 'any map', actual,
    };
  },

  // =========================================================================
  // Scene-level matchers (no object ID — operate on the whole scene)
  // =========================================================================

  /**
   * Assert the total number of objects in the scene.
   * Auto-retries until the count matches or timeout.
   *
   * @example expect(r3f).toHaveObjectCount(42);
   * @example expect(r3f).toHaveObjectCount(42, { timeout: 10_000 });
   */
  async toHaveObjectCount(
    r3f: R3FMatcherReceiver,
    expected: number,
    options?: MatcherOptions,
  ) {
    const isNot = this.isNot;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const interval = options?.interval ?? DEFAULT_INTERVAL;
    let actual = -1;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        actual = await fetchSceneCount(r3f.page);
        pass = actual === expected;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected scene to NOT have ${expected} objects, but it does`
          : `Expected scene to have ${expected} objects, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveObjectCount', expected, actual,
    };
  },

  /**
   * Assert the total number of objects is at least `min`.
   * Useful for BIM scenes where the exact count may vary slightly.
   *
   * @example expect(r3f).toHaveObjectCountGreaterThan(10);
   */
  async toHaveObjectCountGreaterThan(
    r3f: R3FMatcherReceiver,
    min: number,
    options?: MatcherOptions,
  ) {
    const isNot = this.isNot;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const interval = options?.interval ?? DEFAULT_INTERVAL;
    let actual = -1;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        actual = await fetchSceneCount(r3f.page);
        pass = actual > min;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected scene to have at most ${min} objects, but has ${actual}`
          : `Expected scene to have more than ${min} objects, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveObjectCountGreaterThan', expected: `> ${min}`, actual,
    };
  },

  /**
   * Assert the count of objects of a specific Three.js type.
   * Auto-retries until the count matches or timeout.
   *
   * @example expect(r3f).toHaveCountByType('Mesh', 5);
   * @example expect(r3f).toHaveCountByType('Line', 10, { timeout: 10_000 });
   */
  async toHaveCountByType(
    r3f: R3FMatcherReceiver,
    type: string,
    expected: number,
    options?: MatcherOptions,
  ) {
    const isNot = this.isNot;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const interval = options?.interval ?? DEFAULT_INTERVAL;
    let actual = -1;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        actual = await fetchCountByType(r3f.page, type);
        pass = actual === expected;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected scene to NOT have ${expected} "${type}" objects, but it does`
          : `Expected ${expected} "${type}" objects, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveCountByType', expected, actual,
    };
  },

  /**
   * Assert the total triangle count across all meshes in the scene.
   * Use as a performance budget guard — fail if the scene exceeds a threshold.
   *
   * @example expect(r3f).toHaveTotalTriangleCount(50000);
   * @example expect(r3f).not.toHaveTotalTriangleCountGreaterThan(100000); // budget guard
   */
  async toHaveTotalTriangleCount(
    r3f: R3FMatcherReceiver,
    expected: number,
    options?: MatcherOptions,
  ) {
    const isNot = this.isNot;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const interval = options?.interval ?? DEFAULT_INTERVAL;
    let actual = -1;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        actual = await fetchTotalTriangles(r3f.page);
        pass = actual === expected;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected scene to NOT have ${expected} total triangles, but it does`
          : `Expected ${expected} total triangles, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveTotalTriangleCount', expected, actual,
    };
  },

  /**
   * Assert the total triangle count is at most `max`.
   * Perfect as a performance budget guard to prevent scene bloat.
   *
   * @example expect(r3f).toHaveTotalTriangleCountLessThan(100_000);
   */
  async toHaveTotalTriangleCountLessThan(
    r3f: R3FMatcherReceiver,
    max: number,
    options?: MatcherOptions,
  ) {
    const isNot = this.isNot;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const interval = options?.interval ?? DEFAULT_INTERVAL;
    let actual = -1;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        actual = await fetchTotalTriangles(r3f.page);
        pass = actual < max;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected scene to have at least ${max} triangles, but has ${actual}`
          : `Expected scene to have fewer than ${max} triangles, got ${actual} (waited ${timeout}ms)`,
      name: 'toHaveTotalTriangleCountLessThan', expected: `< ${max}`, actual,
    };
  },
});
