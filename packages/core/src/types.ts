import type { Object3D } from 'three';

// ---------------------------------------------------------------------------
// Tier 1: Lightweight metadata — always cached for every tracked object
// ~120 bytes per object, ~12 MB at 100k objects
// ---------------------------------------------------------------------------

export interface ObjectMetadata {
  /** Three.js internal UUID */
  uuid: string;
  /** Object name (object.name) */
  name: string;
  /** Three.js class type: "Mesh", "Group", "PointLight", etc. */
  type: string;
  /** Whether the object itself is visible (does not check parent chain) */
  visible: boolean;
  /** User-defined test identifier from userData.testId */
  testId?: string;
  /** Geometry class name: "BoxGeometry", "BufferGeometry", etc. */
  geometryType?: string;
  /** Material class name: "MeshStandardMaterial", etc. */
  materialType?: string;
  /** Total vertex count (from geometry attributes) */
  vertexCount?: number;
  /** Triangle count (derived from index or vertex count) */
  triangleCount?: number;
  /** Instance count for InstancedMesh */
  instanceCount?: number;
  /** Local position as [x, y, z] */
  position: [number, number, number];
  /** Local euler rotation as [x, y, z] in radians */
  rotation: [number, number, number];
  /** Local scale as [x, y, z] */
  scale: [number, number, number];
  /** UUID of parent object, or null for scene root */
  parentUuid: string | null;
  /** UUIDs of direct children */
  childrenUuids: string[];
  /** Flag indicating bounds need recomputation */
  boundsDirty: boolean;
}

// ---------------------------------------------------------------------------
// Tier 2: Heavy inspection data — computed on-demand, never stored
// Read directly from the live Three.js object when requested
// ---------------------------------------------------------------------------

export interface GeometryInspection {
  /** Geometry class type */
  type: string;
  /** Map of attribute name → { itemSize, count } */
  attributes: Record<string, { itemSize: number; count: number }>;
  /** Index buffer info, if indexed geometry */
  index?: { count: number };
  /** Bounding sphere computed from geometry */
  boundingSphere?: { center: [number, number, number]; radius: number };
}

export interface MaterialInspection {
  /** Material class type */
  type: string;
  /** Hex color string, if applicable */
  color?: string;
  /** Texture name/uuid of the main map, if any */
  map?: string;
  /** Shader material uniforms (keys only for non-shader materials) */
  uniforms?: Record<string, unknown>;
  /** Whether material is transparent */
  transparent?: boolean;
  /** Material opacity */
  opacity?: number;
  /** Whether the material is double-sided */
  side?: number;
}

export interface ObjectInspection {
  /** Tier 1 cached metadata */
  metadata: ObjectMetadata;
  /** World matrix as 16-element flat array */
  worldMatrix: number[];
  /** World-space axis-aligned bounding box */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  /** Geometry details (meshes only) */
  geometry?: GeometryInspection;
  /** Material details (meshes/points/lines only) */
  material?: MaterialInspection;
  /** Full userData object from the Three.js object */
  userData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Scene snapshot — structured JSON built from Tier 1 store
// ---------------------------------------------------------------------------

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
  /** Timestamp when snapshot was taken (Date.now()) */
  timestamp: number;
  /** Total number of objects in the scene */
  objectCount: number;
  /** Recursive tree of snapshot nodes */
  tree: SnapshotNode;
}

// ---------------------------------------------------------------------------
// Store event types — emitted by ObjectStore for listeners
// ---------------------------------------------------------------------------

export type StoreEventType = 'add' | 'remove' | 'update';

export interface StoreEvent {
  type: StoreEventType;
  object: Object3D;
  metadata: ObjectMetadata;
}

export type StoreListener = (event: StoreEvent) => void;

// ---------------------------------------------------------------------------
// Global API — exposed as window.__R3F_DOM__
// ---------------------------------------------------------------------------

export interface R3FDOM {
  /** Tier 1: O(1) lookup by testId */
  getByTestId(id: string): ObjectMetadata | null;
  /** Tier 1: O(1) lookup by uuid */
  getByUuid(uuid: string): ObjectMetadata | null;
  /** Tier 1: O(1) lookup by name (returns array, names aren't unique) */
  getByName(name: string): ObjectMetadata[];
  /** Total number of tracked objects */
  getCount(): number;
  /** Full structured JSON snapshot from Tier 1 store */
  snapshot(): SceneSnapshot;

  /** Tier 2: on-demand heavy inspection (reads live Three.js object) */
  inspect(idOrUuid: string): ObjectInspection | null;

  /** Deterministic click on a 3D object */
  click(idOrUuid: string): void;
  /** Deterministic double-click on a 3D object */
  doubleClick(idOrUuid: string): void;
  /** Deterministic right-click / context menu on a 3D object */
  contextMenu(idOrUuid: string): void;
  /** Deterministic hover on a 3D object */
  hover(idOrUuid: string): void;
  /** Deterministic drag on a 3D object */
  drag(idOrUuid: string, delta: { x: number; y: number; z: number }): void;
  /** Dispatch a wheel/scroll event on a 3D object */
  wheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): void;
  /** Click empty space to trigger onPointerMissed */
  pointerMiss(): void;

  /** Raw Three.js object access (for advanced debugging) */
  getObject3D(idOrUuid: string): Object3D | null;

  /** Library version */
  version: string;
}

// Extend the global Window interface
declare global {
  interface Window {
    __R3F_DOM__?: R3FDOM;
  }
}
