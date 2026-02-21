/**
 * Bridge to the inspected page via chrome.devtools.inspectedWindow.eval.
 * Only works when the page has window.__R3F_DOM__ (i.e. uses @react-three-dom/core).
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

/** Check if the page has the R3F DOM bridge and is ready. */
export function checkBridgeReady(): Promise<boolean> {
  return evalInPage<boolean>(
    "typeof window.__R3F_DOM__ !== 'undefined' && window.__R3F_DOM__._ready === true"
  ).catch(() => false);
}

/** Get full scene snapshot (tree). */
export function getSnapshot(): Promise<SceneSnapshot | null> {
  return evalInPage<string>(
    "JSON.stringify(typeof window.__R3F_DOM__ !== 'undefined' && window.__R3F_DOM__._ready ? window.__R3F_DOM__.snapshot() : null)"
  ).then((json) => (json ? JSON.parse(json) : null));
}

/** Get selected object uuids. */
export function getSelection(): Promise<string[]> {
  return evalInPage<string>(
    "JSON.stringify(typeof window.__R3F_DOM__ !== 'undefined' && window.__R3F_DOM__.getSelection ? window.__R3F_DOM__.getSelection() : [])"
  ).then((json) => (json ? JSON.parse(json) : []));
}

/** Select an object in the scene (highlight). */
export function select(uuid: string): Promise<void> {
  return evalInPage(
    `(function(){ if(window.__R3F_DOM__ && window.__R3F_DOM__.select) window.__R3F_DOM__.select(${JSON.stringify(uuid)}); })()`
  ).then(() => undefined);
}

/** Get Tier 2 inspection for an object. */
export function inspect(uuid: string): Promise<ObjectInspection | null> {
  return evalInPage<string>(
    `JSON.stringify(typeof window.__R3F_DOM__ !== 'undefined' && window.__R3F_DOM__.inspect ? window.__R3F_DOM__.inspect(${JSON.stringify(uuid)}) : null)`
  ).then((json) => (json ? JSON.parse(json) : null));
}

/** Enable or disable "inspect mode" so the Elements panel picker can select 3D mirror nodes on the canvas. */
export function setInspectMode(on: boolean): Promise<void> {
  return evalInPage(
    `(function(){ if(window.__R3F_DOM__ && window.__R3F_DOM__.setInspectMode) window.__R3F_DOM__.setInspectMode(${on}); })()`
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
