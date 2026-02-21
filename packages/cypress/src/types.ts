// ---------------------------------------------------------------------------
// Shared types for @react-three-dom/cypress
// These mirror the core types but are defined here so this package has zero
// runtime dependency on @react-three-dom/core. Cypress runs in the same
// browser process, accessing window.__R3F_DOM__ directly.
// ---------------------------------------------------------------------------

export interface ObjectMetadata {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  testId?: string;
  geometryType?: string;
  materialType?: string;
  vertexCount?: number;
  triangleCount?: number;
  instanceCount?: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  parentUuid: string | null;
  childrenUuids: string[];
  boundsDirty: boolean;
}

export interface ObjectInspection {
  metadata: ObjectMetadata;
  worldMatrix: number[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  geometry?: {
    type: string;
    attributes: Record<string, { itemSize: number; count: number }>;
    index?: { count: number };
    boundingSphere?: { center: [number, number, number]; radius: number };
    positionData?: number[];
    indexData?: number[];
  };
  material?: {
    type: string;
    color?: string;
    map?: string;
    uniforms?: Record<string, unknown>;
    transparent?: boolean;
    opacity?: number;
    side?: number;
  };
  userData: Record<string, unknown>;
}

export interface SnapshotNode {
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
}

export interface SceneSnapshot {
  timestamp: number;
  objectCount: number;
  tree: SnapshotNode;
}

export interface BridgeDiagnostics {
  version: string;
  ready: boolean;
  error?: string;
  objectCount: number;
  meshCount: number;
  groupCount: number;
  lightCount: number;
  cameraCount: number;
  materializedDomNodes: number;
  maxDomNodes: number;
  canvasWidth: number;
  canvasHeight: number;
  webglRenderer: string;
  dirtyQueueSize: number;
}

// ---------------------------------------------------------------------------
// R3FDOM interface — shape of window.__R3F_DOM__
// ---------------------------------------------------------------------------

export interface R3FDOM {
  _ready: boolean;
  _error?: string;
  getByTestId(id: string): ObjectMetadata | null;
  getByUuid(uuid: string): ObjectMetadata | null;
  getByName(name: string): ObjectMetadata[];
  getChildren(idOrUuid: string): ObjectMetadata[];
  getParent(idOrUuid: string): ObjectMetadata | null;
  getCount(): number;
  getByType(type: string): ObjectMetadata[];
  getByGeometryType(type: string): ObjectMetadata[];
  getByMaterialType(type: string): ObjectMetadata[];
  getByUserData(key: string, value?: unknown): ObjectMetadata[];
  getCountByType(type: string): number;
  getObjects(ids: string[]): Record<string, ObjectMetadata | null>;
  snapshot(): SceneSnapshot;
  inspect(idOrUuid: string, options?: { includeGeometryData?: boolean }): ObjectInspection | null;
  click(idOrUuid: string): void;
  doubleClick(idOrUuid: string): void;
  contextMenu(idOrUuid: string): void;
  hover(idOrUuid: string): void;
  drag(idOrUuid: string, delta: { x: number; y: number; z: number }): Promise<void>;
  wheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): void;
  pointerMiss(): void;
  drawPath(
    points: Array<{ x: number; y: number; pressure?: number }>,
    options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
  ): Promise<{ eventCount: number; pointCount: number }>;
  select(idOrUuid: string): void;
  clearSelection(): void;
  getSelection(): string[];
  getObject3D(idOrUuid: string): unknown;
  setInspectMode(on: boolean): void;
  sweepOrphans(): number;
  getDiagnostics(): BridgeDiagnostics;
  fuzzyFind(query: string, limit?: number): ObjectMetadata[];
  version: string;
}
