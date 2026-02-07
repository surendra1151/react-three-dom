import {
  BoxHelper,
  Color,
  Object3D,
  Box3,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Vector3,
} from 'three';
import type { SelectionManager } from './SelectionManager';

// ---------------------------------------------------------------------------
// Highlighter
//
// Renders a BoxHelper wireframe outline around selected objects in the scene.
// Subscribes to the SelectionManager and automatically updates when the
// selection changes. Supports customizable highlight color and can
// optionally display a label above the selected object.
// ---------------------------------------------------------------------------

/** Options for the Highlighter. */
export interface HighlighterOptions {
  /** Highlight wireframe color. Default: '#00ff88' */
  color?: string;
  /** Whether to show a label above selected objects. Default: true */
  showLabel?: boolean;
  /** Label font size in canvas pixels. Default: 48 */
  labelFontSize?: number;
  /** Label background color. Default: 'rgba(0, 0, 0, 0.7)' */
  labelBackground?: string;
  /** Label text color. Default: '#00ff88' */
  labelColor?: string;
}

/** Internal state for a single highlighted object. */
interface HighlightEntry {
  target: Object3D;
  boxHelper: BoxHelper;
  label?: Sprite;
  labelTexture?: CanvasTexture;
}

// ---------------------------------------------------------------------------
// Label texture generation
// ---------------------------------------------------------------------------

function createLabelTexture(
  text: string,
  fontSize: number,
  bgColor: string,
  textColor: string,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Measure text
  ctx.font = `bold ${fontSize}px monospace`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const padding = fontSize * 0.4;

  // Size the canvas (power-of-two friendly isn't required for sprites)
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2;

  // Background
  ctx.fillStyle = bgColor;
  const radius = fontSize * 0.25;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, radius);
  ctx.fill();

  // Text
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Highlighter class
// ---------------------------------------------------------------------------

const _box = /* @__PURE__ */ new Box3();
const _center = /* @__PURE__ */ new Vector3();

export class Highlighter {
  private _entries: Map<Object3D, HighlightEntry> = new Map();
  private _scene: Object3D | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _color: Color;
  private _showLabel: boolean;
  private _labelFontSize: number;
  private _labelBackground: string;
  private _labelColor: string;

