---
sidebar_position: 2
---

# Bridge API

The bridge exposes `window.__R3F_DOM__` — test frameworks call it via `page.evaluate()`. The Playwright `r3f` fixture and Cypress `cy.r3f*` commands wrap this API.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `_ready` | `boolean` | `true` when setup completed successfully |
| `_error` | `string \| undefined` | Error message if `_ready` is false |
| `canvasId` | `string \| undefined` | Canvas identifier for multi-canvas apps |
| `version` | `string` | Library version |

## Query Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getObject(id)` | `ObjectMetadata \| null` | By testId or uuid |
| `getByTestId(id)` | `ObjectMetadata \| null` | By testId only |
| `getByUuid(uuid)` | `ObjectMetadata \| null` | By uuid only |
| `getByName(name)` | `ObjectMetadata[]` | All objects with this name |
| `getChildren(id)` | `ObjectMetadata[]` | Direct children |
| `getParent(id)` | `ObjectMetadata \| null` | Parent object |
| `getByType(type)` | `ObjectMetadata[]` | e.g. `'Mesh'`, `'Group'`, `'PointLight'` |
| `getByGeometryType(type)` | `ObjectMetadata[]` | e.g. `'BoxGeometry'` |
| `getByMaterialType(type)` | `ObjectMetadata[]` | e.g. `'MeshStandardMaterial'` |
| `getByUserData(key, value?)` | `ObjectMetadata[]` | By userData key/value |
| `getCount()` | `number` | Total object count |
| `getCountByType(type)` | `number` | Count by Three.js type |
| `getObjects(ids[])` | `Record<string, ObjectMetadata \| null>` | Batch lookup |
| `getWorldPosition(id)` | `[x,y,z] \| null` | World-space position |
| `fuzzyFind(query, limit?)` | `ObjectMetadata[]` | Fuzzy search by testId/name |

## Inspection

| Method | Returns | Description |
|--------|---------|-------------|
| `inspect(id, options?)` | `ObjectInspection \| null` | Deep inspection (bounds, material, geometry) |
| `snapshot()` | `SceneSnapshot` | Full scene tree as JSON |
| `getCameraState()` | `CameraState` | Camera position, rotation, fov, etc. |
| `getDiagnostics()` | `BridgeDiagnostics` | Bridge health and scene stats |

Pass `{ includeGeometryData: true }` to `inspect()` for vertex/index buffers.

## Selection

| Method | Description |
|--------|-------------|
| `select(id)` | Select an object (shows highlight) |
| `clearSelection()` | Clear all selections |
| `getSelection()` | Get UUIDs of selected objects |

## Registration

| Method | Description |
|--------|-------------|
| `r3fRegister(obj)` | Manually register a Three.js object into the mirror DOM. Warns if the object isn't in the scene graph. |
| `r3fUnregister(obj)` | Unregister a manually registered object. Won't remove auto-registered objects. |

## Utility

| Method | Description |
|--------|-------------|
| `setInspectMode(on)` | Enable/disable inspect mode for DevTools |
| `sweepOrphans()` | Remove orphaned objects from store |
| `getObject3D(id)` | Raw Three.js `Object3D` access |

## Examples

### Playwright

```ts
const cube = await r3f.getObject('hero-cube');
console.log(cube.position); // [0, 1, 0]

const meshes = await r3f.getByType('Mesh');
const objects = await r3f.getObjects(['wall-1', 'wall-2', 'floor']);

const inspection = await r3f.inspect('hero-cube');
console.log(inspection.material.color); // '#ffa500'
```

### Cypress

```ts
cy.r3fGetObject('hero-cube').then((obj) => {
  expect(obj.type).to.equal('Mesh');
});

cy.r3fInspect('hero-cube').then((inspection) => {
  expect(inspection.material.color).to.equal('#ffa500');
});
```

