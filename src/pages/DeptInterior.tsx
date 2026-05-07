/**
 * STITCHWORKS — DEPARTMENT INTERIOR (level 2)
 * Drill-down from Live Floor: zone → interior. Views: PLAN / FLOW / PEOPLE /
 * NUMBERS. Editable: add/move/delete workstations, reassign operators,
 * tune cycle, add machines from catalog, sequence sub-ops, set breaks,
 * re-route paths.
 *
 * Persistence: localStorage["sw_dept_<id>"]
 *
 * Ported verbatim (visual fidelity priority) from
 * .design-import/sw/sw-screens-dept.jsx — see SWDeptInterior + supporting
 * components. Helpers ported as local components in this file:
 *   DeptBreadcrumb, FloorMinimap, DeptCanvas, DeptInspector,
 *   SubopsRibbon, SubopsModal, SkillMatrixModal, ModalShell, CamBtn,
 *   LocalStat (the source's local <Stat>).
 */
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  Fragment,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import {
  DEPT_MACHINE_CATALOG,
  DEPT_LAYOUT,
  type DeptMachineId,
  type Subop,
  type Dept,
} from '../domain';

// ============================================================================
// Layout types — local to the dept-interior screen.
// ============================================================================
interface Workstation {
  id: string;
  x: number;
  y: number;
  label: string;
  subopId: string;
  machineId: string;
  operatorId: string;
}
interface MachineInstance {
  id: string;
  type: DeptMachineId;
  x: number;
  y: number;
}
interface Operator {
  id: string;
  name: string;
  skill: number;
}
interface Buffer {
  side: 'in' | 'out';
  x: number;
  y: number;
  cap: number;
}
interface WalkPath {
  from: string;
  to: string;
}
interface MatPath {
  from: string;
  to: string;
  kind: 'trolley' | 'conveyor';
}

interface DeptLayout {
  workstations: Workstation[];
  machines: MachineInstance[];
  operators: Operator[];
  buffers: Buffer[];
  walkPaths: WalkPath[];
  matPaths: MatPath[];
  subops: Subop[];
}

interface WsLiveState {
  ratePerHr: number;
  util: number;
  wip: number;
  status: 'hot' | 'starved' | 'busy' | 'ok';
  cycle: number;
  defectPct: number;
}

interface DeptStats {
  throughput: number;
  totalWip: number;
  avgUtil: number;
  bottleneck: Workstation | undefined;
}

type ViewMode = 'plan' | 'flow' | 'people' | 'numbers';
type ToolMode = 'select' | 'add_ws' | 'add_machine' | 'path' | 'erase';

