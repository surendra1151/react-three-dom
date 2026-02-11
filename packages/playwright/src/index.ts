// @react-three-dom/playwright
// Playwright E2E testing SDK for React Three Fiber apps

// The main entry point — import { test, expect } from '@react-three-dom/playwright'
export { test, R3FFixture, createR3FTest, type R3FFixtureOptions } from './fixtures';
export { expect } from './assertions';

// Individual interaction functions (for advanced usage)
export {
  click,
  doubleClick,
  contextMenu,
  hover,
  drag,
  wheel,
  pointerMiss,
} from './interactions';

// Waiter utilities
export { waitForSceneReady, waitForIdle, waitForObject } from './waiters';
export type {
  WaitForSceneReadyOptions,
  WaitForIdleOptions,
  WaitForObjectOptions,
} from './waiters';

// Re-exported types for convenience
export type {
  ObjectMetadata,
  ObjectInspection,
  SceneSnapshot,
  SnapshotNode,
} from './types';
