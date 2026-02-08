// ---------------------------------------------------------------------------
// TypeScript declarations for @react-three-dom/cypress
// Extends Cypress.Chainable and Cypress.Assertion for full type safety.
//
// Usage: add to your cypress/support/e2e.ts:
//   import '@react-three-dom/cypress';
// ---------------------------------------------------------------------------

import type { ObjectMetadata, ObjectInspection, SceneSnapshot } from './types';

declare global {
  namespace Cypress {
    interface Chainable {
      // ---- Interactions ----
      /** Click a 3D object by testId or uuid. */
      r3fClick(idOrUuid: string): Chainable<void>;
      /** Double-click a 3D object by testId or uuid. */
      r3fDoubleClick(idOrUuid: string): Chainable<void>;
      /** Right-click / context-menu a 3D object by testId or uuid. */
      r3fContextMenu(idOrUuid: string): Chainable<void>;
      /** Hover over a 3D object by testId or uuid. */
      r3fHover(idOrUuid: string): Chainable<void>;
      /** Drag a 3D object with a world-space delta vector. */
      r3fDrag(idOrUuid: string, delta: { x: number; y: number; z: number }): Chainable<void>;
      /** Dispatch a wheel/scroll event on a 3D object. */
      r3fWheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): Chainable<void>;
      /** Click empty space to trigger onPointerMissed handlers. */
      r3fPointerMiss(): Chainable<void>;

      // ---- Selection ----
      /** Select a 3D object (highlights in scene). */
      r3fSelect(idOrUuid: string): Chainable<void>;
      /** Clear the current selection. */
      r3fClearSelection(): Chainable<void>;

      // ---- Queries ----
      /** Get object metadata by testId or uuid. */
      r3fGetObject(idOrUuid: string): Chainable<ObjectMetadata | null>;
      /** Get heavy inspection data (Tier 2) by testId or uuid. */
      r3fInspect(idOrUuid: string): Chainable<ObjectInspection | null>;
      /** Take a full scene snapshot. */
      r3fSnapshot(): Chainable<SceneSnapshot>;
      /** Get the total number of tracked objects. */
      r3fGetCount(): Chainable<number>;

      // ---- Waiters ----
      /** Wait until the scene is ready (bridge available, object count stable). */
      r3fWaitForSceneReady(options?: {
        stableChecks?: number;
        pollIntervalMs?: number;
        timeout?: number;
      }): Chainable<void>;
      /** Wait until no property changes for N consecutive polls. */
      r3fWaitForIdle(options?: {
        idleChecks?: number;
        pollIntervalMs?: number;
        timeout?: number;
      }): Chainable<void>;
    }

    interface Assertion {
      /** Assert that a 3D object with the given testId/uuid exists. */
      r3fExist(idOrUuid: string): Assertion;
      /** Assert that a 3D object is visible. */
      r3fVisible(idOrUuid: string): Assertion;
      /** Assert that a 3D object is in the camera frustum. */
      r3fInFrustum(idOrUuid: string): Assertion;
      /** Assert object position within tolerance. */
      r3fPosition(
        idOrUuid: string,
        expected: [number, number, number],
        tolerance?: number,
      ): Assertion;
      /** Assert InstancedMesh instance count. */
      r3fInstanceCount(idOrUuid: string, expectedCount: number): Assertion;
      /** Assert world-space bounding box within tolerance. */
      r3fBounds(
        idOrUuid: string,
        expected: { min: [number, number, number]; max: [number, number, number] },
        tolerance?: number,
      ): Assertion;
    }
  }
}