// ============================================================================
// Default interior layouts — 5 hero depts
// ============================================================================
function makeDefaultDeptLayout(deptId: string): DeptLayout | null {
  const dept = DEPT_LAYOUT[deptId as keyof typeof DEPT_LAYOUT];
  if (!dept || !dept.hero || !dept.grid) return null;

  // depts.ts splits sew_a/sew_b explicitly and source uses both keys
  const SUBOPS: Record<string, Subop[]> = {
    spread: [
      { id:'lay_fabric',   label:'Lay fabric',         skill:2, mach:'spread_table' },
      { id:'align_edges',  label:'Align edges',        skill:3, mach:'spread_table' },
      { id:'mark_plies',   label:'Mark plies',         skill:3, mach:'spread_table' },
      { id:'auto_spread',  label:'Auto spread run',    skill:2, mach:'auto_spreader' },
    ],
    cut: [
      { id:'place_marker', label:'Place marker',       skill:2, mach:'cut_table' },
      { id:'rough_cut',    label:'Rough cut',          skill:3, mach:'straight_knife' },
      { id:'finish_cut',   label:'Finish cut',         skill:4, mach:'band_knife' },
      { id:'cnc_run',      label:'CNC cut run',        skill:3, mach:'cnc_cutter' },
      { id:'bundle',       label:'Bundle pieces',      skill:1, mach:'cut_table' },
    ],
    sew_a: [
      { id:'serge_panels', label:'Serge front/back',   skill:3, mach:'overlock' },
      { id:'shoulder',     label:'Join shoulder',      skill:3, mach:'ssm' },
      { id:'attach_collar',label:'Attach collar',      skill:4, mach:'ssm' },
      { id:'set_sleeve',   label:'Set sleeve',         skill:5, mach:'ssm' },
      { id:'side_seam',    label:'Side seam',          skill:3, mach:'overlock' },
      { id:'hem_bottom',   label:'Hem bottom',         skill:3, mach:'flatlock' },
      { id:'attach_pocket',label:'Attach pocket',      skill:4, mach:'ssm' },
      { id:'buttonhole_op',label:'Buttonhole',         skill:4, mach:'buttonhole' },
      { id:'attach_button',label:'Attach button',      skill:2, mach:'buttonsew' },
      { id:'bartack_op',   label:'Bartack stress pts', skill:3, mach:'bartack' },
    ],
    sew_b: [
      { id:'serge_panels', label:'Serge front/back',   skill:3, mach:'overlock' },
      { id:'shoulder',     label:'Join shoulder',      skill:3, mach:'ssm' },
      { id:'attach_collar',label:'Attach collar',      skill:4, mach:'ssm' },
      { id:'set_sleeve',   label:'Set sleeve',         skill:5, mach:'ssm' },
      { id:'side_seam',    label:'Side seam',          skill:3, mach:'overlock' },
      { id:'hem_bottom',   label:'Hem bottom',         skill:3, mach:'flatlock' },
      { id:'attach_pocket',label:'Attach pocket',      skill:4, mach:'ssm' },
      { id:'buttonhole_op',label:'Buttonhole',         skill:4, mach:'buttonhole' },
      { id:'attach_button',label:'Attach button',      skill:2, mach:'buttonsew' },
    ],
    qc: [
      { id:'visual_inspect',label:'Visual inspect',    skill:3, mach:'qc_table' },
      { id:'measure_check', label:'Measure check',     skill:4, mach:'qc_table' },
      { id:'metal_scan',    label:'Metal scan',        skill:1, mach:'metal_detect' },
      { id:'tag_pack',      label:'Tag & flag',        skill:2, mach:'qc_table' },
    ],
  };
  const subops = SUBOPS[deptId] || [];
  const G = dept.grid;

  if (deptId === 'spread') {
    return {
      workstations: [
        { id:'WS-01', x:3,  y:2, label:'Manual Spread 1', subopId:'lay_fabric',  machineId:'M-01', operatorId:'OP-01' },
        { id:'WS-02', x:3,  y:5, label:'Manual Spread 2', subopId:'align_edges', machineId:'M-02', operatorId:'OP-02' },
        { id:'WS-03', x:8,  y:3, label:'Marker Cell',     subopId:'mark_plies',  machineId:'M-03', operatorId:'OP-03' },
        { id:'WS-04', x:13, y:4, label:'Auto Spreader',   subopId:'auto_spread', machineId:'M-04', operatorId:'OP-04' },
      ],
      machines: [
        { id:'M-01', type:'spread_table',  x:3,  y:2 },
        { id:'M-02', type:'spread_table',  x:3,  y:5 },
        { id:'M-03', type:'spread_table',  x:8,  y:3 },
        { id:'M-04', type:'auto_spreader', x:13, y:4 },
      ],
      operators: [
        { id:'OP-01', name:'Asha',   skill:3 },
        { id:'OP-02', name:'Ravi',   skill:4 },
        { id:'OP-03', name:'Lina',   skill:4 },
        { id:'OP-04', name:'Tomás',  skill:3 },
      ],
      buffers: [{ side:'in', x:0, y:4, cap:30 }, { side:'out', x:G.w-1, y:4, cap:30 }],
      walkPaths: [
        { from:'IN', to:'WS-01' }, { from:'WS-01', to:'WS-02' },
        { from:'WS-02', to:'WS-03' }, { from:'WS-03', to:'WS-04' }, { from:'WS-04', to:'OUT' },
      ],
      matPaths: [{ from:'IN', to:'WS-04', kind:'trolley' }],
      subops,
    };
  }

  if (deptId === 'cut') {
    return {
      workstations: [
        { id:'WS-01', x:2,  y:2, label:'Marker Place',  subopId:'place_marker', machineId:'M-01', operatorId:'OP-01' },
        { id:'WS-02', x:6,  y:2, label:'Rough Cut',     subopId:'rough_cut',    machineId:'M-02', operatorId:'OP-02' },
        { id:'WS-03', x:6,  y:5, label:'Finish Cut',    subopId:'finish_cut',   machineId:'M-03', operatorId:'OP-03' },
        { id:'WS-04', x:11, y:3, label:'CNC Cell',      subopId:'cnc_run',      machineId:'M-04', operatorId:'OP-04' },
        { id:'WS-05', x:14, y:6, label:'Bundle Pack',   subopId:'bundle',       machineId:'M-05', operatorId:'OP-05' },
      ],
      machines: [
        { id:'M-01', type:'cut_table',      x:2,  y:2 },
        { id:'M-02', type:'straight_knife', x:6,  y:2 },
        { id:'M-03', type:'band_knife',     x:6,  y:5 },
        { id:'M-04', type:'cnc_cutter',     x:11, y:3 },
        { id:'M-05', type:'cut_table',      x:14, y:6 },
      ],
      operators: [
        { id:'OP-01', name:'Mei',    skill:3 },
        { id:'OP-02', name:'Diego',  skill:4 },
        { id:'OP-03', name:'Sara',   skill:5 },
        { id:'OP-04', name:'Kojo',   skill:4 },
        { id:'OP-05', name:'Priya',  skill:2 },
      ],
      buffers: [{ side:'in', x:0, y:4, cap:24 }, { side:'out', x:G.w-1, y:6, cap:24 }],
      walkPaths: [
        { from:'IN', to:'WS-01' }, { from:'WS-01', to:'WS-02' },
        { from:'WS-02', to:'WS-03' }, { from:'WS-03', to:'WS-05' },
        { from:'WS-04', to:'WS-05' }, { from:'WS-05', to:'OUT' },
      ],
      matPaths: [{ from:'IN', to:'WS-04', kind:'conveyor' }],
      subops,
    };
  }

  if (deptId === 'sew_a' || deptId === 'sew_b') {
    // 2 parallel rows of sewing operations
    const subopOrder = SUBOPS.sew_a;
    const rowY = [3, 8];
    const ws: Workstation[] = [];
    const machines: MachineInstance[] = [];
    const operators: Operator[] = [];
    const names = ['Aiko','Ben','Carmen','Devon','Eli','Fatima','Gabe','Hana','Idris','Jin'];
    subopOrder.slice(0, 8).forEach((sub, i) => {
      const r = i % 2;
      const col = Math.floor(i / 2);
      const x = 2 + col * 5;
      const y = rowY[r];
      ws.push({
        id:'WS-'+String(i+1).padStart(2,'0'),
        x, y,
        label: sub.label,
        subopId: sub.id,
        machineId:'M-'+String(i+1).padStart(2,'0'),
        operatorId:'OP-'+String(i+1).padStart(2,'0'),
      });
      machines.push({ id:'M-'+String(i+1).padStart(2,'0'), type: sub.mach, x, y });
      operators.push({ id:'OP-'+String(i+1).padStart(2,'0'), name: names[i] || ('Op '+(i+1)), skill: 2 + (i % 4) });
    });
    return {
      workstations: ws, machines, operators,
      buffers: [{ side:'in', x:0, y:5, cap:36 }, { side:'out', x:G.w-1, y:5, cap:36 }],
      walkPaths: ws.map((w,i)=>({ from: i===0?'IN':ws[i-1].id, to: w.id })).concat([{ from: ws[ws.length-1].id, to:'OUT' }]),
      matPaths: [{ from:'IN', to:'OUT', kind:'trolley' }],
      subops: subopOrder,
    };
  }

  if (deptId === 'qc') {
    return {
      workstations: [
        { id:'WS-01', x:2,  y:2, label:'Visual Insp',  subopId:'visual_inspect', machineId:'M-01', operatorId:'OP-01' },
        { id:'WS-02', x:5,  y:2, label:'Measure Chk',  subopId:'measure_check',  machineId:'M-02', operatorId:'OP-02' },
        { id:'WS-03', x:8,  y:2, label:'Metal Scan',   subopId:'metal_scan',     machineId:'M-03', operatorId:'OP-03' },
        { id:'WS-04', x:11, y:2, label:'Tag & Flag',   subopId:'tag_pack',       machineId:'M-04', operatorId:'OP-04' },
      ],
      machines: [
        { id:'M-01', type:'qc_table',     x:2,  y:2 },
        { id:'M-02', type:'qc_table',     x:5,  y:2 },
        { id:'M-03', type:'metal_detect', x:8,  y:2 },
        { id:'M-04', type:'qc_table',     x:11, y:2 },
      ],
      operators: [
        { id:'OP-01', name:'Yui',  skill:4 },
        { id:'OP-02', name:'Sam',  skill:5 },
        { id:'OP-03', name:'Niko', skill:2 },
        { id:'OP-04', name:'Vega', skill:3 },
      ],
      buffers: [{ side:'in', x:0, y:4, cap:20 }, { side:'out', x:G.w-1, y:4, cap:20 }],
      walkPaths: [
        { from:'IN', to:'WS-01' }, { from:'WS-01', to:'WS-02' },
        { from:'WS-02', to:'WS-03' }, { from:'WS-03', to:'WS-04' }, { from:'WS-04', to:'OUT' },
      ],
      matPaths: [],
      subops: SUBOPS.qc,
    };
  }
  return null;
}

function loadDeptLayout(deptId: string): DeptLayout | null {
  try {
    const k = 'sw_dept_'+deptId;
    const raw = localStorage.getItem(k);
    if (raw) return JSON.parse(raw) as DeptLayout;
  } catch { /* ignore */ }
  return makeDefaultDeptLayout(deptId);
}

function saveDeptLayout(deptId: string, layout: DeptLayout): void {
  try { localStorage.setItem('sw_dept_'+deptId, JSON.stringify(layout)); } catch { /* ignore */ }
}

// ============================================================================
// Standard route map (matches conventions used elsewhere in the app).
// ============================================================================
function routeFor(id: string): string {
  if (id === 'menu') return '/';
  if (id === 'twin') return '/twin';
  if (id === 'floor') return '/floor';
  if (id === 'sim') return '/sim';
  if (id.startsWith('dept:')) return '/dept/' + id.slice(5);
  return '/';
}

