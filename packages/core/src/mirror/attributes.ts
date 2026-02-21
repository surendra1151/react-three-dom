import type { ObjectMetadata } from '../types';

// ---------------------------------------------------------------------------
// Attribute serialization: converts Tier 1 metadata to DOM attribute strings
// ---------------------------------------------------------------------------

/**
 * Attribute definitions: maps data-attribute names to extractor functions.
 * Each extractor takes metadata and returns a string value, or undefined
 * to skip setting the attribute (avoids empty attributes in DOM).
 */
const ATTRIBUTE_MAP: Record<string, (meta: ObjectMetadata) => string | undefined> = {
  'data-uuid': (m) => m.uuid,
  'data-name': (m) => m.name || undefined,
  'data-type': (m) => m.type,
  'data-visible': (m) => String(m.visible),
  'data-test-id': (m) => m.testId,
  'data-geometry': (m) => m.geometryType,
  'data-material': (m) => m.materialType,
  'data-position': (m) => serializeTuple(m.position),
  'data-rotation': (m) => serializeTuple(m.rotation),
  'data-scale': (m) => serializeTuple(m.scale),
  'data-vertex-count': (m) => m.vertexCount !== undefined ? String(m.vertexCount) : undefined,
  'data-triangle-count': (m) => m.triangleCount !== undefined ? String(m.triangleCount) : undefined,
  'data-instance-count': (m) => m.instanceCount !== undefined ? String(m.instanceCount) : undefined,
  'data-fov': (m) => m.fov !== undefined ? String(m.fov) : undefined,
  'data-near': (m) => m.near !== undefined ? String(m.near) : undefined,
  'data-far': (m) => m.far !== undefined ? String(m.far) : undefined,
  'data-zoom': (m) => m.zoom !== undefined ? String(m.zoom) : undefined,
};

/** All attribute names we manage (for diffing). */
export const MANAGED_ATTRIBUTES = Object.keys(ATTRIBUTE_MAP);

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a 3-element tuple to a compact string: "1.23,4.56,7.89"
 * Uses 2 decimal places for readability without excessive precision.
 */
function serializeTuple(tuple: [number, number, number]): string {
  return `${round(tuple[0])},${round(tuple[1])},${round(tuple[2])}`;
}

/**
 * Round to 4 decimal places to avoid floating point noise
 * while preserving meaningful precision.
 */
function round(n: number): string {
  // Avoid -0 display
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded === 0 ? 0 : rounded);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute all attribute key-value pairs for a metadata object.
 * Returns a map of attribute name → value.
 * Attributes with undefined values are excluded.
 */
export function computeAttributes(meta: ObjectMetadata): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const [key, extractor] of Object.entries(ATTRIBUTE_MAP)) {
    const value = extractor(meta);
    if (value !== undefined) {
      attrs.set(key, value);
    }
  }
  return attrs;
}

/**
 * Apply attributes to a DOM element, only writing those that changed.
 * Returns the number of attributes that were actually written (for perf tracking).
 *
 * @param element - The custom element to update
 * @param meta - Current Tier 1 metadata
 * @param prevAttrs - Previous attribute values (mutated in-place to reflect new state)
 * @returns Number of DOM setAttribute calls made
 */
export function applyAttributes(
  element: HTMLElement,
  meta: ObjectMetadata,
  prevAttrs: Map<string, string>,
): number {
  let writeCount = 0;
  const newAttrs = computeAttributes(meta);

  // Set or update attributes that changed
  for (const [key, value] of newAttrs) {
    const prev = prevAttrs.get(key);
    if (prev !== value) {
      element.setAttribute(key, value);
      prevAttrs.set(key, value);
      writeCount++;
    }
  }

  // Remove attributes that no longer exist
  for (const key of prevAttrs.keys()) {
    if (!newAttrs.has(key)) {
      element.removeAttribute(key);
      prevAttrs.delete(key);
      writeCount++;
    }
  }

  return writeCount;
}
