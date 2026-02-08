import { useState, useCallback } from 'react';
import type { TreeNode } from './hooks';
import {
  treeContainerStyle,
  treeNodeStyle,
  arrowStyle,
  iconStyle,
  nameStyle,
  badgeStyle,
  COLORS,
  FONTS,
} from './styles';

// ---------------------------------------------------------------------------
// TreeView — virtualized scene graph tree
// ---------------------------------------------------------------------------

export interface TreeViewProps {
  roots: TreeNode[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  onHover?: (uuid: string | null) => void;
}

/** Map Three.js type to icon character and color. */
function getIcon(type: string): { char: string; color: string } {
  if (type === 'Scene') return { char: '◆', color: COLORS.sceneIcon };
  if (type === 'Group' || type === 'LOD' || type === 'Bone')
    return { char: '▣', color: COLORS.groupIcon };
  if (type.includes('Camera')) return { char: '◎', color: COLORS.cameraIcon };
  if (type.includes('Light')) return { char: '◉', color: COLORS.lightIcon };
  if (
    type === 'Mesh' ||
    type === 'SkinnedMesh' ||
    type === 'InstancedMesh' ||
    type.includes('Line') ||
    type === 'Points' ||
    type === 'Sprite'
  )
    return { char: '△', color: COLORS.meshIcon };
  return { char: '○', color: COLORS.groupIcon };
}

function TreeNodeRow({
  node,
  selectedUuid,
  onSelect,
  onHover,
  expandedSet,
  onToggleExpand,
}: {
  node: TreeNode;
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  onHover?: (uuid: string | null) => void;
  expandedSet: Set<string>;
  onToggleExpand: (uuid: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { meta, children, depth } = node;
  const isSelected = meta.uuid === selectedUuid;
  const hasChildren = children.length > 0;
  const isExpanded = expandedSet.has(meta.uuid);
  const icon = getIcon(meta.type);

  const displayName = meta.name || meta.type;

  return (
    <>
      <div
        style={treeNodeStyle(depth, isSelected, hovered)}
        onClick={() => onSelect(meta.uuid)}
        onMouseEnter={() => { setHovered(true); onHover?.(meta.uuid); }}
        onMouseLeave={() => { setHovered(false); onHover?.(null); }}
      >
        {/* Expand arrow */}
        {hasChildren ? (
          <span
            style={arrowStyle(isExpanded)}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(meta.uuid);
            }}
          >
            ▶
          </span>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}

        {/* Type icon */}
        <span style={iconStyle(icon.color)}>{icon.char}</span>

        {/* Name */}
        <span style={nameStyle}>{displayName}</span>

        {/* TestId badge */}
        {meta.testId && <span style={badgeStyle}>{meta.testId}</span>}

        {/* Visibility indicator */}
        {!meta.visible && (
          <span
            style={{
              fontSize: FONTS.sizeXs,
              color: COLORS.textMuted,
              marginLeft: 4,
            }}
          >
            (hidden)
          </span>
        )}
      </div>

      {/* Render children if expanded */}
      {hasChildren &&
        isExpanded &&
        children.map((child) => (
          <TreeNodeRow
            key={child.meta.uuid}
            node={child}
            selectedUuid={selectedUuid}
            onSelect={onSelect}
            onHover={onHover}
            expandedSet={expandedSet}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  );
}

export function TreeView({ roots, selectedUuid, onSelect, onHover }: TreeViewProps) {
  // Track expanded nodes — expand first two levels by default
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const root of roots) {
      initial.add(root.meta.uuid);
      for (const child of root.children) {
        initial.add(child.meta.uuid);
      }
    }
    return initial;
  });

  const onToggleExpand = useCallback((uuid: string) => {
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

  return (
    <div style={treeContainerStyle}>
      {roots.map((root) => (
        <TreeNodeRow
          key={root.meta.uuid}
          node={root}
          selectedUuid={selectedUuid}
          onSelect={onSelect}
          onHover={onHover}
          expandedSet={expandedSet}
          onToggleExpand={onToggleExpand}
        />
      ))}
      {roots.length === 0 && (
        <div
          style={{
            padding: '20px',
            textAlign: 'center',
            color: COLORS.textMuted,
            fontSize: FONTS.sizeSm,
          }}
        >
          No objects found
        </div>
      )}
    </div>
  );
}