// ============================================================================
// MAIN: DeptInteriorPage
// ============================================================================
export function DeptInteriorPage() {
  const params = useParams();
  const navigate = useNavigate();
  const deptId = params.deptId || '';
  const setRoute = (id: string) => navigate(routeFor(id));
  const openWorkstation = (d: string, ws: string) =>
    navigate(`/workstation/${d}/${ws}`);

  const dept = DEPT_LAYOUT[deptId as keyof typeof DEPT_LAYOUT] as Dept | undefined;
  const heroDept = dept && dept.hero;

  const [layout, setLayout] = useState<DeptLayout | null>(() => loadDeptLayout(deptId));
  useEffect(() => { setLayout(loadDeptLayout(deptId)); }, [deptId]);
  useEffect(() => { if (layout) saveDeptLayout(deptId, layout); }, [deptId, layout]);

  const [view, setView] = useState<ViewMode>('plan');
  const [tool, setTool] = useState<ToolMode>('select');
  const [selectedWs, setSelectedWs] = useState<string | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x:0, y:0 });
  const [zoom, setZoom] = useState<number>(1);
  const [rot, setRot] = useState<number>(0); // 0 | -12 | -22 (iso tilt)
  const [showSubopPanel, setShowSubopPanel] = useState<boolean>(false);
  const [showSkillPanel, setShowSkillPanel] = useState<boolean>(false);
  const [t, setT] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(true);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(()=>setT(x=>x+1), 200);
    return () => clearInterval(id);
  }, [playing]);

  // Live state — must be computed even when stub-rendering is selected.
  const wsState = useMemo<Record<string, WsLiveState>>(() => {
    const out: Record<string, WsLiveState> = {};
    if (!layout) return out;
    layout.workstations.forEach(w => {
      const sub = layout.subops.find(s => s.id === w.subopId);
      const machInst = layout.machines.find(m=>m.id===w.machineId);
      const mach = machInst ? DEPT_MACHINE_CATALOG[machInst.type] : undefined;
      const op = layout.operators.find(o => o.id === w.operatorId);
      const cycleAvg = mach ? (mach.cycleS[0] + mach.cycleS[1]) / 2 : 30;
      const skillBoost = op
        ? Math.max(0.85, 1.05 - (sub ? Math.abs(sub.skill - op.skill) * 0.07 : 0))
        : 1;
      const effCycle = cycleAvg / skillBoost;
      const ratePerHr = 3600 / effCycle;
      const wave = Math.sin((t + (w.x + w.y) * 4) / 18) * 6;
      const util = Math.max(15, Math.min(98, 70 + wave + (op?.skill || 3) * 2 - (sub?.skill || 3) * 3));
      const wip = Math.max(0, Math.floor(8 + Math.sin(t/9 + w.x) * 6 + (util > 88 ? 6 : 0)));
      const status: WsLiveState['status'] =
        util > 92 ? 'hot' : util < 35 ? 'starved' : util > 75 ? 'busy' : 'ok';
      out[w.id] = {
        ratePerHr: Math.round(ratePerHr * 10) / 10,
        util: Math.round(util),
        wip,
        status,
        cycle: Math.round(effCycle),
        defectPct: mach?.defectPct || 0,
      };
    });
    return out;
  }, [layout, t]);

  const deptStats = useMemo<DeptStats>(() => {
    if (!layout) return { throughput: 0, totalWip: 0, avgUtil: 0, bottleneck: undefined };
    const rates = layout.workstations.map(w => wsState[w.id]?.ratePerHr || 0).filter(r => r > 0);
    const throughput = rates.length ? Math.min(...rates) : 0;
    const totalWip = layout.workstations.reduce((s,w) => s + (wsState[w.id]?.wip || 0), 0);
    const avgUtil = layout.workstations.length
      ? Math.round(layout.workstations.reduce((s,w) => s + (wsState[w.id]?.util || 0), 0) / layout.workstations.length)
      : 0;
    const bottleneck = layout.workstations.reduce<Workstation | undefined>(
      (bn, w) => (wsState[w.id]?.ratePerHr || 999) < (wsState[bn?.id || '']?.ratePerHr || 999) ? w : bn,
      layout.workstations[0]
    );
    return { throughput: Math.round(throughput), totalWip, avgUtil, bottleneck };
  }, [layout, wsState]);

  // Stub for non-hero
  if (!heroDept) {
    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column', background: SW_COLORS.paperDeep }}>
        <DeptBreadcrumb deptId={deptId} setRoute={setRoute}/>
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap: 16 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 32, fontWeight: 900, letterSpacing:'-0.02em' }}>{dept?.label || 'DEPARTMENT'}</div>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 12, color: SW_COLORS.muted, letterSpacing: '1px' }}>INTERIOR MODEL — COMING SOON</div>
          <div style={{ fontSize: 13, color: SW_COLORS.steel, maxWidth: 420, textAlign:'center', lineHeight: 1.5 }}>
            This department exists on the floor but its detailed interior layout hasn't been built yet. Hero departments: Spreading, Cutting, Sewing A, Sewing B, QC.
          </div>
          <button onClick={()=>setRoute('floor')} style={{
            background: SW_COLORS.paper, color: SW_COLORS.ink,
            border: `1px solid ${SW_COLORS.line}`, padding:'9px 14px', borderRadius: SW_RADIUS.sm,
            cursor:'pointer', fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 600,
          }}>← Back to Live Floor</button>
        </div>
      </div>
    );
  }

  if (!layout || !dept) return null;

  // Mutators
  const mutate = (fn: (next: DeptLayout) => DeptLayout) =>
    setLayout(L => (L ? fn(JSON.parse(JSON.stringify(L)) as DeptLayout) : L));
  function moveWs(wsId: string, x: number, y: number) {
    mutate(L => {
      const w = L.workstations.find(w=>w.id===wsId); if (w) { w.x = x; w.y = y; }
      const m = L.machines.find(m=>m.id===w?.machineId); if (m) { m.x = x; m.y = y; }
      return L;
    });
  }
  function deleteWs(wsId: string) {
    mutate(L => {
      const ws = L.workstations.find(w=>w.id===wsId);
      if (!ws) return L;
      L.workstations = L.workstations.filter(w=>w.id!==wsId);
      L.machines = L.machines.filter(m=>m.id!==ws.machineId);
      L.walkPaths = L.walkPaths.filter(p=>p.from!==wsId && p.to!==wsId);
      return L;
    });
    setSelectedWs(null);
  }
  function addWs(x: number, y: number) {
    if (!layout) return;
    mutate(L => {
      const idx = L.workstations.length + 1;
      const newId = 'WS-'+String(idx).padStart(2,'0');
      const machId = 'M-'+String(idx).padStart(2,'0');
      const opId = 'OP-'+String(idx).padStart(2,'0');
      const sub = layout.subops[0];
      L.workstations.push({ id:newId, x, y, label:'New WS', subopId: sub?.id || '', machineId: machId, operatorId: opId });
      L.machines.push({ id: machId, type: (sub?.mach || 'ssm') as DeptMachineId, x, y });
      L.operators.push({ id: opId, name: 'Op '+idx, skill: 3 });
      return L;
    });
    setTool('select');
  }
  function reassignOperator(wsId: string, opId: string) {
    mutate(L => { const w = L.workstations.find(w=>w.id===wsId); if (w) w.operatorId = opId; return L; });
  }
  function setStationSubop(wsId: string, subopId: string) {
    mutate(L => {
      const w = L.workstations.find(w=>w.id===wsId);
      if (w) {
        w.subopId = subopId;
        const sub = L.subops.find(s=>s.id===subopId);
        const m = L.machines.find(m=>m.id===w.machineId);
        if (m && sub) m.type = sub.mach;
      }
      return L;
    });
  }
  function setStationMachine(wsId: string, machType: string) {
    mutate(L => {
      const w = L.workstations.find(w=>w.id===wsId);
      if (w) {
        const m = L.machines.find(m=>m.id===w.machineId);
        if (m) m.type = machType as DeptMachineId;
      }
      return L;
    });
  }
  function reorderSubop(fromIdx: number, toIdx: number) {
    mutate(L => { const [it] = L.subops.splice(fromIdx,1); L.subops.splice(toIdx, 0, it); return L; });
  }
  function resetLayout() {
    if (!confirm('Reset interior to default? This will lose your edits to '+(dept?.label || '')+'.')) return;
    const def = makeDefaultDeptLayout(deptId);
    if (def) setLayout(def);
  }

  return (
    <div style={{ height:'100%', display:'grid',
      gridTemplateColumns:'1fr 320px',
      gridTemplateRows:'auto 1fr auto',
      background: SW_COLORS.paperDeep,
      fontFamily: SW_FONTS.body,
    }}>
      {/* Breadcrumb */}
      <div style={{ gridColumn:'1 / 3', gridRow:'1' }}>
        <DeptBreadcrumb deptId={deptId} setRoute={setRoute}/>
      </div>

      {/* Stage */}
      <div style={{ gridColumn:'1', gridRow:'2', position:'relative', overflow:'hidden', background: SW_COLORS.paper }}>
        {/* Top stage bar — view tabs + camera + tools */}
        <div style={{
          position:'absolute', top:10, left:14, right:14, zIndex: 5,
          display:'flex', alignItems:'center', gap:10,
        }}>
          {/* View tabs */}
          <div style={{ display:'flex', gap: 4, background: SW_COLORS.paperDeep, padding: 3, borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}` }}>
            {([['plan','PLAN'],['flow','FLOW'],['people','PEOPLE'],['numbers','NUMBERS']] as const).map(([id, lbl]) => {
              const a = view === id;
              return (
                <button key={id} onClick={()=>setView(id)} style={{
                  background: a ? SW_COLORS.ink : 'transparent',
                  color: a ? SW_COLORS.paper : SW_COLORS.steel,
                  border:'none', cursor:'pointer',
                  fontFamily: SW_FONTS.display, fontSize:11, fontWeight:900, letterSpacing:'0.06em',
                  padding:'6px 12px', borderRadius: SW_RADIUS.sm,
                }}>{lbl}</button>
              );
            })}
          </div>

          <div style={{ flex:1 }}/>

          {/* Tool palette (only relevant in PLAN) */}
          {view === 'plan' && (
            <div style={{ display:'flex', gap: 4, background: SW_COLORS.paperDeep, padding: 3, borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}` }}>
              {([
                { id:'select',     icon:'⌖', label:'Select' },
                { id:'add_ws',     icon:'+',  label:'Add WS' },
                { id:'erase',      icon:'⌫', label:'Erase' },
              ] as const).map(tt => {
                const a = tool === tt.id;
                return (
                  <button key={tt.id} title={tt.label} onClick={()=>setTool(tt.id as ToolMode)} style={{
                    background: a ? SW_COLORS.brand : 'transparent',
                    color: a ? '#fff' : SW_COLORS.steel,
                    border:'none', cursor:'pointer', width: 32, height: 26,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900,
                    borderRadius: SW_RADIUS.sm,
                  }}>{tt.icon}</button>
                );
              })}
            </div>
          )}

          {/* Camera controls */}
          <div style={{ display:'flex', gap: 4, background: SW_COLORS.paperDeep, padding: 3, borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}` }}>
            <CamBtn label="−" onClick={()=>setZoom(z => Math.max(0.4, z - 0.15))}/>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, padding:'6px 8px', minWidth: 36, textAlign:'center' }}>{Math.round(zoom*100)}%</div>
            <CamBtn label="+" onClick={()=>setZoom(z => Math.min(2.5, z + 0.15))}/>
            <div style={{ width:1, background: SW_COLORS.line, margin:'0 2px' }}/>
            <CamBtn label="↺" title="Tilt" onClick={()=>setRot(r => r === 0 ? -12 : r === -12 ? -22 : 0)}/>
            <CamBtn label="⌂" title="Reset view" onClick={()=>{ setPan({x:0,y:0}); setZoom(1); setRot(0); }}/>
          </div>
        </div>

        {/* Bottom toolbar */}
        <div style={{
          position:'absolute', bottom:10, left:14, right:14, zIndex: 5,
          display:'flex', alignItems:'center', gap:10,
        }}>
          <div style={{ display:'flex', gap: 4, background: SW_COLORS.ink, color:'#fff', padding: 3, borderRadius: SW_RADIUS.sm }}>
            <CamBtn label={playing ? '⏸' : '▶'} dark onClick={()=>setPlaying(p=>!p)}/>
            <CamBtn label="⏮" dark onClick={()=>setT(0)}/>
          </div>
          <button onClick={()=>setShowSubopPanel(true)} style={panelBtnStyle}>SUB-OPS</button>
          <button onClick={()=>setShowSkillPanel(true)} style={panelBtnStyle}>SKILL MATRIX</button>
          <div style={{ flex:1 }}/>
          <button onClick={resetLayout} style={{ ...panelBtnStyle, color: SW_COLORS.alarm }}>↺ RESET</button>
        </div>

        {/* Canvas */}
        <DeptCanvas
          dept={dept} layout={layout} wsState={wsState} view={view}
          tool={tool} pan={pan} setPan={setPan} zoom={zoom} rot={rot}
          selectedWs={selectedWs} setSelectedWs={setSelectedWs}
          onMoveWs={moveWs} onAddWs={addWs} onDeleteWs={deleteWs}
          onOpenWs={openWorkstation} t={t}
        />

        {/* Floor minimap */}
        <FloorMinimap currentDeptId={deptId} setRoute={setRoute}/>
      </div>

      {/* Right inspector */}
      <div style={{ gridColumn:'2', gridRow:'2', borderLeft: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, overflow:'auto' }}>
        <DeptInspector
          dept={dept} layout={layout} wsState={wsState} deptStats={deptStats}
          selectedWs={selectedWs}
          onReassignOp={reassignOperator}
          onSetSubop={setStationSubop}
          onSetMachine={setStationMachine}
          onOpenWs={openWorkstation}
        />
      </div>

      {/* Bottom strip — sub-ops sequence summary */}
      <div style={{ gridColumn:'1 / 3', gridRow:'3', borderTop: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper }}>
        <SubopsRibbon layout={layout} wsState={wsState} setSelectedWs={setSelectedWs}/>
      </div>

      {/* Modals */}
      {showSubopPanel && <SubopsModal layout={layout} onClose={()=>setShowSubopPanel(false)} onReorder={reorderSubop}/>}
      {showSkillPanel && <SkillMatrixModal layout={layout} onClose={()=>setShowSkillPanel(false)}/>}

      <style>{`
        @keyframes sw-walk { 0% { offset-distance: 0%; } 100% { offset-distance: 100%; } }
        @keyframes sw-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes sw-march-dash { to { stroke-dashoffset: -20; } }
      `}</style>
    </div>
  );
}

// ============================================================================
// Breadcrumb
// ============================================================================
interface BreadcrumbProps {
  deptId: string;
  setRoute: (id: string) => void;
  wsId?: string;
}
function DeptBreadcrumb({ deptId, setRoute, wsId }: BreadcrumbProps) {
  const dept = DEPT_LAYOUT[deptId as keyof typeof DEPT_LAYOUT];
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'10px 18px',
      background: SW_COLORS.paper,
      borderBottom: `1px solid ${SW_COLORS.line}`,
      fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, letterSpacing:'0.5px',
    }}>
      <span onClick={()=>setRoute('menu')} style={{ color: SW_COLORS.muted, cursor:'pointer' }}>STITCHWORKS</span>
      <span style={{ color: SW_COLORS.line }}>▸</span>
      <span onClick={()=>setRoute('floor')} style={{ color: SW_COLORS.muted, cursor:'pointer' }}>FLOOR</span>
      <span style={{ color: SW_COLORS.line }}>▸</span>
      <span style={{ color: SW_COLORS.ink, fontFamily: SW_FONTS.display, fontWeight: 900, letterSpacing:'0.04em' }}>{dept?.label || deptId.toUpperCase()}</span>
      {wsId && (<>
        <span style={{ color: SW_COLORS.line }}>▸</span>
        <span style={{ color: SW_COLORS.brand, fontFamily: SW_FONTS.display, fontWeight: 900 }}>{wsId}</span>
      </>)}
      <div style={{ flex:1 }}/>
      <button onClick={()=>setRoute('floor')} style={{
        background:'transparent', color: SW_COLORS.steel,
        border: `1px solid ${SW_COLORS.line}`, padding:'5px 10px', borderRadius: SW_RADIUS.sm,
        fontFamily: SW_FONTS.display, fontSize:10, fontWeight:900, letterSpacing:'0.06em', cursor:'pointer',
      }}>← FLOOR</button>
    </div>
  );
}

// Re-export for the workstation detail page (it needs the breadcrumb).
export { DeptBreadcrumb };

// ============================================================================
// Floor minimap (always visible bottom-right)
// ============================================================================
interface FloorMinimapProps {
  currentDeptId: string;
  setRoute: (id: string) => void;
}
function FloorMinimap({ currentDeptId, setRoute }: FloorMinimapProps) {
  const zones = [
    { id:'fabric', x:0,  y:1,  w:5,  h:4 },
    { id:'spread', x:0,  y:6,  w:5,  h:4 },
    { id:'cut',    x:0,  y:11, w:5,  h:4 },
    { id:'bundle', x:6,  y:1,  w:4,  h:5 },
    { id:'sew_a',  x:11, y:1,  w:14, h:4 },
    { id:'sew_b',  x:11, y:6,  w:14, h:4 },
    { id:'qc',     x:11, y:11, w:5,  h:4 },
    { id:'press',  x:17, y:11, w:4,  h:4 },
    { id:'pack',   x:22, y:11, w:4,  h:4 },
    { id:'dispatch', x:26, y:1, w:4, h:14 },
  ];
  return (
    <div style={{
      position:'absolute', bottom:60, right: 14, zIndex: 5,
      background: SW_COLORS.paper, border: `1px solid ${SW_COLORS.line}`,
      borderRadius: SW_RADIUS.sm, padding: 8, width: 240,
    }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight:700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 4 }}>FLOOR MAP</div>
      <svg viewBox="0 0 30 16" style={{ width:'100%', height: 110, display:'block' }}>
        <rect x="0" y="0" width="30" height="16" fill={SW_COLORS.paperDeep}/>
        {zones.map(z => {
          const sel = z.id === currentDeptId;
          const dept = DEPT_LAYOUT[z.id as keyof typeof DEPT_LAYOUT];
          return (
            <g key={z.id} onClick={()=>{
              if (dept?.hero) setRoute('dept:'+z.id);
              else setRoute('floor');
            }} style={{ cursor:'pointer' }}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h}
                fill={sel ? SW_COLORS.brand : (dept?.hero ? '#fff' : SW_COLORS.paperEdge)}
                stroke={sel ? SW_COLORS.ink : SW_COLORS.line} strokeWidth="0.15"/>
              {sel && <rect x={z.x} y={z.y} width={z.w} height={z.h} fill="none" stroke={SW_COLORS.ink} strokeWidth="0.4"/>}
            </g>
          );
        })}
      </svg>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color: SW_COLORS.muted, marginTop: 4 }}>Click any dept to jump</div>
    </div>
  );
}

// ============================================================================
// DeptCanvas — the main pan/zoom/rotate stage
// ============================================================================
interface DeptCanvasProps {
  dept: Dept;
  layout: DeptLayout;
  wsState: Record<string, WsLiveState>;
  view: ViewMode;
  tool: ToolMode;
  pan: { x: number; y: number };
  setPan: (p: { x: number; y: number }) => void;
  zoom: number;
  rot: number;
  selectedWs: string | null;
  setSelectedWs: (id: string | null) => void;
  onMoveWs: (wsId: string, x: number, y: number) => void;
  onAddWs: (x: number, y: number) => void;
  onDeleteWs: (wsId: string) => void;
  onOpenWs?: (deptId: string, wsId: string) => void;
  t: number;
}
function DeptCanvas({
  dept, layout, wsState, view, tool, pan, setPan, zoom, rot,
  selectedWs, setSelectedWs, onMoveWs, onAddWs, onDeleteWs, onOpenWs, t,
}: DeptCanvasProps) {
  const G = dept.grid!;
  const CELL = 48;
  const W = G.w * CELL, H = G.h * CELL;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ wsId: string; dx: number; dy: number } | null>(null);

  // Pan with space-drag or middle-click; click-drag on empty
  const onStageMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'svg' && target.tagName !== 'rect') return;
    if (tool === 'add_ws' && target.tagName === 'rect' && target.getAttribute('data-cell')) {
      const cell = (target.getAttribute('data-cell') || '').split(',').map(Number);
      onAddWs(cell[0], cell[1]);
      return;
    }
    if (tool === 'select') {
      const sx = e.clientX, sy = e.clientY;
      const p0 = { ...pan };
      const move = (ev: MouseEvent) => setPan({ x: p0.x + (ev.clientX - sx), y: p0.y + (ev.clientY - sy) });
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
  };

  const onWsMouseDown = (e: ReactMouseEvent<SVGGElement>, ws: Workstation) => {
    e.stopPropagation();
    setSelectedWs(ws.id);
    if (tool === 'erase') { onDeleteWs(ws.id); return; }
    if (tool !== 'select') return;
    const sx = e.clientX, sy = e.clientY;
    const x0 = ws.x, y0 = ws.y;
    let dx = 0, dy = 0;
    const move = (ev: MouseEvent) => {
      dx = (ev.clientX - sx) / (CELL * zoom);
      dy = (ev.clientY - sy) / (CELL * zoom);
      dragRef.current = { wsId: ws.id, dx, dy };
      onMoveWs(ws.id, Math.max(0, Math.min(G.w - 1, Math.round(x0 + dx))), Math.max(0, Math.min(G.h - 1, Math.round(y0 + dy))));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Compute walk path animation
  const walkers = useMemo(() => {
    if (view !== 'people' && view !== 'flow') return [];
    return layout.walkPaths.map((p, i) => {
      const phase = ((t * 8 + i * 60) / 600) % 1;
      const fromXY = p.from === 'IN' ? { x: 0, y: G.h/2 } : (p.from === 'OUT' ? { x: G.w-1, y: G.h/2 } : findWs(layout, p.from));
      const toXY = p.to === 'IN' ? { x: 0, y: G.h/2 } : (p.to === 'OUT' ? { x: G.w-1, y: G.h/2 } : findWs(layout, p.to));
      if (!fromXY || !toXY) return null;
      return { x: (fromXY.x + (toXY.x - fromXY.x) * phase + 0.5) * CELL, y: (fromXY.y + (toXY.y - fromXY.y) * phase + 0.5) * CELL };
    }).filter(Boolean) as Array<{ x: number; y: number }>;
  }, [layout, view, t, G]);

  return (
    <div ref={stageRef} style={{
      position:'absolute', inset: 0,
      background: `repeating-linear-gradient(0deg, transparent 0 47px, ${SW_COLORS.line} 47px 48px), repeating-linear-gradient(90deg, transparent 0 47px, ${SW_COLORS.line} 47px 48px), ${SW_COLORS.paper}`,
      cursor: tool === 'add_ws' ? 'crosshair' : (tool === 'erase' ? 'not-allowed' : 'grab'),
      overflow:'hidden',
    }} onMouseDown={onStageMouseDown}>
      <div style={{
        transform: `translate(calc(50% + ${pan.x}px), calc(50% + ${pan.y}px)) scale(${zoom}) rotateX(${rot}deg)`,
        transformOrigin:'center center',
        transformStyle:'preserve-3d',
        transition: 'transform 280ms cubic-bezier(.3,.7,.4,1)',
        width: W, height: H, marginLeft: -W/2, marginTop: -H/2,
        position:'absolute', top:'50%', left:'50%',
      }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
          {/* Floor base with department tint */}
          <rect x="0" y="0" width={W} height={H} fill={view==='numbers' ? SW_COLORS.ink : '#fff'} stroke={dept.stroke} strokeWidth="2"/>
          {/* Add-WS cell hover targets */}
          {tool === 'add_ws' && (
            <g>
              {Array.from({length:G.w*G.h}).map((_,i)=>{
                const x = i % G.w, y = Math.floor(i / G.w);
                return <rect key={i} data-cell={x+','+y} x={x*CELL} y={y*CELL} width={CELL} height={CELL} fill="transparent"/>;
              })}
            </g>
          )}

          {/* Grid lines (PLAN/FLOW) */}
          {(view === 'plan' || view === 'flow') && (
            <g opacity="0.3">
              {Array.from({length:G.w+1}).map((_,i)=><line key={'v'+i} x1={i*CELL} y1="0" x2={i*CELL} y2={H} stroke={SW_COLORS.line} strokeWidth="1"/>)}
              {Array.from({length:G.h+1}).map((_,i)=><line key={'h'+i} x1="0" y1={i*CELL} x2={W} y2={i*CELL} stroke={SW_COLORS.line} strokeWidth="1"/>)}
            </g>
          )}

          {/* Buffers */}
          {layout.buffers.map((b, i) => (
            <g key={i}>
              <rect x={b.x*CELL+4} y={b.y*CELL+4} width={CELL-8} height={CELL*2-8} fill={SW_COLORS.paperDeep} stroke={SW_COLORS.steel} strokeWidth="1.5" strokeDasharray="3 3"/>
              <text x={b.x*CELL+CELL/2} y={b.y*CELL+CELL+10} fontFamily={SW_FONTS.display} fontSize="9" fontWeight="900" fill={SW_COLORS.steel} textAnchor="middle" letterSpacing="0.05em">{b.side === 'in' ? 'INBOUND' : 'OUTBOUND'}</text>
              <text x={b.x*CELL+CELL/2} y={b.y*CELL+CELL+22} fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700" fill={SW_COLORS.muted} textAnchor="middle">cap {b.cap}</text>
            </g>
          ))}

          {/* Walk paths (FLOW + PEOPLE views) */}
          {(view === 'flow' || view === 'people') && layout.walkPaths.map((p, i) => {
            const a = p.from === 'IN' ? { x: 0, y: G.h/2 } : (p.from === 'OUT' ? { x: G.w-1, y: G.h/2 } : findWs(layout, p.from));
            const b = p.to === 'IN' ? { x: 0, y: G.h/2 } : (p.to === 'OUT' ? { x: G.w-1, y: G.h/2 } : findWs(layout, p.to));
            if (!a || !b) return null;
            return <line key={i} x1={(a.x+0.5)*CELL} y1={(a.y+0.5)*CELL} x2={(b.x+0.5)*CELL} y2={(b.y+0.5)*CELL} stroke={SW_COLORS.brand} strokeWidth="2.5" strokeDasharray="6 4" strokeLinecap="round" style={{ animation:'sw-march-dash 1.4s linear infinite' }} opacity="0.7"/>;
          })}

          {/* Material paths (FLOW view) */}
          {view === 'flow' && layout.matPaths.map((p, i) => {
            const a = p.from === 'IN' ? { x: 0, y: G.h/2 } : (p.from === 'OUT' ? { x: G.w-1, y: G.h/2 } : findWs(layout, p.from));
            const b = p.to === 'IN' ? { x: 0, y: G.h/2 } : (p.to === 'OUT' ? { x: G.w-1, y: G.h/2 } : findWs(layout, p.to));
            if (!a || !b) return null;
            return (
              <g key={i}>
                <line x1={(a.x+0.5)*CELL} y1={(a.y+0.5)*CELL+8} x2={(b.x+0.5)*CELL} y2={(b.y+0.5)*CELL+8}
                  stroke={SW_COLORS.thread} strokeWidth="6" strokeOpacity="0.4" strokeLinecap="round"/>
                <line x1={(a.x+0.5)*CELL} y1={(a.y+0.5)*CELL+8} x2={(b.x+0.5)*CELL} y2={(b.y+0.5)*CELL+8}
                  stroke={SW_COLORS.thread} strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" style={{ animation:'sw-march-dash 0.8s linear infinite reverse' }}/>
              </g>
            );
          })}

          {/* Workstations */}
          {layout.workstations.map(ws => {
            const s = wsState[ws.id];
            const sel = selectedWs === ws.id;
            const machInst = layout.machines.find(m=>m.id===ws.machineId);
            const mach = machInst ? DEPT_MACHINE_CATALOG[machInst.type] : undefined;
            const op = layout.operators.find(o=>o.id===ws.operatorId);
            const sub = layout.subops.find(su=>su.id===ws.subopId);
            const x = ws.x*CELL, y = ws.y*CELL;
            const status = s?.status;
            const stroke = view === 'numbers' ? '#fff' : (status === 'hot' ? SW_COLORS.alarm : status === 'starved' ? SW_COLORS.bobbin : status === 'busy' ? SW_COLORS.thread : SW_COLORS.ok);
            const fill = view === 'numbers' ? heatColor(s?.util||0) : (sel ? SW_COLORS.brandLite : '#fff');
            return (
              <g key={ws.id}
                onMouseDown={(e)=>onWsMouseDown(e, ws)}
                onDoubleClick={()=>onOpenWs && onOpenWs(dept.id, ws.id)}
                style={{ cursor: tool === 'erase' ? 'not-allowed' : 'grab' }}>
                {/* Station bay */}
                <rect x={x+4} y={y+4} width={CELL-8} height={CELL-8} fill={fill} stroke={stroke} strokeWidth={sel ? 3 : 1.8}/>
                {/* Machine icon */}
                <text x={x+CELL/2} y={y+18} fontFamily={SW_FONTS.display} fontSize="14" fontWeight="900" fill={view==='numbers'?'#fff':SW_COLORS.ink} textAnchor="middle">{mach?.icon || '●'}</text>
                {/* WS id */}
                <text x={x+CELL/2} y={y+30} fontFamily={SW_FONTS.mono} fontSize="8" fontWeight="700" fill={view==='numbers'?'#ffffffcc':SW_COLORS.muted} textAnchor="middle">{ws.id}</text>

                {/* Operator avatar */}
                {(view === 'plan' || view === 'people') && op && (
                  <g transform={`translate(${x+CELL-14}, ${y+CELL-14})`}>
                    <circle r="6" fill="#fff" stroke={SW_COLORS.ink} strokeWidth="1.2"/>
                    <text y="3" fontFamily={SW_FONTS.display} fontSize="7" fontWeight="900" fill={SW_COLORS.ink} textAnchor="middle">{op.name?.[0]}</text>
                    {/* Skill dots */}
                    <g transform="translate(-10, 2)">
                      {[1,2,3,4,5].map(i => <circle key={i} cx={i*2.2} cy={0} r="1" fill={i <= op.skill ? SW_COLORS.thread : SW_COLORS.line}/>)}
                    </g>
                  </g>
                )}

                {/* WIP/util badge in NUMBERS */}
                {view === 'numbers' && s && (
                  <g>
                    <text x={x+CELL/2} y={y+CELL/2+2} fontFamily={SW_FONTS.display} fontSize="14" fontWeight="900" fill="#fff" textAnchor="middle">{s.util}%</text>
                    <text x={x+CELL/2} y={y+CELL-6} fontFamily={SW_FONTS.mono} fontSize="8" fontWeight="700" fill="#ffffffaa" textAnchor="middle">{s.ratePerHr}/hr</text>
                  </g>
                )}

                {/* Sub-op label below */}
                {(view === 'plan' || view === 'flow') && sub && (
                  <text x={x+CELL/2} y={y+CELL-6} fontFamily={SW_FONTS.mono} fontSize="7" fontWeight="700" fill={SW_COLORS.steel} textAnchor="middle">{sub.label.slice(0,12)}</text>
                )}

                {/* Status pulse */}
                {status === 'hot' && (
                  <circle cx={x+CELL-7} cy={y+7} r="3" fill={SW_COLORS.alarm}>
                    <animate attributeName="r" values="3;5;3" dur="1s" repeatCount="indefinite"/>
                  </circle>
                )}
              </g>
            );
          })}

          {/* Walking workers */}
          {view === 'people' && walkers.map((p, i) => (
            <g key={i} transform={`translate(${p.x}, ${p.y})`}>
              <circle r="3" fill={SW_COLORS.brand} stroke="#fff" strokeWidth="1"/>
              <ellipse cx="0" cy="3" rx="3" ry="1" fill="#00000020"/>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function findWs(layout: DeptLayout, id: string): { x: number; y: number } | undefined {
  return layout.workstations.find(w => w.id === id);
}
function heatColor(u: number): string {
  if (u >= 92) return '#7A0010';
  if (u >= 80) return '#E74C3C';
  if (u >= 60) return '#F5A623';
  if (u >= 40) return '#1FB36B';
  if (u >= 20) return '#4F7CFF';
  return '#A0B4D0';
}

// ============================================================================
// Right inspector
// ============================================================================
interface DeptInspectorProps {
  dept: Dept;
  layout: DeptLayout;
  wsState: Record<string, WsLiveState>;
  deptStats: DeptStats;
  selectedWs: string | null;
  onReassignOp: (wsId: string, opId: string) => void;
  onSetSubop: (wsId: string, subopId: string) => void;
  onSetMachine: (wsId: string, machType: string) => void;
  onOpenWs?: (deptId: string, wsId: string) => void;
}
function DeptInspector({
  dept, layout, wsState, deptStats, selectedWs,
  onReassignOp, onSetSubop, onSetMachine, onOpenWs,
}: DeptInspectorProps) {
  const ws = layout.workstations.find(w => w.id === selectedWs);

  if (!ws) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px' }}>{dept.label}</div>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 24, fontWeight: 900, letterSpacing:'-0.02em', marginTop: 4 }}>Department overview</div>
        <div style={{ marginTop: 12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <LocalStat lbl="THROUGHPUT" val={deptStats.throughput} unit="pcs/hr"/>
          <LocalStat lbl="WIP TOTAL" val={deptStats.totalWip} unit="pcs"/>
          <LocalStat lbl="AVG UTIL" val={deptStats.avgUtil} unit="%"/>
          <LocalStat lbl="STATIONS" val={layout.workstations.length} unit=""/>
        </div>
        {deptStats.bottleneck && (
          <div style={{ marginTop: 14, padding: 10, background:'#FFF1ED', border:`2px solid ${SW_COLORS.alarm}`, borderRadius: SW_RADIUS.sm }}>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.alarm, letterSpacing:'1.5px' }}>⚠ BOTTLENECK</div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginTop: 2 }}>{deptStats.bottleneck.label} <span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, fontSize: 11 }}>({deptStats.bottleneck.id})</span></div>
          </div>
        )}
        <div style={{ marginTop: 18, fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px' }}>SELECT A STATION</div>
        <div style={{ fontSize: 12, color: SW_COLORS.steel, marginTop: 4, lineHeight: 1.4 }}>Click any workstation on the canvas to inspect. Double-click a workstation for the full detail card.</div>
      </div>
    );
  }

  const s = wsState[ws.id];
  const machInst = layout.machines.find(m=>m.id===ws.machineId);
  const mach = machInst ? DEPT_MACHINE_CATALOG[machInst.type] : undefined;
  const op = layout.operators.find(o=>o.id===ws.operatorId);
  const sub = layout.subops.find(su=>su.id===ws.subopId);

  return (
    <div style={{ padding: 16, display:'flex', flexDirection:'column', gap: 14 }}>
      <div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.brand, letterSpacing:'1.5px' }}>{ws.id}</div>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, letterSpacing:'-0.02em', marginTop: 2 }}>{ws.label}</div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, color: SW_COLORS.muted, marginTop: 2 }}>cell ({ws.x}, {ws.y})</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <LocalStat lbl="UTIL" val={s?.util||0} unit="%" tone={s && s.util > 88 ? 'alarm' : s && s.util > 60 ? 'ok' : 'bobbin'}/>
        <LocalStat lbl="RATE" val={s?.ratePerHr||0} unit="/hr"/>
        <LocalStat lbl="WIP" val={s?.wip||0} unit="pcs"/>
        <LocalStat lbl="CYCLE" val={s?.cycle||0} unit="s"/>
      </div>

      {/* Sub-op selector */}
      <div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 4 }}>SUB-OPERATION</div>
        <select value={ws.subopId} onChange={e=>onSetSubop(ws.id, e.target.value)} style={selectStyle}>
          {layout.subops.map(s=> <option key={s.id} value={s.id}>{s.label} (skill {s.skill})</option>)}
        </select>
      </div>

      {/* Machine selector */}
      <div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 4 }}>MACHINE</div>
        <select value={mach?.id || ''} onChange={e=>onSetMachine(ws.id, e.target.value)} style={selectStyle}>
          {Object.values(DEPT_MACHINE_CATALOG).map(m=> <option key={m.id} value={m.id}>{m.icon} {m.label} (${m.costHr}/hr)</option>)}
        </select>
        {mach && <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, color: SW_COLORS.steel, marginTop: 4 }}>cycle {mach.cycleS[0]}–{mach.cycleS[1]}s · defect {(mach.defectPct).toFixed(2)}% · {mach.power}kW</div>}
      </div>

      {/* Operator selector */}
      <div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 4 }}>OPERATOR</div>
        <select value={ws.operatorId} onChange={e=>onReassignOp(ws.id, e.target.value)} style={selectStyle}>
          {layout.operators.map(o=> <option key={o.id} value={o.id}>{o.name} (skill {o.skill})</option>)}
        </select>
        {op && sub && (
          <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, marginTop: 4, color: op.skill >= sub.skill ? SW_COLORS.ok : SW_COLORS.alarm }}>
            {op.skill >= sub.skill ? '✓ Skilled match' : '⚠ Under-skilled (req '+sub.skill+', has '+op.skill+')'}
          </div>
        )}
      </div>

      <button onClick={()=>onOpenWs && onOpenWs(dept.id, ws.id)} style={{
        background: SW_COLORS.ink, color:'#fff', border:'none',
        padding: '10px 14px', borderRadius: SW_RADIUS.sm, cursor:'pointer',
        fontFamily: SW_FONTS.display, fontSize: 12, fontWeight: 900, letterSpacing:'0.06em',
      }}>OPEN STATION DETAIL ▸</button>
    </div>
  );
}

const selectStyle: CSSProperties = {
  width:'100%', padding:'8px 10px',
  fontFamily: SW_FONTS.body, fontSize: 12,
  background:'#fff', border:`1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm,
};

