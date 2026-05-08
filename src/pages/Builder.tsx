/**
 * Factory Builder — the authoring surface for the new Twin model.
 *
 * Architecture (locked 2026-05-07):
 *   • Two drawable layers: Department (zoned regions) + Workstation (machines,
 *     tables, racks). Departments and Workstations have geometry on the canvas.
 *   • Three lenses (Operations · Resources · KPIs) decorate the same scene.
 *     Toggling a lens never changes the underlying data — it changes overlays
 *     and which inspector group is highlighted.
 *   • Scenario = a fork of the canonical twin. Switch scenarios with the picker
 *     in the top toolbar; edits route to whichever twin is active.
 *
 * This page reads/writes through the `useTwin` store. It is the single
 * authoring surface for the factory digital twin — there is no separate
 * "iso builder" anymore.
 */

import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS } from '../design/tokens';
import {
  ISO_FIXTURE_CATALOG,
  APPAREL_CATEGORIES,
  APPAREL_FIXTURE_PALETTE,
  isoProj,
  unproject,
  ptsToStr,
  type ApparelCategoryId,
  type IsoFixture,
} from '../domain';
import {
  useTwin,
  selectActiveTwin,
  type DepartmentColorKey,
} from '../store/twin';
import type { Department, Workstation, Rect } from '../domain/twin';

// ============================================================================
// CONSTANTS
// ============================================================================

const ISO_TILE = 32;
const ISO_THIN = ISO_TILE / 2;

type Lens = 'operations' | 'resources' | 'kpis';
type DropTool =
  | { kind: 'none' }
  | { kind: 'dept'; preset: DeptPreset }
  | { kind: 'ws'; catalogId: string };

interface DeptPreset {
  kind: string;
  color: DepartmentColorKey;
  label: string;
  defaultSize: { w: number; h: number };
}

const DEPT_PRESETS: DeptPreset[] = [
  { kind: 'Cutting',   color: 'green',  label: 'Cutting',   defaultSize: { w: 8, h: 6 } },
  { kind: 'Sewing',    color: 'blue',   label: 'Sewing',    defaultSize: { w: 10, h: 7 } },
  { kind: 'QC',        color: 'red',    label: 'QC',        defaultSize: { w: 6, h: 5 } },
  { kind: 'Finishing', color: 'yellow', label: 'Finishing', defaultSize: { w: 8, h: 6 } },
  { kind: 'Storage',   color: 'thread', label: 'Storage',   defaultSize: { w: 7, h: 5 } },
  { kind: 'Custom',    color: 'cream',  label: 'Custom',    defaultSize: { w: 6, h: 6 } },
];

const DEPT_COLOR_HEX: Record<DepartmentColorKey, string> = {
  fabric: SW_COLORS.fabric,
  thread: SW_COLORS.thread,
  brand: SW_COLORS.brand,
  red: SW_COLORS.alarm,
  blue: SW_COLORS.bobbin,
  yellow: SW_COLORS.thread,
  green: SW_COLORS.fabric,
  cream: SW_COLORS.paperEdge,
};

/** Resolve a catalog id to its IsoFixture entry. Used to look up draw-fn,
 *  footprint, and label from ids that live in the apparel palette. */
function resolveFixture(catalogId: string): IsoFixture | undefined {
  return ISO_FIXTURE_CATALOG.find((f) => f.id === catalogId);
}

// ============================================================================
// SHARED STYLE FRAGMENTS
// ============================================================================

const btnPrim: CSSProperties = {
  background: SW_COLORS.brand,
  border: 'none',
  color: '#fff',
  padding: '6px 12px',
  fontFamily: SW_FONTS.display,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  borderRadius: 6,
};

const btnSec: CSSProperties = {
  background: SW_COLORS.paper,
  border: `1px solid ${SW_COLORS.line}`,
  padding: '6px 11px',
  fontFamily: SW_FONTS.display,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  borderRadius: 6,
  color: SW_COLORS.steel,
};

const sectionLabel: CSSProperties = {
  fontFamily: SW_FONTS.mono,
  fontSize: 9,
  fontWeight: 700,
  color: SW_COLORS.muted,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const fieldLabel: CSSProperties = {
  fontFamily: SW_FONTS.mono,
  fontSize: 10,
  fontWeight: 600,
  color: SW_COLORS.steel,
  marginBottom: 3,
  display: 'block',
};

const inputBase: CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: 12,
  fontFamily: SW_FONTS.body,
  border: `1px solid ${SW_COLORS.line}`,
  borderRadius: 4,
  background: SW_COLORS.paper,
  color: SW_COLORS.ink,
};

// ============================================================================
// MAIN PAGE
// ============================================================================

