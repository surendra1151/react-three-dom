import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { Object3D, Scene, Camera } from 'three';
import { ObjectStore } from '../store/ObjectStore';
import { DomMirror } from '../mirror/DomMirror';
import { ensureCustomElements } from '../mirror/CustomElements';
import { patchObject3D } from './patchObject3D';
import { createSnapshot } from '../snapshot/snapshot';
import { click3D, doubleClick3D, contextMenu3D } from '../interactions/click';
import { hover3D, unhover3D } from '../interactions/hover';
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
import type { R3FDOM, ObjectMetadata, CameraState } from '../types';

// ---------------------------------------------------------------------------
// ThreeDom Props
// ---------------------------------------------------------------------------

export interface ThreeDomProps {
  /**
   * Unique identifier for this canvas instance. Required when using multiple
   * canvases. The bridge is registered in `window.__R3F_DOM_INSTANCES__[canvasId]`.
   * When omitted the bridge is only set on `window.__R3F_DOM__`.
   */
  canvasId?: string;
  /**
   * Mark this canvas as the primary / default instance.
   * `window.__R3F_DOM__` always points to the primary bridge.
   * When only one canvas is used (no canvasId), it is implicitly primary.
   * Default: true when canvasId is omitted, false otherwise.
   */
  primary?: boolean;
  /**
   * Registration mode:
   * - "auto" (default): traverses and registers all objects in the scene.
   * - "manual": nothing is auto-registered. Use `useR3FRegister` hook or
   *   `__R3F_DOM__.r3fRegister()` to add objects explicitly.
   */
  mode?: 'auto' | 'manual';
  /**
   * Filter function for auto mode. Only objects that pass the filter are
   * registered. Ignored in manual mode.
   * Example: `filter={(obj) => !!obj.userData.testId}`
   */
  filter?: (obj: Object3D) => boolean;
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
// Per-instance registries (keyed by canvasId, '' for default)
// ---------------------------------------------------------------------------

const _stores = new Map<string, ObjectStore>();
const _mirrors = new Map<string, DomMirror>();
const _selectionManagers = new Map<string, SelectionManager>();
const _highlighters = new Map<string, Highlighter>();
const _inspectControllers = new Map<string, InspectController>();
const _filters = new Map<string, ((obj: Object3D) => boolean) | null>();
const _modes = new Map<string, 'auto' | 'manual'>();

/** Check if an object passes the filter for a given instance. */
export function shouldRegister(instanceKey: string, obj: Object3D): boolean {
  const mode = _modes.get(instanceKey);
  if (mode === 'manual') return false;
  const filter = _filters.get(instanceKey);
  if (filter) return filter(obj);
  return true;
}

/**
 * Ensure every ancestor from the scene root down to `obj.parent` is registered
 * in the store and mirror. This builds the connected parent chain that
 * DomMirror needs to correctly nest DOM elements, even when those ancestors
 * don't pass the user-supplied filter.
 */
export function ensureAncestorChain(
  obj: Object3D,
  store: ObjectStore,
  mirror: DomMirror,
): void {
  const chain: Object3D[] = [];
  let cursor = obj.parent;
  while (cursor) {
    if (store.has(cursor)) break; // already registered — chain is connected
    chain.push(cursor);
    cursor = cursor.parent;
  }
  // Register from root-most ancestor down so each parent exists before its child
  for (let i = chain.length - 1; i >= 0; i--) {
    const ancestor = chain[i];
    store.register(ancestor);
    mirror.onObjectAdded(ancestor);
    mirror.materialize(ancestor.uuid);
  }
}

/** Get the store for a canvas instance. Default: primary ('') instance. */
export function getStore(canvasId = ''): ObjectStore | null { return _stores.get(canvasId) ?? null; }
/** Get the mirror for a canvas instance. Default: primary ('') instance. */
export function getMirror(canvasId = ''): DomMirror | null { return _mirrors.get(canvasId) ?? null; }
/** Get the selection manager for a canvas instance. */
export function getSelectionManager(canvasId = ''): SelectionManager | null { return _selectionManagers.get(canvasId) ?? null; }
/** Get the highlighter for a canvas instance. */
export function getHighlighter(canvasId = ''): Highlighter | null { return _highlighters.get(canvasId) ?? null; }
/** Get the inspect controller for a canvas instance. */
export function getInspectController(canvasId = ''): InspectController | null { return _inspectControllers.get(canvasId) ?? null; }
/** List all active canvas IDs. */
export function getCanvasIds(): string[] { return Array.from(_stores.keys()); }

// ---------------------------------------------------------------------------
// Global API exposure (window.__R3F_DOM__)
// ---------------------------------------------------------------------------

function exposeGlobalAPI(
  store: ObjectStore,
  gl: { domElement: HTMLCanvasElement; getContext(): unknown },
  cameraRef: { current: Camera },
  selMgr: SelectionManager | null,
  inspCtrl: InspectController | null,
  mirror: DomMirror | null,
  canvasId?: string,
  isPrimary = true,
): void {
  const api: R3FDOM = {
    _ready: true,
    canvasId,
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
    unhover: () => { unhover3D(); },
    drag: async (idOrUuid: string, delta: { x: number; y: number; z: number }) => { await drag3D(idOrUuid, delta); },
    wheel: (idOrUuid: string, options?: { deltaY?: number; deltaX?: number }) => { wheel3D(idOrUuid, options); },
    pointerMiss: () => { pointerMiss3D(); },
    drawPath: async (points, options) => {
      const result = await drawPathFn(points, options);
      return { eventCount: result.eventCount, pointCount: result.pointCount };
    },
    select: (idOrUuid: string) => {
      const obj = store.getObject3D(idOrUuid);
      if (obj && selMgr) selMgr.select(obj);
    },
    clearSelection: () => { selMgr?.clearSelection(); },
    getSelection: () =>
      selMgr
        ? selMgr.getSelected().map((o: { uuid: string }) => o.uuid)
        : [],
    getObject3D: (idOrUuid: string) => store.getObject3D(idOrUuid),
    getSelectionDisplayTarget: (uuid: string) =>
      resolveSelectionDisplayTarget((id) => store.getObject3D(id), uuid) ?? uuid,
    setInspectMode: (on: boolean) => {
      r3fLog('inspect', 'Global API setInspectMode called', { on });
      const ctrl = inspCtrl ?? _inspectControllers.get(canvasId ?? '');
      if (on) {
        ctrl?.enable();
        mirror?.setInspectMode(true);
      } else {
        ctrl?.disable();
        mirror?.setInspectMode(false);
      }
    },
    getInspectMode: () => {
      const ctrl = inspCtrl ?? _inspectControllers.get(canvasId ?? '');
      return ctrl?.active ?? false;
    },
    sweepOrphans: () => store.sweepOrphans(),
    getDiagnostics: () => ({
      version,
      ready: true,
      objectCount: store.getCount(),
      meshCount: store.getCountByType('Mesh'),
      groupCount: store.getCountByType('Group'),
      lightCount: store.getCountByType('DirectionalLight') + store.getCountByType('PointLight') + store.getCountByType('SpotLight') + store.getCountByType('AmbientLight') + store.getCountByType('HemisphereLight'),
      cameraCount: store.getCountByType('PerspectiveCamera') + store.getCountByType('OrthographicCamera'),
      materializedDomNodes: mirror?.getMaterializedCount() ?? 0,
      maxDomNodes: mirror?.getMaxNodes() ?? 0,
      canvasWidth: gl.domElement.width,
      canvasHeight: gl.domElement.height,
      webglRenderer: (() => {
        try {
          const ctx = gl.getContext() as WebGLRenderingContext;
          const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
          return dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
        } catch { return 'unknown'; }
      })(),
      dirtyQueueSize: store.getDirtyCount(),
    }),
    getCameraState: (): CameraState => {
      const cam = cameraRef.current;
      const dir = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const target: [number, number, number] = [
        cam.position.x + dir.x * 100,
        cam.position.y + dir.y * 100,
        cam.position.z + dir.z * 100,
      ];
      const state: CameraState = {
        type: cam.type,
        position: [cam.position.x, cam.position.y, cam.position.z],
        rotation: [cam.rotation.x, cam.rotation.y, cam.rotation.z],
        target,
        near: (cam as unknown as { near: number }).near,
        far: (cam as unknown as { far: number }).far,
        zoom: (cam as unknown as { zoom: number }).zoom,
      };
      if (cam.type === 'PerspectiveCamera') {
        const pc = cam as unknown as { fov: number; aspect: number };
        state.fov = pc.fov;
        state.aspect = pc.aspect;
      } else if (cam.type === 'OrthographicCamera') {
        const oc = cam as unknown as { left: number; right: number; top: number; bottom: number };
        state.left = oc.left;
        state.right = oc.right;
        state.top = oc.top;
        state.bottom = oc.bottom;
      }
      return state;
    },
    r3fRegister: (obj) => {
      if (store.has(obj)) return;
      if (!store.isInTrackedScene(obj)) {
        console.warn(
          `[react-three-dom] r3fRegister: object "${obj.userData?.testId || obj.name || obj.uuid.slice(0, 8)}" is not in a tracked scene. ` +
          `Add it to the scene graph first.`,
        );
        return;
      }
      obj.userData.__r3fdom_manual = true;
      ensureAncestorChain(obj, store!, mirror!);
      let count = 0;
      obj.traverse((child) => {
        if (!store!.has(child)) {
          store!.register(child);
          mirror?.onObjectAdded(child);
          mirror?.materialize(child.uuid);
          count++;
        }
      });
      r3fLog('bridge', `r3fRegister: "${obj.userData?.testId || obj.name || obj.uuid.slice(0, 8)}" (${obj.type}) — ${count} objects`);
    },
    r3fUnregister: (obj) => {
      if (!store.has(obj)) return;
      if (!obj.userData?.__r3fdom_manual) {
        r3fLog('bridge', `r3fUnregister skipped — "${obj.userData?.testId || obj.name || obj.uuid.slice(0, 8)}" was auto-registered`);
        return;
      }
      delete obj.userData.__r3fdom_manual;
      mirror?.onObjectRemoved(obj);
      obj.traverse((child) => store.unregister(child));
      r3fLog('bridge', `r3fUnregister: "${obj.userData?.testId || obj.name || obj.uuid.slice(0, 8)}" (${obj.type})`);
    },
    fuzzyFind: (query: string, limit = 5) => {
      const q = query.toLowerCase();
      const results: ObjectMetadata[] = [];
      for (const obj of store.getFlatList()) {
        if (results.length >= limit) break;
        const meta = store.getMetadata(obj);
        if (!meta) continue;
        const testId = meta.testId?.toLowerCase() ?? '';
        const name = meta.name?.toLowerCase() ?? '';
        if (testId.includes(q) || name.includes(q) || meta.uuid.startsWith(q)) {
          results.push(meta);
        }
      }
      return results;
    },
    version,
  };

  if (isPrimary) {
    window.__R3F_DOM__ = api;
  }
  if (canvasId) {
    if (!window.__R3F_DOM_INSTANCES__) window.__R3F_DOM_INSTANCES__ = {};
    if (window.__R3F_DOM_INSTANCES__[canvasId]) {
      console.warn(
        `[react-three-dom] Duplicate canvasId "${canvasId}" — the previous bridge instance will be overwritten. ` +
        `Each <ThreeDom> must have a unique canvasId.`,
      );
    }
    window.__R3F_DOM_INSTANCES__[canvasId] = api;
  }
}

function removeGlobalAPI(onlyIfEquals?: R3FDOM, canvasId?: string): void {
  r3fLog('bridge', 'removeGlobalAPI called (deferred)');

  const removeFromRegistry = (ref?: R3FDOM) => {
    if (canvasId && window.__R3F_DOM_INSTANCES__) {
      if (!ref || window.__R3F_DOM_INSTANCES__[canvasId] === ref) {
        delete window.__R3F_DOM_INSTANCES__[canvasId];
        if (Object.keys(window.__R3F_DOM_INSTANCES__).length === 0) {
          delete (window as Window & { __R3F_DOM_INSTANCES__?: Record<string, R3FDOM> }).__R3F_DOM_INSTANCES__;
        }
      }
    }
  };

  if (onlyIfEquals !== undefined) {
    const ref = onlyIfEquals;
    queueMicrotask(() => {
      if ((window as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__ === ref) {
        delete (window as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
        r3fLog('bridge', 'Global API removed');
      } else {
        r3fLog('bridge', 'Global API not removed — replaced by new instance (Strict Mode remount)');
      }
      removeFromRegistry(ref);
    });
  } else {
    delete (window as Window & { __R3F_DOM__?: R3FDOM }).__R3F_DOM__;
    removeFromRegistry();
    r3fLog('bridge', 'Global API removed (immediate)');
  }
}

// ---------------------------------------------------------------------------
// Stub bridge for error / no-WebGL states
// ---------------------------------------------------------------------------

function createStubBridge(error?: string, canvasId?: string): R3FDOM {
  return {
    _ready: false,
    _error: error,
    canvasId,
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
    unhover: () => {},
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
    getInspectMode: () => false,
    r3fRegister: () => {},
    r3fUnregister: () => {},
    sweepOrphans: () => 0,
    getDiagnostics: () => ({
      version,
      ready: false,
      error: error ?? undefined,
      objectCount: 0,
      meshCount: 0,
      groupCount: 0,
      lightCount: 0,
      cameraCount: 0,
      materializedDomNodes: 0,
      maxDomNodes: 0,
      canvasWidth: 0,
      canvasHeight: 0,
      webglRenderer: 'unavailable',
      dirtyQueueSize: 0,
    }),
    getCameraState: () => ({
      type: 'unknown',
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      target: [0, 0, -100] as [number, number, number],
      near: 0.1,
      far: 1000,
      zoom: 1,
    }),
    fuzzyFind: () => [],
    version,
  };
}

// ---------------------------------------------------------------------------
// ThreeDom Component
// ---------------------------------------------------------------------------

export function ThreeDom({
  canvasId,
  primary,
  root = '#three-dom-root',
  mode = 'auto',
  filter,
  batchSize = 500,
  syncBudgetMs = 0.5,
  maxDomNodes = 2000,
  initialDepth = 3,
  enabled = true,
  debug = false,
  inspect: inspectProp = false,
}: ThreeDomProps = {}) {
  const isPrimary = primary ?? (canvasId === undefined);
  const instanceKey = canvasId ?? '';
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const cursorRef = useRef(0);
  const lastSweepRef = useRef(0);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // -----------------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;

    if (debug) enableDebug(true);
    r3fLog('setup', 'ThreeDom effect started', { enabled, debug, root, maxDomNodes });

    const canvas = gl.domElement;
    canvas.setAttribute('data-r3f-canvas', canvasId ?? 'true');
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
        const stubApi = createStubBridge(msg, canvasId);
        if (isPrimary) window.__R3F_DOM__ = stubApi;
        if (canvasId) {
          if (!window.__R3F_DOM_INSTANCES__) window.__R3F_DOM_INSTANCES__ = {};
          window.__R3F_DOM_INSTANCES__[canvasId] = stubApi;
        }
        r3fLog('setup', msg);
        return () => {
          removeGlobalAPI(stubApi, canvasId);
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

      // Store mode/filter so patchObject3D can check them
      _modes.set(instanceKey, mode);
      _filters.set(instanceKey, filter ?? null);

      // Install patch BEFORE async registration so any objects added to the
      // scene while registration is in progress are caught by the patch.
      unpatch = patchObject3D(store, mirror, instanceKey);
      setInteractionState(store, camera, gl, size);
      r3fLog('setup', `Object3D patched (mode=${mode}), interaction state set`);

      if (mode === 'auto') {
        // Register the full tree synchronously first so that materializeSubtree
        // can resolve children. Then kick off async registration for any objects
        // added later (caught by the Object3D.add patch).
        if (filter) {
          store!.addTrackedRoot(scene);
          store!.register(scene);
          mirror!.onObjectAdded(scene);
          scene.traverse((obj) => {
            if (obj === scene) return;
            if (filter(obj)) {
              ensureAncestorChain(obj, store!, mirror!);
              store!.register(obj);
              mirror!.onObjectAdded(obj);
            }
          });
        } else {
          store.registerTree(scene);
        }

        // R3F's default camera lives outside the scene graph (managed by the
        // fiber store, not added as a scene child). Register it explicitly so
        // it appears as <three-camera> in the DOM and DevTools, nested under
        // the scene element.
        if (!store.has(camera)) {
          const camMeta = store.register(camera);
          camMeta.parentUuid = scene.uuid;
          mirror.materialize(camera.uuid);
        }

        mirror.materializeSubtree(scene.uuid, initialDepth);
        if (!filter) {
          cancelAsyncReg = store.registerTreeAsync(scene);
        }
      } else {
        // Manual mode: only register the scene root so the mirror has a container
        store.addTrackedRoot(scene);
        store.register(scene);
        mirror.onObjectAdded(scene);
      }
      r3fLog('setup', `Scene registered (mode=${mode}): ${store.getCount()} objects`);

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

      _selectionManagers.set(instanceKey, selectionManager);
      _highlighters.set(instanceKey, highlighter);
      _inspectControllers.set(instanceKey, inspectController);

      exposeGlobalAPI(store, gl, cameraRef, selectionManager, inspectController, mirror, canvasId, isPrimary);
      r3fLog('bridge', `exposeGlobalAPI called — bridge is live, _ready=true${canvasId ? `, canvasId="${canvasId}"` : ''}`);
      currentApi = canvasId
        ? window.__R3F_DOM_INSTANCES__?.[canvasId]
        : window.__R3F_DOM__;
      _stores.set(instanceKey, store);
      _mirrors.set(instanceKey, mirror);

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
      const stubApi = createStubBridge(errorMsg, canvasId);
      if (isPrimary) window.__R3F_DOM__ = stubApi;
      if (canvasId) {
        if (!window.__R3F_DOM_INSTANCES__) window.__R3F_DOM_INSTANCES__ = {};
        window.__R3F_DOM_INSTANCES__[canvasId] = stubApi;
      }
      currentApi = stubApi;
    }

    // ---- Cleanup ----
    return () => {
      r3fLog('setup', 'ThreeDom cleanup started');
      if (cancelAsyncReg) cancelAsyncReg();
      if (inspectController) inspectController.dispose();
      if (raycastAccelerator) raycastAccelerator.dispose();
      if (highlighter) highlighter.dispose();
      if (unpatch) unpatch();
      removeGlobalAPI(currentApi, canvasId);
      clearInteractionState();
      if (selectionManager) selectionManager.dispose();
      if (mirror) mirror.dispose();
      if (store) store.dispose();
      canvas.removeAttribute('data-r3f-canvas');
      if (createdRoot && rootElement?.parentNode) {
        rootElement.parentNode.removeChild(rootElement);
      }
      _stores.delete(instanceKey);
      _mirrors.delete(instanceKey);
      _selectionManagers.delete(instanceKey);
      _highlighters.delete(instanceKey);
      _inspectControllers.delete(instanceKey);
      _modes.delete(instanceKey);
      _filters.delete(instanceKey);
      if (debug) enableDebug(false);
      r3fLog('setup', 'ThreeDom cleanup complete');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `size` is intentionally excluded:
  // it's synced every frame via setInteractionState in useFrame. Including it here
  // would tear down and rebuild the entire bridge on every resize, losing inspect
  // mode state, selection, and highlights.
  }, [scene, camera, gl, enabled, root, maxDomNodes, initialDepth, debug, inspectProp, canvasId, isPrimary, instanceKey]);

  // -----------------------------------------------------------------------
  // Per-frame sync
  // -----------------------------------------------------------------------

  useFrame(() => {
    const _store = _stores.get(instanceKey);
    const _mirror = _mirrors.get(instanceKey);
    const _highlighter = _highlighters.get(instanceKey);
    const _inspectController = _inspectControllers.get(instanceKey);

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
