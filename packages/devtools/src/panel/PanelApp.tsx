import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  checkBridgeReady,
  getSnapshot,
  getSelection,
  select,
  inspect,
  setInspectMode,
  flattenSnapshotTree,
  getCanvasIds,
  setTargetCanvas,
  getTargetCanvas,
  type ObjectMetadata,
  type ObjectInspection,
  type GeometryInspection,
  type MaterialInspection,
} from './pageBridge';
import { DevToolsTree, buildTree } from './DevToolsTree';
import { panelStyles, COLORS } from './styles';

const REFRESH_MS = 500;
const SELECTION_POLL_MS = 300;

// ---------------------------------------------------------------------------
// Simple search filter (name, testId, type, uuid)
// ---------------------------------------------------------------------------

function filterList(list: ObjectMetadata[], query: string): ObjectMetadata[] {
  if (!query.trim()) return list;
  const q = query.toLowerCase();
  return list.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      (m.testId && m.testId.toLowerCase().includes(q)) ||
      m.type.toLowerCase().includes(q) ||
      m.uuid.toLowerCase().startsWith(q),
  );
}

// ---------------------------------------------------------------------------
// Property detail pane
// ---------------------------------------------------------------------------

const SIDE_NAMES: Record<number, string> = { 0: 'Front', 1: 'Back', 2: 'Double' };

function GeometrySection({ geo, meta }: { geo: GeometryInspection; meta: ObjectMetadata }) {
  const attrEntries = Object.entries(geo.attributes ?? {});
  return (
    <>
      <div style={panelStyles.propSection}>Geometry</div>
      <PropRow label="Type" value={geo.type || meta.geometryType || ''} />
      {meta.vertexCount != null && <PropRow label="Vertices" value={fmtNum(meta.vertexCount)} />}
      {meta.triangleCount != null && <PropRow label="Triangles" value={fmtNum(meta.triangleCount)} />}
      {geo.index && <PropRow label="Indices" value={fmtNum(geo.index.count)} />}
      {attrEntries.length > 0 && (
        <>
          <PropRow label="Attributes" value={String(attrEntries.length)} />
          {attrEntries.map(([name, attr]) => (
            <PropRow key={name} label={`  ${name}`} value={`${attr.count} × ${attr.itemSize}`} />
          ))}
        </>
      )}
      {geo.boundingSphere && (
        <PropRow label="B-Sphere r" value={geo.boundingSphere.radius.toFixed(3)} />
      )}
    </>
  );
}

function MaterialSection({ mat }: { mat: MaterialInspection }) {
  const uniformEntries = Object.entries(mat.uniforms ?? {});
  return (
    <>
      <div style={panelStyles.propSection}>Material</div>
      <PropRow label="Type" value={mat.type} />
      {mat.color && <ColorRow label="Color" color={mat.color} />}
      {mat.opacity != null && <PropRow label="Opacity" value={String(mat.opacity)} />}
      {mat.transparent != null && <PropRow label="Transparent" value={String(mat.transparent)} />}
      {mat.side != null && <PropRow label="Side" value={SIDE_NAMES[mat.side] ?? String(mat.side)} />}
      {mat.map && <PropRow label="Map" value={mat.map} />}
      {uniformEntries.length > 0 && (
        <>
          <PropRow label="Uniforms" value={String(uniformEntries.length)} />
          {uniformEntries.map(([name, val]) => (
            <PropRow key={name} label={`  ${name}`} value={fmtUniform(val)} />
          ))}
        </>
      )}
    </>
  );
}

function CameraSection({ meta }: { meta: ObjectMetadata }) {
  return (
    <>
      <div style={panelStyles.propSection}>Camera</div>
      {meta.fov != null && <PropRow label="FOV" value={`${meta.fov}°`} />}
      {meta.near != null && <PropRow label="Near" value={String(meta.near)} />}
      {meta.far != null && <PropRow label="Far" value={String(meta.far)} />}
      {meta.zoom != null && <PropRow label="Zoom" value={String(meta.zoom)} />}
    </>
  );
}

