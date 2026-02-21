/**
 * @module Highlighter
 *
 * Renders Chrome DevTools-style translucent fill overlays on hovered and
 * selected Three.js objects. Subscribes to SelectionManager for selection
 * state and polls `window.__r3fdom_hovered__` for DevTools element-picker
 * hover. Highlight meshes are marked `__r3fdom_internal` so they're excluded
 * from raycasting and the ObjectStore.
 */
import {
  Object3D,
  Scene,
  Vector3,
  Mesh,
  Line,
  Points,
  MeshBasicMaterial,
  LineBasicMaterial,
  EdgesGeometry,
  LineSegments,
  DoubleSide,
  BufferGeometry,
  Box3,
  BoxGeometry,
} from 'three';
import type { Camera, WebGLRenderer } from 'three';
import type { SelectionManager } from './SelectionManager';

// ---------------------------------------------------------------------------
// Highlighter — Chrome DevTools-style 3D object highlighting
//
// Renders a translucent fill overlay matching Chrome's rgb(111,168,220) 66%.
// No edge outlines — clean filled highlight only.
// ---------------------------------------------------------------------------

// Chrome DevTools highlight: rgb(111, 168, 220) ~66% opacity
const HOVER_FILL_COLOR = 0x6fa8dc;
const HOVER_FILL_OPACITY = 0.66;

const SELECTION_FILL_COLOR = 0x6fa8dc;
const SELECTION_FILL_OPACITY = 0.75;
const SELECTION_BBOX_COLOR = 0x6fa8dc;
const SELECTION_BBOX_OPACITY = 0.3;

const _box3 = /* @__PURE__ */ new Box3();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasRenderableGeometry(obj: Object3D): boolean {
  return (
    (obj as Mesh).isMesh === true ||
    (obj as Line).isLine === true ||
    (obj as Points).isPoints === true
  );
}

function collectHighlightTargets(obj: Object3D): Object3D[] {
  if (hasRenderableGeometry(obj)) return [obj];

  const targets: Object3D[] = [];
  obj.traverse((child) => {
    if (child === obj) return;
    if (child.userData?.__r3fdom_internal) return;
    if (hasRenderableGeometry(child)) targets.push(child);
  });
  return targets;
}

function markInternal(obj: Object3D): void {
  obj.userData.__r3fdom_internal = true;
  obj.raycast = () => {};
  obj.traverse((child) => {
    child.userData.__r3fdom_internal = true;
    child.raycast = () => {};
  });
}

/**
 * Sync highlight group to match the source object's world transform.
 * Called from useFrame as a best-effort early sync.
 */
function _syncGroupTransform(source: Object3D, highlightRoot: Object3D): void {
  source.updateWorldMatrix(true, false);
  source.matrixWorld.decompose(
    highlightRoot.position,
    highlightRoot.quaternion,
    highlightRoot.scale,
  );
}

/**
 * Override updateMatrixWorld on the highlight group so that whenever
 * Three.js traverses the scene graph (during renderer.render()),
 * the highlight group's matrixWorld is copied directly from the source.
 *
 * This runs during scene.updateMatrixWorld() — which happens AFTER all
 * useFrame callbacks — so the source's position/quaternion/scale are
 * guaranteed to reflect the current frame's animations.
 */
function _attachRenderSync(source: Object3D, highlightRoot: Object3D): void {
  highlightRoot.matrixAutoUpdate = false;

  highlightRoot.updateMatrixWorld = (force?: boolean) => {
    source.updateWorldMatrix(true, false);
    highlightRoot.matrixWorld.copy(source.matrixWorld);
    for (const child of highlightRoot.children) {
      child.updateMatrixWorld(force);
    }
  };
}

// ---------------------------------------------------------------------------
// Highlight mesh factories
// ---------------------------------------------------------------------------

interface HighlightGroup {
  root: Object3D;
  disposables: { dispose(): void }[];
}

