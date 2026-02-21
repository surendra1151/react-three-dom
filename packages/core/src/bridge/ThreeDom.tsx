import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { Scene } from 'three';
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
import { drawPath as drawPathFn } from '../interactions/drawPath';
import { setInteractionState, clearInteractionState } from '../interactions/resolve';
import { SelectionManager } from '../highlight/SelectionManager';
import { Highlighter } from '../highlight/Highlighter';
import { InspectController } from '../highlight/InspectController';
import { RaycastAccelerator } from '../highlight/RaycastAccelerator';
import { resolveSelectionDisplayTarget } from '../highlight/selectionDisplayTarget';
import { version } from '../version';
import { r3fLog, enableDebug } from '../debug';
import type { R3FDOM, ObjectMetadata } from '../types';

// ---------------------------------------------------------------------------
// ThreeDom Props
// ---------------------------------------------------------------------------

export interface ThreeDomProps {
  /** CSS selector or HTMLElement for the mirror DOM root. Default: "#three-dom-root" */
  root?: string | HTMLElement;
  /** Objects to process per amortized batch per frame. Default: 500 */
  batchSize?: number;
  /** Max time budget (ms) for sync work per frame. Default: 0.5 */
  syncBudgetMs?: number;
  /** Max materialized DOM nodes (LRU eviction). Default: 2000 */
  maxDomNodes?: number;
  /** Initial DOM tree materialization depth. Default: 3 */
  initialDepth?: number;
  /** Disable all sync. Default: true */
  enabled?: boolean;
  /** Enable debug logging to browser console. Default: false */
  debug?: boolean;
  /** Enable inspect mode on mount. Default: false */
  inspect?: boolean;
}

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

let _store: ObjectStore | null = null;
let _mirror: DomMirror | null = null;
let _selectionManager: SelectionManager | null = null;
let _highlighter: Highlighter | null = null;
let _inspectController: InspectController | null = null;

export function getStore(): ObjectStore | null { return _store; }
export function getMirror(): DomMirror | null { return _mirror; }
export function getSelectionManager(): SelectionManager | null { return _selectionManager; }
export function getHighlighter(): Highlighter | null { return _highlighter; }
export function getInspectController(): InspectController | null { return _inspectController; }

// ---------------------------------------------------------------------------
// Global API exposure (window.__R3F_DOM__)
// ---------------------------------------------------------------------------

function exposeGlobalAPI(store: ObjectStore): void {
  const api: R3FDOM = {
    _ready: true,
    getByTestId: (id: string) => store.getByTestId(id),
    getByUuid: (uuid: string) => store.getByUuid(uuid),
    getByName: (name: string) => store.getByName(name),
    getChildren: (idOrUuid: string) => store.getChildren(idOrUuid),
    getParent: (idOrUuid: string) => store.getParent(idOrUuid),
    getCount: () => store.getCount(),
    getByType: (type: string) => store.getByType(type),
    getByGeometryType: (type: string) => store.getByGeometryType(type),
    getByMaterialType: (type: string) => store.getByMaterialType(type),
    getByUserData: (key: string, value?: unknown) => store.getByUserData(key, value),
    getCountByType: (type: string) => store.getCountByType(type),
    getObjects: (ids: string[]) => {
      const map = store.getObjects(ids);
      const result: Record<string, ObjectMetadata | null> = {};
      for (const [id, meta] of map) {
        result[id] = meta;
      }
      return result;
    },
    snapshot: () => createSnapshot(store),
    inspect: (idOrUuid: string, options?: { includeGeometryData?: boolean }) => store.inspect(idOrUuid, options),
    click: (idOrUuid: string) => { click3D(idOrUuid); },
    doubleClick: (idOrUuid: string) => { doubleClick3D(idOrUuid); },
    contextMenu: (idOrUuid: string) => { contextMenu3D(idOrUuid); },
    hover: (idOrUuid: string) => { hover3D(idOrUuid); },
    drag: async (idOrUuid: string, delta: { x: number; y: number; z: number }) => { await drag3D(idOrUuid, delta); },
    wheel: (idOrUuid: string, options?: { deltaY?: number; deltaX?: number }) => { wheel3D(idOrUuid, options); },
    pointerMiss: () => { pointerMiss3D(); },
    drawPath: async (points, options) => {
      const result = await drawPathFn(points, options);
      return { eventCount: result.eventCount, pointCount: result.pointCount };
    },
    select: (idOrUuid: string) => {
      const obj = store.getObject3D(idOrUuid);
      if (obj && _selectionManager) _selectionManager.select(obj);
    },
    clearSelection: () => { _selectionManager?.clearSelection(); },
    getSelection: () =>
      _selectionManager
        ? _selectionManager.getSelected().map((o) => o.uuid)
        : [],
    getObject3D: (idOrUuid: string) => store.getObject3D(idOrUuid),
    getSelectionDisplayTarget: (uuid: string) =>
      resolveSelectionDisplayTarget((id) => store.getObject3D(id), uuid) ?? uuid,
    setInspectMode: (on: boolean) => {
      r3fLog('inspect', 'Global API setInspectMode called', { on });
      if (on) {
        _inspectController?.enable();
      } else {
        _inspectController?.disable();
      }
    },
    sweepOrphans: () => store.sweepOrphans(),
    version,
  };
  window.__R3F_DOM__ = api;
}

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

