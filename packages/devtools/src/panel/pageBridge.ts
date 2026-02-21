/**
 * @module pageBridge
 *
 * Bridge to the inspected page via `chrome.devtools.inspectedWindow.eval`.
 * Provides typed functions for querying scene snapshots, selecting objects,
 * inspecting properties, and toggling inspect mode. Only works when the
 * page has `window.__R3F_DOM__` (i.e. uses `@react-three-dom/core`).
 *
 * Supports multi-canvas apps via {@link setTargetCanvas}.
 */

export type SceneSnapshot = {
  timestamp: number;
  objectCount: number;
  tree: SnapshotNode;
};

export type SnapshotNode = {
  uuid: string;
  name: string;
  type: string;
  testId?: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  geometryType?: string;
  materialType?: string;
  vertexCount?: number;
  triangleCount?: number;
  instanceCount?: number;
  children: SnapshotNode[];
};

export type ObjectMetadata = {
  uuid: string;
  name: string;
  type: string;
  testId?: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  parentUuid: string | null;
  childrenUuids: string[];
  boundsDirty?: boolean;
  geometryType?: string;
  materialType?: string;
  vertexCount?: number;
  triangleCount?: number;
  instanceCount?: number;
  fov?: number;
  near?: number;
  far?: number;
  zoom?: number;
};

export type GeometryInspection = {
  type: string;
  attributes: Record<string, { itemSize: number; count: number }>;
  index?: { count: number };
  boundingSphere?: { center: [number, number, number]; radius: number };
};

export type MaterialInspection = {
  type: string;
  color?: string;
  transparent?: boolean;
  opacity?: number;
  side?: number;
  map?: string;
  uniforms?: Record<string, unknown>;
};

export type ObjectInspection = {
  metadata: ObjectMetadata;
  worldMatrix: number[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  userData: Record<string, unknown>;
  geometry?: GeometryInspection;
  material?: MaterialInspection;
};

function evalInPage<T>(expression: string): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.devtools?.inspectedWindow?.eval) {
      reject(new Error('Not in DevTools extension context'));
      return;
    }
    chrome.devtools.inspectedWindow.eval(expression, (result, err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result as T);
    });
  });
}

/** Currently targeted canvas ID. null = default bridge. */
let _targetCanvasId: string | null = null;

/** Set the target canvas ID for all subsequent bridge calls. */
export function setTargetCanvas(canvasId: string | null): void {
  _targetCanvasId = canvasId;
}

/** Get the current target canvas ID. */
export function getTargetCanvas(): string | null {
  return _targetCanvasId;
}

/** Build JS expression to resolve the bridge API for the current target canvas. */
function apiExpr(): string {
  if (_targetCanvasId) {
    return `(window.__R3F_DOM_INSTANCES__ && window.__R3F_DOM_INSTANCES__[${JSON.stringify(_targetCanvasId)}])`;
  }
  return 'window.__R3F_DOM__';
}

/** List all active canvas IDs from the page's __R3F_DOM_INSTANCES__. */
export function getCanvasIds(): Promise<string[]> {
  return evalInPage<string>(
    "JSON.stringify(window.__R3F_DOM_INSTANCES__ ? Object.keys(window.__R3F_DOM_INSTANCES__) : [])"
  ).then((json) => json ? JSON.parse(json) : []).catch(() => []);
}

/** Check if the page has the R3F DOM bridge and is ready. */
export function checkBridgeReady(): Promise<boolean> {
  return evalInPage<boolean>(
    `(function(){ var api = ${apiExpr()}; return typeof api !== 'undefined' && api !== null && api._ready === true; })()`
  ).catch(() => false);
}

/** Get full scene snapshot (tree). */
export function getSnapshot(): Promise<SceneSnapshot | null> {
  return evalInPage<string>(
    `(function(){ var api = ${apiExpr()}; return JSON.stringify(api && api._ready ? api.snapshot() : null); })()`
  ).then((json) => (json ? JSON.parse(json) : null));
}

/** Get selected object uuids. */
export function getSelection(): Promise<string[]> {
  return evalInPage<string>(
    `(function(){ var api = ${apiExpr()}; return JSON.stringify(api && api.getSelection ? api.getSelection() : []); })()`
  ).then((json) => (json ? JSON.parse(json) : []));
}

/** Select an object in the scene (highlight). */
export function select(uuid: string): Promise<void> {
  return evalInPage(
    `(function(){ var api = ${apiExpr()}; if(api && api.select) api.select(${JSON.stringify(uuid)}); })()`
  ).then(() => undefined);
}

/** Get Tier 2 inspection for an object. */
export function inspect(uuid: string): Promise<ObjectInspection | null> {
  return evalInPage<string>(
    `(function(){ var api = ${apiExpr()}; return JSON.stringify(api && api.inspect ? api.inspect(${JSON.stringify(uuid)}) : null); })()`
  ).then((json) => (json ? JSON.parse(json) : null));
}

/** Enable or disable "inspect mode" so the Elements panel picker can select 3D mirror nodes on the canvas. */
export function setInspectMode(on: boolean): Promise<void> {
  return evalInPage(
    `(function(){ var api = ${apiExpr()}; if(api && api.setInspectMode) api.setInspectMode(${on}); })()`
  ).then(() => undefined);
}

/**
 * Flatten snapshot tree to array of ObjectMetadata (with parentUuid, childrenUuids).
 */
export function flattenSnapshotTree(
  node: SnapshotNode,
  parentUuid: string | null
): ObjectMetadata[] {
  const childrenUuids = node.children.map((c) => c.uuid);
  const meta: ObjectMetadata = {
    uuid: node.uuid,
    name: node.name,
    type: node.type,
    testId: node.testId,
    visible: node.visible,
    position: [...node.position],
    rotation: [...node.rotation],
    scale: [...node.scale],
    parentUuid,
    childrenUuids,
    boundsDirty: true,
    geometryType: node.geometryType,
    materialType: node.materialType,
    vertexCount: node.vertexCount,
    triangleCount: node.triangleCount,
    instanceCount: node.instanceCount,
  };
  const list: ObjectMetadata[] = [meta];
  for (const child of node.children) {
    list.push(...flattenSnapshotTree(child, node.uuid));
  }
  return list;
}
