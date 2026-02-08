import { useState, useEffect, useRef } from 'react';
import type {
  ObjectStore,
  ObjectMetadata,
  ObjectInspection,
  SelectionManager,
} from '@react-three-dom/core';

// ---------------------------------------------------------------------------
// useObjectList — subscribe to ObjectStore and get all metadata
// ---------------------------------------------------------------------------

/**
 * Returns a flat list of all object metadata, refreshing at the given interval.
 * Uses polling since ObjectStore's amortized sync means objects change gradually.
 */
export function useObjectList(
  store: ObjectStore | null,
  refreshMs = 500,
): ObjectMetadata[] {
  const [list, setList] = useState<ObjectMetadata[]>([]);

  useEffect(() => {
    if (!store) return;

    const refresh = () => {
      const objects = store.getFlatList();
      const metas: ObjectMetadata[] = [];
      for (const obj of objects) {
        const meta = store.getMetadata(obj);
        if (meta) metas.push(meta);
      }
      setList(metas);
    };

    refresh();
    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [store, refreshMs]);

  return list;
}

// ---------------------------------------------------------------------------
// useInspection — on-demand Tier 2 inspection of selected object
// ---------------------------------------------------------------------------

export function useInspection(
  store: ObjectStore | null,
  selectedUuid: string | null,
): ObjectInspection | null {
  const [inspection, setInspection] = useState<ObjectInspection | null>(null);

  useEffect(() => {
    if (!store || !selectedUuid) {
      setInspection(null);
      return;
    }

    // Compute immediately
    const result = store.inspect(selectedUuid);
    setInspection(result);

    // Refresh periodically for animated objects
    const id = setInterval(() => {
      setInspection(store.inspect(selectedUuid));
    }, 200);

    return () => clearInterval(id);
  }, [store, selectedUuid]);

  return inspection;
}

// ---------------------------------------------------------------------------
// useSelection — subscribe to SelectionManager
// ---------------------------------------------------------------------------

export function useSelection(
  selectionManager: SelectionManager | null,
): string | null {
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!selectionManager) return;

    const unsub = selectionManager.subscribe((selected) => {
      const primary = selected[0];
      setSelectedUuid(primary?.uuid ?? null);
    });

    // Sync initial state
    const initial = selectionManager.getPrimary();
    setSelectedUuid(initial?.uuid ?? null);

    return unsub;
  }, [selectionManager]);

  return selectedUuid;
}

// ---------------------------------------------------------------------------
// useSearch — filter metadata list by search query
// ---------------------------------------------------------------------------

export function useSearch(
  list: ObjectMetadata[],
  query: string,
): ObjectMetadata[] {
  const [filtered, setFiltered] = useState<ObjectMetadata[]>(list);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(list);
      return;
    }

    const q = query.toLowerCase();
    setFiltered(
      list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.testId && m.testId.toLowerCase().includes(q)) ||
          m.type.toLowerCase().includes(q) ||
          m.uuid.toLowerCase().startsWith(q),
      ),
    );
  }, [list, query]);

  return filtered;
}

// ---------------------------------------------------------------------------
// useHotkey — toggle inspector with a keyboard shortcut
// ---------------------------------------------------------------------------

export function useHotkey(
  hotkey: string,
  callback: () => void,
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const parts = hotkey.toLowerCase().split('+').map((s) => s.trim());
    const needCtrl = parts.includes('ctrl') || parts.includes('control');
    const needShift = parts.includes('shift');
    const needAlt = parts.includes('alt');
    const needMeta = parts.includes('meta') || parts.includes('cmd');
    const key = parts.filter(
      (p) => !['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd'].includes(p),
    )[0];

    const handler = (e: KeyboardEvent) => {
      if (needCtrl && !e.ctrlKey) return;
      if (needShift && !e.shiftKey) return;
      if (needAlt && !e.altKey) return;
      if (needMeta && !e.metaKey) return;
      if (key && e.key.toLowerCase() !== key) return;
      e.preventDefault();
      cbRef.current();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkey]);
}

// ---------------------------------------------------------------------------
// useTreeData — build tree structure from flat metadata list
// ---------------------------------------------------------------------------

export interface TreeNode {
  meta: ObjectMetadata;
  children: TreeNode[];
  depth: number;
}

export function useTreeData(
  list: ObjectMetadata[],
): TreeNode[] {
  const [tree, setTree] = useState<TreeNode[]>([]);

  useEffect(() => {
    // Build a uuid -> metadata map
    const byUuid = new Map<string, ObjectMetadata>();
    for (const m of list) byUuid.set(m.uuid, m);

    // Build tree
    const roots: TreeNode[] = [];
    const nodeMap = new Map<string, TreeNode>();

    for (const m of list) {
      nodeMap.set(m.uuid, { meta: m, children: [], depth: 0 });
    }

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

    // Children are already in list order since we iterate in order

    setTree(roots);
  }, [list]);

  return tree;
}

// ---------------------------------------------------------------------------
// useDebouncedValue
// ---------------------------------------------------------------------------

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
