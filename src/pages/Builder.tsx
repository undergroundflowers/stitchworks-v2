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
  useLayoutEffect,
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
import type {
  Department,
  Workstation,
  Connector,
  ConnectorKind,
  CadUnderlay,
  DetectedRegion,
} from '../domain/twin';
import {
  getBlockSpec,
  getBlockParams,
  apparelRoleFor,
  inferBlockKindFromCatalog,
  pmlFixtureId,
  PML_BLOCK_LIBRARY,
  PML_CATEGORIES,
  PARAM_FIELDS_BY_KIND,
  SELECTABLE_BLOCK_KINDS,
  type ParamFieldSpec,
  type PmlBlock,
  type PmlBlockKind,
  type PmlBlockOverride,
  type PmlBlockParams,
  type PmlCategory,
  type PmlPort,
} from '../domain/pml';
import { importCadFile, regionToWorldRect } from '../lib/cadImport';
import { buildReferenceFactoryTwin } from '../domain/reference-twin';
import { runPmlOnTwin } from '../simulation/pml-runner';
import { validatePmlGraph, type PmlIssue } from '../simulation/pml-engine';

// ============================================================================
// CONSTANTS
// ============================================================================

const ISO_TILE = 32;
const ISO_THIN = ISO_TILE / 2;

type Lens = 'operations' | 'resources' | 'kpis';
/** Canvas render mode:
 *  • iso     — isometric 3D-feel authoring surface (default).
 *  • logic   — dept-level block-flow summary.
 *  • process — workstation-level PML diagram with explicit input/output ports
 *              (every entity is a Process Modeling Library block). */
type CanvasMode = 'iso' | 'logic' | 'process';
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

/** Connector colours by kind. Flow is the brand red (the dominant arrow on a
 *  factory drawing); operator + material are visually distinct so multiple
 *  overlays don't blur together. */
const CONNECTOR_HEX: Record<ConnectorKind, string> = {
  flow: SW_COLORS.brand,
  operator: SW_COLORS.bobbin,
  material: SW_COLORS.thread,
};

const CONNECTOR_LABEL: Record<ConnectorKind, string> = {
  flow: 'FLOW',
  operator: 'OPERATOR',
  material: 'MATERIAL',
};

/** Resolve a catalog id to its IsoFixture entry. Used to look up draw-fn,
 *  footprint, and label from ids that live in the apparel palette. */
function resolveFixture(catalogId: string): IsoFixture | undefined {
  return ISO_FIXTURE_CATALOG.find((f) => f.id === catalogId);
}

/** Effective footprint for a workstation. Per-ws `size` override wins over
 *  the catalog fixture's defaults, so two SNLS machines can be different
 *  sizes. Values are decimal (no integer rounding). */