function createHighlightMesh(
  source: Object3D,
  fillColor: number,
  fillOpacity: number,
): HighlightGroup | null {
  const geom = (source as Mesh).geometry as BufferGeometry | undefined;
  if (!geom) return null;

  const group = new Object3D();
  const disposables: { dispose(): void }[] = [];

  const fillMat = new MeshBasicMaterial({
    color: fillColor,
    transparent: true,
    opacity: fillOpacity,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  disposables.push(fillMat);

  const fillMesh = new Mesh(geom, fillMat);
  fillMesh.scale.setScalar(1.005);
  fillMesh.raycast = () => {};
  group.add(fillMesh);

  source.updateWorldMatrix(true, false);
  source.matrixWorld.decompose(group.position, group.quaternion, group.scale);

  markInternal(group);
  _attachRenderSync(source, group);

  return { root: group, disposables };
}

function createBoundingBoxHighlight(obj: Object3D): HighlightGroup | null {
  _box3.makeEmpty();

  const targets = collectHighlightTargets(obj);
  if (targets.length === 0) return null;

  for (const target of targets) {
    target.updateWorldMatrix(true, false);
    const geom = (target as Mesh).geometry as BufferGeometry | undefined;
    if (geom) {
      if (!geom.boundingBox) geom.computeBoundingBox();
      if (geom.boundingBox) {
        const childBox = geom.boundingBox.clone();
        childBox.applyMatrix4(target.matrixWorld);
        _box3.union(childBox);
      }
    }
  }

  if (_box3.isEmpty()) return null;

  const size = _box3.getSize(new Vector3());
  const center = _box3.getCenter(new Vector3());

  const disposables: { dispose(): void }[] = [];

  const boxGeom = new BoxGeometry(size.x, size.y, size.z);
  disposables.push(boxGeom);

  const fillMat = new MeshBasicMaterial({
    color: SELECTION_BBOX_COLOR,
    transparent: true,
    opacity: SELECTION_BBOX_OPACITY,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  disposables.push(fillMat);
  const fillMesh = new Mesh(boxGeom, fillMat);
  fillMesh.raycast = () => {};

  const edgesGeom = new EdgesGeometry(boxGeom);
  disposables.push(edgesGeom);
  const edgeMat = new LineBasicMaterial({
    color: SELECTION_BBOX_COLOR,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
  });
  disposables.push(edgeMat);
  const edgeMesh = new LineSegments(edgesGeom, edgeMat);
  edgeMesh.raycast = () => {};

  const group = new Object3D();
  group.add(fillMesh);
  group.add(edgeMesh);
  group.position.copy(center);
  group.renderOrder = 998;

  markInternal(group);

  group.matrixAutoUpdate = false;
  group.updateMatrixWorld = (force?: boolean) => {
    _box3.makeEmpty();
    for (const target of targets) {
      target.updateWorldMatrix(true, false);
      const g = (target as Mesh).geometry as BufferGeometry | undefined;
      if (g) {
        if (!g.boundingBox) g.computeBoundingBox();
        if (g.boundingBox) {
          const childBox = g.boundingBox.clone();
          childBox.applyMatrix4(target.matrixWorld);
          _box3.union(childBox);
        }
      }
    }
    if (!_box3.isEmpty()) {
      const s = _box3.getSize(new Vector3());
      const c = _box3.getCenter(new Vector3());
      group.position.copy(c);
      group.scale.set(
        s.x / size.x || 1,
        s.y / size.y || 1,
        s.z / size.z || 1,
      );
    }
    group.updateMatrix();
    group.matrixWorld.copy(group.matrix);
    for (const child of group.children) {
      child.updateMatrixWorld(force);
    }
  };

  return { root: group, disposables };
}

// ---------------------------------------------------------------------------
// Highlighter class
// ---------------------------------------------------------------------------

export interface HighlighterOptions {
  showTooltip?: boolean;
}

interface HoverEntry {
  source: Object3D;
  group: HighlightGroup;
}

interface SelectionEntry {
  source: Object3D;
  meshGroups: HighlightGroup[];
  bboxGroup: HighlightGroup | null;
}

/**
 * Manages hover and selection highlight overlays in the 3D scene.
 * Attaches to a Scene + SelectionManager and creates/disposes translucent
 * mesh clones that track the source object's world transform each frame.
 */
export class Highlighter {
  private _scene: Scene | null = null;
  private _unsubscribe: (() => void) | null = null;

  private _hoverEntries: HoverEntry[] = [];
  private _hoverTarget: Object3D | null = null;
  private _selectedEntries: Map<Object3D, SelectionEntry> = new Map();

  private _hoverPollId: ReturnType<typeof setInterval> | null = null;
  private _lastHoveredUuid: string | null = null;
  private _store: { getObject3D(uuid: string): Object3D | null } | null = null;

  constructor(_options: HighlighterOptions = {}) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Bind to a scene and selection manager, start hover polling. */
  attach(
    scene: Scene,
    selectionManager: SelectionManager,
    _camera: Camera,
    _renderer: WebGLRenderer,
    store: { getObject3D(uuid: string): Object3D | null },
  ): void {
    this.detach();
    this._scene = scene;
    this._store = store;

    this._unsubscribe = selectionManager.subscribe((selected) => {
      this._syncSelectionHighlights(selected);
    });

    this._syncSelectionHighlights([...selectionManager.getSelected()]);
    this._startHoverPolling();
  }

  /** Unbind from the scene, stop polling, and remove all highlights. */
  detach(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._stopHoverPolling();
    this.clearHoverHighlight();
    this._clearAllSelectionHighlights();
    this._scene = null;
    this._store = null;
  }

  // -----------------------------------------------------------------------
  // Per-frame update
  // -----------------------------------------------------------------------

  /** Sync highlight group transforms to their source objects. Call each frame. */
  update(): void {
    for (const entry of this._hoverEntries) {
      _syncGroupTransform(entry.source, entry.group.root);
    }

    for (const selEntry of this._selectedEntries.values()) {
      for (const mg of selEntry.meshGroups) {
        const src = mg.root.userData.__r3fdom_source as Object3D | undefined;
        if (src) {
          _syncGroupTransform(src, mg.root);
        }
      }
    }

  }

  // -----------------------------------------------------------------------
  // Public API: hover highlight
  // -----------------------------------------------------------------------

  /** Show a hover highlight on the given object (replaces any previous hover). */
  showHoverHighlight(obj: Object3D): void {
    if (obj === this._hoverTarget) return;
    this._clearHoverVisuals();
    if (!this._scene) return;

    this._hoverTarget = obj;
    const targets = collectHighlightTargets(obj);

    for (const target of targets) {
      const hg = createHighlightMesh(target, HOVER_FILL_COLOR, HOVER_FILL_OPACITY);
      if (hg) {
        hg.root.renderOrder = 997;
        this._scene.add(hg.root);
        this._hoverEntries.push({ source: target, group: hg });
      }
    }

  }

  /** Remove the current hover highlight. */
  clearHoverHighlight(): void {
    this._clearHoverVisuals();
    this._lastHoveredUuid = null;
  }

  private _clearHoverVisuals(): void {
    for (const entry of this._hoverEntries) {
      this._disposeHighlightGroup(entry.group);
    }
    this._hoverEntries = [];
    this._hoverTarget = null;
  }

  // -----------------------------------------------------------------------
  // Public API: queries
  // -----------------------------------------------------------------------

  /** Check if an object currently has a selection highlight. */
  isHighlighted(obj: Object3D): boolean {
    return this._selectedEntries.has(obj);
  }

  /** Remove all hover and selection highlights. */
  clearAll(): void {
    this.clearHoverHighlight();
    this._clearAllSelectionHighlights();
  }

  // -----------------------------------------------------------------------
  // Internal: selection highlights
  // -----------------------------------------------------------------------

  private _syncSelectionHighlights(selected: Object3D[]): void {
    if (!this._scene) return;

    const selectedSet = new Set(selected);

    for (const [obj] of this._selectedEntries) {
      if (!selectedSet.has(obj)) {
        this._removeSelectionHighlight(obj);
      }
    }

    for (const obj of selected) {
      if (!this._selectedEntries.has(obj)) {
        this._addSelectionHighlight(obj);
      }
    }
  }

  private _addSelectionHighlight(obj: Object3D): void {
    if (!this._scene) return;
    const targets = collectHighlightTargets(obj);
    const meshGroups: HighlightGroup[] = [];

    for (const target of targets) {
      const hg = createHighlightMesh(target, SELECTION_FILL_COLOR, SELECTION_FILL_OPACITY);
      if (hg) {
        hg.root.userData.__r3fdom_source = target;
        hg.root.renderOrder = 999;
        this._scene.add(hg.root);
        meshGroups.push(hg);
      }
    }

    // Skip the bounding box for Groups — individual mesh highlights are
    // sufficient and a filled bbox just obscures the scene.
    let bboxGroup: HighlightGroup | null = null;
    if (targets.length > 1 && obj.type !== 'Group') {
      bboxGroup = createBoundingBoxHighlight(obj);
      if (bboxGroup) {
        this._scene.add(bboxGroup.root);
      }
    }

    if (meshGroups.length > 0 || bboxGroup) {
      this._selectedEntries.set(obj, { source: obj, meshGroups, bboxGroup });
    }
  }

  private _removeSelectionHighlight(obj: Object3D): void {
    const entry = this._selectedEntries.get(obj);
    if (!entry) return;
    for (const mg of entry.meshGroups) {
      this._disposeHighlightGroup(mg);
    }
    if (entry.bboxGroup) {
      this._disposeHighlightGroup(entry.bboxGroup);
    }
    this._selectedEntries.delete(obj);
  }

  private _clearAllSelectionHighlights(): void {
    for (const entry of this._selectedEntries.values()) {
      for (const mg of entry.meshGroups) {
        this._disposeHighlightGroup(mg);
      }
      if (entry.bboxGroup) {
        this._disposeHighlightGroup(entry.bboxGroup);
      }
    }
    this._selectedEntries.clear();
  }

  // -----------------------------------------------------------------------
  // Internal: DevTools hover polling
  // -----------------------------------------------------------------------

  private _startHoverPolling(): void {
    this._hoverPollId = setInterval(() => {
      this._pollDevToolsHover();
    }, 100);
  }

  private _stopHoverPolling(): void {
    if (this._hoverPollId) {
      clearInterval(this._hoverPollId);
      this._hoverPollId = null;
    }
  }

  private _pollDevToolsHover(): void {
    if (!this._store) return;

    try {
      const hoveredEl = window.__r3fdom_hovered__;
      const uuid = hoveredEl?.getAttribute?.('data-uuid') ?? null;

      if (uuid === this._lastHoveredUuid) return;
      this._lastHoveredUuid = uuid;

      if (!uuid) {
        this._clearHoverVisuals();
        return;
      }

      const obj = this._store.getObject3D(uuid);
      if (obj) {
        this.showHoverHighlight(obj);
      } else {
        this._clearHoverVisuals();
      }
    } catch {
      // Ignore errors
    }
  }

  // -----------------------------------------------------------------------
  // Internal: cleanup
  // -----------------------------------------------------------------------

  private _disposeHighlightGroup(hg: HighlightGroup): void {
    hg.root.removeFromParent();
    for (const d of hg.disposables) {
      d.dispose();
    }
  }

  /** Detach and release all resources. */
  dispose(): void {
    this.detach();
  }
}
