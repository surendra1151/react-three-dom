// Type declarations for window.__R3F_DOM__ accessed via page.evaluate()
// This mirrors the R3FDOM interface from @react-three-dom/core but avoids
// a runtime dependency — only used for TypeScript in page.evaluate callbacks.

import type { ObjectMetadata, ObjectInspection, SceneSnapshot } from './types';

interface R3FDOM {
  _ready: boolean;
  _error?: string;
  getByTestId(id: string): ObjectMetadata | null;
  getByUuid(uuid: string): ObjectMetadata | null;
  getByName(name: string): ObjectMetadata[];
  getCount(): number;
  snapshot(): SceneSnapshot;
  inspect(idOrUuid: string): ObjectInspection | null;
  click(idOrUuid: string): void;
  doubleClick(idOrUuid: string): void;
  contextMenu(idOrUuid: string): void;
  hover(idOrUuid: string): void;
  drag(idOrUuid: string, delta: { x: number; y: number; z: number }): Promise<void>;
  wheel(idOrUuid: string, options?: { deltaY?: number; deltaX?: number }): void;
  pointerMiss(): void;
  select(idOrUuid: string): void;
  clearSelection(): void;
  getObject3D(idOrUuid: string): unknown;
  version: string;
}

declare global {
  interface Window {
    __R3F_DOM__?: R3FDOM;
  }
}
