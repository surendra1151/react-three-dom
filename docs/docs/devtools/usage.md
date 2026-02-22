---
sidebar_position: 2
---

# DevTools Usage

## Scene Tree

The left panel shows the Three.js scene graph as a collapsible tree:

- **Type-colored icons:** Scene, Mesh, Group, Light, Camera each have distinct colors
- **Descendant counts:** Container nodes show child count badges
- **Geometry/material badges:** Meshes show their geometry and material types
- **Auto-expand:** Top 2 levels are expanded by default

Click any node to select it.

## Search

The search bar at the top filters the tree by:
- Object name
- testId
- Three.js type
- UUID

## Property Inspector

The right panel shows details for the selected object:

- **Transform:** Position, rotation, scale
- **Geometry:** Type, vertex count, triangle count, attributes
- **Material:** Type, color, opacity, textures
- **Bounds:** World-space bounding box
- **Hierarchy:** Parent and children

## Selection Sync

Selection is bidirectional:
- **DevTools → Scene:** Click a node in the tree → object is highlighted in the 3D scene
- **Scene → DevTools:** Use inspect mode to click objects in the scene → node is selected in the tree

## Inspect Mode

Inspect mode lets you hover over 3D objects in the canvas to highlight them and reveal them in the DevTools tree.

### Enable from DevTools

Click the inspect mode toggle button in the DevTools panel toolbar.

### Enable from Console

```js
window.__R3F_DOM__.setInspectMode(true);
```

