/**
 * @module InspectController
 *
 * Chrome DevTools-style inspect mode for 3D scenes. When enabled, places a
 * transparent overlay on top of the WebGL canvas that intercepts all pointer
 * events (preventing R3F's event system and camera controls from consuming
 * them), raycasts to identify the object under the cursor, drives
 * hover/selection highlights, and sets a global reference so the DevTools
 * extension can reveal the corresponding mirror DOM node.
 * Zero overhead when disabled — no overlay, no listeners.
 */
import {
  Object3D,
  Camera,
  WebGLRenderer,
} from 'three';
import type { SelectionManager } from './SelectionManager';
import type { Highlighter } from './Highlighter';
import type { RaycastAccelerator } from './RaycastAccelerator';
import type { DomMirror } from '../mirror/DomMirror';
import { resolveSelectionDisplayTarget } from './selectionDisplayTarget';
import { r3fLog } from '../debug';

const RAYCAST_THROTTLE_MS = 50;
const HOVER_REVEAL_DEBOUNCE_MS = 300;

/**
 * Manages the inspect-mode lifecycle: creates/removes an overlay div,
 * throttles raycasts, and coordinates Highlighter + SelectionManager + DomMirror.
 */
export class InspectController {
  private _active = false;
  private _camera: Camera;
  private _renderer: WebGLRenderer;
  private _selectionManager: SelectionManager;
  private _highlighter: Highlighter;
  private _raycastAccelerator: RaycastAccelerator;
  private _mirror: DomMirror;
  private _store: { getObject3D(uuid: string): Object3D | null };

  private _lastRaycastTime = 0;
  private _hoveredObject: Object3D | null = null;
  private _hoverRevealTimer: ReturnType<typeof setTimeout> | null = null;

  private _overlay: HTMLDivElement | null = null;
  private _boundPointerMove: ((e: PointerEvent) => void) | null = null;
  private _boundPointerDown: ((e: PointerEvent) => void) | null = null;
  private _boundContextMenu: ((e: MouseEvent) => void) | null = null;

  constructor(opts: {
    camera: Camera;
    renderer: WebGLRenderer;
    selectionManager: SelectionManager;
    highlighter: Highlighter;
    raycastAccelerator: RaycastAccelerator;
    mirror: DomMirror;
    store: { getObject3D(uuid: string): Object3D | null };
  }) {
    this._camera = opts.camera;
    this._renderer = opts.renderer;
    this._selectionManager = opts.selectionManager;
    this._highlighter = opts.highlighter;
    this._raycastAccelerator = opts.raycastAccelerator;
    this._mirror = opts.mirror;
    this._store = opts.store;
  }

  get active(): boolean {
    return this._active;
  }

  /** Update the camera reference (e.g. after a camera switch). */
  updateCamera(camera: Camera): void {
    this._camera = camera;
  }

  // -----------------------------------------------------------------------
  // Enable / disable
  // -----------------------------------------------------------------------

  /** Activate inspect mode — creates overlay on top of canvas. */
  enable(): void {
    if (this._active) return;
    this._active = true;

    const canvas = this._renderer.domElement;
    const parent = canvas.parentElement;
    if (!parent) return;

    // Create a transparent overlay that sits on top of the canvas and
    // intercepts all pointer events, preventing R3F's event system and
    // camera controls (OrbitControls etc.) from consuming them.
    const overlay = document.createElement('div');
    overlay.dataset.r3fdomInspect = 'true';
    overlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'z-index:999999',
      'cursor:crosshair',
      'background:transparent',
    ].join(';');

    // Ensure parent is positioned so absolute overlay works
    const parentPos = getComputedStyle(parent).position;
    if (parentPos === 'static') {
      parent.style.position = 'relative';
    }

    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundContextMenu = (e: MouseEvent) => e.preventDefault();

    overlay.addEventListener('pointermove', this._boundPointerMove);
    overlay.addEventListener('pointerdown', this._boundPointerDown);
    overlay.addEventListener('contextmenu', this._boundContextMenu);

