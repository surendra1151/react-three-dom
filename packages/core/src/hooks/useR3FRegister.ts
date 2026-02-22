import { useEffect, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Object3D } from 'three';

type BridgeAPI = {
  r3fRegister(o: Object3D): void;
  r3fUnregister(o: Object3D): void;
};

function getAPI(canvasId?: string): BridgeAPI | undefined {
  if (canvasId) {
    return (window as Window & { __R3F_DOM_INSTANCES__?: Record<string, BridgeAPI> })
      .__R3F_DOM_INSTANCES__?.[canvasId];
  }
  return (window as Window & { __R3F_DOM__?: BridgeAPI }).__R3F_DOM__;
}

/**
 * Registers a Three.js object with the react-three-dom bridge on mount and
 * unregisters it on unmount. Works in both `auto` and `manual` mode.
 *
 * - In `manual` mode this is the primary way to opt objects into the mirror DOM.
 * - In `auto` mode it can force-register objects excluded by a `filter`.
 * - Handles `ref.current` identity changes automatically.
 * - If the bridge isn't ready on mount, retries each frame until available.
 * - Supports multi-canvas via the optional `canvasId` parameter.
 *
 * @param ref - Ref to the Three.js object to register
 * @param canvasId - Optional canvas ID for multi-canvas setups. When omitted,
 *   uses the primary bridge (`window.__R3F_DOM__`).
 *
 * @example
 * ```tsx
 * function Wall({ geometry }) {
 *   const ref = useRef<Mesh>(null!);
 *   useR3FRegister(ref);
 *   return <mesh ref={ref} geometry={geometry} userData={{ testId: 'wall' }} />;
 * }
 *
 * // Multi-canvas
 * function Overlay() {
 *   const ref = useRef<Mesh>(null!);
 *   useR3FRegister(ref, 'overlay');
 *   return <mesh ref={ref} />;
 * }
 * ```
 */
export function useR3FRegister(
  ref: React.RefObject<Object3D | null>,
  canvasId?: string,
): void {
  const trackedObj = useRef<Object3D | null>(null);
  const canvasIdRef = useRef(canvasId);
  canvasIdRef.current = canvasId;

  const register = useCallback((obj: Object3D) => {
    const api = getAPI(canvasIdRef.current);
    if (!api) return false;
    api.r3fRegister(obj);
    trackedObj.current = obj;
    return true;
  }, []);

  const unregister = useCallback(() => {
    if (!trackedObj.current) return;
    const api = getAPI(canvasIdRef.current);
    api?.r3fUnregister(trackedObj.current);
    trackedObj.current = null;
  }, []);

  useEffect(() => {
    const obj = ref.current;
    if (obj) register(obj);
    return () => unregister();
  }, [ref, register, unregister]);

  // Per-frame: detect ref.current swaps + retry if bridge wasn't ready on mount
  useFrame(() => {
    const current = ref.current;
    if (current === trackedObj.current) return;
    unregister();
    if (current) register(current);
  });
}
