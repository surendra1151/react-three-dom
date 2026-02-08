import {
  Object3D,
  Box3,
  Vector3,
  Camera,
  WebGLRenderer,
} from 'three';
import type { SelectionManager } from './SelectionManager';

// ---------------------------------------------------------------------------
// Highlighter
//
// Renders DevTools-style 2D overlay highlights over 3D objects by projecting
// their world-space bounding boxes onto screen coordinates. Matches the
// Chrome DevTools visual style:
//   - Blue semi-transparent overlay for content area
//   - Tooltip showing element tag name + dimensions
//   - Hover highlight (temporary) vs selected highlight (persistent)
//   - Parent selection cascades to all children
// ---------------------------------------------------------------------------

/** Chrome DevTools highlight colors */
const COLORS = {
  /** Content area — same blue as Chrome DevTools element highlight */
  content: 'rgba(111, 168, 220, 0.66)',
  /** Slightly dimmer for children of a selected parent */
  contentChild: 'rgba(111, 168, 220, 0.33)',
  /** Hover highlight — lighter blue */
  hover: 'rgba(111, 168, 220, 0.4)',
  /** Tooltip background */
  tooltipBg: 'rgba(36, 36, 36, 0.9)',
  /** Tooltip text */
  tooltipText: '#fff',
  /** Tooltip tag color */
  tooltipTag: '#e776e0',
  /** Tooltip dimensions color */
  tooltipDim: '#c5c5c5',
  /** Border for selected elements */
  border: 'rgba(111, 168, 220, 0.9)',
} as const;

export interface HighlighterOptions {
  /** Whether to show a tooltip above highlighted objects. Default: true */
  showTooltip?: boolean;
}

/** A 2D rectangle in screen pixels */
interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Helper: project 3D bounding box to 2D screen rect
// ---------------------------------------------------------------------------

const _box = /* @__PURE__ */ new Box3();
const _v = /* @__PURE__ */ new Vector3();
const _corners: Vector3[] = Array.from({ length: 8 }, () => new Vector3());

function projectBoundsToScreen(
  obj: Object3D,
  camera: Camera,
  canvas: HTMLCanvasElement,
): ScreenRect | null {
  _box.setFromObject(obj);
  if (_box.isEmpty()) return null;

  const { min, max } = _box;

  // Get all 8 corners of the AABB
  _corners[0].set(min.x, min.y, min.z);
  _corners[1].set(min.x, min.y, max.z);
  _corners[2].set(min.x, max.y, min.z);
  _corners[3].set(min.x, max.y, max.z);
  _corners[4].set(max.x, min.y, min.z);
  _corners[5].set(max.x, min.y, max.z);
  _corners[6].set(max.x, max.y, min.z);
  _corners[7].set(max.x, max.y, max.z);

  const rect = canvas.getBoundingClientRect();
  let screenMinX = Infinity;
  let screenMinY = Infinity;
  let screenMaxX = -Infinity;
  let screenMaxY = -Infinity;
  let allBehind = true;

  for (const corner of _corners) {
    _v.copy(corner).project(camera);

    // Check if point is in front of camera (z < 1 in NDC)
    if (_v.z < 1) allBehind = false;

    // Convert NDC to screen pixels
    const sx = ((_v.x + 1) / 2) * rect.width;
    const sy = ((1 - _v.y) / 2) * rect.height;

    screenMinX = Math.min(screenMinX, sx);
    screenMinY = Math.min(screenMinY, sy);
    screenMaxX = Math.max(screenMaxX, sx);
    screenMaxY = Math.max(screenMaxY, sy);
  }

  if (allBehind) return null;

  // Clamp to canvas bounds
  screenMinX = Math.max(0, screenMinX);
  screenMinY = Math.max(0, screenMinY);
  screenMaxX = Math.min(rect.width, screenMaxX);
  screenMaxY = Math.min(rect.height, screenMaxY);

  const width = screenMaxX - screenMinX;
  const height = screenMaxY - screenMinY;

  if (width < 1 || height < 1) return null;

  return {
    left: rect.left + screenMinX,
    top: rect.top + screenMinY,
    width,
    height,
  };
}

// ---------------------------------------------------------------------------
// Helper: get a display label for an object (like DevTools tag name)
// ---------------------------------------------------------------------------

function getObjectLabel(obj: Object3D): string {
  const tag = `three-${obj.type.toLowerCase()}`;
  const parts: string[] = [tag];

  if (obj.name) {
    parts.push(`.${obj.name}`);
  }

  const testId = obj.userData?.testId;
  if (testId) {
    parts.push(`[testId="${testId}"]`);
  }

  return parts.join('');
}