    parent.appendChild(overlay);
    this._overlay = overlay;

    r3fLog('inspect', 'Inspect mode enabled — hover to highlight, click to select');
  }

  /** Deactivate inspect mode — removes overlay and clears hover state. */
  disable(): void {
    if (!this._active) return;
    this._active = false;

    if (this._overlay) {
      if (this._boundPointerMove) this._overlay.removeEventListener('pointermove', this._boundPointerMove);
      if (this._boundPointerDown) this._overlay.removeEventListener('pointerdown', this._boundPointerDown);
      if (this._boundContextMenu) this._overlay.removeEventListener('contextmenu', this._boundContextMenu);
      this._overlay.remove();
      this._overlay = null;
    }

    this._boundPointerMove = null;
    this._boundPointerDown = null;
    this._boundContextMenu = null;

    this._hoveredObject = null;
    this._cancelHoverReveal();
    this._highlighter.clearHoverHighlight();

    window.__r3fdom_selected_element__ = null;

    r3fLog('inspect', 'InspectController disabled');
  }

  /** Disable and release all resources. */
  dispose(): void {
    this.disable();
  }

  // -----------------------------------------------------------------------
  // Raycasting (delegated to RaycastAccelerator)
  // -----------------------------------------------------------------------

  private _raycastFromEvent(e: MouseEvent): Object3D | null {
    return this._raycastAccelerator.raycastAtMouse(
      e,
      this._camera,
      this._renderer.domElement,
    );
  }

  /**
   * Resolve a raw raycast hit to the logical selection target.
   * Walks up to find the best Group parent if applicable.
   */
  private _resolveTarget(hit: Object3D): Object3D | null {
    const displayUuid = resolveSelectionDisplayTarget(
      (id) => this._store.getObject3D(id),
      hit.uuid,
    );
    if (!displayUuid) return hit;
    return this._store.getObject3D(displayUuid) ?? hit;
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  private _onPointerMove(e: PointerEvent): void {
    e.stopPropagation();
    e.preventDefault();

    const now = performance.now();
    if (now - this._lastRaycastTime < RAYCAST_THROTTLE_MS) return;
    this._lastRaycastTime = now;

    const hit = this._raycastFromEvent(e);

    if (!hit) {
      if (this._hoveredObject) {
        this._hoveredObject = null;
        this._highlighter.clearHoverHighlight();
        this._cancelHoverReveal();
      }
      return;
    }

    if (hit === this._hoveredObject) return;

    this._hoveredObject = hit;
    this._highlighter.showHoverHighlight(hit);
    this._scheduleHoverReveal(hit);
  }

  /**
   * After hovering an object for HOVER_REVEAL_DEBOUNCE_MS, auto-reveal its
   * mirror element in the Elements tab.
   */
  private _scheduleHoverReveal(target: Object3D): void {
    this._cancelHoverReveal();
    this._hoverRevealTimer = setTimeout(() => {
      const mirrorEl = this._mirror.getOrMaterialize(target.uuid);
      if (mirrorEl) {
        window.__r3fdom_selected_element__ = mirrorEl;
      }
    }, HOVER_REVEAL_DEBOUNCE_MS);
  }

  private _cancelHoverReveal(): void {
    if (this._hoverRevealTimer) {
      clearTimeout(this._hoverRevealTimer);
      this._hoverRevealTimer = null;
    }
  }

  private _onPointerDown(e: PointerEvent): void {
    e.stopPropagation();
    e.preventDefault();

    const hit = this._raycastFromEvent(e);

    if (!hit) {
      this._selectionManager.clearSelection();
      return;
    }

    const target = this._resolveTarget(hit);
    if (!target) return;

    this._selectionManager.select(target);

    const mirrorEl = this._mirror.getOrMaterialize(target.uuid);
    if (mirrorEl) {
      window.__r3fdom_selected_element__ = mirrorEl;
    }

    r3fLog('inspect', 'Object selected via canvas click', {
      uuid: target.uuid.slice(0, 8),
      name: target.name || '(unnamed)',
      type: target.type,
    });
  }
}