const panelBtnStyle: CSSProperties = {
  background: SW_COLORS.paper, border:`1px solid ${SW_COLORS.line}`,
  fontFamily: SW_FONTS.display, fontSize: 11, fontWeight: 900, letterSpacing:'0.06em',
  padding:'7px 12px', borderRadius: SW_RADIUS.sm, cursor:'pointer',
};

interface CamBtnProps {
  label: string;
  onClick?: () => void;
  dark?: boolean;
  title?: string;
}
function CamBtn({ label, onClick, dark, title }: CamBtnProps) {
  return <button title={title} onClick={onClick} style={{
    background:'transparent', color: dark ? '#fff' : SW_COLORS.steel, border:'none',
    width: 26, height: 26, cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily: SW_FONTS.display, fontSize: 13, fontWeight: 900,
    borderRadius: SW_RADIUS.sm,
  }}>{label}</button>;
}

interface LocalStatProps {
  lbl: string;
  val: number | string;
  unit: string;
  tone?: 'alarm' | 'ok' | 'bobbin';
}
function LocalStat({ lbl, val, unit, tone }: LocalStatProps) {
  const c = tone === 'alarm' ? SW_COLORS.alarm : tone === 'ok' ? SW_COLORS.ok : tone === 'bobbin' ? SW_COLORS.bobbin : SW_COLORS.ink;
  return (
    <div style={{ background: SW_COLORS.paperDeep, padding: 8, borderRadius: SW_RADIUS.sm }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight:700, color: SW_COLORS.muted, letterSpacing:'1px' }}>{lbl}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:3, marginTop:2 }}>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 20, fontWeight: 900, color: c, letterSpacing:'-0.02em' }}>{val}</div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted }}>{unit}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-ops ribbon (bottom)
