/**
 * @module SelectionManager
 *
 * Lightweight selection state manager for 3D objects. Supports single and
 * multi-selection, notifies listeners on change so Highlighter and the
 * devtools inspector panel can react. Decoupled from rendering — purely
 * manages which Object3D references are "selected".
 */
import type { Object3D } from 'three';

// ---------------------------------------------------------------------------
// SelectionManager
//
// Manages the currently selected/highlighted object(s) in the scene.
// Supports single selection (click to select) and multi-selection.
// Notifies listeners when the selection changes so the Highlighter
// can update visuals and the Inspector can update its UI.
// ---------------------------------------------------------------------------

export type SelectionListener = (selected: Object3D[]) => void;

/**
 * Tracks the set of currently selected Object3D instances and notifies
 * subscribers when the selection changes.
 */
export class SelectionManager {
  /** Currently selected objects (ordered by selection time). */
  private _selected: Object3D[] = [];

  /** Listeners notified on selection change. */
  private _listeners: SelectionListener[] = [];

  // -----------------------------------------------------------------------
  // Selection API
  // -----------------------------------------------------------------------

  /** Select a single object (clears previous selection). */
  select(obj: Object3D): void {
    if (this._selected.length === 1 && this._selected[0] === obj) return;
    this._selected = [obj];
    this._notify();
  }

  /** Add an object to the current selection (multi-select). */
  addToSelection(obj: Object3D): void {
    if (this._selected.includes(obj)) return;
    this._selected.push(obj);
    this._notify();
  }

  /** Remove an object from the selection. */
  removeFromSelection(obj: Object3D): void {
    const idx = this._selected.indexOf(obj);
    if (idx === -1) return;
    this._selected.splice(idx, 1);
    this._notify();
  }

  /** Toggle an object in/out of the selection. */
  toggleSelection(obj: Object3D): void {
    if (this._selected.includes(obj)) {
      this.removeFromSelection(obj);
    } else {
      this.addToSelection(obj);
    }
  }

  /** Clear all selections. */
  clearSelection(): void {
    if (this._selected.length === 0) return;
    this._selected = [];
    this._notify();
  }

  /** Get the currently selected objects. */
  getSelected(): readonly Object3D[] {
    return this._selected;
  }

  /** Get the primary (first) selected object, or null. */
  getPrimary(): Object3D | null {
    return this._selected[0] ?? null;
  }

  /** Check if an object is selected. */
  isSelected(obj: Object3D): boolean {
    return this._selected.includes(obj);
  }

  /** Number of selected objects. */
  get count(): number {
    return this._selected.length;
  }

  // -----------------------------------------------------------------------
  // Event system
  // -----------------------------------------------------------------------

  /** Subscribe to selection changes. Returns unsubscribe function. */
  subscribe(listener: SelectionListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  private _notify(): void {
    const snapshot = [...this._selected];
    for (const listener of this._listeners) {
      listener(snapshot);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    this._selected = [];
    this._listeners = [];
  }
}
