---
sidebar_position: 7
---

# Snapshots & Diffing

Capture the full scene state as JSON and diff snapshots to track changes.

## Taking a Snapshot

```ts
// Playwright
const snapshot = await r3f.snapshot();
console.log(snapshot.objectCount); // 42
console.log(snapshot.tree);        // recursive SnapshotNode tree

// Cypress
cy.r3fSnapshot().then((snapshot) => {
  expect(snapshot.objectCount).to.equal(42);
});
```

A snapshot captures every object's Tier 1 metadata in a recursive tree structure. See [SceneSnapshot type reference](../types/scene-snapshot.md) for the full shape.

## Diffing Snapshots

Compare two snapshots to find what changed:

```ts
// Playwright
const before = await r3f.snapshot();
await r3f.click('add-button');
await r3f.waitForIdle();
const after = await r3f.snapshot();

const diff = r3f.diffSnapshots(before, after);
console.log(diff.added);   // nodes present in `after` but not `before`
console.log(diff.removed); // nodes present in `before` but not `after`
console.log(diff.changed); // nodes with property changes

// Cypress
cy.r3fSnapshot().then((before) => {
  cy.r3fClick('add-button');
  cy.r3fWaitForIdle();
  cy.r3fSnapshot().then((after) => {
    cy.r3fDiffSnapshots(before, after).then((diff) => {
      expect(diff.added).to.have.length(1);
    });
  });
});
```

## Tracking Object Count

Shorthand for counting objects added/removed during an action:

```ts
// Playwright
const delta = await r3f.trackObjectCount(async () => {
  await r3f.click('add-button');
  await r3f.waitForIdle();
});
expect(delta.added).toBe(1);
expect(delta.removed).toBe(0);
```

## Use Cases

### Regression Testing

Snapshot the scene after setup, store as a baseline, and diff against future runs:

```ts
test('scene structure unchanged', async ({ r3f }) => {
  await r3f.waitForSceneReady();
  const snapshot = await r3f.snapshot();

  expect(snapshot.objectCount).toBe(42);
  expect(snapshot.tree.children).toHaveLength(5);
});
```

### Verifying Add/Remove Operations

```ts
test('delete removes exactly one object', async ({ r3f }) => {
  const before = await r3f.snapshot();
  await r3f.click('delete-button');
  await r3f.waitForObjectRemoved('target-mesh');
  const after = await r3f.snapshot();

  const diff = r3f.diffSnapshots(before, after);
  expect(diff.removed).toHaveLength(1);
  expect(diff.removed[0].testId).toBe('target-mesh');
});
```

### Monitoring Scene Changes During Interaction

```ts
test('drag does not create or destroy objects', async ({ r3f }) => {
  const delta = await r3f.trackObjectCount(async () => {
    await r3f.drag('draggable', { x: 100, y: 0 });
  });
  expect(delta.added).toBe(0);
  expect(delta.removed).toBe(0);
});
```
