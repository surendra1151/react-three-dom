// @react-three-dom/inspector
// In-app inspector overlay UI for React Three Fiber scene graphs

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export {
  ThreeDomInspector,
  type ThreeDomInspectorProps,
} from './ThreeDomInspector';

// ---------------------------------------------------------------------------
// Sub-components (for custom layouts)
// ---------------------------------------------------------------------------

export { TreeView, type TreeViewProps } from './TreeView';
export { SearchBar, type SearchBarProps } from './SearchBar';
export { PropertyPane, type PropertyPaneProps } from './PropertyPane';

// ---------------------------------------------------------------------------
// Hooks (for building custom inspector UIs)
// ---------------------------------------------------------------------------

export {
  useObjectList,
  useInspection,
  useSelection,
  useSearch,
  useHotkey,
  useTreeData,
  useDebouncedValue,
  type TreeNode,
} from './hooks';

// ---------------------------------------------------------------------------
// Styles (for theming / extending)
// ---------------------------------------------------------------------------

export { COLORS, FONTS } from './styles';