// ---------------------------------------------------------------------------
// Stub bridge for error / no-WebGL states
// ---------------------------------------------------------------------------

function createStubBridge(error?: string): R3FDOM {
  return {
    _ready: false,
    _error: error,
    getByTestId: () => null,
    getByUuid: () => null,
    getByName: () => [],
    getChildren: () => [],
    getParent: () => null,
    getCount: () => 0,
    getByType: () => [],
    getByGeometryType: () => [],
    getByMaterialType: () => [],
    getByUserData: () => [],
    getCountByType: () => 0,
    getObjects: (ids: string[]) => {
      const result: Record<string, null> = {};
      for (const id of ids) result[id] = null;
      return result;
    },
    snapshot: () => ({
      timestamp: 0,
      objectCount: 0,
      tree: {
        uuid: '', name: '', type: 'Scene', visible: true,
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], children: [],
      },
    }),
    inspect: () => null,
    click: () => {},
    doubleClick: () => {},
    contextMenu: () => {},
    hover: () => {},
    drag: async () => {},
    wheel: () => {},
    pointerMiss: () => {},
    drawPath: async () => ({ eventCount: 0, pointCount: 0 }),
    select: () => {},
    clearSelection: () => {},
    getSelection: () => [],
    getObject3D: () => null,
    getSelectionDisplayTarget: (uuid: string) => uuid,
    setInspectMode: () => {},
    sweepOrphans: () => 0,
    version,
  };
}

// ---------------------------------------------------------------------------
// ThreeDom Component
// ---------------------------------------------------------------------------