function getObjectDimensions(obj: Object3D): string {
  _box.setFromObject(obj);
  if (_box.isEmpty()) return '';
  const size = _box.getSize(new Vector3());
  return `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Overlay element management
// ---------------------------------------------------------------------------

interface OverlayEntry {
  /** The container div for the highlight overlay */
  overlayEl: HTMLDivElement;
  /** The tooltip element */
  tooltipEl: HTMLDivElement;
  /** Target object being highlighted */
  target: Object3D;
  /** Whether this is a child-of-parent highlight (dimmer) */
  isChild: boolean;
}

function createOverlayElement(color: string, showBorder: boolean): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 99998;
    background: ${color};
    ${showBorder ? `border: 1px solid ${COLORS.border};` : ''}
    transition: all 0.05s ease-out;
    box-sizing: border-box;
  `;
  return el;
}

function createTooltipElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 99999;
    background: ${COLORS.tooltipBg};
    color: ${COLORS.tooltipText};
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 3px;
    white-space: nowrap;
    line-height: 1.4;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;
  return el;
}

function positionOverlay(entry: OverlayEntry, rect: ScreenRect): void {
  const { overlayEl, tooltipEl } = entry;
  overlayEl.style.left = `${rect.left}px`;
  overlayEl.style.top = `${rect.top}px`;
  overlayEl.style.width = `${rect.width}px`;
  overlayEl.style.height = `${rect.height}px`;
  overlayEl.style.display = 'block';

  // Position tooltip above the overlay
  tooltipEl.style.left = `${rect.left}px`;
  tooltipEl.style.top = `${Math.max(0, rect.top - 28)}px`;
  tooltipEl.style.display = 'block';
}