  constructor(options: HighlighterOptions = {}) {
    this._color = new Color(options.color ?? '#00ff88');
    this._showLabel = options.showLabel ?? true;
    this._labelFontSize = options.labelFontSize ?? 48;
    this._labelBackground = options.labelBackground ?? 'rgba(0, 0, 0, 0.7)';
    this._labelColor = options.labelColor ?? '#00ff88';
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Attach the highlighter to a scene and selection manager.
   * Starts listening for selection changes.
   */
  attach(scene: Object3D, selectionManager: SelectionManager): void {
    this.detach();
    this._scene = scene;

    // Subscribe to selection changes
    this._unsubscribe = selectionManager.subscribe((selected) => {
      this._syncHighlights(selected);
    });

    // Apply initial selection
    this._syncHighlights([...selectionManager.getSelected()]);
  }

  /** Detach from the scene and clean up all highlights. */
  detach(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._removeAllHighlights();
    this._scene = null;
  }

  // -----------------------------------------------------------------------
  // Per-frame update (call from useFrame)
  // -----------------------------------------------------------------------

  /**
   * Update all active highlights. Call once per frame to keep
   * BoxHelpers in sync with moving objects.
   */
  update(): void {
    for (const entry of this._entries.values()) {
      // Update BoxHelper to follow the target
      entry.boxHelper.update();

      // Update label position above the object
      if (entry.label) {
        _box.setFromObject(entry.target);
        if (!_box.isEmpty()) {
          _box.getCenter(_center);
          const size = _box.getSize(new Vector3());
          entry.label.position.set(
            _center.x,
            _center.y + size.y / 2 + size.y * 0.15,
            _center.z,
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Manual highlight API (for programmatic use)
  // -----------------------------------------------------------------------

  /** Highlight a specific object (adds to existing highlights). */
  highlight(obj: Object3D): void {
    if (this._entries.has(obj)) return;
    this._addHighlight(obj);
  }

  /** Remove highlight from a specific object. */
  unhighlight(obj: Object3D): void {
    this._removeHighlight(obj);
  }

  /** Clear all highlights. */
  clearAll(): void {
    this._removeAllHighlights();
  }

  /** Check if an object is currently highlighted. */
  isHighlighted(obj: Object3D): boolean {
    return this._entries.has(obj);
  }

  // -----------------------------------------------------------------------
  // Internal — sync highlights with selection state
  // -----------------------------------------------------------------------

  private _syncHighlights(selected: Object3D[]): void {
    const selectedSet = new Set(selected);

    // Remove highlights for deselected objects
    for (const [obj] of this._entries) {
      if (!selectedSet.has(obj)) {
        this._removeHighlight(obj);
      }
    }

    // Add highlights for newly selected objects
    for (const obj of selected) {
      if (!this._entries.has(obj)) {
        this._addHighlight(obj);
      }
    }
  }

  private _addHighlight(obj: Object3D): void {
    if (!this._scene) return;

    // Create BoxHelper
    const boxHelper = new BoxHelper(obj, this._color);
    boxHelper.name = `__r3fdom_highlight_${obj.uuid}`;
    boxHelper.userData.__r3fdom_internal = true;
    boxHelper.raycast = () => {}; // Make non-interactive
    this._scene.add(boxHelper);

    const entry: HighlightEntry = { target: obj, boxHelper };

    // Create label sprite
    if (this._showLabel) {
      const labelText = this._getLabelText(obj);
      if (labelText) {
        const texture = createLabelTexture(
          labelText,
          this._labelFontSize,
          this._labelBackground,
          this._labelColor,
        );

        const material = new SpriteMaterial({
          map: texture,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          sizeAttenuation: true,
        });

        const sprite = new Sprite(material);
        sprite.name = `__r3fdom_label_${obj.uuid}`;
        sprite.userData.__r3fdom_internal = true;
        sprite.raycast = () => {}; // Make non-interactive

        // Scale sprite based on object size
        _box.setFromObject(obj);
        const objSize = _box.getSize(new Vector3());
        const maxDim = Math.max(objSize.x, objSize.y, objSize.z, 0.5);
        const aspect = texture.image.width / texture.image.height;
        sprite.scale.set(maxDim * 0.6 * aspect, maxDim * 0.6, 1);

        // Position above object
        _box.getCenter(_center);
        sprite.position.set(
          _center.x,
          _center.y + objSize.y / 2 + objSize.y * 0.15,
          _center.z,
        );

        this._scene.add(sprite);
        entry.label = sprite;
        entry.labelTexture = texture;
      }
    }

    this._entries.set(obj, entry);
  }

  private _removeHighlight(obj: Object3D): void {
    const entry = this._entries.get(obj);
    if (!entry) return;

    // Remove BoxHelper from scene
    if (entry.boxHelper.parent) {
      entry.boxHelper.parent.remove(entry.boxHelper);
    }
    entry.boxHelper.geometry.dispose();
    (entry.boxHelper.material as { dispose: () => void }).dispose();

    // Remove label from scene
    if (entry.label) {
      if (entry.label.parent) {
        entry.label.parent.remove(entry.label);
      }
      (entry.label.material as SpriteMaterial).dispose();
      entry.labelTexture?.dispose();
    }

    this._entries.delete(obj);
  }

  private _removeAllHighlights(): void {
    for (const obj of [...this._entries.keys()]) {
      this._removeHighlight(obj);
    }
  }

  private _getLabelText(obj: Object3D): string {
    const testId = obj.userData?.testId;
    if (testId) return testId;
    if (obj.name) return obj.name;
    return obj.type;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    this.detach();
  }
}
