// @react-three-dom/core
// DOM mirror, snapshot API, and interaction bridge for React Three Fiber

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export { version } from './version';

// ---------------------------------------------------------------------------
// Types (re-exported for consumers)
// ---------------------------------------------------------------------------

export type {
  ObjectMetadata,
  ObjectInspection,
  GeometryInspection,
  MaterialInspection,
  SceneSnapshot,
  SnapshotNode,
  StoreEvent,
  StoreEventType,
  StoreListener,
  R3FDOM,
} from './types';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export { ObjectStore } from './store/ObjectStore';

// ---------------------------------------------------------------------------
// Mirror
// ---------------------------------------------------------------------------

export { DomMirror } from './mirror/DomMirror';
export {
  ThreeElement,
  ensureCustomElements,
  getTagForType,
  TAG_MAP,
  type ThreeTagName,
} from './mirror/CustomElements';
export { computeAttributes, applyAttributes, MANAGED_ATTRIBUTES } from './mirror/attributes';

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export {
  ThreeDom,
  getStore,
  getMirror,
  getSelectionManager,
  getHighlighter,
  type ThreeDomProps,
} from './bridge/ThreeDom';
export { patchObject3D, restoreObject3D, isPatched } from './bridge/patchObject3D';

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export { createSnapshot, createFlatSnapshot } from './snapshot/snapshot';

// ---------------------------------------------------------------------------
// Interactions — projection
// ---------------------------------------------------------------------------

export {
  projectToScreen,
  isInFrustum,
  screenDeltaToWorld,
  projectAllSamplePoints,
  type ScreenPoint,
  type CanvasSize,
  type ProjectionResult,
} from './interactions/projection';

// ---------------------------------------------------------------------------
// Interactions — click / hover / drag
// ---------------------------------------------------------------------------

export {
  click3D,
  doubleClick3D,
  contextMenu3D,
  type Click3DOptions,
  type Click3DResult,
} from './interactions/click';
export { hover3D, unhover3D, type Hover3DOptions, type Hover3DResult } from './interactions/hover';
export {
  drag3D,
  previewDragWorldDelta,
  type Drag3DOptions,
  type Drag3DResult,
  type WorldDelta,
  type ScreenDelta,
} from './interactions/drag';
export { wheel3D, type Wheel3DOptions, type Wheel3DResult } from './interactions/wheel';
export { pointerMiss3D, type PointerMiss3DOptions } from './interactions/pointerMiss';

// ---------------------------------------------------------------------------
// Interactions — event dispatch (low-level)
// ---------------------------------------------------------------------------

export {
  dispatchClick,
  dispatchDoubleClick,
  dispatchContextMenu,
  dispatchHover,
  dispatchDrag,
  dispatchWheel,
  dispatchPointerMiss,
  dispatchUnhover,
  type DragOptions,
  type WheelOptions,
} from './interactions/dispatch';

// ---------------------------------------------------------------------------
// Interactions — raycast verification
// ---------------------------------------------------------------------------

export {
  verifyRaycastHit,
  verifyRaycastHitMultiPoint,
  type RaycastResult,
} from './interactions/raycastVerify';

// ---------------------------------------------------------------------------
// Interactions — resolution helpers
// ---------------------------------------------------------------------------

export { resolveObject } from './interactions/resolve';

// ---------------------------------------------------------------------------
// Highlight / selection
// ---------------------------------------------------------------------------

export {
  Highlighter,
  type HighlighterOptions,
} from './highlight/Highlighter';
export {
  SelectionManager,
  type SelectionListener,
} from './highlight/SelectionManager';