function hideOverlay(entry: OverlayEntry): void {
  entry.overlayEl.style.display = 'none';
  entry.tooltipEl.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Highlighter class
// ---------------------------------------------------------------------------

export class Highlighter {
  /** Selected object overlays (persistent until deselected) */
  private _selectedEntries: Map<Object3D, OverlayEntry> = new Map();
  /** Hover overlay (temporary, single object at a time) */
  private _hoverEntries: Map<Object3D, OverlayEntry> = new Map();

  private _camera: Camera | null = null;
  private _renderer: WebGLRenderer | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _showTooltip: boolean;

  /** DevTools hover polling interval */
  private _hoverPollId: ReturnType<typeof setInterval> | null = null;
  private _lastHoveredElement: HTMLElement | null = null;

  /** Store reference for resolving objects */
  private _store: { getObject3D(uuid: string): Object3D | null } | null = null;

  constructor(options: HighlighterOptions = {}) {
    this._showTooltip = options.showTooltip ?? true;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  attach(
    _scene: Object3D,
    selectionManager: SelectionManager,
    camera: Camera,
    renderer: WebGLRenderer,
    store: { getObject3D(uuid: string): Object3D | null },
  ): void {
    this.detach();
    // scene parameter kept for API compatibility but not used for 2D overlays
    void _scene;
    this._camera = camera;
    this._renderer = renderer;
    this._store = store;

    // Subscribe to selection changes
    this._unsubscribe = selectionManager.subscribe((selected) => {
      this._syncSelectedHighlights(selected);
    });

    // Apply initial selection
    this._syncSelectedHighlights([...selectionManager.getSelected()]);

    // Start polling for DevTools hover
    this._startHoverPolling();
  }

  detach(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._stopHoverPolling();
    this._clearAllOverlays(this._selectedEntries);
    this._clearAllOverlays(this._hoverEntries);
    this._camera = null;
    this._renderer = null;
    this._store = null;
  }

  // -----------------------------------------------------------------------
  // Per-frame update — reposition all overlays to follow camera/objects
  // -----------------------------------------------------------------------

  update(): void {
    if (!this._camera || !this._renderer) return;
    const canvas = this._renderer.domElement;

    // Update selected overlays
    for (const entry of this._selectedEntries.values()) {
      const rect = projectBoundsToScreen(entry.target, this._camera, canvas);
      if (rect) {
        positionOverlay(entry, rect);
      } else {
        hideOverlay(entry);
      }
    }

    // Update hover overlays
    for (const entry of this._hoverEntries.values()) {
      const rect = projectBoundsToScreen(entry.target, this._camera, canvas);
      if (rect) {
        positionOverlay(entry, rect);
      } else {
        hideOverlay(entry);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  highlight(obj: Object3D): void {
    this._addSelectedHighlight(obj, false);
  }

  unhighlight(obj: Object3D): void {
    this._removeOverlay(obj, this._selectedEntries);
  }

  clearAll(): void {
    this._clearAllOverlays(this._selectedEntries);
    this._clearAllOverlays(this._hoverEntries);
  }

  isHighlighted(obj: Object3D): boolean {
    return this._selectedEntries.has(obj);
  }

  /** Show a temporary hover highlight for an object and its children */
  showHoverHighlight(obj: Object3D): void {
    this._clearAllOverlays(this._hoverEntries);
    this._addHoverHighlightRecursive(obj);
  }

  /** Clear the hover highlight */
  clearHoverHighlight(): void {
    this._clearAllOverlays(this._hoverEntries);
    this._lastHoveredElement = null;
  }

  // -----------------------------------------------------------------------
  // Internal: selection highlights
  // -----------------------------------------------------------------------

  private _syncSelectedHighlights(selected: Object3D[]): void {
    // Collect all objects that should be highlighted
    const targetSet = new Set<Object3D>();
    const primarySet = new Set<Object3D>(selected);

    for (const obj of selected) {
      targetSet.add(obj);
      // If the selected object has children, cascade highlights
      obj.traverse((child) => {
        targetSet.add(child);
      });
    }

    // Remove overlays for objects no longer in the target set
    for (const [obj] of this._selectedEntries) {
      if (!targetSet.has(obj)) {
        this._removeOverlay(obj, this._selectedEntries);
      }
    }

    // Add overlays for newly targeted objects
    for (const obj of targetSet) {
      if (obj.userData?.__r3fdom_internal) continue;
      if (!this._selectedEntries.has(obj)) {
        const isChild = !primarySet.has(obj);
        this._addSelectedHighlight(obj, isChild);
      }
    }
  }

  private _addSelectedHighlight(obj: Object3D, isChild: boolean): void {
    if (this._selectedEntries.has(obj)) return;

    const color = isChild ? COLORS.contentChild : COLORS.content;
    const overlayEl = createOverlayElement(color, !isChild);
    const tooltipEl = createTooltipElement();

    // Only show tooltip for the primary (non-child) selection
    if (isChild || !this._showTooltip) {
      tooltipEl.style.display = 'none';
    }

    // Set tooltip content
    const label = getObjectLabel(obj);
    const dims = getObjectDimensions(obj);
    tooltipEl.innerHTML = `<span style="color:${COLORS.tooltipTag}">${label}</span>` +
      (dims ? ` <span style="color:${COLORS.tooltipDim}">${dims}</span>` : '');

    document.body.appendChild(overlayEl);
    document.body.appendChild(tooltipEl);

    const entry: OverlayEntry = { overlayEl, tooltipEl, target: obj, isChild };
    this._selectedEntries.set(obj, entry);
  }

  // -----------------------------------------------------------------------
  // Internal: hover highlights
  // -----------------------------------------------------------------------

  private _addHoverHighlightRecursive(obj: Object3D): void {
    if (obj.userData?.__r3fdom_internal) return;

    const overlayEl = createOverlayElement(COLORS.hover, false);
    const tooltipEl = createTooltipElement();

    // Tooltip only for the root hovered object
    if (this._hoverEntries.size === 0 && this._showTooltip) {
      const label = getObjectLabel(obj);
      const dims = getObjectDimensions(obj);
      tooltipEl.innerHTML = `<span style="color:${COLORS.tooltipTag}">${label}</span>` +
        (dims ? ` <span style="color:${COLORS.tooltipDim}">${dims}</span>` : '');
    } else {
      tooltipEl.style.display = 'none';
    }

    document.body.appendChild(overlayEl);
    document.body.appendChild(tooltipEl);

    this._hoverEntries.set(obj, { overlayEl, tooltipEl, target: obj, isChild: false });

    // Recurse into children
    for (const child of obj.children) {
      if (!child.userData?.__r3fdom_internal) {
        this._addHoverHighlightRecursive(child);
      }
    }
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
      // Chrome DevTools exposes $0 for the currently selected element.
      // We also check for a custom __r3fdom_hovered__ property that
      // we set via a MutationObserver on the mirror root.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hoveredEl = (globalThis as any).__r3fdom_hovered__ as HTMLElement | undefined;
      if (hoveredEl === this._lastHoveredElement) return;
      this._lastHoveredElement = hoveredEl ?? null;

      if (!hoveredEl) {
        this._clearAllOverlays(this._hoverEntries);
        return;
      }

      const uuid = hoveredEl.getAttribute?.('data-uuid');
      if (!uuid) {
        this._clearAllOverlays(this._hoverEntries);
        return;
      }

      const obj = this._store.getObject3D(uuid);
      if (obj) {
        this.showHoverHighlight(obj);
      } else {
        this._clearAllOverlays(this._hoverEntries);
      }
    } catch {
      // Ignore errors from DevTools API
    }
  }

  // -----------------------------------------------------------------------
  // Internal: overlay cleanup
  // -----------------------------------------------------------------------

  private _removeOverlay(obj: Object3D, map: Map<Object3D, OverlayEntry>): void {
    const entry = map.get(obj);
    if (!entry) return;
    entry.overlayEl.remove();
    entry.tooltipEl.remove();
    map.delete(obj);
  }

  private _clearAllOverlays(map: Map<Object3D, OverlayEntry>): void {
    for (const entry of map.values()) {
      entry.overlayEl.remove();
      entry.tooltipEl.remove();
    }
    map.clear();
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    this.detach();
  }
}