export function ThreeDom({
  root = '#three-dom-root',
  batchSize = 500,
  syncBudgetMs = 0.5,
  maxDomNodes = 2000,
  initialDepth = 3,
  enabled = true,
  debug = false,
  inspect: inspectProp = false,
}: ThreeDomProps = {}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const cursorRef = useRef(0);
  const lastSweepRef = useRef(0);

  // -----------------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;

    if (debug) enableDebug(true);
    r3fLog('setup', 'ThreeDom effect started', { enabled, debug, root, maxDomNodes });

    const canvas = gl.domElement;
    canvas.setAttribute('data-r3f-canvas', 'true');
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

    canvasParent.style.position = canvasParent.style.position || 'relative';
    canvasParent.appendChild(rootElement);

    rootElement.style.cssText = 'width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;';

    let store: ObjectStore | null = null;
    let mirror: DomMirror | null = null;
    let unpatch: (() => void) | null = null;
    let cancelAsyncReg: (() => void) | null = null;
    let selectionManager: SelectionManager | null = null;
    let highlighter: Highlighter | null = null;
    let raycastAccelerator: RaycastAccelerator | null = null;
    let inspectController: InspectController | null = null;
    let currentApi: R3FDOM | undefined;

    try {
      // ---- Check WebGL availability (headless / CI often has no WebGL) ----
      const webglContext = gl.getContext();
      if (!webglContext || (webglContext as WebGLRenderingContext).isContextLost?.()) {
        const msg =
          'WebGL context not available. For headless Chromium, add --enable-webgl and optionally --use-gl=angle --use-angle=swiftshader-webgl to launch args.';
        const stubApi = createStubBridge(msg);
        window.__R3F_DOM__ = stubApi;
        r3fLog('setup', msg);
        return () => {
          removeGlobalAPI(stubApi);
          canvas.removeAttribute('data-r3f-canvas');
          if (createdRoot && rootElement?.parentNode) {
            rootElement.parentNode.removeChild(rootElement);
          }
          if (debug) enableDebug(false);
        };
      }

      // ---- Create store and mirror ----
      store = new ObjectStore();
      mirror = new DomMirror(store, maxDomNodes);
      mirror.setRoot(rootElement);
      r3fLog('setup', 'Store and mirror created');

      ensureCustomElements(store);

      // Install patch BEFORE async registration so any objects added to the
      // scene while registration is in progress are caught by the patch.
      unpatch = patchObject3D(store, mirror);
      setInteractionState(store, camera, gl, size);
      r3fLog('setup', 'Object3D patched, interaction state set');

      // Register the scene root synchronously (so it's immediately available)
      // then register the rest of the tree asynchronously to avoid blocking.
      store.register(scene);
      mirror.materializeSubtree(scene.uuid, initialDepth);
      cancelAsyncReg = store.registerTreeAsync(scene);
      r3fLog('setup', `Async registration started for scene tree`);

      // ---- Selection, highlighting, and inspect controller ----
      selectionManager = new SelectionManager();
      highlighter = new Highlighter();
      highlighter.attach(scene as Scene, selectionManager, camera, gl, store);
      raycastAccelerator = new RaycastAccelerator(store);

      inspectController = new InspectController({
        camera,
        renderer: gl,
        selectionManager,
        highlighter,
        raycastAccelerator,
        mirror,
        store,
      });

      _selectionManager = selectionManager;
      _highlighter = highlighter;
      _inspectController = inspectController;

      exposeGlobalAPI(store);
      r3fLog('bridge', 'exposeGlobalAPI called — bridge is live, _ready=true');
      currentApi = window.__R3F_DOM__;
      _store = store;
      _mirror = mirror;

      if (inspectProp) {
        inspectController.enable();
      }

      if (debug) {
        const inspectStatus = inspectProp ? 'on' : 'off';
        // eslint-disable-next-line no-console
        console.log(
          '%c[react-three-dom]%c v' + version + ' — ' + store.getCount() + ' objects · inspect: ' + inspectStatus + '\n' +
          '  %c→%c Toggle inspect: %c__R3F_DOM__.setInspectMode(true|false)%c\n' +
          '  %c→%c Hover 3D objects to highlight + auto-reveal in Elements tab',
          'background:#1a73e8;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
          'color:inherit',
          'color:#1a73e8', 'color:inherit',
          'color:#e8a317;font-family:monospace', 'color:inherit',
          'color:#1a73e8', 'color:inherit',
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      r3fLog('setup', 'ThreeDom setup failed', err);
      console.error('[react-three-dom] Setup failed:', err);
      window.__R3F_DOM__ = createStubBridge(errorMsg);
      currentApi = window.__R3F_DOM__;
    }

    // ---- Cleanup ----
    return () => {
      r3fLog('setup', 'ThreeDom cleanup started');
      if (cancelAsyncReg) cancelAsyncReg();
      if (inspectController) inspectController.dispose();
      if (raycastAccelerator) raycastAccelerator.dispose();
      if (highlighter) highlighter.dispose();
      if (unpatch) unpatch();
      removeGlobalAPI(currentApi);
      clearInteractionState();
      if (selectionManager) selectionManager.dispose();
      if (mirror) mirror.dispose();
      if (store) store.dispose();
      canvas.removeAttribute('data-r3f-canvas');
      if (createdRoot && rootElement?.parentNode) {
        rootElement.parentNode.removeChild(rootElement);
      }
      _store = null;
      _mirror = null;
      _selectionManager = null;
      _highlighter = null;
      _inspectController = null;
      if (debug) enableDebug(false);
      r3fLog('setup', 'ThreeDom cleanup complete');
    };
  }, [scene, camera, gl, size, enabled, root, maxDomNodes, initialDepth, debug, inspectProp]);

  // -----------------------------------------------------------------------
  // Per-frame sync
  // -----------------------------------------------------------------------

  useFrame(() => {
    if (!enabled || !_store || !_mirror) return;

    try {
      setInteractionState(_store, camera, gl, size);

      if (_inspectController) _inspectController.updateCamera(camera);

      const store = _store;
      const mirror = _mirror;
      const start = performance.now();

      // Sync priority (dirty) objects first
      const dirtyObjects = store.drainDirtyQueue();
      for (const obj of dirtyObjects) {
        store.update(obj);
        mirror.syncAttributes(obj);
      }

      // Amortized attribute sync
      const budgetRemaining = syncBudgetMs - (performance.now() - start);
      if (budgetRemaining > 0.1) {
        const objects = store.getFlatList();
        if (objects.length > 0) {
          const end = Math.min(cursorRef.current + batchSize, objects.length);
          for (let i = cursorRef.current; i < end; i++) {
            if (performance.now() - start > syncBudgetMs) break;
            const obj = objects[i];
            const changed = store.update(obj);
            if (changed) mirror.syncAttributes(obj);
          }
          cursorRef.current = end >= objects.length ? 0 : end;
        }
      }

      // Update 3D highlights (sync transforms with source objects)
      if (_highlighter) _highlighter.update();

      // Periodic orphan sweep (~every 30s) to prevent memory leaks
      const now = performance.now();
      if (now - lastSweepRef.current > 30_000) {
        lastSweepRef.current = now;
        store.sweepOrphans();
      }
    } catch (err) {
      r3fLog('sync', 'Per-frame sync error', err);
    }
  });

  return null;
}