function wsFootprint(ws: Workstation): { w: number; d: number; h: number } {
  const fix = ISO_FIXTURE_CATALOG.find((f) => f.id === ws.catalogId);
  return {
    w: ws.size?.w ?? fix?.w ?? 1,
    d: ws.size?.d ?? fix?.d ?? 1,
    h: ws.size?.h ?? fix?.h ?? 1,
  };
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

// Side-panel resize bounds. Keeps the canvas usable at minimum widths and
// prevents either panel from eating the screen.
const PALETTE_MIN = 220;
const PALETTE_MAX = 520;
const INSPECTOR_MIN = 260;
const INSPECTOR_MAX = 560;
const SPLITTER_W = 5;

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
  const setKpiObserved = useTwin((s) => s.setKpiObserved);
  const setBlock = useTwin((s) => s.setBlock);
  const addConnector = useTwin((s) => s.addConnector);
  const removeConnector = useTwin((s) => s.removeConnector);
  const setCadUnderlay = useTwin((s) => s.setCadUnderlay);
  const updateCadTransform = useTwin((s) => s.updateCadTransform);
  const renameActive = useTwin((s) => s.renameActive);
  const loadCanonical = useTwin((s) => s.loadCanonical);
  const createScenarioFromCanonical = useTwin(
    (s) => s.createScenarioFromCanonical,
  );
  const setActiveScenario = useTwin((s) => s.setActiveScenario);
  const deleteScenario = useTwin((s) => s.deleteScenario);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [drop, setDrop] = useState<DropTool>({ kind: 'none' });
  /** Connect-flow modal tool state. When `on` is true:
   *    • In ISO mode, clicking a workstation picks the source (if
   *      `fromWsId` is null) or the target — fromPort/toPort default
   *      to the first output / first input of the respective block.
   *    • In PROCESS mode, clicking a specific output port dot picks
   *      `(fromWsId, fromPort)`; clicking a specific input port dot
   *      picks `(toWsId, toPort)` and creates the connector.
   *  ESC clears. */
  const [connect, setConnect] = useState<{
    on: boolean;
    kind: ConnectorKind;
    fromWsId: string | null;
    fromPort: string | null;
  }>({ on: false, kind: 'flow', fromWsId: null, fromPort: null });
  const [selected, setSelected] = useState<
    { kind: 'dept' | 'ws'; id: string } | null
  >(null);
  const [lens, setLens] = useState<Lens>('operations');
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('iso');

  // Dev-time escape hatch — exposes the live useTwin hook on `window` so
  // browser-console tests / e2e harnesses can mutate the same store
  // instance the React tree is mounted against. Vite's dev module graph
  // can otherwise hand out separate instances for different import paths,
  // making it impossible to drive the UI from a side script. Stripped
  // from production builds by the `import.meta.env.DEV` guard.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __swUseTwin?: typeof useTwin }).__swUseTwin = useTwin;
  }, []);
  /** Which simulation engine the ▶ RUN SIM button uses.
   *  • pml    — graph-driven DES over the twin's PML blocks + connectors
   *  • legacy — opens the operation-list LiveSim page (current behaviour) */
  const [engineMode, setEngineMode] = useState<'pml' | 'legacy'>('pml');
  /** Last PML run summary, shown as a small toast under the toolbar. */
  const [lastRun, setLastRun] = useState<{
    text: string;
    warnings: string[];
    at: number;
  } | null>(null);
  /** When true the pre-flight validation list is expanded under the chip. */
  const [issuesOpen, setIssuesOpen] = useState(false);

  // Live graph validation — recomputed on every twin change. Cheap, runs
  // the same pure validator the engine uses post-run for consistency.
  const pmlIssues = useMemo<PmlIssue[]>(
    () => (engineMode === 'pml' ? validatePmlGraph(twin) : []),
    [engineMode, twin],
  );

  // Best scenario — leader on latest-run throughput/hr, with efficiencyPct as
  // a tiebreaker. Scenarios with no runs are ignored. Null when nothing's
  // been simulated yet.
  const bestScenario = useMemo(() => {
    let winner: { id: string; name: string; throughput: number; eff: number } | null = null;
    for (const scn of scenarios) {
      const k = scn.runs[0]?.kpis;
      if (!k) continue;
      const cand = { id: scn.id, name: scn.name, throughput: k.throughputPerHr, eff: k.efficiencyPct };
      if (
        !winner ||
        cand.throughput > winner.throughput ||
        (cand.throughput === winner.throughput && cand.eff > winner.eff)
      ) {
        winner = cand;
      }
    }
    return winner;
  }, [scenarios]);
  const errorCount = pmlIssues.filter((i) => i.level === 'error').length;
  const warnCount = pmlIssues.filter((i) => i.level === 'warn').length;
  const infoCount = pmlIssues.filter((i) => i.level === 'info').length;
  const [paletteTab, setPaletteTab] = useState<'dept' | 'ws' | 'pml'>('dept');
  const [activeApparelCat, setActiveApparelCat] = useState<ApparelCategoryId>('sew_mach');
  const [paletteSearch, setPaletteSearch] = useState<string>('');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  /** Live stage element size in CSS pixels. Drives the SVG viewBox so the
   *  canvas user-space matches stage pixels 1:1 — required for the cursor
   *  → world projection to be exact regardless of element aspect ratio. */
  const [stageSize, setStageSize] = useState({ w: 1200, h: 800 });
  /** When true the Auto-Extract modal is open over the canvas. Reads its
   *  candidate list from the active twin's CAD underlay. */
  const [extractOpen, setExtractOpen] = useState(false);

  // Side-panel widths. User drags the splitters; values persist in
  // localStorage so the layout survives reloads.
  const [paletteWidth, setPaletteWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('builder.paletteW'));
    return Number.isFinite(v) && v >= PALETTE_MIN && v <= PALETTE_MAX ? v : 280;
  });
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('builder.inspectorW'));
    return Number.isFinite(v) && v >= INSPECTOR_MIN && v <= INSPECTOR_MAX ? v : 340;
  });
  useEffect(() => { localStorage.setItem('builder.paletteW', String(paletteWidth)); }, [paletteWidth]);
  useEffect(() => { localStorage.setItem('builder.inspectorW', String(inspectorWidth)); }, [inspectorWidth]);

  const startSideResize = useCallback((side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? paletteWidth : inspectorWidth;
    const min = side === 'left' ? PALETTE_MIN : INSPECTOR_MIN;
    const max = side === 'left' ? PALETTE_MAX : INSPECTOR_MAX;
    const setter = side === 'left' ? setPaletteWidth : setInspectorWidth;
    // Dragging right grows the left palette; dragging right shrinks the right inspector.
    const dir = side === 'left' ? 1 : -1;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(min, Math.min(max, startW + (ev.clientX - startX) * dir));
      setter(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [paletteWidth, inspectorWidth]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const cadFileInputRef = useRef<HTMLInputElement | null>(null);
  const panRef = useRef(pan);
  panRef.current = pan;
  const spacePanRef = useRef(false);
  spacePanRef.current = spacePan;

  const ZOOM_MIN = 0.3;
  const ZOOM_MAX = 3;
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  // Track the stage element's pixel size. The SVG inside uses a viewBox
  // sized to match — `[-w/2, -h/2, w, h]` — so 1 user-space unit equals
  // 1 stage pixel and (0,0) sits at the element centre. That makes the
  // cursor → world math (which divides client-coords by zoom and feeds the
  // result to `unproject`) exact at any aspect ratio or zoom level.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setStageSize({ w: r.width, h: r.height });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      // Stage pixel offset from element centre, undone by the wrapper's
      // CSS transform (`translate(pan) scale(zoom)`). Because the SVG's
      // viewBox is `[-w/2, -h/2, w, h]`, the result is the exact iso
      // projected coordinate of the cursor in SVG user-space — no
      // viewBox-to-viewport fit factor to compensate for. The canvas is
      // unbounded, so we accept any cell (negative or beyond the original
      // gridW/gridH) and let the placement land where the cursor is.
      const sx = (e.clientX - rect.left - rect.width / 2 - pan.x) / zoom;
      const sy = (e.clientY - rect.top - rect.height / 2 - pan.y) / zoom;
      const w = unproject(sx, sy);
      setHoverCell({ x: Math.floor(w.x), y: Math.floor(w.y) });
    },
    [pan, zoom],
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
        setConnect((c) => (c.on ? { ...c, on: false, fromWsId: null, fromPort: null } : c));
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

  // ── CAD import ─────────────────────────────────────────────────────────────
  const onImportCadClick = useCallback(() => {
    cadFileInputRef.current?.click();
  }, []);

  const onCadFileChosen = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so re-importing the same file fires onChange again.
      e.target.value = '';
      if (!file) return;
      const result = await importCadFile(file, {
        gridW: twin.gridW,
        gridH: twin.gridH,
      });
      if (!result.ok) {
        window.alert(`Could not import CAD file.\n\n${result.reason}`);
        return;
      }
      setCadUnderlay(result.underlay);
    },
    [twin.gridW, twin.gridH, setCadUnderlay],
  );

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
        gridTemplateColumns: `${paletteWidth}px ${SPLITTER_W}px 1fr ${SPLITTER_W}px ${inspectorWidth}px`,
        gridTemplateRows: 'auto 1fr',
        background: SW_COLORS.paperDeep,
        fontFamily: SW_FONTS.body,
      }}
    >
      {/* TOP TOOLBAR */}
      <div
        style={{
          gridColumn: '1 / 6',
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
                {bestScenario?.id === scn.id ? '★' : '✦'} {scn.name}
                {bestScenario?.id === scn.id ? ' · BEST' : ''}
              </option>
            ))}
          </select>
          <button onClick={onForkScenario} style={btnSec} title="Fork the canonical twin into a new scenario">
            ✦ FORK
          </button>
          {bestScenario && (
            <button
              onClick={() => {
                setActiveScenario(bestScenario.id);
                setSelected(null);
              }}
              title={`Leader on latest sim · ${Math.round(bestScenario.throughput).toLocaleString()} pcs/hr · ${bestScenario.eff.toFixed(1)}% eff — click to switch`}
              style={{
                background: activeScenarioId === bestScenario.id ? SW_COLORS.ok : SW_COLORS.paper,
                border: `1.5px solid ${SW_COLORS.ok}`,
                color: activeScenarioId === bestScenario.id ? '#fff' : SW_COLORS.ok,
                padding: '5px 9px',
                fontFamily: SW_FONTS.display,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                maxWidth: 180,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span>★ BEST</span>
              <span style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bestScenario.name}
              </span>
            </button>
          )}
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

        {/* Canvas-mode toggle — iso authoring vs dept-flow logic vs PML block diagram */}
        <div style={{ display: 'flex', gap: 4, background: SW_COLORS.paperDeep, padding: 3, borderRadius: 6, border: `1px solid ${SW_COLORS.line}` }} title="Switch the canvas: ISO authoring · LOGIC dept-flow · PROCESS PML block diagram with input/output ports">
          {(['iso', 'logic', 'process'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setCanvasMode(m)}
              style={{
                background: canvasMode === m ? SW_COLORS.brand : 'transparent',
                color: canvasMode === m ? '#fff' : SW_COLORS.steel,
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
              {m === 'iso' ? '◈ ISO' : m === 'logic' ? '⌬ LOGIC' : '⚙ PROCESS'}
            </button>
          ))}
        </div>

        {/* Connect-flow tool — modal: pick source ws, then target ws */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: SW_COLORS.paperDeep,
            padding: 3,
            borderRadius: 6,
            border: `1px solid ${SW_COLORS.line}`,
          }}
          title="Draw a directed flow / operator / material link between two workstations"
        >
          <button
            onClick={() => {
              setDrop({ kind: 'none' });
              setConnect((c) => ({ ...c, on: !c.on, fromWsId: null, fromPort: null }));
            }}
            style={{
              background: connect.on ? SW_COLORS.brand : 'transparent',
              color: connect.on ? '#fff' : SW_COLORS.steel,
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
            ➜ CONNECT
          </button>
          {connect.on && (
            <select
              value={connect.kind}
              onChange={(e) =>
                setConnect((c) => ({ ...c, kind: e.target.value as ConnectorKind }))
              }
              style={{
                ...inputBase,
                width: 110,
                fontWeight: 800,
                fontSize: 10,
                fontFamily: SW_FONTS.display,
                letterSpacing: '0.06em',
              }}
            >
              <option value="flow">FLOW</option>
              <option value="operator">OPERATOR</option>
              <option value="material">MATERIAL</option>
            </select>
          )}
        </div>

        {/* Lens toggles — overlay choice for the iso canvas */}
        <div style={{ display: 'flex', gap: 4, background: SW_COLORS.paperDeep, padding: 3, borderRadius: 6, border: `1px solid ${SW_COLORS.line}`, opacity: canvasMode === 'iso' ? 1 : 0.55 }}>
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

        <button
          onClick={onImportCadClick}
          style={btnSec}
          title="Import a DXF or SVG floor plan as a tracing reference"
        >
          ⌂ IMPORT CAD
        </button>
        <input
          ref={cadFileInputRef}
          type="file"
          accept=".dxf,.svg,.dwg,image/svg+xml"
          onChange={onCadFileChosen}
          style={{ display: 'none' }}
        />
        <button onClick={onExportJson} style={btnSec} title="Download the active twin as JSON">
          ⤓ EXPORT JSON
        </button>
        <button
          onClick={() => {
            const has = canonical.departments.length > 0 || canonical.workstations.length > 0;
            if (
              has &&
              !window.confirm(
                'Replace the current canonical factory with the multi-line reference factory? Existing scenarios will be cleared.',
              )
            ) {
              return;
            }
            const next = buildReferenceFactoryTwin({ name: 'Reference Factory · All Lines' });
            const result = loadCanonical(next);
            if (!result.ok) {
              window.alert(`Could not load reference factory: ${result.reason}`);
            }
          }}
          style={btnSec}
          title="Seed the canonical twin with one line per reference paper (Hossain · Elnaggar · Sime · Morshed · Kursun · Koç) stacked on the same floor."
        >
          📚 LOAD REF FACTORY
        </button>

        {/* Engine toggle — PML graph-driven DES vs. legacy operation-list sim.
            PML is opt-in for v1 so legacy runs keep working unchanged. */}
        <div
          style={{ display: 'flex', gap: 4, background: SW_COLORS.paperDeep, padding: 3, borderRadius: 6, border: `1px solid ${SW_COLORS.line}` }}
          title="Pick which simulation engine ▶ RUN SIM uses. PML runs the wired block-graph in-place; LEGACY opens the operation-list LiveSim page."
        >
          {(['pml', 'legacy'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setEngineMode(m)}
              style={{
                background: engineMode === m ? SW_COLORS.ink : 'transparent',
                color: engineMode === m ? '#fff' : SW_COLORS.steel,
                border: 'none',
                padding: '6px 10px',
                fontFamily: SW_FONTS.display,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              {m === 'pml' ? '⚙ PML' : '▤ LEGACY'}
            </button>
          ))}
        </div>

        {/* Pre-flight graph health chip — only shown in PML mode. Click to
            expand the issue list. Errors block a useful run; warns / infos
            are hints. */}
        {engineMode === 'pml' && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIssuesOpen((v) => !v)}
              title={
                pmlIssues.length === 0
                  ? 'Graph passes pre-flight checks — ready to run.'
                  : 'Click to expand the pre-flight issue list.'
              }
              style={{
                ...btnSec,
                background:
                  errorCount > 0
                    ? '#FFE5E5'
                    : warnCount > 0
                      ? '#FFF6E0'
                      : pmlIssues.length === 0
                        ? '#E7F7EE'
                        : SW_COLORS.paperDeep,
                borderColor:
                  errorCount > 0
                    ? SW_COLORS.alarm
                    : warnCount > 0
                      ? SW_COLORS.thread
                      : SW_COLORS.line,
                color:
                  errorCount > 0 ? SW_COLORS.alarm : warnCount > 0 ? SW_COLORS.steel : SW_COLORS.steel,
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                fontWeight: 800,
              }}
            >
              {errorCount > 0
                ? `⨯ ${errorCount} ERR${warnCount + infoCount > 0 ? ` · ${warnCount + infoCount} HINT` : ''}`
                : warnCount > 0
                  ? `⚠ ${warnCount} WARN${infoCount > 0 ? ` · ${infoCount}` : ''}`
                  : infoCount > 0
                    ? `✓ READY · ${infoCount} HINT`
                    : '✓ READY'}
            </button>
            {issuesOpen && pmlIssues.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  zIndex: 10,
                  width: 360,
                  maxHeight: 320,
                  overflowY: 'auto',
                  background: SW_COLORS.paper,
                  border: `1px solid ${SW_COLORS.line}`,
                  borderRadius: 6,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                  padding: 8,
                }}
              >
                <div style={{ ...sectionLabel, marginBottom: 6 }}>
                  Pre-flight · {pmlIssues.length} issue{pmlIssues.length === 1 ? '' : 's'}
                </div>
                {pmlIssues.map((iss, i) => {
                  const tone =
                    iss.level === 'error'
                      ? SW_COLORS.alarm
                      : iss.level === 'warn'
                        ? SW_COLORS.thread
                        : SW_COLORS.muted;
                  const glyph =
                    iss.level === 'error' ? '⨯' : iss.level === 'warn' ? '⚠' : '·';
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        if (iss.wsId) setSelected({ kind: 'ws', id: iss.wsId });
                      }}
                      style={{
                        padding: '6px 8px',
                        borderLeft: `3px solid ${tone}`,
                        background: SW_COLORS.paperDeep,
                        borderRadius: 3,
                        marginBottom: 4,
                        fontSize: 11,
                        lineHeight: 1.4,
                        color: SW_COLORS.steel,
                        cursor: iss.wsId ? 'pointer' : 'default',
                      }}
                      title={iss.wsId ? 'Click to select this block in the inspector' : undefined}
                    >
                      <strong style={{ color: tone, fontFamily: SW_FONTS.mono, marginRight: 6 }}>
                        {glyph} {iss.level.toUpperCase()}
                      </strong>
                      {iss.message}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => {
            if (engineMode === 'legacy') {
              navigate('/sim');
              return;
            }
            const r = runPmlOnTwin(twin, { writeKpiObserved: setKpiObserved });
            setLastRun({
              text:
                `Ran in ${r.wallMs.toFixed(0)} ms · ` +
                `${r.totalProduced} produced · ` +
                `${r.throughputPerHr}/hr · ` +
                `lead ${r.meanLeadTimeMin.toFixed(1)} min` +
                (r.bottleneckName ? ` · ⚠ ${r.bottleneckName}` : ''),
              warnings: r.warnings,
              at: Date.now(),
            });
          }}
          style={btnPrim}
          title={
            engineMode === 'pml'
              ? 'Run the PML block-graph sim against the active twin and write per-block KPIs.'
              : 'Open the legacy operation-list LiveSim page.'
          }
        >
          ▶ RUN SIM
        </button>
      </div>

      {/* PML run toast — appears under the toolbar after a run completes.
          Click to dismiss. Auto-dismisses are deliberately omitted so
          warnings stay visible. */}
      {lastRun && engineMode === 'pml' && (
        <div
          onClick={() => setLastRun(null)}
          title="Click to dismiss"
          style={{
            gridColumn: '3',
            gridRow: '2',
            position: 'absolute',
            top: 56,
            right: 16,
            zIndex: 6,
            padding: '8px 12px',
            background: SW_COLORS.ink,
            color: '#fff',
            fontFamily: SW_FONTS.mono,
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 6,
            boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
            maxWidth: 460,
            cursor: 'pointer',
            borderLeft: `4px solid ${SW_COLORS.brand}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: SW_FONTS.display, fontSize: 10, letterSpacing: '0.1em', color: SW_COLORS.brand }}>
              ⚙ PML RUN
            </span>
            <span>{lastRun.text}</span>
          </div>
          {lastRun.warnings.length > 0 && (
            <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px', lineHeight: 1.4 }}>
              {lastRun.warnings.map((w, i) => (
                <li key={i} style={{ color: SW_COLORS.thread }}>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

      {/* LEFT SPLITTER (palette ↔ canvas) */}
      <div
        onMouseDown={startSideResize('left')}
        onDoubleClick={() => setPaletteWidth(280)}
        title="Drag to resize · double-click to reset"
        style={{
          gridColumn: '2',
          gridRow: '2',
          cursor: 'col-resize',
          background: 'transparent',
          position: 'relative',
          zIndex: 5,
        }}
      />

      {/* CANVAS */}
      <div
        ref={stageRef}
        onMouseMove={onCanvasMouseMove}
        onClick={onCanvasClick}
        onMouseDown={onPanStart}
        style={{
          gridColumn: '3',
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

        {connect.on && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 5,
              padding: '8px 12px',
              background: CONNECTOR_HEX[connect.kind],
              color: '#fff',
              fontFamily: SW_FONTS.display,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.06em',
              borderRadius: 6,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            }}
          >
            ➜ {connect.kind.toUpperCase()} ·{' '}
            {connect.fromWsId === null
              ? canvasMode === 'process'
                ? 'Click an OUTPUT port (●) to start'
                : 'Click the SOURCE workstation'
              : canvasMode === 'process'
                ? `from ${connect.fromPort ?? 'out'} → click an INPUT port (◯)`
                : 'Click the TARGET (Esc to stop)'}
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

        {/* Stage transform — pan/zoom is applied inside the SVG (see the
            inner <g> in CanvasSVG) so the SVG itself always fills the stage
            at 100%. If we instead CSS-scaled this wrapper, zooming out would
            shrink the SVG into a small island and let the stage background
            bleed through; doing it inside the SVG keeps the floor + grid
            covering the whole viewport at any zoom. */}
        {canvasMode === 'iso' ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            <CanvasSVG
              twin={twin}
              lens={lens}
              hoverCell={hoverCell}
              drop={drop}
              selected={selected}
              connect={connect}
              zoom={zoom}
              pan={pan}
              stageSize={stageSize}
              onSelect={(s) => {
                if (connect.on && s?.kind === 'ws') {
                  if (connect.fromWsId === null) {
                    // Default fromPort to the source block's first output —
                    // overridden if the user authors via the PROCESS canvas.
                    const src = twin.workstations.find((w) => w.id === s.id);
                    const fromPort = src ? getBlockSpec(src).outputs[0]?.id ?? null : null;
                    setConnect((c) => ({ ...c, fromWsId: s.id, fromPort }));
                  } else if (connect.fromWsId !== s.id) {
                    const tgt = twin.workstations.find((w) => w.id === s.id);
                    const toPort = tgt ? getBlockSpec(tgt).inputs[0]?.id : undefined;
                    addConnector({
                      kind: connect.kind,
                      fromWsId: connect.fromWsId,
                      toWsId: s.id,
                      fromPort: connect.fromPort ?? undefined,
                      toPort,
                    });
                    // Chain: keep target as the next source so users can build
                    // a sequential line quickly. ESC or button toggles off.
                    const nextFromPort = tgt ? getBlockSpec(tgt).outputs[0]?.id ?? null : null;
                    setConnect((c) => ({ ...c, fromWsId: s.id, fromPort: nextFromPort }));
                  }
                  return;
                }
                setSelected(s);
              }}
              onRemoveConnector={removeConnector}
              onStartDrag={(kind, id, e) => {
                // Suppress drag while connecting so the click selects instead.
                if (connect.on && kind === 'ws') return;
                startEntityDrag(kind, id, e);
              }}
            />
          </div>
        ) : canvasMode === 'logic' ? (
          <BuilderLogicView
            twin={twin}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <BuilderProcessView
            twin={twin}
            selected={selected}
            onSelect={setSelected}
            connect={connect}
            onPickFromPort={(wsId, portId) =>
              setConnect((c) => ({ ...c, fromWsId: wsId, fromPort: portId }))
            }
            onPickToPort={(wsId, portId) => {
              if (!connect.fromWsId || connect.fromWsId === wsId) return;
              addConnector({
                kind: connect.kind,
                fromWsId: connect.fromWsId,
                toWsId: wsId,
                fromPort: connect.fromPort ?? undefined,
                toPort: portId,
              });
              // Chain: leave the target as the next source on its first
              // output, so users can extend the wire down the line by
              // clicking input ports without re-picking the source.
              const tgt = twin.workstations.find((w) => w.id === wsId);
              const nextFromPort = tgt ? getBlockSpec(tgt).outputs[0]?.id ?? null : null;
              setConnect((c) => ({ ...c, fromWsId: wsId, fromPort: nextFromPort }));
            }}
          />
        )}

        {/* CAD-underlay control strip — only shown when an underlay exists */}
        {twin.cadUnderlay && (
          <CadUnderlayControls
            underlay={twin.cadUnderlay}
            onPatch={updateCadTransform}
            onRemove={() => {
              if (window.confirm('Remove the CAD underlay from this twin?')) {
                setCadUnderlay(null);
              }
            }}
            onExtract={() => setExtractOpen(true)}
          />
        )}

        {/* CAD Auto-Extract modal — closed shapes → Departments */}
        {extractOpen && twin.cadUnderlay && (
          <CadExtractModal
            underlay={twin.cadUnderlay}
            gridW={twin.gridW}
            gridH={twin.gridH}
            existingDeptCount={twin.departments.length}
            onCancel={() => setExtractOpen(false)}
            onConfirm={(rows) => {
              for (const row of rows) {
                const rect = regionToWorldRect(row.region, twin.cadUnderlay!, {
                  gridW: twin.gridW,
                  gridH: twin.gridH,
                });
                addDepartment({
                  name: row.name,
                  kind: row.preset.kind,
                  color: row.preset.color,
                  bounds: rect,
                });
              }
              setExtractOpen(false);
            }}
          />
        )}

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

      {/* RIGHT SPLITTER (canvas ↔ inspector) */}
      <div
        onMouseDown={startSideResize('right')}
        onDoubleClick={() => setInspectorWidth(340)}
        title="Drag to resize · double-click to reset"
        style={{
          gridColumn: '4',
          gridRow: '2',
          cursor: 'col-resize',
          background: 'transparent',
          position: 'relative',
          zIndex: 5,
        }}
      />

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
        onSetBlock={setBlock}
        onRemoveConnector={removeConnector}
      />
    </div>
  );
}

// ============================================================================
// PALETTE (left)
// ============================================================================

interface PaletteProps {
  tab: 'dept' | 'ws' | 'pml';
  onTab: (t: 'dept' | 'ws' | 'pml') => void;
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${SW_COLORS.line}` }}>
        {(['dept', 'ws', 'pml'] as const).map((t) => (
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
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.08em',
            }}
          >
            {t === 'dept' ? 'DEPTS' : t === 'ws' ? 'STATIONS' : '⚙ PROCESS'}
          </button>
        ))}
      </div>

      {props.tab === 'dept' && (
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
      )}
      {props.tab === 'ws' && (
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

      {props.tab === 'pml' && <PmlPalettePane drop={props.drop} onPickWs={props.onPickWs} />}
    </div>
  );
}

/** PROCESS palette pane — pure PML primitives, grouped by category. Each
 *  card drops a workstation that auto-stamps `block.kind` to match the
 *  fixture id (see `makeWorkstation` in domain/twin.ts). */
function PmlPalettePane({
  drop,
  onPickWs,
}: {
  drop: DropTool;
  onPickWs: (catalogId: string) => void;
}) {
  // Group block specs by PML category, preserving the canonical category order.
  const byCategory = useMemo(() => {
    const map = new Map<PmlCategory, typeof PML_BLOCK_LIBRARY[PmlBlockKind][]>();
    for (const cat of PML_CATEGORIES) map.set(cat.id, []);
    for (const spec of Object.values(PML_BLOCK_LIBRARY)) {
      map.get(spec.category)?.push(spec);
    }
    return map;
  }, []);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          padding: '6px 8px',
          background: SW_COLORS.paperDeep,
          border: `1px dashed ${SW_COLORS.line}`,
          borderRadius: 4,
          fontSize: 11,
          color: SW_COLORS.steel,
          lineHeight: 1.4,
        }}
      >
        Drop a pure PML primitive. Each block lands with its kind + ports
        pre-stamped — wire them in the <strong>PROCESS</strong> canvas
        view by clicking port dots.
      </div>

      {PML_CATEGORIES.map((cat) => {
        const specs = byCategory.get(cat.id) ?? [];
        if (specs.length === 0) return null;
        return (
          <div key={cat.id}>
            <div
              style={{
                ...sectionLabel,
                marginBottom: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span>{cat.label}</span>
              <span style={{ fontSize: 9, color: SW_COLORS.muted, fontWeight: 700 }}>
                {specs.length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {specs.map((spec) => {
                const fixtureId = pmlFixtureId(spec.kind);
                const armed = drop.kind === 'ws' && drop.catalogId === fixtureId;
                const tint = PML_CATEGORY_TINT[spec.category];
                return (
                  <button
                    key={spec.kind}
                    onClick={() => onPickWs(fixtureId)}
                    title={`${spec.label} — ${spec.blurb}\n${spec.inputs.length} in / ${spec.outputs.length} out`}
                    style={{
                      background: armed ? SW_COLORS.brandLite : tint.fill,
                      border: `1px solid ${armed ? SW_COLORS.brand : tint.stroke}`,
                      borderLeft: `4px solid ${tint.stroke}`,
                      borderRadius: 6,
                      padding: '8px 6px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                      <span
                        style={{
                          fontFamily: SW_FONTS.mono,
                          fontSize: 16,
                          fontWeight: 900,
                          color: tint.stroke,
                          width: 20,
                          textAlign: 'center',
                          lineHeight: 1,
                        }}
                      >
                        {spec.glyph}
                      </span>
                      <span
                        style={{
                          fontFamily: SW_FONTS.display,
                          fontSize: 11,
                          fontWeight: 800,
                          color: SW_COLORS.ink,
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {spec.label}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: SW_FONTS.mono,
                        fontSize: 9,
                        fontWeight: 700,
                        color: SW_COLORS.muted,
                        letterSpacing: '0.06em',
                      }}
                    >
                      {spec.inputs.length} IN · {spec.outputs.length} OUT
                      {spec.usesResources && ' · ⚡'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
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
  connect: { on: boolean; kind: ConnectorKind; fromWsId: string | null };
  /** Current canvas zoom — used to choose grid subdivision density so the
   *  grid divides further when the user zooms in. */
  zoom: number;
  /** Current pan offset in stage pixels. Drives the visible-region
   *  computation that keeps the floor + grid centred on what the user is
   *  actually looking at, so the canvas feels infinite at any pan. */
  pan: { x: number; y: number };
  /** Live size of the stage element in CSS pixels. Used to set a centred,
   *  1:1 viewBox and to compute which cells are currently on screen. */
  stageSize: { w: number; h: number };
  onSelect: (s: { kind: 'dept' | 'ws'; id: string } | null) => void;
  onRemoveConnector: (id: string) => void;
  onStartDrag: (kind: 'ws' | 'dept', id: string, e: React.MouseEvent) => void;
}

/** Footprint center of a workstation in screen coordinates. Used as the
 *  arrow anchor when drawing connectors. */
function workstationScreenCenter(ws: Workstation): { sx: number; sy: number } {
  const { w, d } = wsFootprint(ws);
  return isoProj(ws.position.x + w / 2, ws.position.y + d / 2);
}

function CanvasSVG(props: CanvasSVGProps) {
  const { twin, lens, hoverCell, drop, selected, zoom, pan, stageSize } = props;

  // Grid subdivision density. As the user zooms in, each integer cell is
  // divided into more sub-cells (powers of 2). Steps are tuned so the next
  // tier kicks in just after the previous one becomes too coarse to track
  // sub-cell sizing in the inspector.
  const subdivisions = zoom < 0.9 ? 1 : zoom < 1.6 ? 2 : zoom < 2.4 ? 4 : 8;

  // Centred 1:1 viewBox — SVG user-space units == stage CSS pixels, with
  // (0,0) at the element centre. The cursor handler in the parent relies
  // on this to map clientX/Y → world cells without an aspect-ratio fudge.
  const W = Math.max(1, stageSize.w);
  const H = Math.max(1, stageSize.h);
  const vbMinX = -W / 2;
  const vbMinY = -H / 2;

  // Compute the visible cell range from the four screen corners. With a
  // CSS transform of `translate(pan) scale(zoom)` on the wrapper, the
  // pre-transform user-space coord under a screen corner offset
  // `(cx, cy)` (from element centre) is `((cx - pan.x)/zoom, (cy - pan.y)/zoom)`.
  // Inverting iso projection at those four corners gives the cell bounds
  // currently in view; we render the floor + grid over that span (plus a
  // small pad) so the canvas feels infinite at any pan.
  const screenCorners: Array<[number, number]> = [
    [-W / 2, -H / 2],
    [ W / 2, -H / 2],
    [ W / 2,  H / 2],
    [-W / 2,  H / 2],
  ];
  let visMinX = Infinity, visMaxX = -Infinity;
  let visMinY = Infinity, visMaxY = -Infinity;
  for (const [cx, cy] of screenCorners) {
    const sx = (cx - pan.x) / zoom;
    const sy = (cy - pan.y) / zoom;
    const cell = unproject(sx, sy);
    if (cell.x < visMinX) visMinX = cell.x;
    if (cell.x > visMaxX) visMaxX = cell.x;
    if (cell.y < visMinY) visMinY = cell.y;
    if (cell.y > visMaxY) visMaxY = cell.y;
  }
  const PAD = 4;
  const gMinX = Math.floor(visMinX) - PAD;
  const gMaxX = Math.ceil(visMaxX) + PAD;
  const gMinY = Math.floor(visMinY) - PAD;
  const gMaxY = Math.ceil(visMaxY) + PAD;

  const floorTL = isoProj(gMinX, gMinY);
  const floorTR = isoProj(gMaxX, gMinY);
  const floorBR = isoProj(gMaxX, gMaxY);
  const floorBL = isoProj(gMinX, gMaxY);

  // Ghost outline of the original factory footprint — keeps the user
  // oriented while still allowing drops anywhere outside it.
  const factoryTL = isoProj(0, 0);
  const factoryTR = isoProj(twin.gridW, 0);
  const factoryBR = isoProj(twin.gridW, twin.gridH);
  const factoryBL = isoProj(0, twin.gridH);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${vbMinX} ${vbMinY} ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', userSelect: 'none' }}
    >
      {/* Stage-filling background — catches pan-drag clicks anywhere the
          floor doesn't reach (paranoid safeguard; the floor below already
          covers the visible cell range). Same hue as the stage so the seam
          is invisible. */}
      <rect
        data-canvas-bg="true"
        x={vbMinX}
        y={vbMinY}
        width={W}
        height={H}
        fill="#FAF8F2"
      />
      {/* Pan/zoom transform — applied in SVG-space rather than via CSS on
          the wrapper, so the SVG keeps filling the stage at 100% even when
          the user zooms out. Everything below this <g> is in iso-projected
          user-space (1 unit = 1 pre-zoom stage pixel). */}
      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
      {/* Floor base — covers the visible cell range so the surface feels
          infinite. Marked as canvas background so panning ignores entity
          clicks but accepts background drags. */}
      <polygon
        data-canvas-bg="true"
        points={ptsToStr([floorTL, floorTR, floorBR, floorBL])}
        fill="#F2EEE3"
        stroke="none"
      />

      {/* CAD UNDERLAY — projected onto the iso ground plane between the floor
          and the grid so the user can trace it with departments. Hidden when
          the underlay is invisible; pointer-events suppressed always so it
          never steals clicks from layout entities. */}
      {twin.cadUnderlay && twin.cadUnderlay.transform.visible && (
        <CadUnderlayLayer underlay={twin.cadUnderlay} />
      )}

      {/* Grid lines — sub-cell tier first (drawn under the integer tier so
          the cell boundaries stay visually dominant). Sub-cell density grows
          with zoom; at zoom 1× there are none. Range tracks the visible
          cell bounds rather than the original grid. */}
      {subdivisions > 1 &&
        Array.from(
          { length: (gMaxX - gMinX) * subdivisions + 1 },
          (_, i) => {
            if (i % subdivisions === 0) return null;
            const x = gMinX + i / subdivisions;
            const a = isoProj(x, gMinY);
            const b = isoProj(x, gMaxY);
            return (
              <line
                key={`vs-${i}`}
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke="#0F141908"
                strokeWidth={0.3}
              />
            );
          },
        )}
      {subdivisions > 1 &&
        Array.from(
          { length: (gMaxY - gMinY) * subdivisions + 1 },
          (_, i) => {
            if (i % subdivisions === 0) return null;
            const y = gMinY + i / subdivisions;
            const a = isoProj(gMinX, y);
            const b = isoProj(gMaxX, y);
            return (
              <line
                key={`hs-${i}`}
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke="#0F141908"
                strokeWidth={0.3}
              />
            );
          },
        )}
      {Array.from({ length: gMaxX - gMinX + 1 }, (_, i) => {
        const x = gMinX + i;
        const a = isoProj(x, gMinY);
        const b = isoProj(x, gMaxY);
        return <line key={`v-${x}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#0F141910" strokeWidth={0.6} />;
      })}
      {Array.from({ length: gMaxY - gMinY + 1 }, (_, i) => {
        const y = gMinY + i;
        const a = isoProj(gMinX, y);
        const b = isoProj(gMaxX, y);
        return <line key={`h-${y}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#0F141910" strokeWidth={0.6} />;
      })}

      {/* Original factory footprint — drawn as a faint outline so the user
          retains a "you are here" reference inside the otherwise infinite
          surface. Pointer-events disabled so the floor underneath still
          receives canvas-background clicks for panning. */}
      <polygon
        points={ptsToStr([factoryTL, factoryTR, factoryBR, factoryBL])}
        fill="none"
        stroke="#0F141930"
        strokeWidth={1.2}
        strokeDasharray="6 4"
        style={{ pointerEvents: 'none' }}
      />


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
        .map((w) => {
          const isConnectSource =
            props.connect.on && props.connect.fromWsId === w.id;
          return (
            <WorkstationSprite
              key={w.id}
              ws={w}
              selected={selected?.kind === 'ws' && selected.id === w.id}
              connectSource={isConnectSource}
              lens={lens}
              onClick={() => props.onSelect({ kind: 'ws', id: w.id })}
              onMouseDown={(e) => props.onStartDrag('ws', w.id, e)}
            />
          );
        })}

      {/* CONNECTORS — drawn above stations so arrows aren't occluded */}
      <ConnectorLayer
        twin={twin}
        connect={props.connect}
        onRemove={props.onRemoveConnector}
      />

      {/* HOVER PREVIEW */}
      {hoverCell && drop.kind !== 'none' && (
        <HoverPreview cell={hoverCell} drop={drop} />
      )}
      </g>
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
  connectSource,
  lens,
  onClick,
  onMouseDown,
}: {
  ws: Workstation;
  selected: boolean;
  connectSource: boolean;
  lens: Lens;
  onClick: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const fixture = ISO_FIXTURE_CATALOG.find((f) => f.id === ws.catalogId);
  if (!fixture) return null;

  const origin = isoProj(ws.position.x, ws.position.y);
  const { w: fw, d: fd, h: fh } = wsFootprint(ws);

  // KPI heat tint (lens=kpis only) — based on observed.utilizationPct.
  const heat =
    lens === 'kpis' && ws.kpiObserved
      ? heatColor(ws.kpiObserved.utilizationPct)
      : null;

  // Compute footprint bounds for the selection ring.
  const tl = isoProj(ws.position.x, ws.position.y);
  const tr = isoProj(ws.position.x + fw, ws.position.y);
  const br = isoProj(ws.position.x + fw, ws.position.y + fd);
  const bl = isoProj(ws.position.x, ws.position.y + fd);

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
      {connectSource && (
        <polygon
          points={ptsToStr([
            { sx: 0, sy: 0 },
            { sx: tr.sx - tl.sx, sy: tr.sy - tl.sy },
            { sx: br.sx - tl.sx, sy: br.sy - tl.sy },
            { sx: bl.sx - tl.sx, sy: bl.sy - tl.sy },
          ])}
          fill="none"
          stroke={SW_COLORS.brand}
          strokeWidth={3.2}
          strokeOpacity={0.9}
        />
      )}
      {fixture.draw({ w: fw, d: fd, h: fh }) as ReactNode}

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

// ── CAD UNDERLAY ─────────────────────────────────────────────────────────────

/**
 * Render an imported floor plan onto the iso ground plane.
 *
 * Coordinate stack, outermost first:
 *   1. Iso projection: map world (x, y) → screen (sx, sy).
 *   2. Translate to the underlay's center in world cells.
 *   3. Rotate by the user-set angle.
 *   4. Scale source-units → world-cells.
 *   5. Translate so the source viewBox is centred at the origin.
 *
 * `vector-effect: non-scaling-stroke` keeps the trace lines visually thin no
 * matter how aggressively the user scales the underlay. `pointer-events: none`
 * means the underlay never steals clicks from departments / workstations.
 */
function CadUnderlayLayer({ underlay }: { underlay: CadUnderlay }) {
  const [vbX, vbY, vbW, vbH] = underlay.viewBox;
  const cxSrc = vbX + vbW / 2;
  const cySrc = vbY + vbH / 2;
  const t = underlay.transform;

  const isoMatrix = `matrix(${ISO_TILE} ${ISO_THIN} ${-ISO_TILE} ${ISO_THIN} 0 0)`;
  const place =
    `translate(${t.cx} ${t.cy}) ` +
    `rotate(${t.rotation}) ` +
    `scale(${t.scale}) ` +
    `translate(${-cxSrc} ${-cySrc})`;

  return (
    <g
      data-cad-underlay="true"
      transform={isoMatrix}
      opacity={t.opacity}
      style={{ pointerEvents: 'none' }}
    >
      <g transform={place}>
        <g
          stroke={SW_COLORS.ink}
          strokeWidth={1.5}
          fill="none"
          style={{ vectorEffect: 'non-scaling-stroke' } as CSSProperties}
          // Inner content was emitted by the importer; safe because we never
          // accept anything other than the user's own DXF/SVG file.
          dangerouslySetInnerHTML={{ __html: underlay.svg }}
        />
      </g>
    </g>
  );
}

/**
 * Floating control strip for the CAD underlay. Mirrors the visual language of
 * the zoom strip (paper background, hairline border) so it doesn't compete
 * with the toolbar; lives just above the count chips.
 */
function CadUnderlayControls({
  underlay,
  onPatch,
  onRemove,
  onExtract,
}: {
  underlay: CadUnderlay;
  onPatch: (patch: Partial<CadUnderlay['transform']>) => void;
  onRemove: () => void;
  onExtract: () => void;
}) {
  const t = underlay.transform;
  const tinyBtn: CSSProperties = {
    ...btnSec,
    padding: '4px 8px',
    minWidth: 28,
    fontSize: 11,
  };
  const labelStyle: CSSProperties = {
    fontFamily: SW_FONTS.display,
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: '0.08em',
    color: SW_COLORS.muted,
  };
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        right: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: SW_COLORS.paper,
        padding: '8px 10px',
        borderRadius: 6,
        border: `1px solid ${SW_COLORS.line}`,
        zIndex: 5,
        minWidth: 240,
        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: SW_FONTS.display,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.1em',
            color: SW_COLORS.ink,
          }}
        >
          ⌂ CAD
        </span>
        <span
          title={underlay.name}
          style={{
            fontFamily: SW_FONTS.body,
            fontSize: 11,
            color: SW_COLORS.steel,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 110,
          }}
        >
          {underlay.name}
        </span>
        <span style={{ ...labelStyle, marginLeft: 'auto' }}>
          {underlay.format.toUpperCase()}
        </span>
      </div>

      {/* Visibility · Lock · Remove */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => onPatch({ visible: !t.visible })}
          style={{
            ...tinyBtn,
            background: t.visible ? SW_COLORS.brand : 'transparent',
            color: t.visible ? '#fff' : SW_COLORS.steel,
            borderColor: t.visible ? SW_COLORS.brand : SW_COLORS.line,
          }}
          title={t.visible ? 'Hide underlay' : 'Show underlay'}
        >
          {t.visible ? '◉ SHOW' : '○ HIDE'}
        </button>
        <button
          onClick={() => onPatch({ locked: !t.locked })}
          style={{
            ...tinyBtn,
            background: t.locked ? SW_COLORS.ink : 'transparent',
            color: t.locked ? '#fff' : SW_COLORS.steel,
            borderColor: t.locked ? SW_COLORS.ink : SW_COLORS.line,
          }}
          title="When locked, controls are dimmed and accidental nudges are prevented"
        >
          {t.locked ? '🔒 LOCKED' : '🔓 LOCK'}
        </button>
        <button
          onClick={onRemove}
          style={{
            ...tinyBtn,
            color: SW_COLORS.alarm,
            borderColor: SW_COLORS.alarm + '60',
            marginLeft: 'auto',
          }}
          title="Remove the underlay"
        >
          ✕
        </button>
      </div>

      {/* Auto-extract — promote detected closed shapes into Departments */}
      <button
        onClick={onExtract}
        disabled={underlay.regions.length === 0}
        style={{
          ...tinyBtn,
          width: '100%',
          marginTop: 2,
          background: underlay.regions.length > 0 ? SW_COLORS.ink : 'transparent',
          color: underlay.regions.length > 0 ? '#fff' : SW_COLORS.muted,
          borderColor: underlay.regions.length > 0 ? SW_COLORS.ink : SW_COLORS.line,
          cursor: underlay.regions.length > 0 ? 'pointer' : 'not-allowed',
          fontFamily: SW_FONTS.display,
          letterSpacing: '0.08em',
          fontSize: 10,
        }}
        title={
          underlay.regions.length > 0
            ? `Promote ${underlay.regions.length} detected region${underlay.regions.length === 1 ? '' : 's'} into Departments`
            : 'No closed shapes were detected in this drawing'
        }
      >
        🪄 AUTO-EXTRACT ({underlay.regions.length})
      </button>

      {/* Opacity slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: t.locked ? 0.5 : 1 }}>
        <span style={{ ...labelStyle, width: 56 }}>OPACITY</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={t.opacity}
          disabled={t.locked}
          onChange={(e) => onPatch({ opacity: parseFloat(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, width: 30, textAlign: 'right', color: SW_COLORS.steel }}>
          {Math.round(t.opacity * 100)}%
        </span>
      </div>

      {/* Scale */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: t.locked ? 0.5 : 1 }}>
        <span style={{ ...labelStyle, width: 56 }}>SCALE</span>
        <button onClick={() => onPatch({ scale: t.scale / 1.1 })} style={tinyBtn} disabled={t.locked} title="Smaller">−</button>
        <button onClick={() => onPatch({ scale: t.scale * 1.1 })} style={tinyBtn} disabled={t.locked} title="Larger">+</button>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.steel, marginLeft: 'auto' }}>
          {t.scale.toExponential(1)}
        </span>
      </div>

      {/* Rotate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: t.locked ? 0.5 : 1 }}>
        <span style={{ ...labelStyle, width: 56 }}>ROTATE</span>
        <button onClick={() => onPatch({ rotation: t.rotation - 15 })} style={tinyBtn} disabled={t.locked} title="Rotate −15°">⟲</button>
        <button onClick={() => onPatch({ rotation: t.rotation + 15 })} style={tinyBtn} disabled={t.locked} title="Rotate +15°">⟳</button>
        <button onClick={() => onPatch({ rotation: 0 })} style={tinyBtn} disabled={t.locked} title="Reset rotation">0°</button>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.steel, marginLeft: 'auto' }}>
          {Math.round(t.rotation)}°
        </span>
      </div>

      {/* Nudge position — moves the underlay center in world cells */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: t.locked ? 0.5 : 1 }}>
        <span style={{ ...labelStyle, width: 56 }}>NUDGE</span>
        <button onClick={() => onPatch({ cx: t.cx - 1 })} style={tinyBtn} disabled={t.locked} title="Move left 1 cell">←</button>
        <button onClick={() => onPatch({ cy: t.cy - 1 })} style={tinyBtn} disabled={t.locked} title="Move up 1 cell">↑</button>
        <button onClick={() => onPatch({ cy: t.cy + 1 })} style={tinyBtn} disabled={t.locked} title="Move down 1 cell">↓</button>
        <button onClick={() => onPatch({ cx: t.cx + 1 })} style={tinyBtn} disabled={t.locked} title="Move right 1 cell">→</button>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.steel, marginLeft: 'auto' }}>
          {Math.round(t.cx)},{Math.round(t.cy)}
        </span>
      </div>
    </div>
  );
}

// ── CAD AUTO-EXTRACT MODAL ───────────────────────────────────────────────────

interface ExtractRow {
  region: DetectedRegion;
  /** User-editable name; defaults to "Region 1", "Region 2", … */
  name: string;
  /** Department preset (kind + colour + label). */
  preset: DeptPreset;
  /** When false the row is skipped on confirm. */
  include: boolean;
}

/**
 * Modal that lists every closed shape detected in the underlay, lets the user
 * pick a Department kind for each, and creates them in one go. The user can:
 *   • Toggle individual rows on/off (top-K by area are pre-selected).
 *   • Edit the name and the preset (kind + colour) per row.
 *   • Use Select-all / Select-none for bulk action.
 *
 * The modal computes each region's world-cell footprint live so the user can
 * sanity-check that "this big shape" maps to "a 24×16 cell rectangle" before
 * committing. Once confirmed, the parent runs `addDepartment` per row.
 */
function CadExtractModal({
  underlay,
  gridW,
  gridH,
  existingDeptCount,
  onCancel,
  onConfirm,
}: {
  underlay: CadUnderlay;
  gridW: number;
  gridH: number;
  existingDeptCount: number;
  onCancel: () => void;
  onConfirm: (rows: ExtractRow[]) => void;
}) {
  // Pre-select the top-N largest regions; everything else starts unchecked.
  // Anything tinier than 0.05% of the drawing's bbox area is almost certainly
  // a fixture, not a room — leave it off by default.
  const PRE_SELECT_TOP = 6;
  const drawingArea = (() => {
    const [, , w, h] = underlay.viewBox;
    return Math.max(1, w * h);
  })();
  const initialRows = useMemo<ExtractRow[]>(
    () =>
      underlay.regions.map((r, i) => ({
        region: r,
        name: `Region ${existingDeptCount + i + 1}`,
        preset: DEPT_PRESETS[DEPT_PRESETS.length - 1], // default "Custom"
        include:
          i < PRE_SELECT_TOP && r.area / drawingArea >= 0.0005,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [underlay.regions],
  );
  const [rows, setRows] = useState<ExtractRow[]>(initialRows);

  const setRow = (idx: number, patch: Partial<ExtractRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const selectedCount = rows.filter((r) => r.include).length;

  return (
    <div
      role="dialog"
      aria-label="Auto-extract Departments from CAD"
      onClick={onCancel}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(15, 20, 25, 0.4)',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 92%)',
          maxHeight: '88%',
          background: SW_COLORS.paper,
          borderRadius: 8,
          border: `1px solid ${SW_COLORS.line}`,
          boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderBottom: `1px solid ${SW_COLORS.line}`,
          }}
        >
          <div
            style={{
              fontFamily: SW_FONTS.display,
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: '0.04em',
              color: SW_COLORS.ink,
            }}
          >
            🪄 AUTO-EXTRACT DEPARTMENTS
          </div>
          <div style={{ fontFamily: SW_FONTS.body, fontSize: 12, color: SW_COLORS.muted }}>
            from <strong style={{ color: SW_COLORS.steel }}>{underlay.name}</strong>
            {' · '}
            {underlay.regions.length} closed shape{underlay.regions.length === 1 ? '' : 's'} detected
          </div>
          <button onClick={onCancel} style={{ ...btnSec, marginLeft: 'auto' }} title="Close">
            ✕
          </button>
        </div>

        {/* Bulk actions */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '8px 18px',
            borderBottom: `1px solid ${SW_COLORS.line}`,
            background: SW_COLORS.paperDeep,
          }}
        >
          <button
            onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))}
            style={btnSec}
          >
            ☑ Select all
          </button>
          <button
            onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}
            style={btnSec}
          >
            ☐ Select none
          </button>
          <span
            style={{
              marginLeft: 'auto',
              alignSelf: 'center',
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              color: SW_COLORS.steel,
            }}
          >
            {selectedCount} / {rows.length} selected
          </span>
        </div>

        {/* Body — scrollable list */}
        <div style={{ overflowY: 'auto', padding: '4px 0' }}>
          {rows.map((row, idx) => {
            const rect = regionToWorldRect(row.region, underlay, { gridW, gridH });
            const [bx0, by0, bx1, by1] = row.region.bbox;
            const srcW = (bx1 - bx0).toFixed(0);
            const srcH = (by1 - by0).toFixed(0);
            return (
              <div
                key={row.region.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 64px 1fr 130px 130px 100px',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 18px',
                  borderBottom: `1px solid ${SW_COLORS.line}`,
                  opacity: row.include ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={row.include}
                  onChange={(e) => setRow(idx, { include: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                {/* Tiny preview of the region's bbox proportions */}
                <RegionThumb region={row.region} />
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => setRow(idx, { name: e.target.value })}
                  style={{ ...inputBase, width: '100%' }}
                />
                <select
                  value={row.preset.kind}
                  onChange={(e) => {
                    const next = DEPT_PRESETS.find((p) => p.kind === e.target.value);
                    if (next) setRow(idx, { preset: next });
                  }}
                  style={{ ...inputBase, width: '100%' }}
                >
                  {DEPT_PRESETS.map((p) => (
                    <option key={p.kind} value={p.kind}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontFamily: SW_FONTS.mono,
                    fontSize: 10,
                    color: SW_COLORS.muted,
                    whiteSpace: 'nowrap',
                  }}
                  title={`Source: ${srcW} × ${srcH} units · ${row.region.source}`}
                >
                  src {srcW}×{srcH}
                </span>
                <span
                  style={{
                    fontFamily: SW_FONTS.mono,
                    fontSize: 10,
                    color: SW_COLORS.steel,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rect.w}×{rect.h} cells
                </span>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: SW_COLORS.muted, fontFamily: SW_FONTS.body, fontSize: 13 }}>
              No closed shapes were detected. Try tracing on top of the underlay by hand.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 18px',
            borderTop: `1px solid ${SW_COLORS.line}`,
            justifyContent: 'flex-end',
            background: SW_COLORS.paperDeep,
          }}
        >
          <button onClick={onCancel} style={btnSec}>
            CANCEL
          </button>
          <button
            onClick={() => onConfirm(rows.filter((r) => r.include))}
            disabled={selectedCount === 0}
            style={{
              ...btnPrim,
              opacity: selectedCount === 0 ? 0.45 : 1,
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            CREATE {selectedCount} DEPARTMENT{selectedCount === 1 ? '' : 'S'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tiny SVG thumbnail of a region's source bbox shape — gives the modal a
 *  visual cue that "this row is wide" or "this row is square" at a glance. */
function RegionThumb({ region }: { region: DetectedRegion }) {
  const [x0, y0, x1, y1] = region.bbox;
  const w = Math.max(1e-6, x1 - x0);
  const h = Math.max(1e-6, y1 - y0);
  const max = Math.max(w, h);
  const tw = (w / max) * 32;
  const th = (h / max) * 32;
  return (
    <svg width={48} height={36} viewBox="-24 -18 48 36" style={{ display: 'block' }}>
      <rect
        x={-tw / 2}
        y={-th / 2}
        width={tw}
        height={th}
        fill={SW_COLORS.brand + '22'}
        stroke={SW_COLORS.brand}
        strokeWidth={1.4}
      />
    </svg>
  );
}

// ── CONNECTOR LAYER ───────────────────────────────────────────────────────────

/**
 * Draws every connector in the active twin as a directed arrow from source
 * footprint center to target footprint center. One <defs> arrowhead marker
 * per kind so flow / operator / material arrows can be tinted independently.
 */
function ConnectorLayer({
  twin,
  connect,
  onRemove,
}: {
  twin: ReturnType<typeof selectActiveTwin>;
  connect: { on: boolean; kind: ConnectorKind; fromWsId: string | null };
  onRemove: (id: string) => void;
}) {
  const wsById = new Map(twin.workstations.map((w) => [w.id, w] as const));
  const dim = connect.on ? 0.35 : 1; // de-emphasise existing arrows while connecting

  return (
    <g>
      <defs>
        {(['flow', 'operator', 'material'] as ConnectorKind[]).map((k) => (
          <marker
            key={k}
            id={`sw-arrow-${k}`}
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={CONNECTOR_HEX[k]} />
          </marker>
        ))}
      </defs>

      {(twin.connectors ?? []).map((c) => {
        const a = wsById.get(c.fromWsId);
        const b = wsById.get(c.toWsId);
        if (!a || !b) return null;
        const pa = workstationScreenCenter(a);
        const pb = workstationScreenCenter(b);
        const color = CONNECTOR_HEX[c.kind];
        const mx = (pa.sx + pb.sx) / 2;
        const my = (pa.sy + pb.sy) / 2 - 6;
        const isFlow = c.kind === 'flow';
        return (
          <g key={c.id} style={{ pointerEvents: 'auto' }}>
            <line
              x1={pa.sx}
              y1={pa.sy}
              x2={pb.sx}
              y2={pb.sy}
              stroke={color}
              strokeOpacity={dim}
              strokeWidth={isFlow ? 2.4 : 1.8}
              strokeDasharray={isFlow ? undefined : '6 4'}
              markerEnd={`url(#sw-arrow-${c.kind})`}
            />
            {/* Click target — invisible thicker line for easier hit-testing */}
            <line
              x1={pa.sx}
              y1={pa.sy}
              x2={pb.sx}
              y2={pb.sy}
              stroke="transparent"
              strokeWidth={14}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete ${CONNECTOR_LABEL[c.kind]} connector?`)) {
                  onRemove(c.id);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${CONNECTOR_LABEL[c.kind]} · ${a.name} → ${b.name} (click to delete)`}</title>
            </line>
            {c.label && (
              <text
                x={mx}
                y={my}
                textAnchor="middle"
                fontFamily={SW_FONTS.mono}
                fontSize={9}
                fontWeight={700}
                fill={color}
                opacity={dim}
                style={{ pointerEvents: 'none', letterSpacing: '0.04em' }}
              >
                {c.label}
              </text>
            )}
          </g>
        );
      })}

      {/* In-progress preview: source → cursor isn't tracked here (it would
       *  require pointer state lifted to BuilderPage). The source ring on the
       *  selected workstation is enough of a visual cue for now. */}
    </g>
  );
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
// BUILDER LOGIC VIEW — block-flow / schema diagram of the active twin
// ============================================================================
//
// Replaces the iso canvas when the user toggles the LOGIC mode. Each dept
// becomes a flow card showing its station count, station kinds, and links
// to the next dept in the iso reading order. Clicking a card selects the
// dept so the inspector populates — no authoring of geometry happens here,
// since logic mode is for inspecting the *flow*, not the floor plan.

interface BuilderLogicViewProps {
  twin: ReturnType<typeof selectActiveTwin>;
  selected: { kind: 'dept' | 'ws'; id: string } | null;
  onSelect: (s: { kind: 'dept' | 'ws'; id: string } | null) => void;
}

function BuilderLogicView({ twin, selected, onSelect }: BuilderLogicViewProps) {
  const ordered = [...twin.departments].sort((a, b) => {
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
    return a.bounds.x - b.bounds.x;
  });

  const W = 1280;
  const H = 720;
  const CARD_W = 230;
  const CARD_H = 150;
  const cols = 4;
  const colStep = (W - 80 - CARD_W) / Math.max(1, cols - 1);
  const rowStep = CARD_H + 80;

  const positions = ordered.map((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { x: 40 + col * colStep, y: 70 + row * rowStep, col, row };
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        padding: 0,
        background:
          'linear-gradient(' + SW_COLORS.paperEdge + '20 1px, transparent 1px), linear-gradient(90deg, ' + SW_COLORS.paperEdge + '20 1px, transparent 1px), ' + SW_COLORS.paperDeep,
        backgroundSize: '24px 24px',
      }}
      onClick={(e) => {
        // Click on background clears selection
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
        onClick={() => onSelect(null)}
      >
        <defs>
          <marker
            id="builder-logic-arrow"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill={SW_COLORS.steel} />
          </marker>
        </defs>

        {/* Title */}
        <text
          x={W / 2}
          y={36}
          textAnchor="middle"
          fill={SW_COLORS.muted}
          fontFamily={SW_FONTS.mono}
          fontSize={12}
          fontWeight={800}
          letterSpacing="2px"
        >
          {twin.name.toUpperCase()} · LOGIC · BLOCK-FLOW DIAGRAM
        </text>

        {/* Flow arrows */}
        {ordered.map((_, i) => {
          if (i === ordered.length - 1) return null;
          const a = positions[i];
          const b = positions[i + 1];
          const sx = a.x + CARD_W;
          const sy = a.y + CARD_H / 2;
          const ex = b.x;
          const ey = b.y + CARD_H / 2;
          let path: string;
          if (a.row === b.row) {
            path = `M ${sx} ${sy} L ${ex - 6} ${ey}`;
          } else {
            const midY = (a.y + CARD_H + b.y) / 2;
            path = `M ${sx} ${sy} L ${sx + 24} ${sy} L ${sx + 24} ${midY} L ${b.x - 24} ${midY} L ${b.x - 24} ${ey} L ${ex - 6} ${ey}`;
          }
          return (
            <path
              key={`flow-${i}`}
              d={path}
              fill="none"
              stroke={SW_COLORS.line.replace('30', '70')}
              strokeWidth={2}
              strokeDasharray="6 5"
              markerEnd="url(#builder-logic-arrow)"
              pointerEvents="none"
            />
          );
        })}

        {/* Department cards */}
        {ordered.map((d, i) => {
          const p = positions[i];
          const stations = twin.workstations.filter((w) => w.deptId === d.id);
          const accent = DEPT_COLOR_HEX[d.color];
          const isSelected = selected?.kind === 'dept' && selected.id === d.id;

          // Group stations by catalog id for a "what's in this dept" summary.
          const byCatalog: Record<string, number> = {};
          stations.forEach((w) => {
            byCatalog[w.catalogId] = (byCatalog[w.catalogId] ?? 0) + 1;
          });
          const summary = Object.entries(byCatalog).slice(0, 3);

          return (
            <g
              key={d.id}
              transform={`translate(${p.x}, ${p.y})`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: 'dept', id: d.id });
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={0}
                y={0}
                width={CARD_W}
                height={CARD_H}
                rx={6}
                fill={SW_COLORS.paper}
                stroke={isSelected ? SW_COLORS.brand : accent}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              {/* Header strip */}
              <rect x={0} y={0} width={CARD_W} height={28} rx={6} fill={accent} />
              <rect x={0} y={22} width={CARD_W} height={6} fill={accent} />
              <text
                x={12}
                y={18}
                fontFamily={SW_FONTS.display}
                fontSize={11}
                fontWeight={900}
                fill="#fff"
                letterSpacing="0.1em"
              >
                {d.name.toUpperCase()}
              </text>
              <text
                x={CARD_W - 12}
                y={18}
                textAnchor="end"
                fontFamily={SW_FONTS.mono}
                fontSize={9}
                fontWeight={800}
                fill="#ffffffcc"
              >
                {stations.length} STN
              </text>

              {/* Body — kind + bounds */}
              <text
                x={12}
                y={50}
                fontFamily={SW_FONTS.body}
                fontSize={11}
                fontWeight={700}
                fill={SW_COLORS.steel}
              >
                {d.kind}
              </text>
              <text
                x={CARD_W - 12}
                y={50}
                textAnchor="end"
                fontFamily={SW_FONTS.mono}
                fontSize={9}
                fontWeight={700}
                fill={SW_COLORS.muted}
              >
                {d.bounds.w}×{d.bounds.h}
              </text>

              {/* Workstation summary list */}
              {summary.length === 0 ? (
                <text
                  x={CARD_W / 2}
                  y={86}
                  textAnchor="middle"
                  fontFamily={SW_FONTS.body}
                  fontSize={11}
                  fontStyle="italic"
                  fill={SW_COLORS.muted}
                >
                  no workstations
                </text>
              ) : (
                summary.map(([catalogId, count], k) => {
                  const fix = ISO_FIXTURE_CATALOG.find((f) => f.id === catalogId);
                  const label = fix?.label ?? catalogId;
                  return (
                    <g key={catalogId} transform={`translate(0, ${72 + k * 16})`}>
                      <text
                        x={12}
                        fontFamily={SW_FONTS.mono}
                        fontSize={10}
                        fontWeight={700}
                        fill={SW_COLORS.ink}
                      >
                        × {count}
                      </text>
                      <text
                        x={42}
                        fontFamily={SW_FONTS.body}
                        fontSize={11}
                        fontWeight={500}
                        fill={SW_COLORS.steel}
                      >
                        {label.length > 22 ? label.slice(0, 20) + '…' : label}
                      </text>
                    </g>
                  );
                })
              )}
              {Object.keys(byCatalog).length > 3 && (
                <text
                  x={12}
                  y={CARD_H - 10}
                  fontFamily={SW_FONTS.mono}
                  fontSize={9}
                  fontWeight={700}
                  fill={SW_COLORS.muted}
                >
                  +{Object.keys(byCatalog).length - 3} more types
                </text>
              )}
            </g>
          );
        })}

        {/* Empty state */}
        {ordered.length === 0 && (
          <text
            x={W / 2}
            y={H / 2}
            textAnchor="middle"
            fontFamily={SW_FONTS.body}
            fontSize={14}
            fill={SW_COLORS.muted}
          >
            No departments authored yet — switch to ISO mode to drop one in.
          </text>
        )}

        {/* Legend */}
        <g transform={`translate(${W - 240}, ${H - 60})`}>
          <rect width={220} height={44} fill={SW_COLORS.paper} stroke={SW_COLORS.line} rx={4} />
          <text
            x={12}
            y={18}
            fontFamily={SW_FONTS.mono}
            fontSize={10}
            fontWeight={900}
            fill={SW_COLORS.ink}
            letterSpacing="0.15em"
          >
            LOGIC LEGEND
          </text>
          <text
            x={12}
            y={34}
            fontFamily={SW_FONTS.mono}
            fontSize={9}
            fill={SW_COLORS.muted}
          >
            ⬛ dept · → process flow · click → inspect
          </text>
        </g>
      </svg>
    </div>
  );
}

// ============================================================================
// BUILDER PROCESS VIEW — workstation-level PML block diagram
// ============================================================================
//
// Renders every workstation as a PML block (Source / Queue / Service /
// Delay / SelectOutput / Sink / Conveyor / ResourcePool / …) with explicit
// input + output port dots. Connectors in the twin are drawn as wires
// from a source block's output port to a target block's input port.
//
// Layout: each Department is a horizontal swim lane. Within a lane,
// blocks are sorted by their iso-canvas x position so the PML diagram
// reads left-to-right in the same order the floor reads left-to-right.
// ResourcePool blocks (operators / mechanics) are pulled out into a
// dedicated bottom lane — they have no flow ports; they are *referenced*
// by Service blocks, not wired into the flow.

interface BuilderProcessViewProps {
  twin: ReturnType<typeof selectActiveTwin>;
  selected: { kind: 'dept' | 'ws'; id: string } | null;
  onSelect: (s: { kind: 'dept' | 'ws'; id: string } | null) => void;
  /** Active CONNECT-tool state. When `on` is true, port dots become
   *  clickable and the cursor switches to crosshair. */
  connect: { on: boolean; kind: ConnectorKind; fromWsId: string | null; fromPort: string | null };
  /** Called when the user clicks an OUTPUT port dot in CONNECT mode. */
  onPickFromPort: (wsId: string, portId: string) => void;
  /** Called when the user clicks an INPUT port dot in CONNECT mode and
   *  the source is already chosen. Implementations should call
   *  addConnector and then advance the connect chain. */
  onPickToPort: (wsId: string, portId: string) => void;
}

/** Layout result for a single workstation block. */
interface ProcessNode {
  ws: Workstation;
  block: PmlBlock;
  /** Top-left in SVG coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Department this block belongs to (already resolved from ws.deptId). */
  dept: Department | undefined;
}

/** Tints by PML category — keeps the diagram visually parseable at a glance. */
const PML_CATEGORY_TINT: Record<string, { fill: string; stroke: string }> = {
  lifecycle: { fill: '#FFF7E6', stroke: '#F2C12E' },
  buffer:    { fill: '#EEF3FF', stroke: '#3D6EE5' },
  service:   { fill: '#FFEBEC', stroke: '#E63946' },
  routing:   { fill: '#F0FBF4', stroke: '#1FB36B' },
  batch:     { fill: '#F4ECFF', stroke: '#7E5BEF' },
  movement:  { fill: '#FDF1E0', stroke: '#C8915E' },
};

/** Returns the SVG-space center of a port on a node. Inputs are spread
 *  along the left edge, outputs along the right edge. */
function portPosition(
  node: ProcessNode,
  port: PmlPort,
  side: 'in' | 'out',
): { x: number; y: number } {
  const ports = side === 'in' ? node.block.inputs : node.block.outputs;
  const idx = Math.max(0, ports.findIndex((p) => p.id === port.id));
  const slot = (idx + 1) / (ports.length + 1);
  return {
    x: side === 'in' ? node.x : node.x + node.w,
    y: node.y + node.h * slot,
  };
}

function BuilderProcessView({
  twin,
  selected,
  onSelect,
  connect,
  onPickFromPort,
  onPickToPort,
}: BuilderProcessViewProps) {
  const BLOCK_W = 168;
  const BLOCK_H = 80;
  const GAP_X = 28;
  const LANE_GAP = 28;
  const LANE_PAD_TOP = 28;
  const LANE_LABEL_W = 140;
  const PAD_X = 24 + LANE_LABEL_W;
  const PAD_TOP = 64;

  // Resolve PML block for every workstation, then split into flow vs resource pools.
  const allNodes = twin.workstations.map<{ ws: Workstation; block: PmlBlock; isPool: boolean }>(
    (ws) => {
      const block = getBlockSpec(ws);
      return { ws, block, isPool: block.kind === 'ResourcePool' };
    },
  );
  const flowNodes = allNodes.filter((n) => !n.isPool);
  const poolNodes = allNodes.filter((n) => n.isPool);

  // Departments in reading order (top-left first).
  const ordered = [...twin.departments].sort((a, b) => {
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
    return a.bounds.x - b.bounds.x;
  });

  // Layout each department lane, then a final pool lane.
  const positions = new Map<string, ProcessNode>();
  let cursorY = PAD_TOP;
  let maxBlocksInLane = 1;

  ordered.forEach((d) => {
    const dBlocks = flowNodes
      .filter((n) => n.ws.deptId === d.id)
      .sort((a, b) => a.ws.position.x - b.ws.position.x || a.ws.position.y - b.ws.position.y);
    if (dBlocks.length === 0) {
      // Still render the lane label so empty depts are visible.
      cursorY += BLOCK_H + LANE_GAP;
      return;
    }
    maxBlocksInLane = Math.max(maxBlocksInLane, dBlocks.length);
    dBlocks.forEach((n, idx) => {
      positions.set(n.ws.id, {
        ws: n.ws,
        block: n.block,
        x: PAD_X + idx * (BLOCK_W + GAP_X),
        y: cursorY + LANE_PAD_TOP,
        w: BLOCK_W,
        h: BLOCK_H,
        dept: d,
      });
    });
    cursorY += BLOCK_H + LANE_PAD_TOP + LANE_GAP;
  });

  // Workstations whose dept didn't make it into `ordered` (defensive — shouldn't
  // happen; would mean a dangling deptId).
  const orphanFlow = flowNodes.filter(
    (n) => !ordered.find((d) => d.id === n.ws.deptId),
  );
  if (orphanFlow.length > 0) {
    orphanFlow.forEach((n, idx) => {
      positions.set(n.ws.id, {
        ws: n.ws,
        block: n.block,
        x: PAD_X + idx * (BLOCK_W + GAP_X),
        y: cursorY + LANE_PAD_TOP,
        w: BLOCK_W,
        h: BLOCK_H,
        dept: undefined,
      });
    });
    cursorY += BLOCK_H + LANE_PAD_TOP + LANE_GAP;
    maxBlocksInLane = Math.max(maxBlocksInLane, orphanFlow.length);
  }

  // Resource-pool lane.
  const poolY = cursorY + LANE_PAD_TOP;
  poolNodes.forEach((n, idx) => {
    positions.set(n.ws.id, {
      ws: n.ws,
      block: n.block,
      x: PAD_X + idx * (BLOCK_W + GAP_X),
      y: poolY,
      w: BLOCK_W,
      h: BLOCK_H,
      dept: twin.departments.find((d) => d.id === n.ws.deptId),
    });
  });
  if (poolNodes.length > 0) {
    maxBlocksInLane = Math.max(maxBlocksInLane, poolNodes.length);
    cursorY += BLOCK_H + LANE_PAD_TOP + LANE_GAP;
  }

  const W = Math.max(1280, PAD_X + maxBlocksInLane * (BLOCK_W + GAP_X) + 40);
  const H = Math.max(640, cursorY + 60);

  // Pre-resolve connector wire endpoints. Honour the connector's named
  // `fromPort` / `toPort` when set; otherwise default to the source's
  // first output and the target's first input.
  const wires = twin.connectors
    .map((c) => {
      const from = positions.get(c.fromWsId);
      const to = positions.get(c.toWsId);
      if (!from || !to) return null;
      const outPort =
        (c.fromPort ? from.block.outputs.find((p) => p.id === c.fromPort) : null) ??
        from.block.outputs[0];
      const inPort =
        (c.toPort ? to.block.inputs.find((p) => p.id === c.toPort) : null) ??
        to.block.inputs[0];
      if (!outPort || !inPort) return null;
      const a = portPosition(from, outPort, 'out');
      const b = portPosition(to, inPort, 'in');
      return { c, a, b, outPortLabel: outPort.label, inPortLabel: inPort.label };
    })
    .filter(Boolean) as {
      c: Connector;
      a: { x: number; y: number };
      b: { x: number; y: number };
      outPortLabel: string;
      inPortLabel: string;
    }[];

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        background:
          'linear-gradient(' + SW_COLORS.paperEdge + '20 1px, transparent 1px), linear-gradient(90deg, ' + SW_COLORS.paperEdge + '20 1px, transparent 1px), ' + SW_COLORS.paperDeep,
        backgroundSize: '24px 24px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMinYMin meet"
        width={W}
        height={H}
        style={{ display: 'block' }}
        onClick={() => onSelect(null)}
      >
        <defs>
          <marker
            id="builder-process-arrow"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill={SW_COLORS.brand} />
          </marker>
        </defs>

        {/* Title strip */}
        <text
          x={W / 2}
          y={32}
          textAnchor="middle"
          fill={SW_COLORS.muted}
          fontFamily={SW_FONTS.mono}
          fontSize={12}
          fontWeight={800}
          letterSpacing="2px"
        >
          {twin.name.toUpperCase()} · PROCESS · PML BLOCKS WITH I/O PORTS
        </text>

        {/* Swim-lane backgrounds + dept labels */}
        {(() => {
          let y = PAD_TOP;
          const lanes: ReactNode[] = [];
          ordered.forEach((d) => {
            const blocksInLane = flowNodes.filter((n) => n.ws.deptId === d.id);
            const laneH = BLOCK_H + LANE_PAD_TOP + LANE_GAP;
            const accent = DEPT_COLOR_HEX[d.color];
            lanes.push(
              <g key={`lane-${d.id}`} transform={`translate(0, ${y})`}>
                <rect
                  x={LANE_LABEL_W}
                  y={4}
                  width={W - LANE_LABEL_W - 16}
                  height={laneH - 12}
                  fill={accent + '0a'}
                  stroke={accent + '40'}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  rx={4}
                />
                <rect x={12} y={LANE_PAD_TOP} width={6} height={BLOCK_H} fill={accent} rx={2} />
                <text
                  x={26}
                  y={LANE_PAD_TOP + 16}
                  fontFamily={SW_FONTS.display}
                  fontSize={11}
                  fontWeight={900}
                  fill={SW_COLORS.ink}
                  letterSpacing="0.1em"
                >
                  {d.name.toUpperCase()}
                </text>
                <text
                  x={26}
                  y={LANE_PAD_TOP + 32}
                  fontFamily={SW_FONTS.mono}
                  fontSize={9}
                  fontWeight={700}
                  fill={SW_COLORS.muted}
                >
                  {blocksInLane.length} BLOCK{blocksInLane.length === 1 ? '' : 'S'}
                </text>
                <text
                  x={26}
                  y={LANE_PAD_TOP + 48}
                  fontFamily={SW_FONTS.mono}
                  fontSize={9}
                  fontWeight={500}
                  fill={SW_COLORS.muted}
                >
                  {d.kind}
                </text>
              </g>,
            );
            y += laneH;
          });
          return lanes;
        })()}

        {/* Resource-pool lane label */}
        {poolNodes.length > 0 && (
          <g transform={`translate(0, ${poolY - LANE_PAD_TOP})`}>
            <rect
              x={LANE_LABEL_W}
              y={4}
              width={W - LANE_LABEL_W - 16}
              height={BLOCK_H + 8}
              fill={SW_COLORS.steel + '0a'}
              stroke={SW_COLORS.steel + '40'}
              strokeDasharray="2 4"
              strokeWidth={1}
              rx={4}
            />
            <rect x={12} y={LANE_PAD_TOP} width={6} height={BLOCK_H} fill={SW_COLORS.steel} rx={2} />
            <text
              x={26}
              y={LANE_PAD_TOP + 16}
              fontFamily={SW_FONTS.display}
              fontSize={11}
              fontWeight={900}
              fill={SW_COLORS.ink}
              letterSpacing="0.1em"
            >
              RESOURCE POOLS
            </text>
            <text
              x={26}
              y={LANE_PAD_TOP + 32}
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={700}
              fill={SW_COLORS.muted}
            >
              {poolNodes.length} POOL{poolNodes.length === 1 ? '' : 'S'}
            </text>
            <text
              x={26}
              y={LANE_PAD_TOP + 48}
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={500}
              fill={SW_COLORS.muted}
            >
              referenced by Services
            </text>
          </g>
        )}

        {/* Connector wires (drawn before blocks so blocks sit on top) */}
        {wires.map(({ c, a, b }) => {
          const dx = b.x - a.x;
          const cx1 = a.x + Math.max(28, dx / 2);
          const cx2 = b.x - Math.max(28, dx / 2);
          const path = `M ${a.x} ${a.y} C ${cx1} ${a.y}, ${cx2} ${b.y}, ${b.x} ${b.y}`;
          return (
            <g key={c.id}>
              <path
                d={path}
                fill="none"
                stroke={CONNECTOR_HEX[c.kind]}
                strokeWidth={2}
                strokeOpacity={0.85}
                markerEnd="url(#builder-process-arrow)"
                pointerEvents="none"
              />
            </g>
          );
        })}

        {/* Block cards */}
        {Array.from(positions.values()).map((n) => {
          const isSelected = selected?.kind === 'ws' && selected.id === n.ws.id;
          const tint = PML_CATEGORY_TINT[n.block.spec.category] ?? {
            fill: SW_COLORS.paper,
            stroke: SW_COLORS.line,
          };
          const role = apparelRoleFor(n.ws);
          return (
            <g
              key={n.ws.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: 'ws', id: n.ws.id });
              }}
            >
              {/* Card body */}
              <rect
                x={0}
                y={0}
                width={n.w}
                height={n.h}
                rx={6}
                fill={tint.fill}
                stroke={isSelected ? SW_COLORS.brand : tint.stroke}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              {/* Header strip */}
              <rect x={0} y={0} width={n.w} height={22} rx={6} fill={tint.stroke} />
              <rect x={0} y={16} width={n.w} height={6} fill={tint.stroke} />
              <text
                x={10}
                y={15}
                fontFamily={SW_FONTS.mono}
                fontSize={10}
                fontWeight={900}
                fill="#fff"
                letterSpacing="0.08em"
              >
                {n.block.spec.glyph} {n.block.spec.label.toUpperCase()}
              </text>
              <text
                x={n.w - 8}
                y={15}
                textAnchor="end"
                fontFamily={SW_FONTS.mono}
                fontSize={9}
                fontWeight={800}
                fill="#ffffffcc"
              >
                {n.block.inputs.length}/{n.block.outputs.length}
              </text>

              {/* Body — apparel role + ws name */}
              <text
                x={10}
                y={40}
                fontFamily={SW_FONTS.body}
                fontSize={11}
                fontWeight={800}
                fill={SW_COLORS.ink}
              >
                {role.length > 22 ? role.slice(0, 21) + '…' : role}
              </text>
              <text
                x={10}
                y={56}
                fontFamily={SW_FONTS.mono}
                fontSize={9}
                fontWeight={500}
                fill={SW_COLORS.muted}
              >
                {n.ws.name.length > 26 ? n.ws.name.slice(0, 24) + '…' : n.ws.name}
              </text>
              {n.block.spec.usesResources && !n.ws.kpiObserved && (
                <text
                  x={n.w - 8}
                  y={n.h - 6}
                  textAnchor="end"
                  fontFamily={SW_FONTS.mono}
                  fontSize={8}
                  fontWeight={800}
                  fill={SW_COLORS.muted}
                  letterSpacing="0.1em"
                >
                  ⚡ RESOURCE
                </text>
              )}

              {/* Observed-throughput badge — renders along the bottom of the
                  block when the active twin has KPIs from a recent PML run.
                  Shows "X /hr" plus utilisation %. Bottleneck blocks get a
                  red ◆. */}
              {n.ws.kpiObserved && (
                <g transform={`translate(8, ${n.h - 16})`}>
                  <rect
                    x={0}
                    y={0}
                    width={n.w - 16}
                    height={14}
                    rx={3}
                    fill={n.ws.kpiObserved.bottleneck ? SW_COLORS.alarm : tint.stroke}
                    fillOpacity={0.92}
                  />
                  <text
                    x={6}
                    y={10}
                    fontFamily={SW_FONTS.mono}
                    fontSize={9}
                    fontWeight={900}
                    fill="#fff"
                    letterSpacing="0.04em"
                  >
                    {n.ws.kpiObserved.bottleneck && '◆ '}
                    {Math.round(n.ws.kpiObserved.capacityPerHr)} /hr
                    {n.block.spec.usesResources && ` · ${Math.round(n.ws.kpiObserved.utilizationPct)}% util`}
                  </text>
                </g>
              )}

              {/* Input port dots — left edge. Clickable in CONNECT mode
                  once a source has been picked. */}
              {n.block.inputs.map((p, i) => {
                const slot = (i + 1) / (n.block.inputs.length + 1);
                const py = n.h * slot;
                const armed = connect.on && connect.fromWsId !== null && connect.fromWsId !== n.ws.id;
                return (
                  <g
                    key={`in-${p.id}`}
                    transform={`translate(0, ${py})`}
                    style={{ cursor: armed ? 'crosshair' : 'default' }}
                    onClick={(e) => {
                      if (!armed) return;
                      e.stopPropagation();
                      onPickToPort(n.ws.id, p.id);
                    }}
                  >
                    {/* Larger transparent hit area so the click target is
                        comfortable even though the visible dot is small. */}
                    <circle cx={0} cy={0} r={12} fill="transparent" />
                    <circle
                      cx={0}
                      cy={0}
                      r={armed ? 6 : 5}
                      fill={SW_COLORS.paper}
                      stroke={armed ? SW_COLORS.brand : tint.stroke}
                      strokeWidth={armed ? 2.5 : 2}
                    />
                    <circle cx={0} cy={0} r={1.8} fill={armed ? SW_COLORS.brand : tint.stroke} />
                    {n.block.inputs.length > 1 && (
                      <text
                        x={9}
                        y={3}
                        fontFamily={SW_FONTS.mono}
                        fontSize={8}
                        fontWeight={700}
                        fill={SW_COLORS.steel}
                        pointerEvents="none"
                      >
                        {p.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Output port dots — right edge. Clickable in CONNECT mode
                  to set the source `(wsId, portId)`. The currently-selected
                  fromPort is highlighted with a brand-coloured halo. */}
              {n.block.outputs.map((p, i) => {
                const slot = (i + 1) / (n.block.outputs.length + 1);
                const py = n.h * slot;
                const armed = connect.on;
                const isFrom =
                  connect.on &&
                  connect.fromWsId === n.ws.id &&
                  connect.fromPort === p.id;
                return (
                  <g
                    key={`out-${p.id}`}
                    transform={`translate(${n.w}, ${py})`}
                    style={{ cursor: armed ? 'crosshair' : 'default' }}
                    onClick={(e) => {
                      if (!armed) return;
                      e.stopPropagation();
                      onPickFromPort(n.ws.id, p.id);
                    }}
                  >
                    <circle cx={0} cy={0} r={12} fill="transparent" />
                    {isFrom && (
                      <circle
                        cx={0}
                        cy={0}
                        r={9}
                        fill="none"
                        stroke={SW_COLORS.brand}
                        strokeWidth={2}
                        strokeDasharray="2 2"
                      />
                    )}
                    <circle
                      cx={0}
                      cy={0}
                      r={isFrom ? 6 : 5}
                      fill={isFrom ? SW_COLORS.brand : tint.stroke}
                      stroke={isFrom ? SW_COLORS.brand : tint.stroke}
                      strokeWidth={2}
                    />
                    <circle cx={0} cy={0} r={1.8} fill="#fff" />
                    {n.block.outputs.length > 1 && (
                      <text
                        x={-9}
                        y={3}
                        textAnchor="end"
                        fontFamily={SW_FONTS.mono}
                        fontSize={8}
                        fontWeight={700}
                        fill={SW_COLORS.steel}
                        pointerEvents="none"
                      >
                        {p.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Empty state */}
        {twin.workstations.length === 0 && (
          <text
            x={W / 2}
            y={H / 2}
            textAnchor="middle"
            fontFamily={SW_FONTS.body}
            fontSize={14}
            fill={SW_COLORS.muted}
          >
            No workstations yet — switch to ISO mode to drop one in. Each fixture you place becomes a PML block.
          </text>
        )}

        {/* Legend */}
        <g transform={`translate(${W - 320}, ${H - 76})`}>
          <rect width={300} height={62} fill={SW_COLORS.paper} stroke={SW_COLORS.line} rx={4} />
          <text
            x={12}
            y={18}
            fontFamily={SW_FONTS.mono}
            fontSize={10}
            fontWeight={900}
            fill={SW_COLORS.ink}
            letterSpacing="0.15em"
          >
            PML LEGEND
          </text>
          <text x={12} y={34} fontFamily={SW_FONTS.mono} fontSize={9} fill={SW_COLORS.muted}>
            ◯ input port (left) · ● output port (right)
          </text>
          <text x={12} y={48} fontFamily={SW_FONTS.mono} fontSize={9} fill={SW_COLORS.muted}>
            → connector · header = block kind · click → inspect
          </text>
        </g>
      </svg>
    </div>
  );
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
  /** Set or clear the workstation's PML block override. */
  onSetBlock: (wsId: string, block: PmlBlockOverride | null) => void;
  onRemoveConnector: (id: string) => void;
}

function Inspector(props: InspectorProps) {
  const wrapper: CSSProperties = {
    gridColumn: '5',
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
          <NumField label="x" step={0.1} value={dept.bounds.x} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, x: v } })} />
          <NumField label="y" step={0.1} value={dept.bounds.y} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, y: v } })} />
          <NumField label="w" step={0.1} value={dept.bounds.w} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, w: v } })} />
          <NumField label="h" step={0.1} value={dept.bounds.h} onChange={(v) => props.onUpdateDept(dept.id, { bounds: { ...dept.bounds, h: v } })} />
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
      <div style={sectionLabel}>Position (cells)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <NumField label="x" step={0.1} value={ws.position.x} onChange={(v) => props.onUpdateWs(ws.id, { position: { ...ws.position, x: v } })} />
        <NumField label="y" step={0.1} value={ws.position.y} onChange={(v) => props.onUpdateWs(ws.id, { position: { ...ws.position, y: v } })} />
      </div>

      {(() => {
        // Effective size = per-ws override ?? catalogue default. Inspector
        // edits always write the override so the workstation diverges from
        // the catalogue size. Decimal stepping (0.1) lets the user dial in
        // sub-cell dimensions.
        const eff = {
          w: ws.size?.w ?? fixture?.w ?? 1,
          d: ws.size?.d ?? fixture?.d ?? 1,
          h: ws.size?.h ?? fixture?.h ?? 1,
        };
        const writeSize = (patch: Partial<{ w: number; d: number; h: number }>) =>
          props.onUpdateWs(ws.id, { size: { ...eff, ...patch } });
        return (
          <>
            <div style={{ height: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={sectionLabel}>Size (cells)</div>
              {ws.size && (
                <button
                  onClick={() => props.onUpdateWs(ws.id, { size: undefined })}
                  style={{ ...btnSec, padding: '2px 7px', fontSize: 9 }}
                  title="Restore the catalogue's default size"
                >
                  RESET
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <NumField label="w" step={0.1} value={eff.w} onChange={(v) => writeSize({ w: v })} />
              <NumField label="d" step={0.1} value={eff.d} onChange={(v) => writeSize({ d: v })} />
              <NumField label="h" step={0.1} value={eff.h} onChange={(v) => writeSize({ h: v })} />
            </div>
          </>
        );
      })()}

      <div style={{ height: 14 }} />
      <BlockSection
        ws={ws}
        onSetBlock={props.onSetBlock}
      />

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

      <FlowSection
        ws={ws}
        twin={props.twin}
        onRemoveConnector={props.onRemoveConnector}
      />
    </div>
  );
}

/** PROCESS BLOCK panel — lets the user inspect and override the PML block
 *  kind for the selected workstation. The default is inferred from the
 *  fixture's `catalogId` (e.g. a sewing machine → Service, a buffer pad →
 *  Queue); the user can override per-station to model non-default
 *  semantics (a generic table tagged as a Hold or Match block). */
function BlockSection({
  ws,
  onSetBlock,
}: {
  ws: Workstation;
  onSetBlock: (wsId: string, block: PmlBlockOverride | null) => void;
}) {
  const block = getBlockSpec(ws);
  const defaultKind = inferBlockKindFromCatalog(ws.catalogId);
  const role = apparelRoleFor(ws);

  const onPickKind = (next: PmlBlockKind | 'auto') => {
    if (next === 'auto') {
      onSetBlock(ws.id, null);
      return;
    }
    if (next === defaultKind) {
      // Picking the catalog default explicitly = drop the override; same
      // outcome as 'auto', but the dropdown reflects the user's intent.
      onSetBlock(ws.id, null);
      return;
    }
    onSetBlock(ws.id, { kind: next });
  };

  // Tint to match the PROCESS view category palette so the section visually
  // ties to the canvas card style.
  const catTint = PML_CATEGORY_TINT[block.spec.category] ?? {
    fill: SW_COLORS.paper,
    stroke: SW_COLORS.line,
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={sectionLabel}>Process block</div>
        {block.overridden && (
          <button
            onClick={() => onSetBlock(ws.id, null)}
            style={{ ...btnSec, padding: '2px 7px', fontSize: 9 }}
            title="Drop the override and fall back to the catalog-default block kind"
          >
            RESET
          </button>
        )}
      </div>

      {/* Header chip: glyph · kind · role */}
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: catTint.fill,
          border: `1px solid ${catTint.stroke}`,
          borderLeft: `4px solid ${catTint.stroke}`,
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            display: 'grid',
            placeItems: 'center',
            background: catTint.stroke,
            color: '#fff',
            fontFamily: SW_FONTS.mono,
            fontWeight: 900,
            fontSize: 14,
            borderRadius: 4,
          }}
        >
          {block.spec.glyph}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.08em',
              color: SW_COLORS.ink,
            }}
          >
            {block.spec.label.toUpperCase()}
            <span
              style={{
                marginLeft: 6,
                fontSize: 9,
                fontWeight: 700,
                color: block.overridden ? SW_COLORS.alarm : SW_COLORS.muted,
              }}
            >
              {block.overridden ? 'OVERRIDE' : 'AUTO'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: SW_COLORS.steel, fontWeight: 700 }}>
            {role}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.4 }}>
        {block.spec.blurb}
      </div>

      {/* Kind picker */}
      <div style={{ height: 8 }} />
      <label style={fieldLabel}>Kind</label>
      <select
        value={block.overridden ? block.kind : 'auto'}
        onChange={(e) => onPickKind(e.target.value as PmlBlockKind | 'auto')}
        style={{ ...inputBase, width: '100%', fontFamily: SW_FONTS.mono, fontWeight: 700 }}
      >
        <option value="auto">
          ◇ Auto · {PML_BLOCK_LIBRARY[defaultKind].label} (catalog default)
        </option>
        {SELECTABLE_BLOCK_KINDS.map((k) => {
          const spec = PML_BLOCK_LIBRARY[k];
          return (
            <option key={k} value={k}>
              {spec.glyph} {spec.label}
              {k === defaultKind ? ' · default' : ''}
            </option>
          );
        })}
      </select>

      {/* Port summary */}
      <div style={{ height: 10 }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <PortList side="in"  label="Inputs"  ports={block.inputs}  tint={catTint} />
        <PortList side="out" label="Outputs" ports={block.outputs} tint={catTint} />
      </div>

      {/* Authored sim parameters — only shown when the block kind has any. */}
      <BlockParamFields ws={ws} block={block} onSetBlock={onSetBlock} />

      {block.spec.usesResources && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 8px',
            background: SW_COLORS.paperDeep,
            border: `1px dashed ${SW_COLORS.line}`,
            borderRadius: 4,
            fontSize: 11,
            color: SW_COLORS.steel,
          }}
        >
          ⚡ Draws on a ResourcePool · Seize → Delay → Release
        </div>
      )}
    </div>
  );
}

/** Per-kind authored simulation parameters editor. Renders the fields
 *  declared in `PARAM_FIELDS_BY_KIND` for the block's resolved kind.
 *  Inputs are seeded from the live resolved value (override → catalog →
 *  default) so the user can see what the engine will use even when no
 *  explicit override has been set. */
function BlockParamFields({
  ws,
  block,
  onSetBlock,
}: {
  ws: Workstation;
  block: PmlBlock;
  onSetBlock: (wsId: string, block: PmlBlockOverride | null) => void;
}) {
  const fields = PARAM_FIELDS_BY_KIND[block.kind];
  if (!fields || fields.length === 0) return null;

  const resolved = getBlockParams(ws);
  const authored = ws.block?.params ?? {};

  /** Persist a single param edit. Always materialises a `block` override
   *  (with the current kind) so simply setting a param implicitly opts
   *  into the override — the user doesn't need to flip the kind picker
   *  first. */
  const setParam = (id: ParamFieldSpec['id'], rawValue: number) => {
    // Pass% is shown as 0..100 in the UI but stored as 0..1.
    const stored = id === 'passProb' ? rawValue / 100 : rawValue;
    const nextParams: PmlBlockParams = { ...authored, [id]: stored };
    onSetBlock(ws.id, {
      kind: block.kind,
      inputs: ws.block?.inputs,
      outputs: ws.block?.outputs,
      params: nextParams,
    });
  };

  const clearParam = (id: ParamFieldSpec['id']) => {
    const next: PmlBlockParams = { ...authored };
    delete next[id];
    const hasAny = Object.keys(next).length > 0;
    // If no overrides remain AND the kind matches the catalog default,
    // drop the whole block override so the workstation goes back to AUTO.
    const isAuto = !block.overridden && !hasAny;
    onSetBlock(
      ws.id,
      isAuto
        ? null
        : {
            kind: block.kind,
            inputs: ws.block?.inputs,
            outputs: ws.block?.outputs,
            params: hasAny ? next : undefined,
          },
    );
  };

  return (
    <>
      <div style={{ height: 10 }} />
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 9,
          fontWeight: 800,
          color: SW_COLORS.muted,
          letterSpacing: '0.12em',
          marginBottom: 4,
        }}
      >
        BLOCK PARAMETERS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fields.map((f) => {
          const isAuthored = authored[f.id] !== undefined;
          const live = f.resolveDefault(resolved);
          return (
            <div key={f.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...fieldLabel, marginBottom: 0, flex: 1 }}>
                  {f.label} <span style={{ color: SW_COLORS.muted, fontWeight: 500 }}>{f.unit.trim()}</span>
                </span>
                <span
                  style={{
                    fontFamily: SW_FONTS.mono,
                    fontSize: 9,
                    fontWeight: 700,
                    color: isAuthored ? SW_COLORS.brand : SW_COLORS.muted,
                  }}
                >
                  {isAuthored ? 'SET' : 'auto'}
                </span>
                {isAuthored && (
                  <button
                    onClick={() => clearParam(f.id)}
                    style={{ ...btnSec, padding: '1px 6px', fontSize: 9 }}
                    title="Drop this override and fall back to the catalog default"
                  >
                    ✕
                  </button>
                )}
              </div>
              <input
                type="number"
                value={live}
                step={f.step}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (isFinite(v)) setParam(f.id, v);
                }}
                style={{ ...inputBase, fontFamily: SW_FONTS.mono, fontWeight: 700 }}
              />
              <div style={{ marginTop: 2, fontSize: 10, color: SW_COLORS.muted }}>
                {f.hint}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Compact list of named ports — one chip per port. Used by BlockSection
 *  for the Inputs / Outputs preview. */
function PortList({
  side,
  label,
  ports,
  tint,
}: {
  side: 'in' | 'out';
  label: string;
  ports: PmlPort[];
  tint: { fill: string; stroke: string };
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 9,
          fontWeight: 800,
          color: SW_COLORS.muted,
          letterSpacing: '0.12em',
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()} · {ports.length}
      </div>
      {ports.length === 0 ? (
        <div
          style={{
            padding: '6px 8px',
            border: `1px dashed ${SW_COLORS.line}`,
            borderRadius: 4,
            fontSize: 10,
            color: SW_COLORS.muted,
            fontStyle: 'italic',
          }}
        >
          none
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ports.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 6px',
                background: SW_COLORS.paper,
                border: `1px solid ${SW_COLORS.line}`,
                borderRadius: 3,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: side === 'in' ? SW_COLORS.paper : tint.stroke,
                  border: `2px solid ${tint.stroke}`,
                  flexShrink: 0,
                }}
              />
              <strong style={{ color: SW_COLORS.ink, fontFamily: SW_FONTS.mono }}>{p.label}</strong>
              {p.kind === 'resource' && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: SW_COLORS.muted, fontWeight: 700 }}>
                  RES
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Flow-connections panel — lists every connector touching the selected
 *  workstation (incoming + outgoing) and lets the user delete them inline. */
function FlowSection({
  ws,
  twin,
  onRemoveConnector,
}: {
  ws: Workstation;
  twin: ReturnType<typeof selectActiveTwin>;
  onRemoveConnector: (id: string) => void;
}) {
  const wsById = new Map(twin.workstations.map((w) => [w.id, w] as const));
  const all = twin.connectors ?? [];
  const incoming = all.filter((c) => c.toWsId === ws.id);
  const outgoing = all.filter((c) => c.fromWsId === ws.id);

  /** Render the port label for an endpoint. Falls back to the block's
   *  first port when the connector doesn't pin a specific port. */
  const portLabelFor = (
    targetWsId: string,
    portId: string | undefined,
    side: 'in' | 'out',
  ): string => {
    const target = wsById.get(targetWsId);
    if (!target) return portId ?? '?';
    const block = getBlockSpec(target);
    const list = side === 'in' ? block.inputs : block.outputs;
    if (portId) {
      return list.find((p) => p.id === portId)?.label ?? portId;
    }
    return list[0]?.label ?? (side === 'in' ? 'in' : 'out');
  };

  const row = (c: Connector, mode: 'in' | 'out') => {
    const otherId = mode === 'in' ? c.fromWsId : c.toWsId;
    const other = wsById.get(otherId);
    // For an INCOMING wire on `ws`: we are the target → our port is the
    // INPUT side, peer's port is the OUTPUT side. And vice-versa.
    const myPort =
      mode === 'in'
        ? portLabelFor(ws.id, c.toPort, 'in')
        : portLabelFor(ws.id, c.fromPort, 'out');
    const otherPort =
      mode === 'in'
        ? portLabelFor(otherId, c.fromPort, 'out')
        : portLabelFor(otherId, c.toPort, 'in');
    return (
      <div
        key={c.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 7px',
          marginTop: 4,
          background: SW_COLORS.paper,
          border: `1px solid ${SW_COLORS.line}`,
          borderLeft: `3px solid ${CONNECTOR_HEX[c.kind]}`,
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        <span
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 9,
            fontWeight: 800,
            color: CONNECTOR_HEX[c.kind],
            letterSpacing: '0.06em',
            minWidth: 56,
          }}
        >
          {mode === 'in' ? '←' : '→'} {CONNECTOR_LABEL[c.kind]}
        </span>
        <span
          style={{
            flex: 1,
            color: SW_COLORS.steel,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${mode === 'in' ? otherPort : myPort} → ${mode === 'in' ? myPort : otherPort}\n${other?.name ?? otherId}`}
        >
          <span
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 9,
              fontWeight: 800,
              color: SW_COLORS.muted,
              marginRight: 6,
            }}
          >
            {mode === 'in' ? `${otherPort}→${myPort}` : `${myPort}→${otherPort}`}
          </span>
          {other?.name ?? '— deleted'}
        </span>
        <button
          onClick={() => onRemoveConnector(c.id)}
          style={{
            ...btnSec,
            padding: '2px 6px',
            fontSize: 9,
            color: SW_COLORS.alarm,
          }}
          title="Remove this connector"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 10,
        background: SW_COLORS.paperDeep,
        borderRadius: 6,
        border: `1px solid ${SW_COLORS.line}`,
      }}
    >
      <div style={sectionLabel}>Flow connections</div>
      {incoming.length === 0 && outgoing.length === 0 && (
        <div style={{ fontSize: 11, color: SW_COLORS.muted, marginTop: 4 }}>
          No connectors yet — turn on{' '}
          <strong style={{ color: SW_COLORS.brand }}>➜ CONNECT</strong> in the
          toolbar, then click this station and another.
        </div>
      )}
      {incoming.length > 0 && (
        <>
          <div style={{ ...fieldLabel, marginTop: 6 }}>Incoming · {incoming.length}</div>
          {incoming.map((c) => row(c, 'in'))}
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <div style={{ ...fieldLabel, marginTop: 8 }}>Outgoing · {outgoing.length}</div>
          {outgoing.map((c) => row(c, 'out'))}
        </>
      )}
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
