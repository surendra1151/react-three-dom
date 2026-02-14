// ---------------------------------------------------------------------------
// TypeScript declarations for @react-three-dom/cypress
// Extends Cypress.Chainable and Cypress.Assertion for full type safety.
//
// Usage: add to your cypress/support/e2e.ts:
//   import '@react-three-dom/cypress';
// ---------------------------------------------------------------------------

import type { ObjectMetadata, ObjectInspection, SceneSnapshot } from './types';
import type { SceneDiff } from './diffSnapshots';

declare global {
  namespace Cypress {
    interface Chainable {
      // ---- Debug ----
      /** Enable debug logging. Mirrors [r3f-dom:*] browser logs to Cypress command log. */
      r3fEnableDebug(): Chainable<void>;
      /** Log the full scene tree to the Cypress command log and browser console. */
      r3fLogScene(): Chainable<void>;

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
      /** Draw a freeform path on the canvas (for drawing/annotation apps). */
      r3fDrawPath(
        points: Array<{ x: number; y: number; pressure?: number }>,
        options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
      ): Chainable<{ eventCount: number; pointCount: number }>;

      // ---- Selection ----
      /** Select a 3D object (highlights in scene). */
      r3fSelect(idOrUuid: string): Chainable<void>;
      /** Clear the current selection. */
      r3fClearSelection(): Chainable<void>;

      // ---- Queries ----
      /** Get object metadata by testId or uuid. */
      r3fGetObject(idOrUuid: string): Chainable<ObjectMetadata | null>;
      /** Get all objects with the given name (object.name). */
      r3fGetByName(name: string): Chainable<ObjectMetadata[]>;
      /** Get object metadata by uuid only. */
      r3fGetByUuid(uuid: string): Chainable<ObjectMetadata | null>;
      /** Get direct children of an object by testId or uuid. */
      r3fGetChildren(idOrUuid: string): Chainable<ObjectMetadata[]>;
      /** Get parent of an object by testId or uuid. */
      r3fGetParent(idOrUuid: string): Chainable<ObjectMetadata | null>;
      /** Get the R3F canvas element (data-r3f-canvas). */
      r3fGetCanvas(): Chainable<JQuery<HTMLCanvasElement>>;
      /** Get world-space position [x, y, z] of an object. */
      r3fGetWorldPosition(idOrUuid: string): Chainable<[number, number, number] | null>;
      /** Compare two scene snapshots (added, removed, changed). */
      r3fDiffSnapshots(before: SceneSnapshot, after: SceneSnapshot): Chainable<SceneDiff>;
      /** Run an action and return { added, removed } object count change. */
      r3fTrackObjectCount(action: () => Cypress.Chainable<unknown>): Chainable<{ added: number; removed: number }>;
      /** Get heavy inspection data (Tier 2) by testId or uuid. */
      r3fInspect(idOrUuid: string): Chainable<ObjectInspection | null>;
      /** Take a full scene snapshot. */
      r3fSnapshot(): Chainable<SceneSnapshot>;
      /** Get the total number of tracked objects. */
      r3fGetCount(): Chainable<number>;

      // ---- BIM/CAD queries ----
      /** Get all objects of a given Three.js type (e.g. "Mesh", "Group", "Line"). */
      r3fGetByType(type: string): Chainable<ObjectMetadata[]>;
      /** Get all objects with a given geometry type (e.g. "BoxGeometry"). */
      r3fGetByGeometryType(type: string): Chainable<ObjectMetadata[]>;
      /** Get all objects with a given material type (e.g. "MeshStandardMaterial"). */
      r3fGetByMaterialType(type: string): Chainable<ObjectMetadata[]>;
      /** Get objects that have a specific userData key (and optionally matching value). */
      r3fGetByUserData(key: string, value?: unknown): Chainable<ObjectMetadata[]>;
      /** Count objects of a given Three.js type. */
      r3fGetCountByType(type: string): Chainable<number>;
      /** Batch lookup: get metadata for multiple objects by testId or uuid. */
      r3fGetObjects(ids: string[]): Chainable<Record<string, ObjectMetadata | null>>;

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
      /** Wait until a specific object (by testId or uuid) exists in the scene. */
      r3fWaitForObject(
        idOrUuid: string,
        options?: {
          bridgeTimeout?: number;
          objectTimeout?: number;
          pollIntervalMs?: number;
        },
      ): Chainable<void>;
      /** Wait until new object(s) appear in the scene (for drawing/annotation apps). */
      r3fWaitForNewObject(options?: {
        type?: string;
        nameContains?: string;
        pollIntervalMs?: number;
        timeout?: number;
      }): Chainable<{ newObjects: ObjectMetadata[]; newUuids: string[]; count: number }>;
      /** Wait until an object (by testId or uuid) is no longer in the scene. */
      r3fWaitForObjectRemoved(
        idOrUuid: string,
        options?: { bridgeTimeout?: number; pollIntervalMs?: number; timeout?: number },
      ): Chainable<void>;
    }

    interface Assertion {
      // ---- Tier 1: Metadata-based assertions (cheap) ----
      /** Assert that a 3D object with the given testId/uuid exists. */
      r3fExist(idOrUuid: string): Assertion;
      /** Assert that a 3D object is visible. */
      r3fVisible(idOrUuid: string): Assertion;
      /** Assert object position within tolerance. */
      r3fPosition(idOrUuid: string, expected: [number, number, number], tolerance?: number): Assertion;
      /** Assert object rotation (Euler radians) within tolerance. */
      r3fRotation(idOrUuid: string, expected: [number, number, number], tolerance?: number): Assertion;
      /** Assert object scale within tolerance. */
      r3fScale(idOrUuid: string, expected: [number, number, number], tolerance?: number): Assertion;
      /** Assert object type (Mesh, Group, Line, Points, etc.). */
      r3fType(idOrUuid: string, expectedType: string): Assertion;
      /** Assert object name. */
      r3fName(idOrUuid: string, expectedName: string): Assertion;
      /** Assert geometry type (BoxGeometry, PlaneGeometry, BufferGeometry, etc.). */
      r3fGeometryType(idOrUuid: string, expectedGeoType: string): Assertion;
      /** Assert material type (MeshStandardMaterial, ShaderMaterial, etc.). */
      r3fMaterialType(idOrUuid: string, expectedMatType: string): Assertion;
      /** Assert number of direct children. */
      r3fChildCount(idOrUuid: string, expectedCount: number): Assertion;
      /** Assert object's parent by testId, uuid, or name. */
      r3fParent(idOrUuid: string, expectedParent: string): Assertion;
      /** Assert InstancedMesh instance count. */
      r3fInstanceCount(idOrUuid: string, expectedCount: number): Assertion;

      // ---- Tier 2: Inspection-based assertions (heavier) ----
      /** Assert that a 3D object is in the camera frustum. */
      r3fInFrustum(idOrUuid: string): Assertion;
      /** Assert world-space bounding box within tolerance. */
      r3fBounds(
        idOrUuid: string,
        expected: { min: [number, number, number]; max: [number, number, number] },
        tolerance?: number,
      ): Assertion;
      /** Assert material color (hex string, e.g. '#ff0000'). */
      r3fColor(idOrUuid: string, expectedColor: string): Assertion;
      /** Assert material opacity (0–1) within tolerance. */
      r3fOpacity(idOrUuid: string, expectedOpacity: number, tolerance?: number): Assertion;
      /** Assert material.transparent === true. */
      r3fTransparent(idOrUuid: string): Assertion;
      /** Assert geometry vertex count. */
      r3fVertexCount(idOrUuid: string, expectedCount: number): Assertion;
      /** Assert geometry triangle count. */
      r3fTriangleCount(idOrUuid: string, expectedCount: number): Assertion;
      /** Assert a specific key (and optionally value) in userData. */
      r3fUserData(idOrUuid: string, key: string, expectedValue?: unknown): Assertion;
      /** Assert material has a map texture (optionally by name). */
      r3fMapTexture(idOrUuid: string, expectedMapName?: string): Assertion;

      // ---- Scene-level assertions ----
      /** Assert total object count in the scene. */
      r3fObjectCount(expected: number): Assertion;
      /** Assert total object count is greater than a minimum. */
      r3fObjectCountGreaterThan(min: number): Assertion;
      /** Assert count of objects of a specific type. */
      r3fCountByType(type: string, expected: number): Assertion;
      /** Assert total triangle count across all meshes. */
      r3fTotalTriangleCount(expected: number): Assertion;
      /** Assert total triangle count is less than a maximum (performance budget). */
      r3fTotalTriangleCountLessThan(max: number): Assertion;
    }
  }
}
