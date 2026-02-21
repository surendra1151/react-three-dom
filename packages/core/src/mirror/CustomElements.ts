/**
 * @module CustomElements
 *
 * Defines and registers the custom HTML elements (<three-scene>, <three-mesh>,
 * <three-light>, etc.) used by DomMirror to represent Three.js objects in the
 * DOM. The ThreeElement base class exposes interactive properties (metadata,
 * inspect, object3D) accessible from the DevTools console via `$0.metadata`.
 */
import type { Object3D } from 'three';
import type { ObjectMetadata, ObjectInspection } from '../types';
import type { ObjectStore } from '../store/ObjectStore';

// ---------------------------------------------------------------------------
// Tag mapping: Three.js type → custom element tag name
// ---------------------------------------------------------------------------

/**
 * Maps Three.js object types to custom element tag names.
 * Multiple Three.js types can map to the same tag.
 */
export const TAG_MAP: Record<string, string> = {
  // Scenes
  Scene: 'three-scene',

  // Groups / containers
  Group: 'three-group',
  LOD: 'three-group',
  Bone: 'three-group',

  // Meshes
  Mesh: 'three-mesh',
  SkinnedMesh: 'three-mesh',
  InstancedMesh: 'three-mesh',
  LineSegments: 'three-mesh',
  Line: 'three-mesh',
  LineLoop: 'three-mesh',
  Points: 'three-mesh',
  Sprite: 'three-mesh',

  // Lights
  AmbientLight: 'three-light',
  DirectionalLight: 'three-light',
  HemisphereLight: 'three-light',
  PointLight: 'three-light',
  RectAreaLight: 'three-light',
  SpotLight: 'three-light',
  LightProbe: 'three-light',

  // Cameras
  PerspectiveCamera: 'three-camera',
  OrthographicCamera: 'three-camera',
  ArrayCamera: 'three-camera',
  CubeCamera: 'three-camera',

  // Helpers (map to object as fallback)
  BoxHelper: 'three-object',
  ArrowHelper: 'three-object',
  AxesHelper: 'three-object',
  GridHelper: 'three-object',
  SkeletonHelper: 'three-object',
};

/** All unique tag names that need to be registered. */
const ALL_TAGS = [
  'three-scene',
  'three-group',
  'three-mesh',
  'three-light',
  'three-camera',
  'three-object',
] as const;

export type ThreeTagName = (typeof ALL_TAGS)[number];

/** Default fallback tag for any Object3D type not in TAG_MAP. */
const DEFAULT_TAG: ThreeTagName = 'three-object';

/**
 * Get the custom element tag name for a Three.js object type.
 */
export function getTagForType(type: string): ThreeTagName {
  return (TAG_MAP[type] as ThreeTagName) ?? DEFAULT_TAG;
}

// ---------------------------------------------------------------------------
// Internal: reference to the store (set once during ensureCustomElements)
// ---------------------------------------------------------------------------

let _store: ObjectStore | null = null;

/**
 * Set the ObjectStore reference that custom elements use for lookups.
 * Must be called before any custom element properties/methods are used.
 */
export function setElementStore(store: ObjectStore): void {
  _store = store;
}

// ---------------------------------------------------------------------------
// ThreeElement: base class for all custom elements
// ---------------------------------------------------------------------------

/**
 * Base custom element class for the DOM mirror.
 * Provides interactive properties and methods accessible via DevTools console.
 *
 * Usage in DevTools after selecting a <three-mesh> in the Elements panel:
 *   $0.metadata     → Tier 1 cached metadata (instant)
 *   $0.inspect()    → Tier 2 heavy inspection (reads live Three.js object)
 *   $0.object3D     → raw THREE.Object3D reference
 *   $0.position     → [x, y, z] shortcut
 *   $0.bounds       → { min, max } shortcut
 *   $0.click()      → trigger deterministic click
 *   $0.hover()      → trigger deterministic hover
 */
export class ThreeElement extends HTMLElement {
  // -------------------------------------------------------------------------
  // Tier 1: Lightweight cached metadata (always available)
  // -------------------------------------------------------------------------

  /**
   * Returns the Tier 1 cached metadata for this object.
   * Instant, no computation. Returns null if the element is not linked.
   */
  get metadata(): ObjectMetadata | null {
    const uuid = this.dataset.uuid;
    if (!uuid || !_store) return null;
    return _store.getByUuid(uuid);
  }

  // -------------------------------------------------------------------------
  // Tier 2: On-demand heavy inspection (reads live Three.js object)
  // -------------------------------------------------------------------------