// ============================================================================
interface SubopsRibbonProps {
  layout: DeptLayout;
  wsState: Record<string, WsLiveState>;
  setSelectedWs: (id: string | null) => void;
}
function SubopsRibbon({ layout, wsState, setSelectedWs }: SubopsRibbonProps) {
  return (
    <div style={{ padding:'10px 16px', display:'flex', alignItems:'center', gap: 8, overflow:'auto' }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', flexShrink: 0 }}>SUB-OP SEQUENCE</div>
      {layout.subops.map((sub, i) => {
        const stations = layout.workstations.filter(w => w.subopId === sub.id);
        const avgUtil = stations.length
          ? Math.round(stations.reduce((s,w)=>s+(wsState[w.id]?.util||0),0)/stations.length)
          : 0;
        return (
          <Fragment key={sub.id}>
            <div onClick={()=>stations[0] && setSelectedWs(stations[0].id)} style={{
              display:'flex', flexDirection:'column', alignItems:'flex-start', gap: 2,
              padding: '5px 9px',
              background: stations.length ? SW_COLORS.paperDeep : '#fff',
              border:`1px solid ${stations.length ? SW_COLORS.line : '#ffe1d6'}`,
              borderRadius: SW_RADIUS.sm,
              cursor:'pointer', flexShrink: 0,
            }}>
              <div style={{ fontFamily: SW_FONTS.display, fontSize: 11, fontWeight: 900 }}>{sub.label}</div>
              <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color: SW_COLORS.muted, fontWeight: 700 }}>{stations.length} st · {avgUtil}% util · skill {sub.skill}</div>
            </div>
            {i < layout.subops.length - 1 && <span style={{ color: SW_COLORS.line, fontSize: 14 }}>→</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// Modals
// ============================================================================
interface SubopsModalProps {
  layout: DeptLayout;
  onClose: () => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
}
function SubopsModal({ layout, onClose, onReorder }: SubopsModalProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  return (
    <ModalShell title="Sub-operation sequence" onClose={onClose}>
      <div style={{ fontSize: 12, color: SW_COLORS.muted, marginBottom: 10 }}>Drag to reorder. Stations follow the sequence top-to-bottom.</div>
      {layout.subops.map((sub, i) => (
        <div key={sub.id}
          draggable onDragStart={()=>setDragIdx(i)}
          onDragOver={(e)=>e.preventDefault()}
          onDrop={()=>{ if (dragIdx != null && dragIdx !== i) onReorder(dragIdx, i); setDragIdx(null); }}
          style={{
            display:'flex', alignItems:'center', gap: 12,
            padding:'10px 12px', background: SW_COLORS.paperDeep,
            border:`1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm,
            marginBottom: 6, cursor:'grab',
          }}>
          <div style={{ fontFamily: SW_FONTS.display, fontWeight: 900, color: SW_COLORS.muted, width: 22 }}>#{i+1}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 13, fontWeight: 900 }}>{sub.label}</div>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>skill {sub.skill} · default machine: {sub.mach}</div>
          </div>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 14, color: SW_COLORS.muted }}>⋮⋮</div>
        </div>
      ))}
    </ModalShell>
  );
}

interface SkillMatrixModalProps {
  layout: DeptLayout;
  onClose: () => void;
}
function SkillMatrixModal({ layout, onClose }: SkillMatrixModalProps) {
  return (
    <ModalShell title="Skill matrix — operators × sub-operations" onClose={onClose} wide>
      <div style={{ overflow:'auto', maxHeight: '60vh' }}>
        <table style={{ borderCollapse:'collapse', width:'100%' }}>
          <thead>
            <tr>
              <th style={skMHead}>Operator</th>
              <th style={skMHead}>Skill</th>
              {layout.subops.map(s => <th key={s.id} style={{ ...skMHead, writingMode:'vertical-rl', transform:'rotate(180deg)', height: 90 }}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {layout.operators.map(op => (
              <tr key={op.id}>
                <td style={skMCell}><strong>{op.name}</strong> <span style={{ color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, fontSize:10 }}>{op.id}</span></td>
                <td style={{...skMCell, fontWeight:900}}>{op.skill}</td>
                {layout.subops.map(s => {
                  const ok = op.skill >= s.skill;
                  return <td key={s.id} style={{ ...skMCell, textAlign:'center', background: ok ? '#D7F5E5' : '#FFD7DD' }}>{ok ? '✓' : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}

const skMHead: CSSProperties = {
  fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, letterSpacing:'1px',
  color: SW_COLORS.muted, padding: '6px 8px', textAlign:'left',
  borderBottom:`2px solid ${SW_COLORS.line}`,
};
const skMCell: CSSProperties = {
  fontFamily: SW_FONTS.body, fontSize: 12, padding: '6px 8px',
  borderBottom:`1px solid ${SW_COLORS.line}`,
};

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}
function ModalShell({ title, onClose, children, wide }: ModalShellProps) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,20,25,0.5)', zIndex: 200, display:'flex', alignItems:'center', justifyContent:'center', padding: 20 }}
         onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width: wide ? 'min(900px, 95vw)' : 'min(560px, 95vw)',
        maxHeight: '85vh', overflow:'auto',
        background: SW_COLORS.paper, borderRadius: SW_RADIUS.md,
        border:`2px solid ${SW_COLORS.ink}`,
      }}>
        <div style={{ display:'flex', alignItems:'center', padding:'14px 18px', borderBottom: `1px solid ${SW_COLORS.line}` }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, letterSpacing:'-0.01em' }}>{title}</div>
          <div style={{ flex: 1 }}/>
          <button onClick={onClose} style={{ background:'transparent', border:'none', fontSize: 20, cursor:'pointer', color: SW_COLORS.muted }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}
