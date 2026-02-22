---
sidebar_position: 4
---

# Interactions

All interactions auto-wait for the bridge and target object. They project the 3D object's position to screen coordinates and dispatch real pointer events on the canvas.

## How Interactions Work

1. The bridge computes the object's screen-space position using camera projection
2. For large objects, multiple sample points are tested to find the best hit
3. BVH-accelerated raycasting verifies the hit
4. Real `PointerEvent`s are dispatched on the canvas element at the computed position

This means R3F event handlers (`onClick`, `onPointerOver`, etc.) fire exactly as they would from real user input.

## Playwright

```ts
// Click
await r3f.click('my-object');
await r3f.doubleClick('my-object');
await r3f.contextMenu('my-object');

// Hover
await r3f.hover('my-object');
await r3f.unhover();

// Drag (screen-space delta in pixels)
await r3f.drag('my-object', { x: 100, y: 0 });

// Wheel / scroll
await r3f.wheel('my-object', { deltaY: -120 });

// Click empty space (triggers onPointerMissed)
await r3f.pointerMiss();

// Freehand drawing
await r3f.drawPath([
  { x: 100, y: 100 },
  { x: 200, y: 150 },
  { x: 300, y: 100 },
]);
```

## Cypress

```ts
cy.r3fClick('my-object');
cy.r3fDoubleClick('my-object');
cy.r3fContextMenu('my-object');
cy.r3fHover('my-object');
cy.r3fUnhover();
cy.r3fDrag('my-object', { x: 100, y: 0 });
cy.r3fWheel('my-object', { deltaY: -120 });
cy.r3fPointerMiss();
cy.r3fDrawPath([{ x: 100, y: 100 }, { x: 200, y: 150 }]);
```

## Reference

| Method | Description |
|--------|-------------|
| `click(id)` | Dispatches `pointerdown` → `pointerup` → `click` |
| `doubleClick(id)` | Two click sequences + `dblclick` |
| `contextMenu(id)` | Right-click via `pointerdown` (button 2) → `contextmenu` |
| `hover(id)` | `pointermove` → `pointerenter` → `pointerover` |
| `unhover()` | Moves pointer off-canvas to trigger `pointerleave` |
| `drag(id, delta)` | Async `pointerdown` → `pointermove` sequence → `pointerup`. Delta is `{ x, y }` in screen pixels |
| `wheel(id, options?)` | Dispatches `wheel` event. Options: `{ deltaX?, deltaY? }` |
| `pointerMiss()` | Clicks empty canvas area, triggers `onPointerMissed` |
| `drawPath(points, options?)` | Freehand path for drawing apps. Options: `stepDelayMs`, `pointerType`, `clickAtEnd` |
