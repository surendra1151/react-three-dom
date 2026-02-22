---
sidebar_position: 5
---

# Assertions

27+ matchers for Playwright and equivalent Chai assertions for Cypress.

## Setup

### Playwright

Extend `expect` once in your config or test file:

```ts
import { expect } from '@playwright/test';
import { r3fMatchers } from '@react-three-dom/playwright';
expect.extend(r3fMatchers);
```

Then use with the `r3f` fixture:

```ts
await expect(r3f).toExist('hero-cube');
```

### Cypress

Import the package in your support file — assertions are registered automatically:

```ts
// cypress/support/e2e.ts
import '@react-three-dom/cypress';
```

Then use as Chai assertions:

```ts
cy.wrap(null).should('r3fExist', 'hero-cube');
```

## Object Assertions

| Playwright Matcher | Cypress Assertion | Description |
|-------------------|-------------------|-------------|
| `toExist(id)` | `r3fExist` | Object exists in scene |
| `toBeVisible(id)` | `r3fVisible` | Object is visible |
| `toHavePosition(id, [x,y,z], tol?)` | `r3fPosition` | Local position |
| `toHaveWorldPosition(id, [x,y,z], tol?)` | `r3fWorldPosition` | World-space position (includes parent transforms) |
| `toHaveRotation(id, [x,y,z], tol?)` | `r3fRotation` | Euler rotation in radians |
| `toHaveScale(id, [x,y,z], tol?)` | `r3fScale` | Local scale |
| `toHaveType(id, type)` | `r3fType` | Three.js class: `'Mesh'`, `'Group'`, etc. |
| `toHaveName(id, name)` | `r3fName` | Object name |
| `toHaveGeometryType(id, type)` | `r3fGeometryType` | `'BoxGeometry'`, `'SphereGeometry'`, etc. |
| `toHaveMaterialType(id, type)` | `r3fMaterialType` | `'MeshStandardMaterial'`, etc. |
| `toHaveChildCount(id, count)` | `r3fChildCount` | Number of direct children |
| `toHaveParent(id, parentId)` | `r3fParent` | Parent by testId, uuid, or name |
| `toHaveInstanceCount(id, count)` | `r3fInstanceCount` | For InstancedMesh |
| `toBeInFrustum(id)` | `r3fInFrustum` | Object is within camera frustum |
| `toHaveBounds(id, { min, max }, tol?)` | `r3fBounds` | Bounding box |
| `toHaveColor(id, '#hex')` | `r3fColor` | Material color |
| `toHaveOpacity(id, value, tol?)` | `r3fOpacity` | Material opacity |
| `toBeTransparent(id)` | `r3fTransparent` | `material.transparent === true` |
| `toHaveVertexCount(id, count)` | `r3fVertexCount` | Geometry vertex count |
| `toHaveTriangleCount(id, count)` | `r3fTriangleCount` | Geometry triangle count |
| `toHaveUserData(id, key, value?)` | `r3fUserData` | userData key (and optional value) |
| `toHaveMapTexture(id, name?)` | `r3fMapTexture` | Has a map texture |

### Examples (Playwright)

```ts
// Position with tolerance
await expect(r3f).toHavePosition('cube', [0, 1, 0], 0.01);

// Material properties
await expect(r3f).toHaveColor('cube', '#ffa500');
await expect(r3f).toHaveOpacity('glass', 0.5, 0.05);
await expect(r3f).toBeTransparent('glass');

// Geometry
await expect(r3f).toHaveGeometryType('cube', 'BoxGeometry');
await expect(r3f).toHaveVertexCount('cube', 24);

// Hierarchy
await expect(r3f).toHaveChildCount('table', 5);
await expect(r3f).toHaveParent('tabletop', 'table');

// Negation
await expect(r3f).not.toExist('deleted-object');
await expect(r3f).not.toBeVisible('hidden-mesh');
```

### Examples (Cypress)

```ts
cy.wrap(null).should('r3fPosition', 'cube', [0, 1, 0], 0.01);
cy.wrap(null).should('r3fColor', 'cube', '#ffa500');
cy.wrap(null).should('r3fGeometryType', 'cube', 'BoxGeometry');
cy.wrap(null).should('r3fChildCount', 'table', 5);
```

## Scene-Level Assertions

| Playwright Matcher | Cypress Assertion | Description |
|-------------------|-------------------|-------------|
| `toHaveObjectCount(count)` | `r3fObjectCount` | Total objects in scene |
| `toHaveObjectCountGreaterThan(min)` | `r3fObjectCountGreaterThan` | Minimum object count |
| `toHaveCountByType(type, count)` | `r3fCountByType` | Count of specific type |
| `toHaveTotalTriangleCount(count)` | `r3fTotalTriangleCount` | Total triangles across all meshes |
| `toHaveTotalTriangleCountLessThan(max)` | `r3fTotalTriangleCountLessThan` | Performance budget |

### Examples

```ts
// Playwright
await expect(r3f).toHaveObjectCount(42);
await expect(r3f).toHaveObjectCountGreaterThan(10);
await expect(r3f).toHaveCountByType('Mesh', 15);
await expect(r3f).toHaveTotalTriangleCountLessThan(100_000); // perf budget

// Cypress
cy.wrap(null).should('r3fObjectCountGreaterThan', 10);
cy.wrap(null).should('r3fTotalTriangleCountLessThan', 100_000);
```

## Camera Assertions

| Playwright Matcher | Cypress Assertion | Description |
|-------------------|-------------------|-------------|
| `toHaveCameraPosition([x,y,z], tol?)` | `r3fCameraPosition` | Camera position |
| `toHaveCameraFov(fov, tol?)` | `r3fCameraFov` | Field of view |
| `toHaveCameraNear(near, tol?)` | `r3fCameraNear` | Near clipping plane |
| `toHaveCameraFar(far, tol?)` | `r3fCameraFar` | Far clipping plane |
| `toHaveCameraZoom(zoom, tol?)` | `r3fCameraZoom` | Zoom level |

### Examples

```ts
await expect(r3f).toHaveCameraPosition([0, 5, 10], 0.1);
await expect(r3f).toHaveCameraFov(50, 0.1);
```

## Batch Assertions

| Playwright Matcher | Cypress Assertion | Description |
|-------------------|-------------------|-------------|
| `toAllExist(ids \| pattern)` | `r3fAllExist` | All objects exist |
| `toAllBeVisible(ids \| pattern)` | `r3fAllVisible` | All objects visible |
| `toNoneExist(ids \| pattern)` | `r3fNoneExist` | No objects exist |

Accepts an array of IDs or a glob pattern:

```ts
// Array
await expect(r3f).toAllExist(['wall-1', 'wall-2', 'wall-3']);

// Glob pattern
await expect(r3f).toAllExist('wall-*');
await expect(r3f).toAllBeVisible('wall-*');
await expect(r3f).toNoneExist('temp-*');
```

## Negation and Timeout

All matchers support `.not` and `{ timeout }`:

```ts
await expect(r3f).not.toExist('deleted-object');
await expect(r3f).toExist('slow-loading-model', { timeout: 30_000 });
```
