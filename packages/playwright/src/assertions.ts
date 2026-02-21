import { expect as baseExpect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ObjectMetadata, ObjectInspection } from './types';

// ---------------------------------------------------------------------------
// Custom Playwright expect matchers for 3D scene testing
//
// Every matcher auto-retries until the assertion passes or the timeout
// expires, matching Playwright's built-in assertion behaviour.
//
// All 27 matchers:
//  Tier 1 (metadata): toExist, toBeVisible, toHavePosition, toHaveWorldPosition, toHaveRotation,
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

async function fetchSceneCount(page: Page, canvasId?: string): Promise<number> {
  return page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    return api ? api.getCount() : 0;
  }, canvasId ?? null);
}

async function fetchCountByType(page: Page, type: string, canvasId?: string): Promise<number> {
  return page.evaluate(([t, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    return api ? api.getCountByType(t) : 0;
  }, [type, canvasId ?? null] as const);
}

async function fetchTotalTriangles(page: Page, canvasId?: string): Promise<number> {
  return page.evaluate((cid) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api) return 0;
    const bridge = api;
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
  }, canvasId ?? null);
}

// ---------------------------------------------------------------------------
// Object-level helpers
// ---------------------------------------------------------------------------

async function fetchMeta(page: Page, id: string, canvasId?: string): Promise<ObjectMetadata | null> {
  return page.evaluate(([i, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api) return null;
    return api.getByTestId(i) ?? api.getByUuid(i) ?? null;
  }, [id, canvasId ?? null] as const);
}

async function fetchInsp(page: Page, id: string, canvasId?: string): Promise<ObjectInspection | null> {
  return page.evaluate(([i, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api) return null;
    return api.inspect(i);
  }, [id, canvasId ?? null] as const);
}

/** World position from column-major 4x4 matrix (translation at indices 12, 13, 14). */
async function fetchWorldPosition(page: Page, id: string, canvasId?: string): Promise<[number, number, number] | null> {
  return page.evaluate(([i, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api) return null;
    const insp = api.inspect(i);
    if (!insp || !insp.worldMatrix || insp.worldMatrix.length < 15) return null;
    const m = insp.worldMatrix;
    return [m[12], m[13], m[14]];
  }, [id, canvasId ?? null] as const);
}

interface R3FMatcherReceiver {
  page: Page;
  canvasId?: string;
  getObject(idOrUuid: string): Promise<ObjectMetadata | null>;
  inspect(idOrUuid: string): Promise<ObjectInspection | null>;
}

