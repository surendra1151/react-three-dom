import type { ReactNode } from 'react';
import type { ObjectInspection } from '@react-three-dom/core';
import {
  propertyPaneStyle,
  propertySectionStyle,
  propertyRowStyle,
  propertyLabelStyle,
  propertyValueStyle,
  COLORS,
  FONTS,
} from './styles';

// ---------------------------------------------------------------------------
// PropertyPane — shows detailed properties of the selected object
// ---------------------------------------------------------------------------

export interface PropertyPaneProps {
  inspection: ObjectInspection | null;
}

function PropRow({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === '') return null;
  return (
    <div style={propertyRowStyle}>
      <span style={propertyLabelStyle}>{label}</span>
      <span style={propertyValueStyle}>{String(value)}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div style={propertySectionStyle}>{title}</div>
      {children}
    </>
  );
}

function formatVec3(v: [number, number, number]): string {
  return `${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)}`;
}

function formatBounds(bounds: { min: [number, number, number]; max: [number, number, number] }): string {
  return `min(${formatVec3(bounds.min)}) max(${formatVec3(bounds.max)})`;
}

export function PropertyPane({ inspection }: PropertyPaneProps) {
  if (!inspection) {
    return (
      <div style={propertyPaneStyle}>
        <div
          style={{
            textAlign: 'center',
            color: COLORS.textMuted,
            fontSize: FONTS.sizeSm,
            padding: '12px 0',
          }}
        >
          Select an object to inspect
        </div>
      </div>
    );
  }

  const { metadata: m, bounds, geometry, material, userData } = inspection;

  return (
    <div style={propertyPaneStyle}>
      {/* Identity */}
      <Section title="Identity">
        <PropRow label="Type" value={m.type} />
        <PropRow label="Name" value={m.name} />
        <PropRow label="TestId" value={m.testId} />
        <PropRow label="UUID" value={m.uuid.slice(0, 12) + '…'} />
        <PropRow label="Visible" value={m.visible ? 'true' : 'false'} />
      </Section>

      {/* Transform */}
      <Section title="Transform">
        <PropRow label="Position" value={formatVec3(m.position)} />
        <PropRow label="Rotation" value={formatVec3(m.rotation)} />
        <PropRow label="Scale" value={formatVec3(m.scale)} />
      </Section>

      {/* Bounds */}
      <Section title="Bounds">
        <PropRow label="AABB" value={formatBounds(bounds)} />
      </Section>

      {/* Geometry */}
      {geometry && (
        <Section title="Geometry">
          <PropRow label="Type" value={geometry.type} />
          <PropRow label="Vertices" value={m.vertexCount} />
          <PropRow label="Triangles" value={m.triangleCount} />
          {geometry.index && (
            <PropRow label="Indices" value={geometry.index.count} />
          )}
          {geometry.boundingSphere && (
            <PropRow
              label="Bounding Sphere"
              value={`r=${geometry.boundingSphere.radius.toFixed(3)}`}
            />
          )}
        </Section>
      )}

      {/* Material */}
      {material && (
        <Section title="Material">
          <PropRow label="Type" value={material.type} />
          <PropRow label="Color" value={material.color} />
          {material.map && <PropRow label="Map" value={material.map} />}
          <PropRow label="Transparent" value={material.transparent ? 'true' : 'false'} />
          <PropRow label="Opacity" value={material.opacity?.toFixed(2)} />
        </Section>
      )}

      {/* userData */}
      {Object.keys(userData).length > 0 && (
        <Section title="userData">
          {Object.entries(userData).map(([key, val]) => (
            <PropRow
              key={key}
              label={key}
              value={typeof val === 'object' ? JSON.stringify(val) : String(val)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}
