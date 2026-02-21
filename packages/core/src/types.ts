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

/** Options for inspect(). Include geometry buffers only when needed to avoid perf impact. */
export interface InspectOptions {
  /** If true, include vertex positions and triangle indices in geometry. Default: false. */
  includeGeometryData?: boolean;
}

export interface GeometryInspection {
  /** Geometry class type */
  type: string;
  /** Map of attribute name → { itemSize, count } */
  attributes: Record<string, { itemSize: number; count: number }>;
  /** Index buffer info, if indexed geometry */
  index?: { count: number };
  /** Bounding sphere computed from geometry */
  boundingSphere?: { center: [number, number, number]; radius: number };
  /** Position attribute data (x,y,z per vertex). Only set when inspect(..., { includeGeometryData: true }). */
  positionData?: number[];
  /** Index buffer (triangle indices). Only set when inspect(..., { includeGeometryData: true }) and geometry is indexed. */
  indexData?: number[];
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
  /** Geometry class name (meshes only) */
  geometryType?: string;
  /** Material class name (meshes only) */
  materialType?: string;
  /** Total vertex count (meshes only) */
  vertexCount?: number;
  /** Triangle count (meshes only) */
  triangleCount?: number;
  /** Instance count (InstancedMesh only) */
  instanceCount?: number;
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
  /**
   * Whether the bridge is fully initialized and ready to use.
   * - `true`: ThreeDom setup completed successfully, all methods are live.
   * - `false`: Bridge exists but setup failed or is still initializing.
   *
   * Test waiters should check `_ready === true` instead of just `typeof !== 'undefined'`.
   */
  _ready: boolean;

  /**
   * If `_ready` is false, contains the error message from the failed setup.
   * Undefined when `_ready` is true.
   */
  _error?: string;

  /** Tier 1: O(1) lookup by testId */
  getByTestId(id: string): ObjectMetadata | null;
  /** Tier 1: O(1) lookup by uuid */
  getByUuid(uuid: string): ObjectMetadata | null;
  /** Tier 1: O(1) lookup by name (returns array, names aren't unique) */
  getByName(name: string): ObjectMetadata[];
  /** Get direct children of an object by testId or uuid */
  getChildren(idOrUuid: string): ObjectMetadata[];
  /** Get parent of an object by testId or uuid (null if root or not found) */
  getParent(idOrUuid: string): ObjectMetadata | null;
  /** Total number of tracked objects */
  getCount(): number;
  /** Get all objects of a given Three.js type (Mesh, Group, Line, Points, etc.) */
  getByType(type: string): ObjectMetadata[];
  /** Get all objects with a given geometry type (e.g. "BoxGeometry", "BufferGeometry") */
  getByGeometryType(type: string): ObjectMetadata[];
  /** Get all objects with a given material type (e.g. "MeshStandardMaterial") */
  getByMaterialType(type: string): ObjectMetadata[];
  /** Get objects that have a specific userData key (and optionally matching value) */
  getByUserData(key: string, value?: unknown): ObjectMetadata[];
  /** Count objects of a given Three.js type */
  getCountByType(type: string): number;
  /** Batch lookup: get metadata for multiple objects by testId or uuid in one call */
  getObjects(ids: string[]): Record<string, ObjectMetadata | null>;
  /** Full structured JSON snapshot from Tier 1 store */
  snapshot(): SceneSnapshot;

  /** Tier 2: on-demand heavy inspection (reads live Three.js object). Use includeGeometryData: true to get vertex/index buffers. */
  inspect(idOrUuid: string, options?: InspectOptions): ObjectInspection | null;

  /** Deterministic click on a 3D object */
  click(idOrUuid: string): void;
  /** Deterministic double-click on a 3D object */
  doubleClick(idOrUuid: string): void;
  /** Deterministic right-click / context menu on a 3D object */
  contextMenu(idOrUuid: string): void;
  /** Deterministic hover on a 3D object */
  hover(idOrUuid: string): void;
  /** Deterministic drag on a 3D object (async — dispatches multi-step pointer sequence) */
  drag(idOrUuid: string, delta: { x: number; y: number; z: number }): Promise<void>;
  /** Dispatch a wheel/scroll event on a 3D object */
  wheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): void;
  /** Click empty space to trigger onPointerMissed */
  pointerMiss(): void;
  /** Draw a freeform path on the canvas (for drawing/annotation apps) */
  drawPath(
    points: Array<{ x: number; y: number; pressure?: number }>,
    options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
  ): Promise<{ eventCount: number; pointCount: number }>;


  /** Select an object (shows highlight wireframe in scene) */
  select(idOrUuid: string): void;
  /** Clear selection */
  clearSelection(): void;
  /** Get uuids of currently selected objects (for DevTools panel sync) */
  getSelection(): string[];

  /** Raw Three.js object access (for advanced debugging) */
  getObject3D(idOrUuid: string): Object3D | null;

  /**
   * Resolve uuid for display: if the object is the first mesh of a Group (e.g. table top),
   * returns the parent group uuid so the whole group is highlighted; otherwise returns the given uuid.
   */
  getSelectionDisplayTarget(uuid: string): string;

  /**
   * Enable or disable "inspect mode" for the mirror DOM.
   * When true, mirror elements use pointer-events: auto so the DevTools element picker
   * can select 3D objects by clicking on the canvas (e.g. hold Alt while using the picker).
   * When false, pointer-events: none so normal 3D interaction works.
   */
  setInspectMode(on: boolean): void;

  /**
   * Manually sweep orphaned objects from the store.
   * Removes objects that are no longer in any tracked scene graph.
   * Runs automatically every ~30s, but can be called after large
   * scene changes (e.g. floor unload) for immediate cleanup.
   * Returns the number of orphans removed.
   */
  sweepOrphans(): number;

  /** Library version */
  version: string;
}

// Extend the global Window interface
declare global {
  interface Window {
    __R3F_DOM__?: R3FDOM;
    /** Set to true to enable debug logging from @react-three-dom/core */
    __R3F_DOM_DEBUG__?: boolean;
  }
}
