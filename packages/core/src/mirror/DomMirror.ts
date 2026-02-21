import type { Object3D } from 'three';
import type { ObjectStore } from '../store/ObjectStore';
import { getTagForType } from './CustomElements';
import { applyAttributes } from './attributes';
import { r3fLog } from '../debug';

// ---------------------------------------------------------------------------
// LRU tracking node (doubly-linked list for O(1) eviction)
// ---------------------------------------------------------------------------

interface LRUNode {
  uuid: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}

// ---------------------------------------------------------------------------
// Materialized node record — tracks a DOM element and its cached attributes
// ---------------------------------------------------------------------------

interface MaterializedNode {
  element: HTMLElement;
  /** Previously applied attribute values for diffing */
  prevAttrs: Map<string, string>;
  /** LRU tracking node */
  lruNode: LRUNode;
}

// ---------------------------------------------------------------------------
// DomMirror — lazy DOM tree builder with LRU eviction
// ---------------------------------------------------------------------------

/**
 * Manages the parallel DOM tree that mirrors the Three.js scene graph.
 *
 * Key design for 100k-scale:
 * - ObjectStore holds Tier 1 metadata for ALL objects (cheap, ~120 bytes each)
 * - DomMirror only materializes DOM nodes for actively viewed/queried objects
 * - Max materialized DOM nodes capped (default 2,000) with LRU eviction
 * - DOM writes only happen for materialized nodes where values actually differ
 */
export class DomMirror {
  private _store: ObjectStore;
  private _rootElement: HTMLElement | null = null;

  // Materialized nodes indexed by uuid
  private _nodes = new Map<string, MaterializedNode>();

  // LRU doubly-linked list for eviction (head = most recently used, tail = least)
  private _lruHead: LRUNode | null = null;
  private _lruTail: LRUNode | null = null;
  private _lruSize = 0;

  // Max materialized DOM nodes
  private _maxNodes: number;

  // UUID → parent UUID mapping for DOM tree structure
  private _parentMap = new Map<string, string | null>();

  /** When true, mirror elements use pointer-events: auto so DevTools element picker can select them. */
  private _inspectMode = false;

  /** Async materialization state for inspect mode */
  private _asyncQueue: string[] = [];
  private _asyncIdleHandle: number | null = null;
  private _asyncBatchSize = 200;

