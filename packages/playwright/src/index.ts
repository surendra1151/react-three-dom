// @react-three-dom/playwright
// Playwright E2E testing SDK for React Three Fiber apps

// Main entry: import { test, r3fMatchers } from '@react-three-dom/playwright'
// Import expect from '@playwright/test' and run expect.extend(r3fMatchers) in setup (see README).
export { test, R3FFixture, createR3FTest, type R3FFixtureOptions } from './fixtures';
export { r3fMatchers } from './assertions';

// Individual interaction functions (for advanced usage)
export {
  click,
  doubleClick,
  contextMenu,
  hover,
  drag,
  wheel,
  pointerMiss,
  drawPathOnCanvas,
} from './interactions';

// Path generators for drawPath
export { linePath, curvePath, rectPath, circlePath, type DrawPoint } from './pathGenerators';

// Scene diff (pure function; also available as r3f.diffSnapshots(before, after))
export { diffSnapshots } from './diffSnapshots';
export type { SceneDiff, SceneDiffChange } from './diffSnapshots';

// Waiter utilities
export { waitForSceneReady, waitForIdle, waitForObject, waitForNewObject, waitForObjectRemoved } from './waiters';
export type {
  WaitForSceneReadyOptions,
  WaitForIdleOptions,
  WaitForObjectOptions,
  WaitForNewObjectOptions,
  WaitForNewObjectResult,
  WaitForObjectRemovedOptions,
} from './waiters';

// Re-exported types for convenience
export type {
  ObjectMetadata,
  ObjectInspection,
  SceneSnapshot,
  SnapshotNode,
} from './types';
