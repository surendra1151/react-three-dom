// ---------------------------------------------------------------------------
// Shared types for @react-three-dom/playwright
// These mirror the core types but are defined here so this package has zero
// runtime dependency on @react-three-dom/core (it only communicates with the
// app via page.evaluate calls to window.__R3F_DOM__).
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

/** Options for inspect(). Set includeGeometryData: true to get vertex/index buffers (higher cost). */
export interface InspectOptions {
  includeGeometryData?: boolean;
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
    /** Vertex positions (x,y,z per vertex). Only when inspect(..., { includeGeometryData: true }). */
    positionData?: number[];
    /** Triangle indices. Only when inspect(..., { includeGeometryData: true }) and geometry is indexed. */
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
  children: SnapshotNode[];
}

export interface SceneSnapshot {
  timestamp: number;
  objectCount: number;
  tree: SnapshotNode;
}

// ---------------------------------------------------------------------------
// Window augmentation for page.evaluate calls
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __R3F_DOM_DEBUG__?: boolean;
  }
}
