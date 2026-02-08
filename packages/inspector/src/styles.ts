// ---------------------------------------------------------------------------
// CSS-in-JS styles for the Inspector UI
// Dark theme matching browser DevTools aesthetics
// ---------------------------------------------------------------------------

import type { CSSProperties } from 'react';

export const COLORS = {
  bg: '#1e1e1e',
  bgSecondary: '#252526',
  bgHover: '#2a2d2e',
  bgSelected: '#094771',
  border: '#3c3c3c',
  text: '#cccccc',
  textMuted: '#808080',
  textBright: '#ffffff',
  accent: '#00ff88',
  accentDim: '#007744',
  search: '#3c3c3c',
  badge: '#264f78',
  badgeText: '#7dc4e4',
  meshIcon: '#e8a838',
  lightIcon: '#ffdd57',
  cameraIcon: '#5bbcff',
  groupIcon: '#888888',
  sceneIcon: '#bb86fc',
} as const;

export const FONTS = {
  family: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace",
  size: '12px',
  sizeSm: '11px',
  sizeXs: '10px',
} as const;

/** Base panel styles */
export const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  bottom: 0,
  width: 320,
  background: COLORS.bg,
  color: COLORS.text,
  fontFamily: FONTS.family,
  fontSize: FONTS.size,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 99999,
  borderLeft: `1px solid ${COLORS.border}`,
  boxShadow: '-2px 0 8px rgba(0,0,0,0.3)',
  overflow: 'hidden',
  userSelect: 'none',
};

/** Header bar */
export const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: `1px solid ${COLORS.border}`,
  background: COLORS.bgSecondary,
  flexShrink: 0,
};

/** Search input */
export const searchInputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: COLORS.search,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  color: COLORS.text,
  fontFamily: FONTS.family,
  fontSize: FONTS.size,
  outline: 'none',
};

/** Tree container */
export const treeContainerStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '4px 0',
};

/** Single tree node row */
export const treeNodeStyle = (
  depth: number,
  isSelected: boolean,
  isHovered: boolean,
): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  padding: '3px 8px',
  paddingLeft: 8 + depth * 16,
  cursor: 'pointer',
  background: isSelected
    ? COLORS.bgSelected
    : isHovered
      ? COLORS.bgHover
      : 'transparent',
  whiteSpace: 'nowrap',
  minHeight: 24,
});

/** Expand/collapse arrow */
export const arrowStyle = (expanded: boolean): CSSProperties => ({
  display: 'inline-block',
  width: 16,
  height: 16,
  textAlign: 'center',
  lineHeight: '16px',
  fontSize: '10px',
  color: COLORS.textMuted,
  transform: expanded ? 'rotate(90deg)' : 'none',
  transition: 'transform 0.1s ease',
  flexShrink: 0,
});

/** Type icon */
export const iconStyle = (color: string): CSSProperties => ({
  display: 'inline-block',
  width: 14,
  height: 14,
  lineHeight: '14px',
  textAlign: 'center',
  fontSize: '10px',
  marginRight: 6,
  color,
  flexShrink: 0,
});

/** Object name text */
export const nameStyle: CSSProperties = {
  color: COLORS.textBright,
  marginRight: 6,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** TestId badge */
export const badgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  background: COLORS.badge,
  color: COLORS.badgeText,
  borderRadius: 3,
  fontSize: FONTS.sizeXs,
  marginLeft: 4,
  flexShrink: 0,
};

/** Property pane container */
export const propertyPaneStyle: CSSProperties = {
  borderTop: `1px solid ${COLORS.border}`,
  background: COLORS.bgSecondary,
  padding: '8px 12px',
  overflow: 'auto',
  maxHeight: '40%',
  flexShrink: 0,
};

/** Property section header */
export const propertySectionStyle: CSSProperties = {
  fontSize: FONTS.sizeSm,
  color: COLORS.accent,
  fontWeight: 'bold',
  marginTop: 8,
  marginBottom: 4,
};

/** Property row */
export const propertyRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '2px 0',
  fontSize: FONTS.sizeSm,
};

/** Property label */
export const propertyLabelStyle: CSSProperties = {
  color: COLORS.textMuted,
  marginRight: 8,
  flexShrink: 0,
};

/** Property value */
export const propertyValueStyle: CSSProperties = {
  color: COLORS.textBright,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textAlign: 'right',
};

/** Close button */
export const closeButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: COLORS.textMuted,
  cursor: 'pointer',
  fontSize: '16px',
  padding: '2px 6px',
  lineHeight: 1,
};

/** Title text */
export const titleStyle: CSSProperties = {
  fontWeight: 'bold',
  color: COLORS.accent,
  fontSize: FONTS.size,
};

/** Object count text */
export const countStyle: CSSProperties = {
  fontSize: FONTS.sizeXs,
  color: COLORS.textMuted,
  marginLeft: 8,
};
