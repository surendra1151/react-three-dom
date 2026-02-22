---
sidebar_position: 6
---

# Waiters

Five waiter strategies for different scenarios. All waiters auto-detect the bridge and handle timing automatically.

## `waitForSceneReady`

The most common waiter. Waits for the bridge to be ready AND the object count to stabilize.

```ts
// Playwright
await r3f.waitForSceneReady();
await r3f.waitForSceneReady({ stableChecks: 5, timeout: 15_000 });

// Cypress
cy.r3fWaitForSceneReady();
cy.r3fWaitForSceneReady({ stableChecks: 5, timeout: 15_000 });
```

**How it works:**
1. Polls until `window.__R3F_DOM__._ready === true`
2. Then polls until `getCount()` returns the same value for `stableChecks` consecutive checks
3. Fails if `timeout` is exceeded

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stableChecks` | `number` | `3` | Consecutive stable count readings required |
| `timeout` | `number` | `10_000` | Max wait time in ms |

**When to use:** Start of every test, after `page.goto()`.

## `waitForObject`

Waits for a specific object to appear in the scene. Useful when the object count never stabilizes (streaming/progressive loading).

```ts
// Playwright
await r3f.waitForObject('my-model');
await r3f.waitForObject('my-model', { objectTimeout: 60_000 });

// Cypress
cy.r3fWaitForObject('my-model');
cy.r3fWaitForObject('my-model', { objectTimeout: 60_000 });
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `objectTimeout` | `number` | `10_000` | Max wait for the object |
| `timeout` | `number` | `10_000` | Max wait for bridge ready |

**When to use:** After loading a model, when you know which object to expect but not the total count.

## `waitForIdle`

Waits for the scene to stop changing. Useful after animations or interactions.

```ts
// Playwright
await r3f.waitForIdle();
await r3f.waitForIdle({ idleFrames: 10, timeout: 10_000 });

// Cypress
cy.r3fWaitForIdle();
cy.r3fWaitForIdle({ idleChecks: 10, timeout: 10_000 });
```

**How it works:** Takes snapshots of object properties and waits until no changes are detected for `idleFrames` consecutive checks.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `idleFrames` / `idleChecks` | `number` | `5` | Consecutive idle readings required |
| `timeout` | `number` | `10_000` | Max wait time |

**When to use:** After triggering an animation or transition, before asserting final state.

## `waitForNewObject`

Waits for new objects to appear in the scene after a baseline snapshot.

```ts
// Playwright
const result = await r3f.waitForNewObject();
const result = await r3f.waitForNewObject({ type: 'Line', timeout: 5_000 });
console.log(result.count);    // number of new objects
console.log(result.newUuids); // UUIDs of new objects

// Cypress
cy.r3fWaitForNewObject({ type: 'Line' });
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `string` | — | Only wait for objects of this Three.js type |
| `timeout` | `number` | `10_000` | Max wait time |

**When to use:** After a drawing action, model spawn, or any operation that adds objects.

## `waitForObjectRemoved`

Waits for a specific object to be removed from the scene.

```ts
// Playwright
await r3f.waitForObjectRemoved('deleted-item');

// Cypress
cy.r3fWaitForObjectRemoved('deleted-item');
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | `10_000` | Max wait time |

**When to use:** After a delete action, before asserting the object is gone.

## Choosing the Right Waiter

| Scenario | Waiter |
|----------|--------|
| Page load, initial scene | `waitForSceneReady` |
| Loading a specific model | `waitForObject` |
| After animation/transition | `waitForIdle` |
| After drawing/spawning | `waitForNewObject` |
| After deleting an object | `waitForObjectRemoved` |
