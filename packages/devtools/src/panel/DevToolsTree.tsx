import { useState, useCallback, type CSSProperties } from 'react';
import type { ObjectMetadata } from './pageBridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeNode {
  meta: ObjectMetadata;
  children: TreeNode[];
  depth: number;
  /** Total descendant count (for "N objects" label) */
  descendantCount: number;
}

export interface DevToolsTreeProps {
  roots: TreeNode[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
}

// ---------------------------------------------------------------------------
// Build tree from flat list (with descendant counts)
// ---------------------------------------------------------------------------

export function buildTree(list: ObjectMetadata[]): TreeNode[] {
  const byUuid = new Map<string, ObjectMetadata>();
  for (const m of list) byUuid.set(m.uuid, m);

  const nodeMap = new Map<string, TreeNode>();
  for (const m of list) {
    nodeMap.set(m.uuid, { meta: m, children: [], depth: 0, descendantCount: 0 });
  }

  const roots: TreeNode[] = [];
  for (const m of list) {
    const node = nodeMap.get(m.uuid)!;
    if (m.parentUuid && nodeMap.has(m.parentUuid)) {
      const parent = nodeMap.get(m.parentUuid)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }

  // Compute descendant counts bottom-up
  function countDescendants(node: TreeNode): number {
    let count = 0;
    for (const child of node.children) {
      count += 1 + countDescendants(child);
    }
    node.descendantCount = count;
    return count;
  }
  for (const root of roots) countDescendants(root);

  return roots;
}

// ---------------------------------------------------------------------------
// Icons & colors by type
// ---------------------------------------------------------------------------

// Light theme to match Chrome DevTools
const COLORS = {
  bg: '#ffffff',
  bgHover: '#e8f0fe',
  bgSelected: '#d2e3fc',
  text: '#202124',
  textMuted: '#5f6368',
  textDim: '#80868b',
  border: '#e0e0e0',
  scene: '#b45309',
  mesh: '#0d9488',
  group: '#0369a1',
  light: '#a16207',
  camera: '#7c3aed',
  object: '#0369a1',
};

function getTypeStyle(type: string): { icon: string; color: string } {
  if (type === 'Scene') return { icon: '◆', color: COLORS.scene };
  if (type === 'Group' || type === 'LOD' || type === 'Bone')
    return { icon: '▪', color: COLORS.group };
  if (type.includes('Camera')) return { icon: '◎', color: COLORS.camera };
  if (type.includes('Light')) return { icon: '●', color: COLORS.light };
  if (
    type === 'Mesh' || type === 'SkinnedMesh' || type === 'InstancedMesh' ||
    type.includes('Line') || type === 'Points' || type === 'Sprite'
  )
    return { icon: '◆', color: COLORS.mesh };
  return { icon: '○', color: COLORS.object };
}

// ---------------------------------------------------------------------------
// Tree row
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 22;
const INDENT = 16;

function TreeRow({
  node,
  selectedUuid,
  onSelect,
  expandedSet,
  onToggle,
}: {
  node: TreeNode;
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  expandedSet: Set<string>;
  onToggle: (uuid: string) => void;
}) {
  const { meta, children, depth, descendantCount } = node;
  const hasChildren = children.length > 0;
  const expanded = expandedSet.has(meta.uuid);
  const selected = meta.uuid === selectedUuid;
  const { icon, color } = getTypeStyle(meta.type);

  const isContainer = meta.type === 'Scene' || meta.type === 'Group' || meta.type === 'LOD';

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingLeft: depth * INDENT + 4,
    paddingRight: 8,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    background: selected ? COLORS.bgSelected : 'transparent',
    color: COLORS.text,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  return (
    <>
      <div
        style={rowStyle}
        onClick={() => onSelect(meta.uuid)}
        onMouseEnter={(e) => {
          if (!selected) (e.currentTarget as HTMLElement).style.background = COLORS.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        {/* Expand/collapse arrow */}
        <span
          style={{
            width: 14,
            textAlign: 'center',
            color: COLORS.textDim,
            fontSize: 10,
            flexShrink: 0,
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(meta.uuid);
          }}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : ' '}
        </span>

        {/* Type icon */}
        <span style={{ color, marginRight: 5, fontSize: 10, flexShrink: 0 }}>{icon}</span>

        {/* Type name */}
        <span style={{ fontWeight: 600, color, marginRight: 6 }}>{meta.type}</span>

        {/* Name (if set) */}
        {meta.name && (
          <span style={{ color: COLORS.text, marginRight: 6 }}>
            {meta.name}
          </span>
        )}

        {/* Object count for containers */}
        {isContainer && descendantCount > 0 && (
          <span style={{ color: COLORS.textMuted, fontSize: 11, marginRight: 6 }}>
            {descendantCount} object{descendantCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Geometry + material (for meshes) */}
        {meta.geometryType && (
          <span style={{ color: COLORS.textDim, fontSize: 11, marginRight: 4 }}>
            {meta.geometryType}
          </span>
        )}
        {meta.materialType && (
          <span style={{ color: COLORS.textDim, fontSize: 11 }}>
            {meta.materialType}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded &&
        children.map((child) => (
          <TreeRow
            key={child.meta.uuid}
            node={child}
            selectedUuid={selectedUuid}
            onSelect={onSelect}
            expandedSet={expandedSet}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// DevToolsTree — main component
// ---------------------------------------------------------------------------

export function DevToolsTree({ roots, selectedUuid, onSelect }: DevToolsTreeProps) {
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    // Auto-expand top 2 levels
    const set = new Set<string>();
    for (const root of roots) {
      set.add(root.meta.uuid);
      for (const child of root.children) {
        set.add(child.meta.uuid);
      }
    }
    return set;
  });

  const onToggle = useCallback((uuid: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  if (roots.length === 0) {
    return (
      <div style={{ padding: 16, color: COLORS.textMuted, fontSize: 12, background: COLORS.bg }}>
        No objects in scene.
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', flex: 1, minHeight: 0, background: COLORS.bg }}>
      {roots.map((root) => (
        <TreeRow
          key={root.meta.uuid}
          node={root}
          selectedUuid={selectedUuid}
          onSelect={onSelect}
          expandedSet={expandedSet}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