  constructor(store: ObjectStore, maxNodes = 2000) {
    this._store = store;
    this._maxNodes = maxNodes;
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Set the root DOM element where the mirror tree will be appended.
   * Typically a hidden div: <div id="three-dom-root" style="display:none">
   */
  setRoot(rootElement: HTMLElement): void {
    this._rootElement = rootElement;
  }

  /**
   * Enable or disable "inspect mode". When turning on, kicks off async
   * chunked materialization so the full tree becomes browsable in the
   * Elements tab without blocking the main thread.
   *
   * At BIM scale (100k-200k objects) the old synchronous loop would freeze
   * the page for 2-10s. The new approach uses requestIdleCallback to
   * spread work across idle frames (~200 nodes per idle slice, ~5ms each).
   */
  setInspectMode(on: boolean): void {
    if (this._inspectMode === on) return;
    this._inspectMode = on;

    if (on) {
      this._startAsyncMaterialization();
    } else {
      this._cancelAsyncMaterialization();
    }

    r3fLog('inspect', 'setInspectMode', { on, nodeCount: this._nodes.size });
  }

  /** Whether inspect mode is currently enabled. */
  getInspectMode(): boolean {
    return this._inspectMode;
  }

  /**
   * Build the initial DOM tree from the scene.
   * Materializes the top 2 levels of the scene hierarchy.
   */
  buildInitialTree(scene: Object3D): void {
    if (!this._rootElement) return;
    this.materializeSubtree(scene.uuid, 2);
  }

  // -------------------------------------------------------------------------
  // Materialization
  // -------------------------------------------------------------------------

  /**
   * Create a DOM node for a single object.
   * If already materialized, touches the LRU and returns the existing element.
   */
  materialize(uuid: string): HTMLElement | null {
    // Already materialized — touch LRU and return
    const existing = this._nodes.get(uuid);
    if (existing) {
      this._lruTouch(existing.lruNode);
      return existing.element;
    }

    // Get metadata from the store
    const meta = this._store.getByUuid(uuid);
    if (!meta) return null;

    // Evict if at capacity
    if (this._lruSize >= this._maxNodes) {
      this._evictLRU();
    }

    // Create the custom element
    const tag = getTagForType(meta.type);
    const element = document.createElement(tag);

    element.style.cssText = 'display:contents;';

    // Apply all Tier 1 attributes
    const prevAttrs = new Map<string, string>();
    applyAttributes(element, meta, prevAttrs);

    // Create LRU node
    const lruNode: LRUNode = { uuid, prev: null, next: null };
    this._lruPush(lruNode);

    // Store the materialized node
    const node: MaterializedNode = { element, prevAttrs, lruNode };
    this._nodes.set(uuid, node);

    // Track parent for DOM structure
    this._parentMap.set(uuid, meta.parentUuid);

    // Insert into DOM tree
    this._insertIntoDom(uuid, meta.parentUuid, element);

    return element;
  }

  /**
   * Materialize a subtree starting from the given uuid, up to the specified depth.
   * depth=0 materializes just the node, depth=1 includes direct children, etc.
   */
  materializeSubtree(uuid: string, depth: number): void {
    this.materialize(uuid);

    if (depth <= 0) return;

    const meta = this._store.getByUuid(uuid);
    if (!meta) return;

    for (const childUuid of meta.childrenUuids) {
      this.materializeSubtree(childUuid, depth - 1);
    }
  }

  /**
   * Remove a DOM node but keep JS metadata in the ObjectStore.
   * Called by LRU eviction or when an object is removed from the scene.
   * Also dematerializes any materialized descendants so they don't become
   * orphaned entries in the LRU / _nodes maps.
   */
  dematerialize(uuid: string): void {
    const node = this._nodes.get(uuid);
    if (!node) return;

    // Collect materialized descendants before removing the parent.
    // Walk _parentMap to find children whose parent is this uuid.
    const descendants = this._collectMaterializedDescendants(uuid);

    // Dematerialize descendants bottom-up (deepest first doesn't matter
    // since we're removing from maps, but process children before parent
    // avoids redundant DOM detach since parent.remove() already detaches them).
    for (const descUuid of descendants) {
      const descNode = this._nodes.get(descUuid);
      if (descNode) {
        this._lruRemove(descNode.lruNode);
        this._nodes.delete(descUuid);
        this._parentMap.delete(descUuid);
      }
    }

    // Remove the node itself
    node.element.remove();
    this._lruRemove(node.lruNode);
    this._nodes.delete(uuid);
    this._parentMap.delete(uuid);
  }

  /**
   * Collect all materialized descendants of a uuid by walking _parentMap.
   */
  private _collectMaterializedDescendants(parentUuid: string): string[] {
    const result: string[] = [];
    for (const [childUuid, pUuid] of this._parentMap) {
      if (pUuid === parentUuid) {
        result.push(childUuid);
        result.push(...this._collectMaterializedDescendants(childUuid));
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Structural updates (called by Object3D.add/remove patch)
  // -------------------------------------------------------------------------

  /**
   * Called when a new object is added to the tracked scene.
   * Only materializes if the parent is already materialized (lazy expansion).
   */
  onObjectAdded(obj: Object3D): void {
    const parentUuid = obj.parent?.uuid;
    if (!parentUuid) return;

    // Only materialize if parent is already visible in the DOM tree
    const parentNode = this._nodes.get(parentUuid);
    if (parentNode) {
      this.materialize(obj.uuid);
    }

    // Update parent's children in DOM (add the new child)
    if (parentNode) {
      const parentMeta = this._store.getByUuid(parentUuid);
      if (parentMeta) {
        applyAttributes(parentNode.element, parentMeta, parentNode.prevAttrs);
      }
    }
  }

  /**
   * Called when an object is removed from the tracked scene.
   * Dematerializes the object and all its descendants.
   */
  onObjectRemoved(obj: Object3D): void {
    // Dematerialize entire subtree
    obj.traverse((child) => {
      this.dematerialize(child.uuid);
    });
  }

  // -------------------------------------------------------------------------
  // Attribute sync (called per-frame by ThreeDom)
  // -------------------------------------------------------------------------

  /**
   * Sync Tier 1 attributes for an object if it's materialized.
   * No-op if the object has no materialized DOM node.
   * Returns the number of DOM writes performed.
   */
  syncAttributes(obj: Object3D): number {
    const node = this._nodes.get(obj.uuid);
    if (!node) return 0;

    const meta = this._store.getMetadata(obj);
    if (!meta) return 0;

    return applyAttributes(node.element, meta, node.prevAttrs);
  }

  /**
   * Sync attributes by uuid (when you don't have the Object3D ref).
   */
  syncAttributesByUuid(uuid: string): number {
    const node = this._nodes.get(uuid);
    if (!node) return 0;

    const meta = this._store.getByUuid(uuid);
    if (!meta) return 0;

    return applyAttributes(node.element, meta, node.prevAttrs);
  }

  // -------------------------------------------------------------------------
  // Querying
  // -------------------------------------------------------------------------

  /**
   * Get the root DOM element.
   */
  getRootElement(): HTMLElement | null {
    return this._rootElement;
  }

  /**
   * Get the materialized DOM element for an object, if it exists.
   */
  getElement(uuid: string): HTMLElement | null {
    const node = this._nodes.get(uuid);
    if (node) {
      this._lruTouch(node.lruNode);
      return node.element;
    }
    return null;
  }

  /**
   * Get or lazily materialize a DOM element for an object.
   * Also materializes the ancestor chain so the element is correctly
   * nested in the DOM tree. Used by InspectController so that
   * hover/click always produces a valid mirror element regardless
   * of whether async materialization has reached it yet.
   */
  getOrMaterialize(uuid: string): HTMLElement | null {
    const existing = this._nodes.get(uuid);
    if (existing) {
      this._lruTouch(existing.lruNode);
      return existing.element;
    }

    this._materializeAncestorChain(uuid);
    return this.materialize(uuid);
  }

  /**
   * Check if an object has a materialized DOM node.
   */
  isMaterialized(uuid: string): boolean {
    return this._nodes.has(uuid);
  }

  /**
   * Query the mirror DOM using a CSS selector.
   * Falls back to searching the ObjectStore if no materialized nodes match,
   * then materializes the matching objects.
   */
  querySelector(selector: string): HTMLElement | null {
    if (!this._rootElement) return null;

    // First try the already-materialized DOM
    const existing = this._rootElement.querySelector<HTMLElement>(selector);
    if (existing) return existing;

    // If not found, search by common patterns against the store
    const uuid = this._findUuidBySelector(selector);
    if (uuid) {
      return this.materialize(uuid);
    }

    return null;
  }

  /**
   * Query all matching elements in the mirror DOM.
   */
  querySelectorAll(selector: string): HTMLElement[] {
    if (!this._rootElement) return [];

    // Find all matching UUIDs from the store
    const uuids = this._findAllUuidsBySelector(selector);

    // Materialize each and collect elements
    const elements: HTMLElement[] = [];
    for (const uuid of uuids) {
      const el = this.materialize(uuid);
      if (el) elements.push(el);
    }

    return elements;
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Set the maximum number of materialized DOM nodes.
   * If current count exceeds the new max, excess nodes are evicted immediately.
   */
  setMaxNodes(max: number): void {
    this._maxNodes = max;
    while (this._lruSize > this._maxNodes) {
      this._evictLRU();
    }
  }

  /** Current number of materialized DOM nodes. */
  getMaterializedCount(): number {
    return this._nodes.size;
  }

  /** Maximum allowed materialized DOM nodes. */
  getMaxNodes(): number {
    return this._maxNodes;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Remove all materialized DOM nodes and reset state.
   */
  dispose(): void {
    this._cancelAsyncMaterialization();
    for (const [, node] of this._nodes) {
      node.element.remove();
    }
    this._nodes.clear();
    this._parentMap.clear();
    this._lruHead = null;
    this._lruTail = null;
    this._lruSize = 0;
    if (this._rootElement) {
      this._rootElement.innerHTML = '';
    }
  }

  // -------------------------------------------------------------------------
  // Private: DOM insertion
  // -------------------------------------------------------------------------

  /**
   * Insert a newly created element into the correct position in the DOM tree.
   */
  private _insertIntoDom(
    _uuid: string,
    parentUuid: string | null,
    element: HTMLElement,
  ): void {
    if (!this._rootElement) return;

    if (!parentUuid) {
      // Root-level object (scene) — append to mirror root
      this._rootElement.appendChild(element);
      return;
    }

    // Try to find materialized parent
    const parentNode = this._nodes.get(parentUuid);
    if (parentNode) {
      parentNode.element.appendChild(element);
    } else {
      // Parent not materialized — append to mirror root as orphan
      // (will be reparented when parent is materialized)
      this._rootElement.appendChild(element);
    }
  }

  // -------------------------------------------------------------------------
  // Private: Ancestor chain materialization
  // -------------------------------------------------------------------------

  /**
   * Materialize all ancestors of a uuid from root down, so the target
   * element will be correctly nested when materialized.
   */
  private _materializeAncestorChain(uuid: string): void {
    const chain: string[] = [];
    let currentUuid: string | null = uuid;

    while (currentUuid) {
      if (this._nodes.has(currentUuid)) break;
      const meta = this._store.getByUuid(currentUuid);
      if (!meta) break;
      chain.push(currentUuid);
      currentUuid = meta.parentUuid;
    }

    // Materialize from root-most ancestor down (skip the target itself)
    for (let i = chain.length - 1; i > 0; i--) {
      this.materialize(chain[i]);
    }
  }

  // -------------------------------------------------------------------------
  // Private: Async chunked materialization for inspect mode
  // -------------------------------------------------------------------------

  private _startAsyncMaterialization(): void {
    this._cancelAsyncMaterialization();

    const flatList = this._store.getFlatList();
    this._asyncQueue = [];
    for (const obj of flatList) {
      if (obj.userData?.__r3fdom_internal) continue;
      if (this._nodes.has(obj.uuid)) continue;
      this._asyncQueue.push(obj.uuid);
    }

    if (this._asyncQueue.length === 0) return;

    r3fLog('inspect', `Async materialization started: ${this._asyncQueue.length} objects queued`);
    this._scheduleAsyncChunk();
  }

  private _cancelAsyncMaterialization(): void {
    if (this._asyncIdleHandle !== null) {
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(this._asyncIdleHandle);
      } else {
        clearTimeout(this._asyncIdleHandle);
      }
      this._asyncIdleHandle = null;
    }
    this._asyncQueue = [];
  }

  private _scheduleAsyncChunk(): void {
    if (this._asyncQueue.length === 0) {
      this._asyncIdleHandle = null;
      r3fLog('inspect', `Async materialization complete: ${this._nodes.size} nodes materialized`);
      return;
    }

    const callback = (deadline?: IdleDeadline) => {
      const hasTimeRemaining = deadline
        ? () => deadline.timeRemaining() > 2
        : () => true;

      let processed = 0;
      while (
        this._asyncQueue.length > 0 &&
        processed < this._asyncBatchSize &&
        hasTimeRemaining()
      ) {
        const uuid = this._asyncQueue.shift()!;
        if (!this._nodes.has(uuid)) {
          this.materialize(uuid);
        }
        processed++;
      }

      this._scheduleAsyncChunk();
    };

    if (typeof requestIdleCallback === 'function') {
      this._asyncIdleHandle = requestIdleCallback(callback, { timeout: 100 }) as unknown as number;
    } else {
      this._asyncIdleHandle = setTimeout(callback, 16) as unknown as number;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Selector → UUID resolution
  // -------------------------------------------------------------------------

  /**
   * Parse common CSS selector patterns and resolve to a uuid from the store.
   * Supports:
   *   [data-test-id="value"]
   *   [data-name="value"]
   *   [data-uuid="value"]
   *   three-mesh, three-light, etc. (by tag/type)
   */
  private _findUuidBySelector(selector: string): string | null {
    // [data-test-id="value"]
    const testIdMatch = selector.match(/\[data-test-id=["']([^"']+)["']\]/);
    if (testIdMatch) {
      const meta = this._store.getByTestId(testIdMatch[1]);
      return meta?.uuid ?? null;
    }

    // [data-uuid="value"]
    const uuidMatch = selector.match(/\[data-uuid=["']([^"']+)["']\]/);
    if (uuidMatch) {
      const meta = this._store.getByUuid(uuidMatch[1]);
      return meta?.uuid ?? null;
    }

    // [data-name="value"]
    const nameMatch = selector.match(/\[data-name=["']([^"']+)["']\]/);
    if (nameMatch) {
      const metas = this._store.getByName(nameMatch[1]);
      return metas.length > 0 ? metas[0].uuid : null;
    }

    return null;
  }

  /**
   * Find all UUIDs matching a selector pattern.
   */
  private _findAllUuidsBySelector(selector: string): string[] {
    const uuids: string[] = [];

    // [data-test-id="value"]
    const testIdMatch = selector.match(/\[data-test-id=["']([^"']+)["']\]/);
    if (testIdMatch) {
      const meta = this._store.getByTestId(testIdMatch[1]);
      if (meta) uuids.push(meta.uuid);
      return uuids;
    }

    // [data-name="value"]
    const nameMatch = selector.match(/\[data-name=["']([^"']+)["']\]/);
    if (nameMatch) {
      const metas = this._store.getByName(nameMatch[1]);
      for (const m of metas) uuids.push(m.uuid);
      return uuids;
    }

    // Tag-based: three-mesh, three-light, etc.
    // Resolve by iterating all objects and filtering by type
    const tagMatch = selector.match(/^(three-(?:scene|group|mesh|light|camera|object))$/);
    if (tagMatch) {
      const targetTag = tagMatch[1];
      const allObjects = this._store.getFlatList();
      for (const obj of allObjects) {
        const meta = this._store.getMetadata(obj);
        if (meta && getTagForType(meta.type) === targetTag) {
          uuids.push(meta.uuid);
        }
      }
      return uuids;
    }

    return uuids;
  }

  // -------------------------------------------------------------------------
  // Private: LRU doubly-linked list operations
  // -------------------------------------------------------------------------

  /** Add a node to the front (most recently used). */
  private _lruPush(node: LRUNode): void {
    node.prev = null;
    node.next = this._lruHead;
    if (this._lruHead) {
      this._lruHead.prev = node;
    }
    this._lruHead = node;
    if (!this._lruTail) {
      this._lruTail = node;
    }
    this._lruSize++;
  }

  /** Remove a node from the list. */
  private _lruRemove(node: LRUNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this._lruHead = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this._lruTail = node.prev;
    }
    node.prev = null;
    node.next = null;
    this._lruSize--;
  }

  /** Move a node to the front (most recently used). */
  private _lruTouch(node: LRUNode): void {
    if (this._lruHead === node) return; // already at front
    this._lruRemove(node);
    this._lruPush(node);
  }

  /** Evict the least recently used node. */
  private _evictLRU(): void {
    if (!this._lruTail) return;
    const uuid = this._lruTail.uuid;
    this.dematerialize(uuid);
  }
}