function PropertyDetail({ data }: { data: ObjectInspection | null }) {
  if (!data) {
    return (
      <div style={panelStyles.propPane}>
        <div style={panelStyles.propEmpty}>Select an object to inspect</div>
      </div>
    );
  }

  const m = data.metadata;
  if (!m) return <div style={panelStyles.propPane}><div style={panelStyles.propEmpty}>No metadata</div></div>;

  return (
    <div style={panelStyles.propPane}>
      <div style={panelStyles.propSection}>Identity</div>
      <PropRow label="Type" value={m.type} />
      {m.name && <PropRow label="Name" value={m.name} />}
      {m.testId && <PropRow label="testId" value={m.testId} />}
      <PropRow label="UUID" value={m.uuid} />
      <PropRow label="Visible" value={String(m.visible)} />

      <div style={panelStyles.propSection}>Transform</div>
      <PropRow label="Position" value={fmtVec(m.position)} />
      <PropRow label="Rotation" value={fmtVec(m.rotation)} />
      <PropRow label="Scale" value={fmtVec(m.scale)} />

      {m.near != null && <CameraSection meta={m} />}

      {data.geometry && <GeometrySection geo={data.geometry} meta={m} />}

      {data.material && <MaterialSection mat={data.material} />}

      {data.bounds && Array.isArray(data.bounds.min) && Array.isArray(data.bounds.max) && (
        <>
          <div style={panelStyles.propSection}>Bounds</div>
          <PropRow label="Min" value={fmtVec(data.bounds.min)} />
          <PropRow label="Max" value={fmtVec(data.bounds.max)} />
        </>
      )}
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  if (value == null || value === '') return null;
  return (
    <div style={panelStyles.propRow}>
      <span style={panelStyles.propLabel}>{label}</span>
      <span style={panelStyles.propValue}>{value}</span>
    </div>
  );
}

function ColorRow({ label, color }: { label: string; color: string }) {
  return (
    <div style={panelStyles.propRow}>
      <span style={panelStyles.propLabel}>{label}</span>
      <span style={panelStyles.propValueWithSwatch}>
        <span style={{ ...panelStyles.colorSwatch, background: color }} />
        {color}
      </span>
    </div>
  );
}

function fmtVec(v: unknown): string {
  if (!Array.isArray(v) || v.length < 3) return '—';
  const a = v as unknown[];
  const n0 = Number(a[0]), n1 = Number(a[1]), n2 = Number(a[2]);
  if (Number.isFinite(n0) && Number.isFinite(n1) && Number.isFinite(n2)) {
    return `${n0.toFixed(3)}, ${n1.toFixed(3)}, ${n2.toFixed(3)}`;
  }
  return '—';
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtUniform(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'number') return val.toFixed(4);
  if (typeof val === 'boolean' || typeof val === 'string') return String(val);
  if (Array.isArray(val)) return `[${val.map((v) => typeof v === 'number' ? v.toFixed(2) : String(v)).join(', ')}]`;
  return String(val);
}

// ---------------------------------------------------------------------------
// PanelApp — main DevTools panel
// ---------------------------------------------------------------------------

export function PanelApp() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [objectList, setObjectList] = useState<ObjectMetadata[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [inspection, setInspection] = useState<ObjectInspection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [inspectModeOn, setInspectModeOn] = useState(false);
  const [canvasIds, setCanvasIds] = useState<string[]>([]);
  const [activeCanvas, setActiveCanvas] = useState<string | null>(getTargetCanvas());

  const handleCanvasChange = useCallback((canvasId: string | null) => {
    setTargetCanvas(canvasId);
    setActiveCanvas(canvasId);
    setSelectedUuid(null);
    setInspection(null);
  }, []);

  // Poll for available canvas IDs
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const ids = await getCanvasIds();
      if (!cancelled) setCanvasIds(ids);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Check bridge and poll snapshot
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const ok = await checkBridgeReady();
      if (cancelled) return;
      setReady(ok);
      if (!ok) {
        setObjectList([]);
        return;
      }
      const snap = await getSnapshot();
      if (cancelled || !snap) return;
      setObjectList(flattenSnapshotTree(snap.tree, null));
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeCanvas]);

  // Poll the SelectionManager for changes from canvas inspect clicks.
  // Elements tab sync is handled by devtools.js setting __r3fdom_hovered__
  // which the Highlighter picks up directly — the panel only needs to track
  // its own selection and the SelectionManager.
  useEffect(() => {
    if (!ready) return;
    let lastPolledUuid: string | null = null;
    const tick = async () => {
      const uuids = await getSelection();
      const current = uuids.length > 0 ? uuids[0] : null;
      if (current && current !== lastPolledUuid) {
        lastPolledUuid = current;
        setSelectedUuid(current);
      }
    };
    tick();
    const id = setInterval(tick, SELECTION_POLL_MS);
    return () => clearInterval(id);
  }, [ready]);

  // Inspect selected object (only show result when it matches current selection — avoids stale/wrong details)
  useEffect(() => {
    if (!ready || !selectedUuid) { setInspection(null); return; }
    const currentUuid = selectedUuid;
    setInspection(null); // clear until correct result loads
    let cancelled = false;
    const load = async () => {
      const result = await inspect(currentUuid);
      if (!cancelled && result?.metadata?.uuid === currentUuid) setInspection(result);
    };
    load();
    const id = setInterval(load, 300);
    return () => { cancelled = true; clearInterval(id); };
  }, [ready, selectedUuid]);

  const filteredList = useMemo(() => filterList(objectList, searchQuery), [objectList, searchQuery]);
  const treeRoots = useMemo(() => buildTree(filteredList), [filteredList]);

  const handleSelect = useCallback(async (uuid: string) => {
    await select(uuid);
    setSelectedUuid(uuid);
    setDetailsOpen(true); // Re-open details when user clicks an object in the tree
  }, []);

  const handleToggleInspectMode = useCallback(async () => {
    const next = !inspectModeOn;
    await setInspectMode(next);
    setInspectModeOn(next);
  }, [inspectModeOn]);

  // -------------------------------------------------------------------------
  // Not ready states
  // -------------------------------------------------------------------------

  if (ready === null) {
    return (
      <div style={panelStyles.container}>
        <div style={panelStyles.message}>Checking for React Three DOM…</div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={panelStyles.container}>
        <div style={panelStyles.message}>
          No React Three DOM bridge on this page.
          <br /><br />
          Add <code style={panelStyles.code}>&lt;ThreeDom /&gt;</code> inside
          your R3F <code style={panelStyles.code}>&lt;Canvas&gt;</code> and
          refresh.
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main layout: search + tree (left) + properties (right)
  // -------------------------------------------------------------------------

  return (
    <div style={panelStyles.container}>
      {/* Search bar + Canvas picker + Select on canvas */}
      <div style={panelStyles.searchBar}>
        {canvasIds.length > 0 && (
          <select
            value={activeCanvas ?? ''}
            onChange={(e) => handleCanvasChange(e.target.value || null)}
            style={{
              ...panelStyles.searchInput,
              flex: 'none',
              width: 'auto',
              minWidth: 80,
              cursor: 'pointer',
            }}
            title="Select canvas instance"
          >
            <option value="">Default</option>
            {canvasIds.map((cid) => (
              <option key={cid} value={cid}>{cid}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by name, testId, type…"
          style={panelStyles.searchInput}
        />
        {searchQuery && (
          <span style={panelStyles.searchCount}>
            {filteredList.length} / {objectList.length}
          </span>
        )}
        <button
          type="button"
          title="Pick a 3D element: hover to preview in Elements tab, click to select"
          style={{
            ...panelStyles.searchInput,
            flex: 'none',
            cursor: 'pointer',
            padding: '4px 10px',
            fontWeight: inspectModeOn ? 600 : 400,
            background: inspectModeOn ? COLORS.accent : COLORS.bg,
            color: inspectModeOn ? '#fff' : COLORS.text,
            borderColor: inspectModeOn ? COLORS.accent : COLORS.border,
          }}
          onClick={handleToggleInspectMode}
        >
          {inspectModeOn ? '\u25CE Pick Element (on)' : '\u25CE Pick Element'}
        </button>
      </div>

      {/* Body: tree + details pane */}
      <div style={panelStyles.body}>
        {/* Scene tree */}
        <div
          style={{
            ...panelStyles.treePane,
            ...(detailsOpen ? {} : { borderRight: 'none' }),
          }}
        >
          <div style={panelStyles.sectionHeader}>SCENES</div>
          <DevToolsTree
            roots={treeRoots}
            selectedUuid={selectedUuid}
            onSelect={handleSelect}
          />
        </div>

        {/* Details pane with close button */}
        {detailsOpen && (
          <div style={panelStyles.detailsPane}>
            <div style={panelStyles.detailsPaneHeader}>
              <span>Details</span>
              <button
                type="button"
                title="Close details"
                style={panelStyles.detailsCloseBtn}
                onClick={() => setDetailsOpen(false)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.bgTertiary;
                  e.currentTarget.style.color = COLORS.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = COLORS.textMuted;
                }}
              >
                ✕
              </button>
            </div>
            <PropertyDetail data={inspection} />
          </div>
        )}
      </div>
    </div>
  );
}
