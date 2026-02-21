/**
 * @module InspectController
 *
 * Chrome DevTools-style inspect mode for 3D scenes. When enabled, intercepts
 * mousemove/click on the WebGL canvas, raycasts to identify the object under
 * the cursor, drives hover/selection highlights, and sets a global reference
 * so the DevTools extension can reveal the corresponding mirror DOM node.
 * Zero overhead when disabled — no listeners attached.
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

// ---------------------------------------------------------------------------
// InspectController
//
// When inspect mode is enabled, intercepts mousemove/click on the WebGL
// canvas and uses raycasting to identify the frontmost 3D object under the
// cursor. Drives the Highlighter for hover/selection visuals and sets
// window.__r3fdom_selected_element__ so the DevTools extension can reveal
// the corresponding mirror DOM node in the Elements tab.
//
// When inspect mode is disabled, zero listeners are attached to the canvas
// and the user's application is completely untouched.
// ---------------------------------------------------------------------------

const RAYCAST_THROTTLE_MS = 50;
const HOVER_REVEAL_DEBOUNCE_MS = 300;

/**
 * Manages the inspect-mode lifecycle: attaches/detaches canvas event listeners,
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

  private _boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private _boundClick: ((e: MouseEvent) => void) | null = null;
  private _boundContextMenu: ((e: MouseEvent) => void) | null = null;

  private _savedCursor = '';

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

  /** Activate inspect mode — attaches canvas listeners and sets crosshair cursor. */
  enable(): void {
    if (this._active) return;
    this._active = true;

    const canvas = this._renderer.domElement;
    this._savedCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';

    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundClick = this._onClick.bind(this);
    this._boundContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('mousemove', this._boundMouseMove);
    canvas.addEventListener('click', this._boundClick);
    canvas.addEventListener('contextmenu', this._boundContextMenu);

    r3fLog('inspect', 'Inspect mode enabled — hover to highlight, click to select');
  }

  /** Deactivate inspect mode — removes all canvas listeners and clears hover state. */
  disable(): void {
    if (!this._active) return;
    this._active = false;

    const canvas = this._renderer.domElement;
    canvas.style.cursor = this._savedCursor;

    if (this._boundMouseMove) canvas.removeEventListener('mousemove', this._boundMouseMove);
    if (this._boundClick) canvas.removeEventListener('click', this._boundClick);
    if (this._boundContextMenu) canvas.removeEventListener('contextmenu', this._boundContextMenu);

    this._boundMouseMove = null;
    this._boundClick = null;
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

  private _raycastAtMouse(e: MouseEvent): Object3D | null {
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

  private _onMouseMove(e: MouseEvent): void {
    const now = performance.now();
    if (now - this._lastRaycastTime < RAYCAST_THROTTLE_MS) return;
    this._lastRaycastTime = now;

    const hit = this._raycastAtMouse(e);

    if (!hit) {
      if (this._hoveredObject) {
        this._hoveredObject = null;
        this._highlighter.clearHoverHighlight();
        this._cancelHoverReveal();
      }
      return;
    }

    // Use the exact mesh under the cursor — no group promotion on hover
    if (hit === this._hoveredObject) return;

    this._hoveredObject = hit;
    this._highlighter.showHoverHighlight(hit);
    this._scheduleHoverReveal(hit);
  }

  /**
   * After hovering an object for HOVER_REVEAL_DEBOUNCE_MS, auto-reveal its
   * mirror element in the Elements tab. This gives the user a Chrome-picker-like
   * experience: hover over a 3D object → Elements tab scrolls to it.
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

  private _onClick(e: MouseEvent): void {
    e.stopPropagation();

    // Force a fresh raycast on click (ignore throttle)
    const hit = this._raycastAtMouse(e);

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