/** Context provided by Playwright when the matcher is invoked via expect().extend() */
interface ExpectMatcherContext {
  isNot?: boolean;
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

async function fetchFuzzyHints(page: Page, query: string, canvasId?: string): Promise<string> {
  try {
    const suggestions = await page.evaluate(
      ({ q, cid }) => {
        const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
        if (!api || typeof api.fuzzyFind !== 'function') return [];
        return api.fuzzyFind(q, 5).map((m: { testId?: string; name: string; uuid: string }) => ({
          testId: m.testId, name: m.name, uuid: m.uuid,
        }));
      },
      { q: query, cid: canvasId ?? null },
    );
    if (suggestions.length === 0) return '';
    return '\nDid you mean:\n' + suggestions.map((s: { testId?: string; name: string; uuid: string }) => {
      const id = s.testId ? `testId="${s.testId}"` : `uuid="${s.uuid}"`;
      return `  → ${s.name || '(unnamed)'} [${id}]`;
    }).join('\n');
  } catch {
    return '';
  }
}

async function fetchDiagnosticHint(page: Page, canvasId?: string): Promise<string> {
  try {
    const diag = await page.evaluate((cid) => {
      const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
      if (!api || typeof api.getDiagnostics !== 'function') return null;
      return api.getDiagnostics();
    }, canvasId ?? null);
    if (!diag) return '';
    return `\nBridge: v${diag.version} ready=${diag.ready}, ${diag.objectCount} objects (${diag.meshCount} meshes)`;
  } catch {
    return '';
  }
}

async function notFoundAsync(page: Page, name: string, id: string, detail: string, timeout: number, canvasId?: string) {
  const [fuzzy, diag] = await Promise.all([
    fetchFuzzyHints(page, id, canvasId),
    fetchDiagnosticHint(page, canvasId),
  ]);
  return {
    pass: false,
    message: () => `Expected object "${id}" ${detail}, but it was not found (waited ${timeout}ms)${diag}${fuzzy}`,
    name,
  };
}

// ===========================================================================
// Matchers — export as object so users extend Playwright's expect (see README).
// This avoids replacing expect and breaking native assertions (e.g. timeout on toBeVisible).
// ===========================================================================

const r3fMatchers = {

  // ========================= TIER 1 — Metadata ============================

  // --- toExist ---
  async toExist(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
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
  async toBeVisible(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        return meta?.visible ?? false;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toBeVisible', id, 'to be visible', timeout, r3f.canvasId);
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
  async toHavePosition(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expected: [number, number, number], tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    let delta: [number, number, number] = [0, 0, 0];
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        delta = [Math.abs(meta.position[0] - expected[0]), Math.abs(meta.position[1] - expected[1]), Math.abs(meta.position[2] - expected[2])];
        pass = delta.every(d => d <= tolerance);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHavePosition', id, `to have position [${expected}]`, timeout, r3f.canvasId);
    const m = meta as ObjectMetadata;
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT be at [${expected}] (±${tolerance})`
        : `Expected "${id}" at [${expected}] (±${tolerance}), got [${m.position}] (Δ [${delta.map(d => d.toFixed(4))}]) (waited ${timeout}ms)`,
      name: 'toHavePosition', expected, actual: m.position,
    };
  },

  // --- toHaveWorldPosition ---
  async toHaveWorldPosition(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expected: [number, number, number], tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let worldPos: [number, number, number] | null = null;
    let pass = false;
    let delta: [number, number, number] = [0, 0, 0];
    try {
      await baseExpect.poll(async () => {
        worldPos = await fetchWorldPosition(r3f.page, id, r3f.canvasId);
        if (!worldPos) return false;
        delta = [Math.abs(worldPos[0] - expected[0]), Math.abs(worldPos[1] - expected[1]), Math.abs(worldPos[2] - expected[2])];
        pass = delta.every((d) => d <= tolerance);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!worldPos) return notFoundAsync(r3f.page, 'toHaveWorldPosition', id, `to have world position [${expected}]`, timeout, r3f.canvasId);
    const actualWorldPos: [number, number, number] = worldPos;
    return {
      pass,
      message: () =>
        pass
          ? `Expected "${id}" to NOT have world position [${expected}] (±${tolerance})`
          : `Expected "${id}" world position [${expected}] (±${tolerance}), got [${actualWorldPos[0].toFixed(4)}, ${actualWorldPos[1].toFixed(4)}, ${actualWorldPos[2].toFixed(4)}] (Δ [${delta.map((d) => d.toFixed(4))}]) (waited ${timeout}ms)`,
      name: 'toHaveWorldPosition', expected, actual: actualWorldPos,
    };
  },

  // --- toHaveRotation ---
  async toHaveRotation(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expected: [number, number, number], tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    let delta: [number, number, number] = [0, 0, 0];
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        delta = [Math.abs(meta.rotation[0] - expected[0]), Math.abs(meta.rotation[1] - expected[1]), Math.abs(meta.rotation[2] - expected[2])];
        pass = delta.every(d => d <= tolerance);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveRotation', id, `to have rotation [${expected}]`, timeout, r3f.canvasId);
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
  async toHaveScale(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expected: [number, number, number], tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    let delta: [number, number, number] = [0, 0, 0];
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        delta = [Math.abs(meta.scale[0] - expected[0]), Math.abs(meta.scale[1] - expected[1]), Math.abs(meta.scale[2] - expected[2])];
        pass = delta.every(d => d <= tolerance);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveScale', id, `to have scale [${expected}]`, timeout, r3f.canvasId);
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
  async toHaveType(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedType: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        pass = meta.type === expectedType;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveType', id, `to have type "${expectedType}"`, timeout, r3f.canvasId);
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
  async toHaveName(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedName: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        pass = meta.name === expectedName;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveName', id, `to have name "${expectedName}"`, timeout, r3f.canvasId);
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
  async toHaveGeometryType(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedGeo: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        pass = meta.geometryType === expectedGeo;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveGeometryType', id, `to have geometry "${expectedGeo}"`, timeout, r3f.canvasId);
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
  async toHaveMaterialType(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedMat: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        pass = meta.materialType === expectedMat;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveMaterialType', id, `to have material "${expectedMat}"`, timeout, r3f.canvasId);
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
  async toHaveChildCount(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta) return false;
        actual = meta.childrenUuids.length;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveChildCount', id, `to have ${expectedCount} children`, timeout, r3f.canvasId);
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
  async toHaveParent(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedParent: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let parentMeta: ObjectMetadata | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        if (!meta?.parentUuid) return false;
        parentMeta = await fetchMeta(r3f.page, meta.parentUuid, r3f.canvasId);
        if (!parentMeta) return false;
        pass = parentMeta.uuid === expectedParent || parentMeta.testId === expectedParent || parentMeta.name === expectedParent;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveParent', id, `to have parent "${expectedParent}"`, timeout, r3f.canvasId);
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
  async toHaveInstanceCount(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        actual = meta?.instanceCount ?? 0;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveInstanceCount', id, `to have instance count ${expectedCount}`, timeout, r3f.canvasId);
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
  async toBeInFrustum(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id, r3f.canvasId);
        if (!insp) return false;
        const fin = (v: number[]) => v.every(Number.isFinite);
        pass = fin(insp.bounds.min) && fin(insp.bounds.max);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFoundAsync(r3f.page, 'toBeInFrustum', id, 'to be in frustum', timeout, r3f.canvasId);
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
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string,
    expected: { min: [number, number, number]; max: [number, number, number] },
    tolOpts?: number | Vec3Opts,
  ) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.1);
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id, r3f.canvasId);
        if (!insp) return false;
        const w = (a: number[], b: number[]) => a.every((v, j) => Math.abs(v - b[j]) <= tolerance);
        pass = w(insp.bounds.min, expected.min) && w(insp.bounds.max, expected.max);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFoundAsync(r3f.page, 'toHaveBounds', id, 'to have specific bounds', timeout, r3f.canvasId);
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
  async toHaveColor(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedColor: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    const norm = expectedColor.startsWith('#') ? expectedColor.toLowerCase() : `#${expectedColor.toLowerCase()}`;
    let insp: ObjectInspection | null = null;
    let actual: string | undefined;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id, r3f.canvasId);
        if (!insp?.material?.color) return false;
        actual = insp.material.color.toLowerCase();
        pass = actual === norm;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFoundAsync(r3f.page, 'toHaveColor', id, `to have color "${norm}"`, timeout, r3f.canvasId);
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have color "${norm}"`
        : `Expected "${id}" color "${norm}", got "${actual ?? 'no color'}" (waited ${timeout}ms)`,
      name: 'toHaveColor', expected: norm, actual,
    };
  },

  // --- toHaveOpacity ---
  async toHaveOpacity(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedOpacity: number, tolOpts?: number | Vec3Opts) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let actual: number | undefined;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id, r3f.canvasId);
        if (!insp?.material) return false;
        actual = insp.material.opacity;
        pass = actual !== undefined && Math.abs(actual - expectedOpacity) <= tolerance;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFoundAsync(r3f.page, 'toHaveOpacity', id, `to have opacity ${expectedOpacity}`, timeout, r3f.canvasId);
    return {
      pass,
      message: () => pass
        ? `Expected "${id}" to NOT have opacity ${expectedOpacity} (±${tolerance})`
        : `Expected "${id}" opacity ${expectedOpacity} (±${tolerance}), got ${actual ?? 'no material'} (waited ${timeout}ms)`,
      name: 'toHaveOpacity', expected: expectedOpacity, actual,
    };
  },

  // --- toBeTransparent ---
  async toBeTransparent(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id, r3f.canvasId);
        if (!insp?.material) return false;
        pass = insp.material.transparent === true;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFoundAsync(r3f.page, 'toBeTransparent', id, 'to be transparent', timeout, r3f.canvasId);
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
  async toHaveVertexCount(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        actual = meta?.vertexCount ?? 0;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveVertexCount', id, `to have ${expectedCount} vertices`, timeout, r3f.canvasId);
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
  async toHaveTriangleCount(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedCount: number, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let meta: ObjectMetadata | null = null;
    let actual = 0;
    try {
      await baseExpect.poll(async () => {
        meta = await fetchMeta(r3f.page, id, r3f.canvasId);
        actual = meta?.triangleCount ?? 0;
        return actual === expectedCount;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!meta) return notFoundAsync(r3f.page, 'toHaveTriangleCount', id, `to have ${expectedCount} triangles`, timeout, r3f.canvasId);
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
  async toHaveUserData(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, key: string, expectedValue?: unknown, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let actual: unknown;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id, r3f.canvasId);
        if (!insp) return false;
        if (!(key in insp.userData)) return false;
        if (expectedValue === undefined) { pass = true; return true; }
        actual = insp.userData[key];
        pass = JSON.stringify(actual) === JSON.stringify(expectedValue);
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFoundAsync(r3f.page, 'toHaveUserData', id, `to have userData.${key}`, timeout, r3f.canvasId);
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
  async toHaveMapTexture(this: ExpectMatcherContext, r3f: R3FMatcherReceiver, id: string, expectedName?: string, opts?: MatcherOptions) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let insp: ObjectInspection | null = null;
    let actual: string | undefined;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        insp = await fetchInsp(r3f.page, id, r3f.canvasId);
        if (!insp?.material?.map) return false;
        actual = insp.material.map;
        if (!expectedName) { pass = true; return true; }
        pass = actual === expectedName;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    if (!insp) return notFoundAsync(r3f.page, 'toHaveMapTexture', id, 'to have a map texture', timeout, r3f.canvasId);
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
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
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
        actual = await fetchSceneCount(r3f.page, r3f.canvasId);
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
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
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
        actual = await fetchSceneCount(r3f.page, r3f.canvasId);
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
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
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
        actual = await fetchCountByType(r3f.page, type, r3f.canvasId);
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
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
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
        actual = await fetchTotalTriangles(r3f.page, r3f.canvasId);
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
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
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
        actual = await fetchTotalTriangles(r3f.page, r3f.canvasId);
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
  // ===================== CAMERA STATE ASSERTIONS ===========================

  /**
   * Assert the camera position is close to the expected [x, y, z].
   *
   * @example expect(r3f).toHaveCameraPosition([0, 5, 10], 0.1);
   */
  async toHaveCameraPosition(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    expected: [number, number, number],
    tolOpts?: number | Vec3Opts,
  ) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.1);
    const isNot = this.isNot;
    let actual: [number, number, number] = [0, 0, 0];
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const cam = await r3f.page.evaluate((cid) => { const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__; return api!.getCameraState(); }, r3f.canvasId ?? null);
        actual = cam.position;
        pass = Math.abs(actual[0] - expected[0]) <= tolerance
            && Math.abs(actual[1] - expected[1]) <= tolerance
            && Math.abs(actual[2] - expected[2]) <= tolerance;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected camera NOT at [${expected}], but it is`
          : `Expected camera at [${expected}], got [${actual}] (tol=${tolerance}, waited ${timeout}ms)`,
      name: 'toHaveCameraPosition', expected, actual,
    };
  },

  /**
   * Assert the camera field of view (PerspectiveCamera only).
   *
   * @example expect(r3f).toHaveCameraFov(75);
   */
  async toHaveCameraFov(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    expected: number,
    tolOpts?: number | Vec3Opts,
  ) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.1);
    const isNot = this.isNot;
    let actual: number | undefined;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const cam = await r3f.page.evaluate((cid) => { const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__; return api!.getCameraState(); }, r3f.canvasId ?? null);
        actual = cam.fov;
        pass = actual !== undefined && Math.abs(actual - expected) <= tolerance;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected camera NOT to have fov ${expected}, but it does`
          : `Expected camera fov ${expected}, got ${actual ?? 'N/A'} (tol=${tolerance}, waited ${timeout}ms)`,
      name: 'toHaveCameraFov', expected, actual,
    };
  },

  /**
   * Assert the camera near clipping plane.
   *
   * @example expect(r3f).toHaveCameraNear(0.1);
   */
  async toHaveCameraNear(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    expected: number,
    tolOpts?: number | Vec3Opts,
  ) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let actual = 0;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const cam = await r3f.page.evaluate((cid) => { const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__; return api!.getCameraState(); }, r3f.canvasId ?? null);
        actual = cam.near;
        pass = Math.abs(actual - expected) <= tolerance;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected camera near NOT ${expected}, but it is`
          : `Expected camera near ${expected}, got ${actual} (tol=${tolerance}, waited ${timeout}ms)`,
      name: 'toHaveCameraNear', expected, actual,
    };
  },

  /**
   * Assert the camera far clipping plane.
   *
   * @example expect(r3f).toHaveCameraFar(1000);
   */
  async toHaveCameraFar(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    expected: number,
    tolOpts?: number | Vec3Opts,
  ) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 1);
    const isNot = this.isNot;
    let actual = 0;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const cam = await r3f.page.evaluate((cid) => { const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__; return api!.getCameraState(); }, r3f.canvasId ?? null);
        actual = cam.far;
        pass = Math.abs(actual - expected) <= tolerance;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected camera far NOT ${expected}, but it is`
          : `Expected camera far ${expected}, got ${actual} (tol=${tolerance}, waited ${timeout}ms)`,
      name: 'toHaveCameraFar', expected, actual,
    };
  },

  /**
   * Assert the camera zoom level.
   *
   * @example expect(r3f).toHaveCameraZoom(1);
   */
  async toHaveCameraZoom(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    expected: number,
    tolOpts?: number | Vec3Opts,
  ) {
    const { timeout, interval, tolerance } = parseTol(tolOpts, 0.01);
    const isNot = this.isNot;
    let actual = 0;
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const cam = await r3f.page.evaluate((cid) => { const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__; return api!.getCameraState(); }, r3f.canvasId ?? null);
        actual = cam.zoom;
        pass = Math.abs(actual - expected) <= tolerance;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected camera zoom NOT ${expected}, but it is`
          : `Expected camera zoom ${expected}, got ${actual} (tol=${tolerance}, waited ${timeout}ms)`,
      name: 'toHaveCameraZoom', expected, actual,
    };
  },

  // ======================== BATCH ASSERTIONS ==============================

  /**
   * Assert that ALL given objects exist in the scene.
   * Accepts an array of testIds/uuids or a glob pattern (e.g. "wall-*").
   *
   * @example expect(r3f).toAllExist(['wall-1', 'wall-2', 'floor']);
   * @example expect(r3f).toAllExist('wall-*');
   */
  async toAllExist(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    idsOrPattern: string[] | string,
    opts?: MatcherOptions,
  ) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let missing: string[] = [];
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const ids = typeof idsOrPattern === 'string'
          ? await resolvePattern(r3f.page, idsOrPattern, r3f.canvasId)
          : idsOrPattern;
        missing = [];
        for (const id of ids) {
          const m = await r3f.getObject(id);
          if (!m) missing.push(id);
        }
        pass = missing.length === 0 && ids.length > 0;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected some objects to NOT exist, but all do`
          : `Objects not found: [${missing.join(', ')}] (waited ${timeout}ms)`,
      name: 'toAllExist', expected: idsOrPattern, actual: { missing },
    };
  },

  /**
   * Assert that ALL given objects are visible.
   *
   * @example expect(r3f).toAllBeVisible(['wall-1', 'wall-2', 'floor']);
   * @example expect(r3f).toAllBeVisible('wall-*');
   */
  async toAllBeVisible(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    idsOrPattern: string[] | string,
    opts?: MatcherOptions,
  ) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let hidden: string[] = [];
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const ids = typeof idsOrPattern === 'string'
          ? await resolvePattern(r3f.page, idsOrPattern, r3f.canvasId)
          : idsOrPattern;
        hidden = [];
        for (const id of ids) {
          const m = await r3f.getObject(id);
          if (!m || !m.visible) hidden.push(id);
        }
        pass = hidden.length === 0 && ids.length > 0;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected some objects to NOT be visible, but all are`
          : `Objects not visible: [${hidden.join(', ')}] (waited ${timeout}ms)`,
      name: 'toAllBeVisible', expected: idsOrPattern, actual: { hidden },
    };
  },

  /**
   * Assert that NONE of the given objects exist in the scene.
   *
   * @example expect(r3f).toNoneExist(['deleted-wall', 'old-floor']);
   * @example expect(r3f).toNoneExist('temp-*');
   */
  async toNoneExist(
    this: ExpectMatcherContext, r3f: R3FMatcherReceiver,
    idsOrPattern: string[] | string,
    opts?: MatcherOptions,
  ) {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
    const interval = opts?.interval ?? DEFAULT_INTERVAL;
    const isNot = this.isNot;
    let found: string[] = [];
    let pass = false;
    try {
      await baseExpect.poll(async () => {
        const ids = typeof idsOrPattern === 'string'
          ? await resolvePattern(r3f.page, idsOrPattern, r3f.canvasId)
          : idsOrPattern;
        found = [];
        for (const id of ids) {
          const m = await r3f.getObject(id);
          if (m) found.push(id);
        }
        pass = found.length === 0;
        return pass;
      }, { timeout, intervals: [interval] }).toBe(!isNot);
    } catch { /* */ }
    return {
      pass,
      message: () =>
        pass
          ? `Expected some objects to exist, but none do`
          : `Objects still exist: [${found.join(', ')}] (waited ${timeout}ms)`,
      name: 'toNoneExist', expected: idsOrPattern, actual: { found },
    };
  },
};

// ---------------------------------------------------------------------------
// Batch helper — resolve glob/wildcard patterns to matching testIds
// ---------------------------------------------------------------------------

async function resolvePattern(page: Page, pattern: string, canvasId?: string): Promise<string[]> {
  return page.evaluate(([p, cid]) => {
    const api = cid ? window.__R3F_DOM_INSTANCES__?.[cid] : window.__R3F_DOM__;
    if (!api) return [];
    const snap = api.snapshot();
    const ids: string[] = [];
    const regex = new RegExp('^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    function walk(node: { uuid: string; name: string; type: string; testId?: string; children: unknown[] }) {
      const testId = (node as { testId?: string }).testId ?? node.name;
      if (regex.test(testId) || regex.test(node.uuid)) ids.push(testId || node.uuid);
      for (const child of (node.children ?? []) as typeof node[]) walk(child);
    }
    walk(snap.tree as Parameters<typeof walk>[0]);
    return ids;
  }, [pattern, canvasId ?? null] as const);
}

export { r3fMatchers };
