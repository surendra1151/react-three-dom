// Type declarations for window.__R3F_DOM__ accessed via page.evaluate()
// This mirrors the R3FDOM interface from @react-three-dom/core but avoids
// a runtime dependency — only used for TypeScript in page.evaluate callbacks.

import type { ObjectMetadata, ObjectInspection, SceneSnapshot } from './types';

interface BridgeDiagnostics {
  version: string;
  ready: boolean;
  error?: string;
  objectCount: number;
  meshCount: number;
  groupCount: number;
  lightCount: number;
  cameraCount: number;
  materializedDomNodes: number;
  maxDomNodes: number;
  canvasWidth: number;
  canvasHeight: number;
  webglRenderer: string;
  dirtyQueueSize: number;
}

interface R3FDOM {
  _ready: boolean;
  _error?: string;
  canvasId?: string;
  getByTestId(id: string): ObjectMetadata | null;
  getByUuid(uuid: string): ObjectMetadata | null;
  getByName(name: string): ObjectMetadata[];
  getChildren(idOrUuid: string): ObjectMetadata[];
  getParent(idOrUuid: string): ObjectMetadata | null;
  getCount(): number;
  getByType(type: string): ObjectMetadata[];
  getByGeometryType(type: string): ObjectMetadata[];
  getByMaterialType(type: string): ObjectMetadata[];
  getByUserData(key: string, value?: unknown): ObjectMetadata[];
  getCountByType(type: string): number;
  getObjects(ids: string[]): Record<string, ObjectMetadata | null>;
  snapshot(): SceneSnapshot;
  inspect(idOrUuid: string, options?: { includeGeometryData?: boolean }): ObjectInspection | null;
  click(idOrUuid: string): void;
  doubleClick(idOrUuid: string): void;
  contextMenu(idOrUuid: string): void;
  hover(idOrUuid: string): void;
  unhover(): void;
  drag(idOrUuid: string, delta: { x: number; y: number; z: number }): Promise<void>;
  wheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): void;
  pointerMiss(): void;
  drawPath(
    points: Array<{ x: number; y: number; pressure?: number }>,
    options?: { stepDelayMs?: number; pointerType?: 'mouse' | 'pen' | 'touch'; clickAtEnd?: boolean },
  ): Promise<{ eventCount: number; pointCount: number }>;
  select(idOrUuid: string): void;
  clearSelection(): void;
  getSelection(): string[];
  getObject3D(idOrUuid: string): unknown;
  setInspectMode(on: boolean): void;
  sweepOrphans(): number;
  getDiagnostics(): BridgeDiagnostics;
  getCameraState(): CameraState;
  fuzzyFind(query: string, limit?: number): ObjectMetadata[];
  version: string;
}

interface CameraState {
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  target: [number, number, number];
  fov?: number;
  near: number;
  far: number;
  zoom: number;
  aspect?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

declare global {
  interface Window {
    __R3F_DOM__?: R3FDOM;
    __R3F_DOM_INSTANCES__?: Record<string, R3FDOM>;
  }
}
