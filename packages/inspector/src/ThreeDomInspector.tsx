import { useState, useCallback, type CSSProperties } from 'react';
import type { ObjectStore, SelectionManager, Highlighter } from '@react-three-dom/core';
import {
  useObjectList,
  useInspection,
  useSelection,
  useSearch,
  useHotkey,
  useTreeData,
  useDebouncedValue,
} from './hooks';
import { SearchBar } from './SearchBar';
import { TreeView } from './TreeView';
import { PropertyPane } from './PropertyPane';
import {
  panelStyle,
  headerStyle,
  titleStyle,
  countStyle,
  closeButtonStyle,
} from './styles';

// ---------------------------------------------------------------------------
// ThreeDomInspector — main inspector overlay panel
//
// A React component rendered OUTSIDE the Canvas (in the regular DOM).
// Reads from the ObjectStore and SelectionManager provided as props,
// or falls back to the global singletons from the core package.
// ---------------------------------------------------------------------------

export interface ThreeDomInspectorProps {
  /** ObjectStore instance. Falls back to getStore() from core if not provided. */
  store?: ObjectStore | null;
  /** SelectionManager instance. Falls back to getSelectionManager() from core. */
  selectionManager?: SelectionManager | null;
  /** Hotkey to toggle the inspector. Default: "Ctrl+Shift+I" */
  hotkey?: string;
  /** Panel position. Default: "right" */
  position?: 'left' | 'right';
  /** Panel width in pixels. Default: 320 */
  width?: number;
  /** Whether the panel starts open. Default: false */
  defaultOpen?: boolean;
  /** Metadata polling interval in ms. Default: 500 */
  refreshMs?: number;
}

export function ThreeDomInspector({
  store: storeProp,
  selectionManager: smProp,
  hotkey = 'Ctrl+Shift+I',
  position = 'right',
  width = 320,
  defaultOpen = false,
  refreshMs = 500,
}: ThreeDomInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [searchQuery, setSearchQuery] = useState('');

  // Resolve store and selection manager
  // Use props if provided, otherwise try global singletons
  const store = storeProp ?? getGlobalStore();
  const selectionManager = smProp ?? getGlobalSelectionManager();

  // Toggle visibility
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useHotkey(hotkey, toggle);

  // Data hooks
  const allObjects = useObjectList(store, refreshMs);
  const debouncedQuery = useDebouncedValue(searchQuery, 150);
  const filteredObjects = useSearch(allObjects, debouncedQuery);
  const treeRoots = useTreeData(filteredObjects);
  const selectedUuid = useSelection(selectionManager);
  const inspection = useInspection(store, selectedUuid);

  // Select handler — tells the SelectionManager to select the object
  const handleSelect = useCallback(
    (uuid: string) => {
      if (!store || !selectionManager) return;
      const obj = store.getObject3D(uuid);
      if (obj) {
        selectionManager.select(obj);
      }
    },
    [store, selectionManager],
  );

  // Hover handler — shows DevTools-style hover overlay on the 3D object
  const highlighter = getGlobalHighlighter();
  const handleHover = useCallback(
    (uuid: string | null) => {
      if (!store || !highlighter) return;
      if (!uuid) {
        highlighter.clearHoverHighlight();
        return;
      }
      const obj = store.getObject3D(uuid);
      if (obj) {
        highlighter.showHoverHighlight(obj);
      }
    },
    [store, highlighter],
  );

  if (!open) return null;

  const posStyle: CSSProperties =
    position === 'right' ? { right: 0 } : { left: 0 };

  return (
    <div
      style={{
        ...panelStyle,
        ...posStyle,
        width,
        ...(position === 'left'
          ? { borderLeft: 'none', borderRight: `1px solid #3c3c3c` }
          : {}),
      }}
    >
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={titleStyle}>ThreeDom Inspector</span>
          <span style={countStyle}>
            {allObjects.length} objects
          </span>
        </div>
        <button style={closeButtonStyle} onClick={toggle} title="Close (or use hotkey)">
          ✕
        </button>
      </div>

      {/* Search */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        resultCount={filteredObjects.length}
        totalCount={allObjects.length}
      />

      {/* Tree */}
      <TreeView
        roots={treeRoots}
        selectedUuid={selectedUuid}
        onSelect={handleSelect}
        onHover={handleHover}
      />

      {/* Property pane */}
      <PropertyPane inspection={inspection} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global singleton fallbacks
// We import directly from @react-three-dom/core (already a dependency).
// ---------------------------------------------------------------------------

import {
  getStore as coreGetStore,
  getSelectionManager as coreGetSelectionManager,
  getHighlighter as coreGetHighlighter,
} from '@react-three-dom/core';

function getGlobalStore(): ObjectStore | null {
  return coreGetStore?.() ?? null;
}

function getGlobalSelectionManager(): SelectionManager | null {
  return coreGetSelectionManager?.() ?? null;
}

function getGlobalHighlighter(): Highlighter | null {
  return coreGetHighlighter?.() ?? null;
}
