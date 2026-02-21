import type { CSSProperties } from 'react';

// Light theme to match Chrome DevTools / browser console
export const COLORS = {
  bg: '#ffffff',
  bgSecondary: '#f5f5f5',
  bgTertiary: '#e8e8e8',
  border: '#e0e0e0',
  text: '#202124',
  textSecondary: '#5f6368',
  textMuted: '#80868b',
  accent: '#1a73e8',
};

export const panelStyles: Record<string, CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    color: COLORS.text,
    background: COLORS.bg,
  },

  // Search bar
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
    color: COLORS.text,
    padding: '4px 8px',
    fontSize: 12,
    outline: 'none',
  },
  searchCount: {
    color: COLORS.textMuted,
    fontSize: 11,
    flexShrink: 0,
  },

  // Body: tree + property split
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },

  // Left: tree pane
  treePane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${COLORS.border}`,
    minWidth: 0,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: COLORS.textMuted,
    background: COLORS.bgSecondary,
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  },

  // Right: details section (wrapper with header + close)
  detailsPane: {
    width: 260,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: `1px solid ${COLORS.border}`,
    background: COLORS.bgSecondary,
    overflow: 'hidden',
  },
  detailsPaneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 6px 4px 8px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: COLORS.textMuted,
    background: COLORS.bgTertiary,
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  },
  detailsCloseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    padding: 0,
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: COLORS.textMuted,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  },
  showDetailsBtn: {
    padding: '6px 10px',
    fontSize: 11,
    color: COLORS.accent,
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
    cursor: 'pointer',
    flexShrink: 0,
  },
  // Property pane content (scrollable)
  propPane: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    fontSize: 11,
    color: COLORS.text,
  },
  propEmpty: {
    padding: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  propSection: {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: COLORS.textMuted,
    background: COLORS.bgTertiary,
    borderTop: `1px solid ${COLORS.border}`,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  propRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 8px',
    borderBottom: `1px solid ${COLORS.border}`,
  },
  propLabel: {
    color: COLORS.textSecondary,
  },
  propValue: {
    color: COLORS.text,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  colorSwatch: {
    display: 'inline-block',
    width: 12,
    height: 12,
    borderRadius: 2,
    border: `1px solid ${COLORS.border}`,
    verticalAlign: 'middle',
    marginRight: 6,
    flexShrink: 0,
  },
  propValueWithSwatch: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    color: COLORS.text,
    maxWidth: 160,
    textAlign: 'right',
  },

  // Empty / message states
  message: {
    padding: 16,
    textAlign: 'center',
    color: COLORS.textMuted,
    lineHeight: 1.5,
  },
  code: {
    background: COLORS.bgTertiary,
    color: COLORS.text,
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11,
    border: `1px solid ${COLORS.border}`,
  },
};
