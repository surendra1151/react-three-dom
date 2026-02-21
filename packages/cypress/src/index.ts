// @react-three-dom/cypress
// Cypress E2E testing SDK for React Three Fiber apps
//
// Usage in cypress/support/e2e.ts:
//   import '@react-three-dom/cypress';
//
// This auto-registers all custom commands and Chai assertions.

/// <reference types="cypress" />

import { registerCommands } from './commands';
import { registerAssertions } from './assertions';
import { registerWaiters } from './waiters';

// Auto-register on import
registerCommands();
registerAssertions();
registerWaiters();

// Re-export types for programmatic use
export type {
  ObjectMetadata,
  ObjectInspection,
  SceneSnapshot,
  SnapshotNode,
  BridgeDiagnostics,
  CameraState,
  R3FDOM,
} from './types';
export type { SceneDiff, SceneDiffChange } from './diffSnapshots';
export { diffSnapshots } from './diffSnapshots';
export { R3FReporter, registerR3FTasks } from './reporter';