export function BuilderPage() {
  const navigate = useNavigate();
  const twin = useTwin(selectActiveTwin);
  const activeScenarioId = useTwin((s) => s.activeScenarioId);
  const scenarios = useTwin((s) => s.scenarios);
  const canonical = useTwin((s) => s.canonical);

  const addDepartment = useTwin((s) => s.addDepartment);
  const moveDepartment = useTwin((s) => s.moveDepartment);
  const updateDepartment = useTwin((s) => s.updateDepartment);
  const removeDepartment = useTwin((s) => s.removeDepartment);
  const addWorkstation = useTwin((s) => s.addWorkstation);
  const moveWorkstation = useTwin((s) => s.moveWorkstation);
  const updateWorkstation = useTwin((s) => s.updateWorkstation);
  const removeWorkstation = useTwin((s) => s.removeWorkstation);
  const rotateWorkstation = useTwin((s) => s.rotateWorkstation);
  const duplicateWorkstation = useTwin((s) => s.duplicateWorkstation);
  const setOperation = useTwin((s) => s.setOperation);
  const setResources = useTwin((s) => s.setResources);
  const setKpiTargets = useTwin((s) => s.setKpiTargets);
  const renameActive = useTwin((s) => s.renameActive);
  const createScenarioFromCanonical = useTwin(
    (s) => s.createScenarioFromCanonical,
  );
  const setActiveScenario = useTwin((s) => s.setActiveScenario);
  const deleteScenario = useTwin((s) => s.deleteScenario);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [drop, setDrop] = useState<DropTool>({ kind: 'none' });
  const [selected, setSelected] = useState<
    { kind: 'dept' | 'ws'; id: string } | null
  >(null);
  const [lens, setLens] = useState<Lens>('operations');
  const [paletteTab, setPaletteTab] = useState<'dept' | 'ws'>('dept');
  const [activeApparelCat, setActiveApparelCat] = useState<ApparelCategoryId>('sew_mach');
  const [paletteSearch, setPaletteSearch] = useState<string>('');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef(pan);
  panRef.current = pan;
  const spacePanRef = useRef(false);
  spacePanRef.current = spacePan;

  const ZOOM_MIN = 0.3;
  const ZOOM_MAX = 3;
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  /** Zoom toward a screen point (relative to canvas top-left). Keeps the
   *  point under the cursor anchored as zoom changes. */
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = cx - rect.width / 2;
    const dy = cy - rect.height / 2;
    const z = zoomRef.current;
    const p = panRef.current;
    const newZ = clampZoom(z * factor);
    if (newZ === z) return;
    setZoom(newZ);
    setPan({
      x: dx - ((dx - p.x) / z) * newZ,
      y: dy - ((dy - p.y) / z) * newZ,
    });
  }, []);

  /** Apparel-grouped catalog for the active category. When the user is
   *  searching, we ignore the active-category filter and search across
   *  every apparel-curated id instead. */
  const filteredApparelCatalog = useMemo(() => {
    const ids = paletteSearch.trim()
      ? Object.values(APPAREL_FIXTURE_PALETTE).flat()
      : APPAREL_FIXTURE_PALETTE[activeApparelCat];
    const fixtures = ids
      .map(resolveFixture)
      .filter((f): f is IsoFixture => Boolean(f));
    if (!paletteSearch.trim()) return fixtures;
    const q = paletteSearch.trim().toLowerCase();
    return fixtures.filter(
      (f) => f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q),
    );
  }, [activeApparelCat, paletteSearch]);

  // ── Canvas pointer handlers ────────────────────────────────────────────────
  const onCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const sx = (e.clientX - rect.left - rect.width / 2 - pan.x) / zoom;
      const sy = (e.clientY - rect.top - rect.height / 2 - pan.y) / zoom;
      const w = unproject(sx, sy);
      const cell = { x: Math.floor(w.x), y: Math.floor(w.y) };
      if (cell.x >= 0 && cell.x < twin.gridW && cell.y >= 0 && cell.y < twin.gridH) {
        setHoverCell(cell);
      } else {
        setHoverCell(null);
      }
    },
    [pan, zoom, twin.gridW, twin.gridH],
  );

  const onCanvasClick = useCallback(() => {
    if (!hoverCell) return;
    if (drop.kind === 'dept') {
      const id = addDepartment({
        name: drop.preset.label + ' ' + (twin.departments.filter(d => d.kind === drop.preset.kind).length + 1),
        kind: drop.preset.kind,
        color: drop.preset.color,
        bounds: {
          x: hoverCell.x,
          y: hoverCell.y,
          w: drop.preset.defaultSize.w,
          h: drop.preset.defaultSize.h,
        },
      });
      setSelected({ kind: 'dept', id });
      setDrop({ kind: 'none' });
      return;
    }
    if (drop.kind === 'ws') {
      // Find the department that contains this cell, if any.
      const dept = twin.departments.find((d) =>
        hoverCell.x >= d.bounds.x &&
        hoverCell.x < d.bounds.x + d.bounds.w &&
        hoverCell.y >= d.bounds.y &&
        hoverCell.y < d.bounds.y + d.bounds.h,
      );
      if (!dept) {
        // Outside any department — clear the tool but don't drop.
        return;
      }
      const id = addWorkstation({
        deptId: dept.id,
        catalogId: drop.catalogId,
        position: { x: hoverCell.x, y: hoverCell.y },
      });
      setSelected({ kind: 'ws', id });
      setDrop({ kind: 'none' });
      return;
    }
    // No tool: clicking empty canvas clears selection.
    setSelected(null);
  }, [hoverCell, drop, addDepartment, addWorkstation, twin.departments]);

  const beginPanFromPoint = useCallback((startX: number, startY: number) => {
    const p0 = { ...panRef.current };
    setIsPanning(true);
    function move(ev: MouseEvent) {
      setPan({ x: p0.x + (ev.clientX - startX), y: p0.y + (ev.clientY - startY) });
    }
    function up() {
      setIsPanning(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, []);

  const onPanStart = (e: React.MouseEvent) => {
    if (drop.kind !== 'none') return;
    if (e.button !== 0) return;
    if (spacePan) return; // capture-phase listener handles space-pan
    const t = e.target as Element;
    // Only pan when clicking the canvas background — let entity clicks bubble.
    if (t.tagName !== 'svg' && !(t as SVGElement).getAttribute?.('data-canvas-bg')) return;
    beginPanFromPoint(e.clientX, e.clientY);
  };

  // Wheel zoom (zoom-toward-cursor). React's wheel listener is passive at the
  // root, so we attach a non-passive native listener to call preventDefault
  // and stop the page from scrolling while zooming over the canvas.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      // Trackpad pinch reports ctrlKey+small delta; mouse wheel reports larger
      // delta. Same exponential map handles both, with a stronger response
      // when ctrlKey is set so pinch feels natural.
      const k = ev.ctrlKey ? 0.012 : 0.0015;
      const factor = Math.exp(-ev.deltaY * k);
      zoomAt(cx, cy, factor);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Space-held or middle-mouse-button pan, intercepted in capture phase so it
  // wins over entity drag handlers.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onDownCapture(ev: MouseEvent) {
      const wantsPan = spacePanRef.current || ev.button === 1;
      if (!wantsPan) return;
      ev.preventDefault();
      ev.stopPropagation();
      beginPanFromPoint(ev.clientX, ev.clientY);
    }
    el.addEventListener('mousedown', onDownCapture, true);
    return () => el.removeEventListener('mousedown', onDownCapture, true);
  }, [beginPanFromPoint]);

  // ── Drag-to-move ───────────────────────────────────────────────────────────
  // Keep zoom in a ref so the drag closure always reads the latest zoom
  // without re-binding listeners on every zoom change.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const startEntityDrag = useCallback(
    (kind: 'ws' | 'dept', id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const initial = (() => {
        const t = selectActiveTwin(useTwin.getState());
        if (kind === 'ws') {
          const w = t.workstations.find((x) => x.id === id);
          return w ? { x: w.position.x, y: w.position.y } : null;
        }
        const d = t.departments.find((x) => x.id === id);
        return d ? { x: d.bounds.x, y: d.bounds.y } : null;
      })();
      if (!initial) return;
      setSelected({ kind, id });
      let moved = false;
      function onMove(ev: MouseEvent) {
        const dx = (ev.clientX - startX) / zoomRef.current;
        const dy = (ev.clientY - startY) / zoomRef.current;
        const w = unproject(dx, dy);
        const nx = Math.round(initial!.x + w.x);
        const ny = Math.round(initial!.y + w.y);
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
        moved = true;
        if (kind === 'ws') {
          moveWorkstation(id, { x: nx, y: ny });
        } else {
          const t = selectActiveTwin(useTwin.getState());
          const dept = t.departments.find((x) => x.id === id);
          if (!dept) return;
          moveDepartment(id, { ...dept.bounds, x: nx, y: ny });
        }
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [moveWorkstation, moveDepartment],
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as Element)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // View shortcuts work even outside a selection.
      if (!inField && e.code === 'Space' && !spacePanRef.current && !e.repeat) {
        e.preventDefault();
        setSpacePan(true);
        return;
      }
      if (!inField && (e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        resetView();
        return;
      }
      if (!inField && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        setZoom((z) => clampZoom(z * 1.15));
        return;
      }
      if (!inField && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        setZoom((z) => clampZoom(z / 1.15));
        return;
      }

      if (inField) return;
      if (e.key === 'Escape') {
        setDrop({ kind: 'none' });
        return;
      }
      if (!selected) return;
      if (e.key === 'r' || e.key === 'R') {
        if (selected.kind === 'ws') rotateWorkstation(selected.id, e.shiftKey ? -1 : 1);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.kind === 'ws') removeWorkstation(selected.id);
        else removeDepartment(selected.id);
        setSelected(null);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        if (selected.kind === 'ws') {
          e.preventDefault();
          const newId = duplicateWorkstation(selected.id);
          if (newId) setSelected({ kind: 'ws', id: newId });
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') setSpacePan(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selected, rotateWorkstation, removeWorkstation, removeDepartment, duplicateWorkstation, resetView]);

  // ── Export JSON ────────────────────────────────────────────────────────────
  const onExportJson = useCallback(() => {
    const data = JSON.stringify(twin, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(twin.name || 'twin').replace(/[^a-z0-9_-]/gi, '-')}.twin.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [twin]);

  // ── Scenario picker ────────────────────────────────────────────────────────
  const onForkScenario = () => {
    const name = window.prompt(
      'Scenario name?',
      `Scenario ${scenarios.length + 1}`,
    );
    if (!name) return;
    createScenarioFromCanonical({ name, activate: true });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '280px 1fr 340px',
        gridTemplateRows: 'auto 1fr',
        background: SW_COLORS.paperDeep,
        fontFamily: SW_FONTS.body,
      }}
    >
      {/* TOP TOOLBAR */}
      <div
        style={{
          gridColumn: '1 / 4',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: SW_COLORS.paper,
          borderBottom: `1px solid ${SW_COLORS.line}`,
        }}
      >
        <button onClick={() => navigate('/')} style={btnSec}>
          ← MENU
        </button>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em' }}>
          FACTORY BUILDER
        </div>

        {/* Active twin name (editable) */}
        <input
          value={twin.name}
          onChange={(e) => renameActive(e.target.value)}
          style={{
            ...inputBase,
            width: 220,
            background: SW_COLORS.paperDeep,
            fontWeight: 700,
          }}
        />

        {/* Scenario picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
          <span style={{ ...sectionLabel, marginBottom: 0 }}>SCENARIO</span>
          <select
            value={activeScenarioId ?? '__canonical__'}
            onChange={(e) => {
              const v = e.target.value;
              setActiveScenario(v === '__canonical__' ? null : v);
              setSelected(null);
            }}
            style={{ ...inputBase, width: 200 }}
          >
            <option value="__canonical__">◆ Canonical · {canonical.name}</option>
            {scenarios.map((scn) => (
              <option key={scn.id} value={scn.id}>
                ✦ {scn.name}
              </option>
            ))}
          </select>
          <button onClick={onForkScenario} style={btnSec} title="Fork the canonical twin into a new scenario">
            ✦ FORK
          </button>
          {activeScenarioId !== null && (
            <button
              onClick={() => {
                if (window.confirm('Delete this scenario?')) {
                  deleteScenario(activeScenarioId);
                }
              }}
              style={{ ...btnSec, color: SW_COLORS.alarm, borderColor: SW_COLORS.alarm + '60' }}
              title="Delete the active scenario"
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Lens toggles */}
        <div style={{ display: 'flex', gap: 4, background: SW_COLORS.paperDeep, padding: 3, borderRadius: 6, border: `1px solid ${SW_COLORS.line}` }}>
          {(['operations', 'resources', 'kpis'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLens(l)}
              style={{
                background: lens === l ? SW_COLORS.ink : 'transparent',
                color: lens === l ? '#fff' : SW_COLORS.steel,
                border: 'none',
                padding: '6px 12px',
                fontFamily: SW_FONTS.display,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <button onClick={onExportJson} style={btnSec} title="Download the active twin as JSON">
          ⤓ EXPORT JSON
        </button>
        <button onClick={() => navigate('/sim')} style={btnPrim}>
          ▶ RUN SIM
        </button>
      </div>

      {/* LEFT PALETTE */}
      <Palette
        tab={paletteTab}
        onTab={setPaletteTab}
        activeApparelCat={activeApparelCat}
        onActiveApparelCat={setActiveApparelCat}
        filteredApparelCatalog={filteredApparelCatalog}
        paletteSearch={paletteSearch}
        onPaletteSearch={setPaletteSearch}
        drop={drop}
        onPickDept={(preset) => setDrop({ kind: 'dept', preset })}
        onPickWs={(catalogId) => setDrop({ kind: 'ws', catalogId })}
      />

      {/* CANVAS */}
      <div
        ref={stageRef}
        onMouseMove={onCanvasMouseMove}
        onClick={onCanvasClick}
        onMouseDown={onPanStart}
        style={{
          gridColumn: '2',
          gridRow: '2',
          position: 'relative',
          overflow: 'hidden',
          background: '#FAF8F2',
          cursor: spacePan
            ? (isPanning ? 'grabbing' : 'grab')
            : isPanning
              ? 'grabbing'
              : drop.kind === 'none'
                ? 'default'
                : 'crosshair',
          touchAction: 'none',
        }}
      >
        {/* Hint chip when a tool is armed */}
        {drop.kind !== 'none' && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 5,
              padding: '8px 12px',
              background: SW_COLORS.brand,
              color: '#fff',
              fontFamily: SW_FONTS.display,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.06em',
              borderRadius: 6,
            }}
          >
            ✚{' '}
            {drop.kind === 'dept'
              ? `Click canvas to place ${drop.preset.label}`
              : 'Click inside a department to place workstation'}
          </div>
        )}

        {/* Empty-state hint */}
        {twin.departments.length === 0 && drop.kind === 'none' && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: SW_COLORS.muted,
              fontFamily: SW_FONTS.body,
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, color: SW_COLORS.steel, marginBottom: 4 }}>
              Empty factory
            </div>
            <div style={{ fontSize: 13 }}>
              Pick a department from the palette to start.
            </div>
          </div>
        )}

        {/* Stage transform */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: '50% 50%',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <CanvasSVG
            twin={twin}
            lens={lens}
            hoverCell={hoverCell}
            drop={drop}
            selected={selected}
            onSelect={(s) => setSelected(s)}
            onStartDrag={startEntityDrag}
          />
        </div>

        {/* Zoom & view controls */}
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            right: 14,
            display: 'flex',
            gap: 4,
            background: SW_COLORS.paper,
            padding: 3,
            borderRadius: 6,
            border: `1px solid ${SW_COLORS.line}`,
            zIndex: 5,
          }}
        >
          <button
            onClick={() => setZoom((z) => clampZoom(z / 1.15))}
            style={{ ...btnSec, padding: '4px 10px' }}
            title="Zoom out  (−)"
          >
            −
          </button>
          <button
            onClick={resetView}
            style={{ ...btnSec, padding: '4px 8px', minWidth: 56 }}
            title="Reset view  (⌘0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => clampZoom(z * 1.15))}
            style={{ ...btnSec, padding: '4px 10px' }}
            title="Zoom in  (+)"
          >
            +
          </button>
          <button
            onClick={resetView}
            style={{ ...btnSec, padding: '4px 8px' }}
            title="Reset zoom & pan"
          >
            ⤒
          </button>
        </div>

        {/* Bottom-left counter strip */}
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: 14,
            display: 'flex',
            gap: 8,
            zIndex: 5,
            alignItems: 'center',
          }}
        >
          <CountChip label="DEPTS" value={twin.departments.length} />
          <CountChip label="STATIONS" value={twin.workstations.length} />
          <span
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 9,
              fontWeight: 600,
              color: SW_COLORS.muted,
              letterSpacing: '0.06em',
              padding: '6px 10px',
              background: SW_COLORS.paper + 'cc',
              border: `1px solid ${SW_COLORS.line}`,
              borderRadius: 6,
            }}
          >
            DRAG · R rotate · Del remove · ⌘D duplicate · Esc cancel · SCROLL zoom · SPACE pan · ⌘0 reset
          </span>
        </div>
      </div>

      {/* RIGHT INSPECTOR */}
      <Inspector
        twin={twin}
        selected={selected}
        lens={lens}
        onUpdateDept={(id, patch) => updateDepartment(id, patch)}
        onRemoveDept={(id) => {
          removeDepartment(id);
          setSelected(null);
        }}
        onUpdateWs={(id, patch) => updateWorkstation(id, patch)}
        onRemoveWs={(id) => {
          removeWorkstation(id);
          setSelected(null);
        }}
        onSetOperation={setOperation}
        onSetResources={setResources}
        onSetKpiTargets={setKpiTargets}
      />
    </div>
  );
}

