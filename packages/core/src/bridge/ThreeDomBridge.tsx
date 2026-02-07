import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { ObjectStore } from '../store/ObjectStore';
import { DomMirror } from '../mirror/DomMirror';
import { ensureCustomElements } from '../mirror/CustomElements';
import { patchObject3D } from './patchObject3D';
import { createSnapshot } from '../snapshot/snapshot';
import { version } from '../version';
import type { R3FDOM } from '../types';

// ---------------------------------------------------------------------------
// ThreeDomBridge Props
// ---------------------------------------------------------------------------

export interface ThreeDomBridgeProps {
  /**
   * CSS selector or HTMLElement for the mirror DOM root.
   * Default: "#three-dom-root"
   */
  root?: string | HTMLElement;

  /**
   * Number of objects to process per amortized batch per frame.
   * Higher = faster full sync cycle, more per-frame cost.
   * Default: 500
   */
  batchSize?: number;

  /**
   * Maximum time budget (in ms) for sync work per frame.
   * The bridge will stop processing when this budget is exceeded.
   * Default: 0.5
   */
  timeBudgetMs?: number;

  /**
   * Maximum number of materialized DOM nodes.
   * Older nodes are evicted via LRU when this cap is reached.
   * Default: 2000
   */
  maxDomNodes?: number;

  /**
   * Depth of the initial DOM tree materialization.
   * Default: 3 (scene + 2 levels of children)
   */
  initialDepth?: number;

  /**
   * Whether the bridge is enabled. Set to false to disable all sync.
   * Useful for production builds where you only want testing hooks.
   * Default: true
   */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Singleton instances (shared across remounts within the same Canvas)
// ---------------------------------------------------------------------------

let _store: ObjectStore | null = null;
let _mirror: DomMirror | null = null;

/** Access the current ObjectStore (for use by other core modules). */
export function getStore(): ObjectStore | null {
  return _store;
}

/** Access the current DomMirror (for use by other core modules). */
export function getMirror(): DomMirror | null {
  return _mirror;
}

// ---------------------------------------------------------------------------
// Global API exposure (window.__R3F_DOM__)
// ---------------------------------------------------------------------------

function exposeGlobalAPI(store: ObjectStore): void {
  const api: R3FDOM = {
    // Tier 1 lookups
    getByTestId: (id: string) => store.getByTestId(id),
    getByUuid: (uuid: string) => store.getByUuid(uuid),
    getByName: (name: string) => store.getByName(name),
    getCount: () => store.getCount(),

    // Snapshot
    snapshot: () => createSnapshot(store),

    // Tier 2 inspection
    inspect: (idOrUuid: string) => store.inspect(idOrUuid),

    // Interactions (stubs — will be wired in interactions step)
    click: (_idOrUuid: string) => {
      console.warn('[react-three-dom] click() not yet implemented. Coming in Phase 2.');
    },
    hover: (_idOrUuid: string) => {
      console.warn('[react-three-dom] hover() not yet implemented. Coming in Phase 2.');
    },
    drag: (_idOrUuid: string, _delta: { x: number; y: number; z: number }) => {
      console.warn('[react-three-dom] drag() not yet implemented. Coming in Phase 2.');
    },

    // Raw access
    getObject3D: (idOrUuid: string) => store.getObject3D(idOrUuid),

    version,
  };

  window.__R3F_DOM__ = api;
}

function removeGlobalAPI(): void {
  delete window.__R3F_DOM__;
}

// ---------------------------------------------------------------------------
// ThreeDomBridge Component
// ---------------------------------------------------------------------------

/**
 * React component that bridges a React Three Fiber scene to the DOM mirror.
 * Place inside <Canvas> to enable DevTools inspection and testing hooks.
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <ThreeDomBridge root="#three-dom-root" />
 *   <mesh userData={{ testId: "my-mesh" }}>
 *     <boxGeometry />
 *     <meshStandardMaterial />
 *   </mesh>
 * </Canvas>
 * ```
 */
export function ThreeDomBridge({
  root = '#three-dom-root',
  batchSize = 500,
  timeBudgetMs = 0.5,
  maxDomNodes = 2000,
  initialDepth = 3,
  enabled = true,
}: ThreeDomBridgeProps = {}) {
  const scene = useThree((s) => s.scene);
  const cursorRef = useRef(0);

  // -----------------------------------------------------------------------
  // Setup: create store, mirror, patch, and expose global API
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;

    // Resolve root element
    let rootElement: HTMLElement | null = null;
    if (typeof root === 'string') {
      rootElement = document.querySelector<HTMLElement>(root);
      if (!rootElement) {
        // Auto-create a hidden root if selector not found
        rootElement = document.createElement('div');
        rootElement.id = root.replace(/^#/, '');
        rootElement.style.display = 'none';
        document.body.appendChild(rootElement);
      }
    } else {
      rootElement = root;
    }

    // Create store and mirror
    const store = new ObjectStore();
    const mirror = new DomMirror(store, maxDomNodes);
    mirror.setRoot(rootElement);

    // Register custom elements
    ensureCustomElements(store);

    // Register entire scene tree
    store.registerTree(scene);

    // Build initial DOM tree
    mirror.materializeSubtree(scene.uuid, initialDepth);

    // Patch Object3D for event-driven structural sync
    const unpatch = patchObject3D(store, mirror);

    // Expose global API
    exposeGlobalAPI(store);

    // Set singletons
    _store = store;
    _mirror = mirror;

    // Cleanup
    return () => {
      unpatch();
      removeGlobalAPI();
      mirror.dispose();
      store.dispose();
      _store = null;
      _mirror = null;
    };
  }, [scene, enabled, root, maxDomNodes, initialDepth]);

  // -----------------------------------------------------------------------
  // Per-frame sync: Layer 3 (priority) + Layer 2 (amortized batch)
  // -----------------------------------------------------------------------

  useFrame(() => {
    if (!enabled || !_store || !_mirror) return;

    const store = _store;
    const mirror = _mirror;
    const start = performance.now();

    // Layer 3: Sync priority (dirty) objects first — every frame
    const dirtyObjects = store.drainDirtyQueue();
    for (const obj of dirtyObjects) {
      store.update(obj);
      mirror.syncAttributes(obj);
    }

    // Layer 2: Amortized batch — process a slice of all objects per frame
    const budgetRemaining = timeBudgetMs - (performance.now() - start);
    if (budgetRemaining > 0.1) {
      const objects = store.getFlatList();
      if (objects.length === 0) return;

      const end = Math.min(cursorRef.current + batchSize, objects.length);

      for (let i = cursorRef.current; i < end; i++) {
        // Respect time budget — stop if we've exceeded it
        if (performance.now() - start > timeBudgetMs) break;

        const obj = objects[i];
        const changed = store.update(obj);

        // Only sync DOM if the object actually changed AND is materialized
        if (changed) {
          mirror.syncAttributes(obj);
        }
      }

      // Advance cursor, wrap around when we've covered the full list
      cursorRef.current = end >= objects.length ? 0 : end;
    }
  });

  // This component renders nothing — it's a pure side-effect bridge
  return null;
}
