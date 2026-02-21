/**
 * @module resolve
 *
 * Shared resolution helpers for all interaction modules. Caches references
 * to the current ObjectStore, Camera, WebGLRenderer, and canvas size (set
 * by ThreeDom each frame) so interaction functions can resolve objects and
 * access rendering state without prop-drilling.
 */
import type { Object3D, Camera, WebGLRenderer } from 'three';
import type { ObjectStore } from '../store/ObjectStore';
import type { CanvasSize } from './projection';

// ---------------------------------------------------------------------------
// Shared resolution helpers for interaction modules
// ---------------------------------------------------------------------------

/** Cached references to the current R3F state (set by ThreeDom). */
let _store: ObjectStore | null = null;
let _camera: Camera | null = null;
let _gl: WebGLRenderer | null = null;
let _size: CanvasSize | null = null;

/**
 * Set the current R3F state references. Called by ThreeDom during setup
 * and on every frame to keep camera/size current.
 */
export function setInteractionState(
  store: ObjectStore,
  camera: Camera,
  gl: WebGLRenderer,
  size: CanvasSize,
): void {
  _store = store;
  _camera = camera;
  _gl = gl;
  _size = size;
}

/** Clear all interaction state (called on cleanup). */
export function clearInteractionState(): void {
  _store = null;
  _camera = null;
  _gl = null;
  _size = null;
}

/** Get the current store, or throw if not initialized. */
export function getStore(): ObjectStore {
  if (!_store) {
    throw new Error(
      '[react-three-dom] Interaction state not initialized. Is <ThreeDom> mounted?',
    );
  }
  return _store;
}

/** Get the current camera, or throw. */
export function getCamera(): Camera {
  if (!_camera) {
    throw new Error(
      '[react-three-dom] Camera not available. Is <ThreeDom> mounted?',
    );
  }
  return _camera;
}

/** Get the current WebGL renderer, or throw. */
export function getRenderer(): WebGLRenderer {
  if (!_gl) {
    throw new Error(
      '[react-three-dom] Renderer not available. Is <ThreeDom> mounted?',
    );
  }
  return _gl;
}

/** Get the current canvas size, or throw. */
export function getCanvasSize(): CanvasSize {
  if (!_size) {
    throw new Error(
      '[react-three-dom] Canvas size not available. Is <ThreeDom> mounted?',
    );
  }
  return _size;
}

/**
 * Resolve a testId or uuid to a live Object3D reference.
 * Throws a descriptive error if the object is not found.
 */
export function resolveObject(idOrUuid: string): Object3D {
  const store = getStore();
  const obj = store.getObject3D(idOrUuid);
  if (!obj) {
    throw new Error(
      `[react-three-dom] Object "${idOrUuid}" not found. ` +
      `Check that the object has userData.testId="${idOrUuid}" or uuid="${idOrUuid}".`,
    );
  }
  return obj;
}
