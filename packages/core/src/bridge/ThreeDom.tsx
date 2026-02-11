import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';
import type { Object3D, Camera } from 'three';
import { ObjectStore } from '../store/ObjectStore';
import { DomMirror } from '../mirror/DomMirror';
import { ensureCustomElements } from '../mirror/CustomElements';
import { patchObject3D } from './patchObject3D';
import { createSnapshot } from '../snapshot/snapshot';
import { click3D, doubleClick3D, contextMenu3D } from '../interactions/click';
import { hover3D } from '../interactions/hover';
import { drag3D } from '../interactions/drag';
import { wheel3D } from '../interactions/wheel';
import { pointerMiss3D } from '../interactions/pointerMiss';
import { setInteractionState, clearInteractionState } from '../interactions/resolve';
import { SelectionManager } from '../highlight/SelectionManager';
import { Highlighter } from '../highlight/Highlighter';
import { version } from '../version';
import { r3fLog, enableDebug } from '../debug';
import type { R3FDOM } from '../types';

// ---------------------------------------------------------------------------
// ThreeDom Props
// ---------------------------------------------------------------------------

export interface ThreeDomProps {
  /** CSS selector or HTMLElement for the mirror DOM root. Default: "#three-dom-root" */
  root?: string | HTMLElement;
  /** Objects to process per amortized batch per frame. Default: 500 */
  batchSize?: number;
  /** Max time budget (ms) for sync work per frame. Default: 0.5 */
  timeBudgetMs?: number;
  /** Max materialized DOM nodes (LRU eviction). Default: 2000 */
  maxDomNodes?: number;
  /** Initial DOM tree materialization depth. Default: 3 */
  initialDepth?: number;
  /** Disable all sync. Default: true */
  enabled?: boolean;
  /** Enable debug logging to browser console. Default: false */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

let _store: ObjectStore | null = null;
let _mirror: DomMirror | null = null;
let _selectionManager: SelectionManager | null = null;
let _highlighter: Highlighter | null = null;

export function getStore(): ObjectStore | null { return _store; }
export function getMirror(): DomMirror | null { return _mirror; }
export function getSelectionManager(): SelectionManager | null { return _selectionManager; }
export function getHighlighter(): Highlighter | null { return _highlighter; }

// ---------------------------------------------------------------------------
// 3D → Screen projection for DOM element positioning
// ---------------------------------------------------------------------------

const _box = /* @__PURE__ */ new Box3();
const _v = /* @__PURE__ */ new Vector3();
const _corners: Vector3[] = Array.from({ length: 8 }, () => new Vector3());

/**
 * Project a 3D object's bounding box to screen-space pixel coordinates
 * relative to the canvas element.
 */
function projectToScreenRect(
  obj: Object3D,
  camera: Camera,
  canvasRect: { width: number; height: number },
): { left: number; top: number; width: number; height: number } | null {
  _box.setFromObject(obj);
  if (_box.isEmpty()) return null;

  const { min, max } = _box;
  _corners[0].set(min.x, min.y, min.z);
  _corners[1].set(min.x, min.y, max.z);
  _corners[2].set(min.x, max.y, min.z);
  _corners[3].set(min.x, max.y, max.z);
  _corners[4].set(max.x, min.y, min.z);
  _corners[5].set(max.x, min.y, max.z);
  _corners[6].set(max.x, max.y, min.z);
  _corners[7].set(max.x, max.y, max.z);

  let sxMin = Infinity, syMin = Infinity;
  let sxMax = -Infinity, syMax = -Infinity;
  let anyInFront = false;
  let anyBehind = false;

  for (const corner of _corners) {
    _v.copy(corner).project(camera);

    if (_v.z >= 1) {
      anyBehind = true;
      continue;
    }

    anyInFront = true;
    const sx = ((_v.x + 1) / 2) * canvasRect.width;
    const sy = ((1 - _v.y) / 2) * canvasRect.height;
    sxMin = Math.min(sxMin, sx);
    syMin = Math.min(syMin, sy);
    sxMax = Math.max(sxMax, sx);
    syMax = Math.max(syMax, sy);
  }

  if (!anyInFront) return null;

  if (anyBehind) {
    sxMin = Math.min(sxMin, 0);
    syMin = Math.min(syMin, 0);
    sxMax = Math.max(sxMax, canvasRect.width);
    syMax = Math.max(syMax, canvasRect.height);
  }

  sxMin = Math.max(0, sxMin);
  syMin = Math.max(0, syMin);
  sxMax = Math.min(canvasRect.width, sxMax);
  syMax = Math.min(canvasRect.height, syMax);

  const w = sxMax - sxMin;
  const h = syMax - syMin;
  if (w < 1 || h < 1) return null;

  return { left: sxMin, top: syMin, width: w, height: h };
}

// ---------------------------------------------------------------------------
// Global API exposure (window.__R3F_DOM__)
// ---------------------------------------------------------------------------

function exposeGlobalAPI(store: ObjectStore): void {
  const api: R3FDOM = {
    _ready: true,
    getByTestId: (id: string) => store.getByTestId(id),
    getByUuid: (uuid: string) => store.getByUuid(uuid),
    getByName: (name: string) => store.getByName(name),
    getCount: () => store.getCount(),
    snapshot: () => createSnapshot(store),
    inspect: (idOrUuid: string) => store.inspect(idOrUuid),
    click: (idOrUuid: string) => { click3D(idOrUuid); },
    doubleClick: (idOrUuid: string) => { doubleClick3D(idOrUuid); },
    contextMenu: (idOrUuid: string) => { contextMenu3D(idOrUuid); },
    hover: (idOrUuid: string) => { hover3D(idOrUuid); },
    drag: async (idOrUuid: string, delta: { x: number; y: number; z: number }) => { await drag3D(idOrUuid, delta); },
    wheel: (idOrUuid: string, options?: { deltaY?: number; deltaX?: number }) => { wheel3D(idOrUuid, options); },
    pointerMiss: () => { pointerMiss3D(); },
    select: (idOrUuid: string) => {
      const obj = store.getObject3D(idOrUuid);
      if (obj && _selectionManager) _selectionManager.select(obj);
    },
    clearSelection: () => { _selectionManager?.clearSelection(); },
    getObject3D: (idOrUuid: string) => store.getObject3D(idOrUuid),
    version,
  };
  window.__R3F_DOM__ = api;
}

/**
 * Remove the global API. In React Strict Mode the component unmounts then
 * remounts; if we delete synchronously, the next effect has not run yet and
 * tests waiting for __R3F_DOM__ can miss it. Defer deletion so that a
 * remounted instance can set the bridge first; we only delete if it's still ours.
 */
function removeGlobalAPI(onlyIfEquals?: R3FDOM): void {
  r3fLog('bridge', 'removeGlobalAPI called (deferred)');
  if (onlyIfEquals !== undefined) {
    const ref = onlyIfEquals;
    queueMicrotask(() => {
      if ((window as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__ === ref) {
        delete (window as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
        r3fLog('bridge', 'Global API removed');
      } else {
        r3fLog('bridge', 'Global API not removed — replaced by new instance (Strict Mode remount)');
      }
    });
  } else {
    delete (window as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
    r3fLog('bridge', 'Global API removed (immediate)');
  }
}

/** Set element position/size, only writing if values changed. */
function setElementRect(el: HTMLElement, l: number, t: number, w: number, h: number): void {
  const d = el.dataset;
  if (d._l !== String(l) || d._t !== String(t) || d._w !== String(w) || d._h !== String(h)) {
    el.style.left = `${l}px`;
    el.style.top = `${t}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    d._l = String(l);
    d._t = String(t);
    d._w = String(w);
    d._h = String(h);
  }
}

// ---------------------------------------------------------------------------
// ThreeDom Component
// ---------------------------------------------------------------------------

export function ThreeDom({
  root = '#three-dom-root',
  batchSize = 500,
  timeBudgetMs = 0.5,
  maxDomNodes = 2000,
  initialDepth = 3,
  enabled = true,
  debug = false,
}: ThreeDomProps = {}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const cursorRef = useRef(0);
  const positionCursorRef = useRef(0);

  // -----------------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;

    if (debug) enableDebug(true);
    r3fLog('setup', 'ThreeDom effect started', { enabled, debug, root, maxDomNodes });

    const canvas = gl.domElement;
    const canvasParent = canvas.parentElement!;

    // ---- Create / resolve root element ----
    let rootElement: HTMLElement | null = null;
    let createdRoot = false;

    if (typeof root === 'string') {
      rootElement = document.querySelector<HTMLElement>(root);
    } else {
      rootElement = root;
    }

    if (!rootElement) {
      rootElement = document.createElement('div');
      rootElement.id = typeof root === 'string' ? root.replace(/^#/, '') : 'three-dom-root';
      createdRoot = true;
    }

    // Place the mirror root INSIDE the Canvas wrapper as a sibling of the
    // <canvas>. With position:absolute and z-index:10, Chrome DevTools will
    // natively highlight our mirror elements when hovering in the Elements tab.
    canvasParent.style.position = canvasParent.style.position || 'relative';
    canvasParent.appendChild(rootElement);

    rootElement.style.cssText = [
      'position: absolute',
      'top: 0',
      'left: 0',
      'width: 100%',
      'height: 100%',
      'pointer-events: none',
      'overflow: hidden',
      'z-index: 10',
    ].join(';');

    // Variables declared outside try so cleanup can access them
    let store: ObjectStore | null = null;
    let mirror: DomMirror | null = null;
    let unpatch: (() => void) | null = null;
    let selectionManager: SelectionManager | null = null;
    let currentApi: R3FDOM | undefined;

    try {
      // ---- Create store and mirror ----
      store = new ObjectStore();
      mirror = new DomMirror(store, maxDomNodes);
      mirror.setRoot(rootElement);
      r3fLog('setup', 'Store and mirror created');

      ensureCustomElements(store);
      store.registerTree(scene);
      r3fLog('setup', `Registered scene tree: ${store.getCount()} objects`);

      mirror.materializeSubtree(scene.uuid, initialDepth);

      unpatch = patchObject3D(store, mirror);
      setInteractionState(store, camera, gl, size);
      r3fLog('setup', 'Object3D patched, interaction state set');

      // Keep SelectionManager available for the global API and Inspector
      selectionManager = new SelectionManager();
      _selectionManager = selectionManager;
      _highlighter = null;

      exposeGlobalAPI(store);
      r3fLog('bridge', 'exposeGlobalAPI called — bridge is live, _ready=true');
      currentApi = window.__R3F_DOM__;
      _store = store;
      _mirror = mirror;

      // ---- Initial full position sync ----
      const initialCanvasRect = canvas.getBoundingClientRect();
      const allObjects = store.getFlatList();
      for (const obj of allObjects) {
        if (obj.userData?.__r3fdom_internal) continue;
        const el = mirror.getElement(obj.uuid);
        if (!el) continue;

        if (obj.type === 'Scene') {
          setElementRect(el, 0, 0, Math.round(initialCanvasRect.width), Math.round(initialCanvasRect.height));
          continue;
        }

        const rect = projectToScreenRect(obj, camera, initialCanvasRect);
        if (rect) {
          let parentLeft = 0;
          let parentTop = 0;
          if (obj.parent && obj.parent.type !== 'Scene') {
            const parentRect = projectToScreenRect(obj.parent, camera, initialCanvasRect);
            if (parentRect) {
              parentLeft = Math.round(parentRect.left);
              parentTop = Math.round(parentRect.top);
            }
          }
          setElementRect(
            el,
            Math.round(rect.left) - parentLeft,
            Math.round(rect.top) - parentTop,
            Math.round(rect.width),
            Math.round(rect.height),
          );
        }
      }
    } catch (err) {
      // Setup failed — expose a non-ready bridge so tests get a clear error
      // instead of a timeout with no diagnostics.
      const errorMsg = err instanceof Error ? err.message : String(err);
      r3fLog('setup', 'ThreeDom setup failed', err);
      console.error('[react-three-dom] Setup failed:', err);
      window.__R3F_DOM__ = {
        _ready: false,
        _error: errorMsg,
        getByTestId: () => null,
        getByUuid: () => null,
        getByName: () => [],
        getCount: () => 0,
        snapshot: () => ({ timestamp: 0, objectCount: 0, tree: { uuid: '', name: '', type: 'Scene', visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], children: [] } }),
        inspect: () => null,
        click: () => {},
        doubleClick: () => {},
        contextMenu: () => {},
        hover: () => {},
        drag: async () => {},
        wheel: () => {},
        pointerMiss: () => {},
        select: () => {},
        clearSelection: () => {},
        getObject3D: () => null,
        version,
      };
      currentApi = window.__R3F_DOM__;
    }

    // ---- Cleanup ----
    return () => {
      r3fLog('setup', 'ThreeDom cleanup started');
      if (unpatch) unpatch();
      removeGlobalAPI(currentApi);
      clearInteractionState();
      if (selectionManager) selectionManager.dispose();
      if (mirror) mirror.dispose();
      if (store) store.dispose();
      if (createdRoot && rootElement?.parentNode) {
        rootElement.parentNode.removeChild(rootElement);
      }
      _store = null;
      _mirror = null;
      _selectionManager = null;
      _highlighter = null;
      if (debug) enableDebug(false);
      r3fLog('setup', 'ThreeDom cleanup complete');
    };
  }, [scene, camera, gl, size, enabled, root, maxDomNodes, initialDepth, debug]);

  // -----------------------------------------------------------------------
  // Per-frame sync
  // -----------------------------------------------------------------------

  useFrame(() => {
    if (!enabled || !_store || !_mirror) return;

    try {
    setInteractionState(_store, camera, gl, size);

    const store = _store;
    const mirror = _mirror;
    const canvas = gl.domElement;
    const canvasRect = canvas.getBoundingClientRect();
    const start = performance.now();

    // Layer 3: Sync priority (dirty) objects first
    const dirtyObjects = store.drainDirtyQueue();
    for (const obj of dirtyObjects) {
      store.update(obj);
      mirror.syncAttributes(obj);
    }

    // Layer 2: Amortized attribute sync
    const budgetRemaining = timeBudgetMs - (performance.now() - start);
    if (budgetRemaining > 0.1) {
      const objects = store.getFlatList();
      if (objects.length > 0) {
        const end = Math.min(cursorRef.current + batchSize, objects.length);
        for (let i = cursorRef.current; i < end; i++) {
          if (performance.now() - start > timeBudgetMs) break;
          const obj = objects[i];
          const changed = store.update(obj);
          if (changed) mirror.syncAttributes(obj);
        }
        cursorRef.current = end >= objects.length ? 0 : end;
      }
    }

    // Layer 1: Amortized DOM position sync — project 3D bounds to screen.
    // Coordinates are parent-relative since elements are nested.
    const objects = store.getFlatList();
    if (objects.length > 0) {
      const posEnd = Math.min(positionCursorRef.current + 50, objects.length);
      for (let i = positionCursorRef.current; i < posEnd; i++) {
        const obj = objects[i];
        if (obj.userData?.__r3fdom_internal) continue;
        const el = mirror.getElement(obj.uuid);
        if (!el) continue;

        if (obj.type === 'Scene') {
          setElementRect(el, 0, 0, Math.round(canvasRect.width), Math.round(canvasRect.height));
          continue;
        }

        const rect = projectToScreenRect(obj, camera, canvasRect);
        if (rect) {
          let parentLeft = 0;
          let parentTop = 0;
          if (obj.parent && obj.parent.type !== 'Scene') {
            const parentRect = projectToScreenRect(obj.parent, camera, canvasRect);
            if (parentRect) {
              parentLeft = Math.round(parentRect.left);
              parentTop = Math.round(parentRect.top);
            }
          }

          const l = Math.round(rect.left) - parentLeft;
          const t = Math.round(rect.top) - parentTop;
          const w = Math.round(rect.width);
          const h = Math.round(rect.height);

          setElementRect(el, l, t, w, h);
          if (el.style.display === 'none') el.style.display = 'block';
        } else {
          if (el.style.display !== 'none') el.style.display = 'none';
        }
      }
      positionCursorRef.current = posEnd >= objects.length ? 0 : posEnd;
    }
    } catch (err) {
      // Per-frame sync failure should not crash the render loop.
      // Log once and continue — the next frame will retry.
      r3fLog('sync', 'Per-frame sync error', err);
    }
  });

  return null;
}