  /**
   * Performs a full inspection of the linked Three.js object.
   * Reads geometry buffers, material properties, world bounds, etc.
   * Cost: 0.1–2ms depending on geometry complexity.
   */
  inspect(): ObjectInspection | null {
    const uuid = this.dataset.uuid;
    if (!uuid || !_store) return null;
    return _store.inspect(uuid);
  }

  // -------------------------------------------------------------------------
  // Raw Three.js object reference
  // -------------------------------------------------------------------------

  /**
   * Returns the raw Three.js Object3D linked to this DOM element.
   * Allows direct access to any Three.js property or method.
   */
  get object3D(): Object3D | null {
    const uuid = this.dataset.uuid;
    if (!uuid || !_store) return null;
    return _store.getObject3D(uuid);
  }

  // -------------------------------------------------------------------------
  // Convenience shortcuts (read from Tier 1 metadata)
  // -------------------------------------------------------------------------

  /**
   * Local position as [x, y, z].
   */
  get position(): [number, number, number] | null {
    return this.metadata?.position ?? null;
  }

  /**
   * Local euler rotation as [x, y, z] in radians.
   */
  get rotation(): [number, number, number] | null {
    return this.metadata?.rotation ?? null;
  }

  /**
   * Local scale as [x, y, z].
   */
  get scale(): [number, number, number] | null {
    return this.metadata?.scale ?? null;
  }

  /**
   * Whether the object is visible (does not check parent chain).
   */
  get visible(): boolean {
    return this.metadata?.visible ?? false;
  }

  /**
   * The testId from userData.testId, if set.
   */
  get testId(): string | undefined {
    return this.metadata?.testId;
  }

  /**
   * World-space bounding box. Computed on-demand (Tier 2).
   */
  get bounds(): { min: [number, number, number]; max: [number, number, number] } | null {
    const inspection = this.inspect();
    return inspection?.bounds ?? null;
  }

  // -------------------------------------------------------------------------
  // Interaction methods
  // -------------------------------------------------------------------------

  /**
   * Trigger a deterministic click on the linked 3D object.
   * Projects the object center to screen coordinates and dispatches pointer events.
   */
  click(): void {
    const uuid = this.dataset.uuid;
    if (!uuid) {
      console.warn('[react-three-dom] Cannot click: element has no data-uuid');
      return;
    }
    if (typeof window.__R3F_DOM__?.click === 'function') {
      window.__R3F_DOM__.click(uuid);
    } else {
      console.warn('[react-three-dom] Cannot click: bridge API not initialized');
    }
  }

  /**
   * Trigger a deterministic hover on the linked 3D object.
   */
  hover(): void {
    const uuid = this.dataset.uuid;
    if (!uuid) {
      console.warn('[react-three-dom] Cannot hover: element has no data-uuid');
      return;
    }
    if (typeof window.__R3F_DOM__?.hover === 'function') {
      window.__R3F_DOM__.hover(uuid);
    } else {
      console.warn('[react-three-dom] Cannot hover: bridge API not initialized');
    }
  }

  // -------------------------------------------------------------------------
  // Console-friendly output
  // -------------------------------------------------------------------------

  /**
   * Returns a readable string representation for console output.
   */
  override toString(): string {
    const tag = this.tagName.toLowerCase();
    const name = this.dataset.name ? ` name="${this.dataset.name}"` : '';
    const testId = this.dataset.testId ? ` testId="${this.dataset.testId}"` : '';
    const type = this.dataset.type ? ` type="${this.dataset.type}"` : '';
    return `<${tag}${name}${testId}${type}>`;
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let _registered = false;

/**
 * Register all custom elements (<three-scene>, <three-mesh>, etc.).
 * Safe to call multiple times — only registers once.
 *
 * @param store - The ObjectStore instance for element property lookups
 */
export function ensureCustomElements(store: ObjectStore): void {
  if (_registered) return;

  // Check if we're in a browser environment
  if (typeof customElements === 'undefined') return;

  _store = store;

  for (const tag of ALL_TAGS) {
    if (!customElements.get(tag)) {
      // Each tag gets its own class so instanceof checks work
      // and DevTools shows distinct element types
      const elementClass = class extends ThreeElement {};
      // Set displayName for debugging
      Object.defineProperty(elementClass, 'name', { value: `ThreeElement_${tag}` });
      customElements.define(tag, elementClass);
    }
  }

  _registered = true;
}

/**
 * Check if custom elements have been registered.
 */
export function isRegistered(): boolean {
  return _registered;
}