// ============================================================================
// PALETTE (left)
// ============================================================================

interface PaletteProps {
  tab: 'dept' | 'ws';
  onTab: (t: 'dept' | 'ws') => void;
  activeApparelCat: ApparelCategoryId;
  onActiveApparelCat: (c: ApparelCategoryId) => void;
  filteredApparelCatalog: IsoFixture[];
  paletteSearch: string;
  onPaletteSearch: (q: string) => void;
  drop: DropTool;
  onPickDept: (preset: DeptPreset) => void;
  onPickWs: (catalogId: string) => void;
}

function Palette(props: PaletteProps) {
  return (
    <div
      style={{
        gridColumn: '1',
        gridRow: '2',
        borderRight: `1px solid ${SW_COLORS.line}`,
        background: SW_COLORS.paper,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.display, fontSize: 12, fontWeight: 900, letterSpacing: '2px', color: SW_COLORS.ink }}>
        PALETTE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${SW_COLORS.line}` }}>
        {(['dept', 'ws'] as const).map((t) => (
          <button
            key={t}
            onClick={() => props.onTab(t)}
            style={{
              background: props.tab === t ? SW_COLORS.ink : 'transparent',
              color: props.tab === t ? '#fff' : SW_COLORS.steel,
              border: 'none',
              cursor: 'pointer',
              padding: '10px 0',
              fontFamily: SW_FONTS.display,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.08em',
            }}
          >
            {t === 'dept' ? 'DEPARTMENTS' : 'WORKSTATIONS'}
          </button>
        ))}
      </div>

      {props.tab === 'dept' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabel}>Drop a zoned region</div>
          {DEPT_PRESETS.map((preset) => {
            const armed = props.drop.kind === 'dept' && props.drop.preset.kind === preset.kind;
            return (
              <button
                key={preset.kind}
                onClick={() => props.onPickDept(preset)}
                style={{
                  background: armed ? SW_COLORS.brandLite : SW_COLORS.paperDeep,
                  border: `1px solid ${armed ? SW_COLORS.brand : SW_COLORS.line}`,
                  borderRadius: 6,
                  padding: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: DEPT_COLOR_HEX[preset.color],
                    flexShrink: 0,
                    border: `1px solid ${SW_COLORS.line}`,
                  }}
                />
                <span style={{ flex: 1 }}>
                  <div style={{ fontFamily: SW_FONTS.display, fontSize: 13, fontWeight: 800, color: SW_COLORS.ink }}>
                    {preset.label}
                  </div>
                  <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>
                    {preset.defaultSize.w} × {preset.defaultSize.h} cells
                  </div>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${APPAREL_CATEGORIES.length}, 1fr)`, borderBottom: `1px solid ${SW_COLORS.line}` }}>
            {APPAREL_CATEGORIES.map((c) => {
              const active = props.activeApparelCat === c.id && !props.paletteSearch.trim();
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    props.onActiveApparelCat(c.id);
                    props.onPaletteSearch('');
                  }}
                  title={c.label}
                  style={{
                    background: active ? SW_COLORS.ink : 'transparent',
                    color: active ? '#fff' : SW_COLORS.steel,
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px 0',
                    fontFamily: SW_FONTS.display,
                    fontSize: 13,
                    fontWeight: 900,
                  }}
                >
                  {c.icon}
                </button>
              );
            })}
          </div>
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${SW_COLORS.line}` }}>
            <div style={{ ...sectionLabel, marginBottom: 4 }}>
              {props.paletteSearch.trim()
                ? `SEARCH · ${props.filteredApparelCatalog.length} HIT${props.filteredApparelCatalog.length === 1 ? '' : 'S'}`
                : (APPAREL_CATEGORIES.find((c) => c.id === props.activeApparelCat)?.label ?? '').toUpperCase()}
            </div>
            <input
              value={props.paletteSearch}
              onChange={(e) => props.onPaletteSearch(e.target.value)}
              placeholder="Search assets…"
              style={{ ...inputBase, fontSize: 11, fontFamily: SW_FONTS.mono }}
            />
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {props.filteredApparelCatalog.map((a) => {
              const armed = props.drop.kind === 'ws' && props.drop.catalogId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => props.onPickWs(a.id)}
                  title={a.label}
                  style={{
                    background: armed ? SW_COLORS.brandLite : SW_COLORS.paperDeep,
                    border: `1px solid ${armed ? SW_COLORS.brand : SW_COLORS.line}`,
                    borderRadius: 6,
                    padding: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <svg width={56} height={42} viewBox="-32 -24 64 48" style={{ display: 'block' }}>
                    {a.draw({ w: a.w, d: a.d, h: a.h }) as ReactNode}
                  </svg>
                  <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.steel, textAlign: 'center', lineHeight: 1.2 }}>
                    {a.label}
                  </div>
                </button>
              );
            })}
            {props.filteredApparelCatalog.length === 0 && (
              <div style={{ gridColumn: '1 / 3', fontSize: 11, color: SW_COLORS.muted, fontStyle: 'italic', textAlign: 'center', padding: 16 }}>
                No assets match.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// CANVAS SVG
// ============================================================================

interface CanvasSVGProps {
  twin: ReturnType<typeof selectActiveTwin>;
  lens: Lens;
  hoverCell: { x: number; y: number } | null;
  drop: DropTool;
  selected: { kind: 'dept' | 'ws'; id: string } | null;
  onSelect: (s: { kind: 'dept' | 'ws'; id: string } | null) => void;
  onStartDrag: (kind: 'ws' | 'dept', id: string, e: React.MouseEvent) => void;
}

function CanvasSVG(props: CanvasSVGProps) {
  const { twin, lens, hoverCell, drop, selected } = props;

  // Compute SVG viewBox from grid extents.
  const cornerTL = isoProj(0, 0);
  const cornerTR = isoProj(twin.gridW, 0);
  const cornerBR = isoProj(twin.gridW, twin.gridH);
  const cornerBL = isoProj(0, twin.gridH);
  const minX = Math.min(cornerTL.sx, cornerBL.sx) - 60;
  const maxX = Math.max(cornerTR.sx, cornerBR.sx) + 60;
  const minY = Math.min(cornerTL.sy, cornerTR.sy) - 60;
  const maxY = Math.max(cornerBL.sy, cornerBR.sy) + 60;
  const vbW = maxX - minX;
  const vbH = maxY - minY;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', userSelect: 'none' }}
    >
      {/* Floor base — full grid quad */}
      <polygon
        data-canvas-bg="true"
        points={ptsToStr([cornerTL, cornerTR, cornerBR, cornerBL])}
        fill="#F2EEE3"
        stroke="#0F141920"
        strokeWidth={1}
      />

      {/* Grid lines */}
      {Array.from({ length: twin.gridW + 1 }, (_, i) => {
        const a = isoProj(i, 0);
        const b = isoProj(i, twin.gridH);
        return <line key={`v-${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#0F141910" strokeWidth={0.6} />;
      })}
      {Array.from({ length: twin.gridH + 1 }, (_, i) => {
        const a = isoProj(0, i);
        const b = isoProj(twin.gridW, i);
        return <line key={`h-${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#0F141910" strokeWidth={0.6} />;
      })}

      {/* DEPARTMENTS — drawn first so they sit under workstations */}
      {twin.departments.map((d) => (
        <DepartmentShape
          key={d.id}
          dept={d}
          selected={selected?.kind === 'dept' && selected.id === d.id}
          onClick={() => props.onSelect({ kind: 'dept', id: d.id })}
          onMouseDown={(e) => props.onStartDrag('dept', d.id, e)}
        />
      ))}

      {/* WORKSTATIONS — depth-sorted by x+y */}
      {[...twin.workstations]
        .sort((a, b) => a.position.x + a.position.y - (b.position.x + b.position.y))
        .map((w) => (
          <WorkstationSprite
            key={w.id}
            ws={w}
            selected={selected?.kind === 'ws' && selected.id === w.id}
            lens={lens}
            onClick={() => props.onSelect({ kind: 'ws', id: w.id })}
            onMouseDown={(e) => props.onStartDrag('ws', w.id, e)}
          />
        ))}

      {/* HOVER PREVIEW */}
      {hoverCell && drop.kind !== 'none' && (
        <HoverPreview cell={hoverCell} drop={drop} />
      )}
    </svg>
  );
}

// ── DEPARTMENT shape ──────────────────────────────────────────────────────────

function DepartmentShape({
  dept,
  selected,
  onClick,
  onMouseDown,
}: {
  dept: Department;
  selected: boolean;
  onClick: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const tl = isoProj(dept.bounds.x, dept.bounds.y);
  const tr = isoProj(dept.bounds.x + dept.bounds.w, dept.bounds.y);
  const br = isoProj(dept.bounds.x + dept.bounds.w, dept.bounds.y + dept.bounds.h);
  const bl = isoProj(dept.bounds.x, dept.bounds.y + dept.bounds.h);
  const fill = DEPT_COLOR_HEX[dept.color] ?? SW_COLORS.paperEdge;
  // Label centre
  const cx = (tl.sx + tr.sx + br.sx + bl.sx) / 4;
  const cy = (tl.sy + tr.sy + br.sy + bl.sy) / 4;
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={onMouseDown}
      style={{ cursor: 'move' }}
    >
      <polygon
        points={ptsToStr([tl, tr, br, bl])}
        fill={fill}
        fillOpacity={selected ? 0.5 : 0.32}
        stroke={selected ? SW_COLORS.brand : fill}
        strokeWidth={selected ? 3 : 1.5}
        strokeOpacity={selected ? 1 : 0.7}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={SW_FONTS.display}
        fontSize={13}
        fontWeight={900}
        fill={SW_COLORS.ink}
        opacity={0.7}
        style={{ pointerEvents: 'none', letterSpacing: '0.1em', textTransform: 'uppercase' }}
      >
        {dept.name}
      </text>
    </g>
  );
}

// ── WORKSTATION sprite ────────────────────────────────────────────────────────

function WorkstationSprite({
  ws,
  selected,
  lens,
  onClick,
  onMouseDown,
}: {
  ws: Workstation;
  selected: boolean;
  lens: Lens;
  onClick: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const fixture = ISO_FIXTURE_CATALOG.find((f) => f.id === ws.catalogId);
  if (!fixture) return null;

  const origin = isoProj(ws.position.x, ws.position.y);

  // KPI heat tint (lens=kpis only) — based on observed.utilizationPct.
  const heat =
    lens === 'kpis' && ws.kpiObserved
      ? heatColor(ws.kpiObserved.utilizationPct)
      : null;

  // Compute footprint bounds for the selection ring.
  const tl = isoProj(ws.position.x, ws.position.y);
  const tr = isoProj(ws.position.x + fixture.w, ws.position.y);
  const br = isoProj(ws.position.x + fixture.w, ws.position.y + fixture.d);
  const bl = isoProj(ws.position.x, ws.position.y + fixture.d);

  return (
    <g
      transform={`translate(${origin.sx}, ${origin.sy}) rotate(${ws.rotation})`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={onMouseDown}
      style={{ cursor: 'move' }}
    >
      {selected && (
        <polygon
          points={ptsToStr([
            { sx: 0, sy: 0 },
            { sx: tr.sx - tl.sx, sy: tr.sy - tl.sy },
            { sx: br.sx - tl.sx, sy: br.sy - tl.sy },
            { sx: bl.sx - tl.sx, sy: bl.sy - tl.sy },
          ])}
          fill="none"
          stroke={SW_COLORS.brand}
          strokeWidth={2.5}
          strokeDasharray="4 3"
        />
      )}
      {fixture.draw({ w: fixture.w, d: fixture.d, h: fixture.h }) as ReactNode}

      {/* KPI heat overlay */}
      {heat && (
        <polygon
          points={ptsToStr([
            { sx: 0, sy: 0 },
            { sx: tr.sx - tl.sx, sy: tr.sy - tl.sy },
            { sx: br.sx - tl.sx, sy: br.sy - tl.sy },
            { sx: bl.sx - tl.sx, sy: bl.sy - tl.sy },
          ])}
          fill={heat}
          fillOpacity={0.45}
        />
      )}

      {/* OPERATIONS lens badge */}
      {lens === 'operations' && (
        <g transform="translate(0, -28)">
          <rect x={-30} y={-9} width={60} height={14} rx={3} fill={SW_COLORS.ink} fillOpacity={0.85} />
          <text x={0} y={1} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={700} fill="#fff" style={{ letterSpacing: '0.04em' }}>
            {ws.operation.opId ?? ws.operation.freeText ?? '—'}
          </text>
        </g>
      )}

      {/* RESOURCES lens badge — worker count */}
      {lens === 'resources' && ws.resources.workersRequired > 0 && (
        <g transform="translate(0, -28)">
          <rect x={-22} y={-9} width={44} height={14} rx={3} fill={SW_COLORS.bobbin} fillOpacity={0.92} />
          <text x={0} y={1} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={700} fill="#fff" style={{ letterSpacing: '0.04em' }}>
            ☻ × {ws.resources.workersRequired}
          </text>
        </g>
      )}

      {/* KPIS lens badge — utilisation pct or "no run" */}
      {lens === 'kpis' && (
        <g transform="translate(0, -28)">
          <rect x={-26} y={-9} width={52} height={14} rx={3} fill={ws.kpiObserved ? SW_COLORS.brandDeep : SW_COLORS.muted} fillOpacity={0.92} />
          <text x={0} y={1} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={700} fill="#fff" style={{ letterSpacing: '0.04em' }}>
            {ws.kpiObserved ? `${Math.round(ws.kpiObserved.utilizationPct)}% util` : 'no run'}
          </text>
        </g>
      )}
    </g>
  );
}

function heatColor(util: number): string {
  // 0–60% green, 60–85% amber, 85+% red
  if (util < 60) return SW_COLORS.ok;
  if (util < 85) return SW_COLORS.warn;
  return SW_COLORS.alarm;
}

// ── HOVER PREVIEW ─────────────────────────────────────────────────────────────

function HoverPreview({ cell, drop }: { cell: { x: number; y: number }; drop: DropTool }) {
  if (drop.kind === 'dept') {
    const tl = isoProj(cell.x, cell.y);
    const tr = isoProj(cell.x + drop.preset.defaultSize.w, cell.y);
    const br = isoProj(cell.x + drop.preset.defaultSize.w, cell.y + drop.preset.defaultSize.h);
    const bl = isoProj(cell.x, cell.y + drop.preset.defaultSize.h);
    return (
      <polygon
        points={ptsToStr([tl, tr, br, bl])}
        fill={DEPT_COLOR_HEX[drop.preset.color]}
        fillOpacity={0.3}
        stroke={SW_COLORS.brand}
        strokeWidth={2}
        strokeDasharray="4 3"
        pointerEvents="none"
      />
    );
  }
  if (drop.kind === 'ws') {
    const fixture = ISO_FIXTURE_CATALOG.find((f) => f.id === drop.catalogId);
    if (!fixture) return null;
    const tl = isoProj(cell.x, cell.y);
    const tr = isoProj(cell.x + fixture.w, cell.y);
    const br = isoProj(cell.x + fixture.w, cell.y + fixture.d);
    const bl = isoProj(cell.x, cell.y + fixture.d);
    return (
      <polygon
        points={ptsToStr([tl, tr, br, bl])}
        fill={SW_COLORS.brand}
        fillOpacity={0.18}
        stroke={SW_COLORS.brand}
        strokeWidth={2}
        strokeDasharray="3 2"
        pointerEvents="none"
      />
    );
  }
  return null;
}

// ============================================================================
// INSPECTOR (right)
// ============================================================================

interface InspectorProps {
  twin: ReturnType<typeof selectActiveTwin>;
  selected: { kind: 'dept' | 'ws'; id: string } | null;
  lens: Lens;
  onUpdateDept: (id: string, patch: Partial<Department>) => void;
  onRemoveDept: (id: string) => void;
  onUpdateWs: (id: string, patch: Partial<Workstation>) => void;
  onRemoveWs: (id: string) => void;
  onSetOperation: (wsId: string, patch: Partial<Workstation['operation']>) => void;
  onSetResources: (wsId: string, patch: Partial<Workstation['resources']>) => void;
  onSetKpiTargets: (wsId: string, patch: Partial<Workstation['kpiTargets']>) => void;
}

function Inspector(props: InspectorProps) {
  const wrapper: CSSProperties = {
    gridColumn: '3',
    gridRow: '2',
    borderLeft: `1px solid ${SW_COLORS.line}`,
    background: SW_COLORS.paper,
    overflow: 'auto',
    padding: 14,
  };

  if (!props.selected) {
    return (
      <div style={wrapper}>
        <div style={sectionLabel}>Inspector</div>
        <div style={{ color: SW_COLORS.muted, fontSize: 12 }}>
          Click a department or workstation to inspect its parameters.
        </div>
      </div>
    );
  }

  if (props.selected.kind === 'dept') {
    const dept = props.twin.departments.find((d) => d.id === props.selected!.id);
    if (!dept) return <div style={wrapper}>Selection lost.</div>;
    return (
      <div style={wrapper}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={sectionLabel}>Department</div>
          <button onClick={() => props.onRemoveDept(dept.id)} style={{ ...btnSec, color: SW_COLORS.alarm, padding: '3px 8px' }}>
            ✕ DELETE
          </button>
        </div>

        <label style={fieldLabel}>Name</label>
        <input
          value={dept.name}
          onChange={(e) => props.onUpdateDept(dept.id, { name: e.target.value })}
          style={inputBase}
        />

        <div style={{ height: 10 }} />
        <label style={fieldLabel}>Kind</label>
        <input
          value={dept.kind}
          onChange={(e) => props.onUpdateDept(dept.id, { kind: e.target.value })}
          style={inputBase}
        />

        <div style={{ height: 10 }} />
        <label style={fieldLabel}>Colour</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(DEPT_COLOR_HEX) as DepartmentColorKey[]).map((c) => (
            <button
              key={c}
              onClick={() => props.onUpdateDept(dept.id, { color: c })}
              title={c}
              style={{
                width: 22, height: 22, borderRadius: 4,
                background: DEPT_COLOR_HEX[c],
                border: dept.color === c ? `2px solid ${SW_COLORS.ink}` : `1px solid ${SW_COLORS.line}`,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>

        <div style={{ height: 14 }} />
        <div style={sectionLabel}>Bounds (cells)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <NumField label="x"   value={dept.bounds.x} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, x: v } })} />
          <NumField label="y"   value={dept.bounds.y} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, y: v } })} />
          <NumField label="w"   value={dept.bounds.w} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, w: v } })} />
          <NumField label="h"   value={dept.bounds.h} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, h: v } })} />
        </div>

        <div style={{ height: 14 }} />
        <div style={sectionLabel}>
          Workstations in this dept · {props.twin.workstations.filter((w) => w.deptId === dept.id).length}
        </div>
      </div>
    );
  }

  // Workstation
  const ws = props.twin.workstations.find((w) => w.id === props.selected!.id);
  if (!ws) return <div style={wrapper}>Selection lost.</div>;
  const fixture = ISO_FIXTURE_CATALOG.find((f) => f.id === ws.catalogId);
  const dept = props.twin.departments.find((d) => d.id === ws.deptId);

  return (
    <div style={wrapper}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={sectionLabel}>Workstation</div>
        <button onClick={() => props.onRemoveWs(ws.id)} style={{ ...btnSec, color: SW_COLORS.alarm, padding: '3px 8px' }}>
          ✕ DELETE
        </button>
      </div>

      <label style={fieldLabel}>Name</label>
      <input
        value={ws.name}
        onChange={(e) => props.onUpdateWs(ws.id, { name: e.target.value })}
        style={inputBase}
      />
      <div style={{ marginTop: 4, fontSize: 11, color: SW_COLORS.muted }}>
        Fixture: <strong style={{ color: SW_COLORS.steel }}>{fixture?.label ?? ws.catalogId}</strong>{' '}
        · Dept: <strong style={{ color: SW_COLORS.steel }}>{dept?.name ?? '—'}</strong>
      </div>

      <div style={{ height: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <NumField label="x" value={ws.position.x} onChange={(v) => props.onUpdateWs(ws.id, { position: { ...ws.position, x: v } })} />
        <NumField label="y" value={ws.position.y} onChange={(v) => props.onUpdateWs(ws.id, { position: { ...ws.position, y: v } })} />
      </div>

      <div style={{ height: 14 }} />
      <LensSection
        title="Operations"
        active={props.lens === 'operations'}
      >
        <label style={fieldLabel}>Op id</label>
        <input
          value={ws.operation.opId ?? ''}
          onChange={(e) => props.onSetOperation(ws.id, { opId: e.target.value || null })}
          placeholder="e.g. shoulder_join"
          style={inputBase}
        />
        <div style={{ height: 8 }} />
        <label style={fieldLabel}>Garment id</label>
        <input
          value={ws.operation.garmentId ?? ''}
          onChange={(e) => props.onSetOperation(ws.id, { garmentId: e.target.value || undefined })}
          placeholder="e.g. tshirt"
          style={inputBase}
        />
        <div style={{ height: 8 }} />
        <label style={fieldLabel}>Free text (storage racks, generic tables, …)</label>
        <input
          value={ws.operation.freeText ?? ''}
          onChange={(e) => props.onSetOperation(ws.id, { freeText: e.target.value || undefined })}
          placeholder="e.g. fabric rolls — knit cotton"
          style={inputBase}
        />
      </LensSection>

      <LensSection title="Resources" active={props.lens === 'resources'}>
        <NumField
          label="Workers required"
          value={ws.resources.workersRequired}
          onChange={(v) => props.onSetResources(ws.id, { workersRequired: v })}
        />
        <div style={{ height: 8 }} />
        <NumField
          label="Power (kW)"
          step={0.1}
          value={ws.resources.powerKw ?? 0}
          onChange={(v) => props.onSetResources(ws.id, { powerKw: v })}
        />
      </LensSection>

      <LensSection title="KPI targets" active={props.lens === 'kpis'}>
        <NumField
          label="Capacity / hr"
          value={ws.kpiTargets.capacityPerHr ?? 0}
          onChange={(v) => props.onSetKpiTargets(ws.id, { capacityPerHr: v })}
        />
        <div style={{ height: 8 }} />
        <NumField
          label="Efficiency %"
          value={ws.kpiTargets.efficiencyPct ?? 0}
          onChange={(v) => props.onSetKpiTargets(ws.id, { efficiencyPct: v })}
        />
        <div style={{ height: 8 }} />
        <NumField
          label="Defect %"
          step={0.1}
          value={ws.kpiTargets.defectPct ?? 0}
          onChange={(v) => props.onSetKpiTargets(ws.id, { defectPct: v })}
        />
        <div style={{ height: 8 }} />
        <NumField
          label="Utilisation %"
          value={ws.kpiTargets.utilizationPct ?? 0}
          onChange={(v) => props.onSetKpiTargets(ws.id, { utilizationPct: v })}
        />
        {ws.kpiObserved ? (
          <div style={{ marginTop: 12, padding: 10, background: SW_COLORS.paperDeep, borderRadius: 6, border: `1px solid ${SW_COLORS.line}` }}>
            <div style={sectionLabel}>Observed (last run)</div>
            <ObservedRow label="Capacity / hr" value={ws.kpiObserved.capacityPerHr.toFixed(0)} />
            <ObservedRow label="Efficiency %" value={ws.kpiObserved.efficiencyPct.toFixed(1)} />
            <ObservedRow label="Utilisation %" value={ws.kpiObserved.utilizationPct.toFixed(1)} />
            <ObservedRow label="Defect %" value={ws.kpiObserved.defectPct.toFixed(2)} />
            {ws.kpiObserved.bottleneck && (
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: SW_COLORS.alarm }}>
                ◆ Bottleneck in last run
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 11, color: SW_COLORS.muted }}>
            No simulated values yet — run the sim to populate observed KPIs.
          </div>
        )}
      </LensSection>
    </div>
  );
}

function LensSection({ title, active, children }: { title: string; active: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 10,
        background: active ? SW_COLORS.brandLite + '60' : SW_COLORS.paperDeep,
        borderRadius: 6,
        border: `1px solid ${active ? SW_COLORS.brand : SW_COLORS.line}`,
      }}
    >
      <div style={{ ...sectionLabel, color: active ? SW_COLORS.brandDeep : SW_COLORS.muted, marginBottom: 8 }}>
        {title}{active && ' · active lens'}
      </div>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input
        type="number"
        value={value}
        step={step ?? 1}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        style={inputBase}
      />
    </div>
  );
}

function ObservedRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: SW_COLORS.steel }}>
      <span>{label}</span>
      <strong style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.ink }}>{value}</strong>
    </div>
  );
}

// ============================================================================
// SMALL UI BITS
// ============================================================================

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: SW_COLORS.paper,
        border: `1px solid ${SW_COLORS.line}`,
        borderRadius: 6,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
      }}
    >
      <span style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '1.2px' }}>{label}</span>
      <strong style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, color: SW_COLORS.ink }}>{value}</strong>
    </div>
  );
}
