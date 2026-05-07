import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Button, Stat, SectionHeader, ToggleGroup, Tag } from '../components';
import { useState, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ALL_PRODUCTION_SYSTEMS,
  PRODUCTION_SYSTEMS,
  type ProductionSystem,
} from '../domain';
import { buildSimConfig, efficiencyFromSkillMatrix, Sim } from '../simulation';
import { useProject, useGarments, type Line, type Floor, type EffectiveGarments } from '../store';

type Zoom = 'factory' | 'floor' | 'line';

const SHIFT_MIN = 480;

/**
 * Factory Twin — three zoom levels backed by the project's multi-line
 * factory structure (project.factory.floors + project.factory.lines).
 *
 *   Factory zoom: every floor + every line, with a rollup KPI strip (sum
 *     of throughput, weighted mean efficiency, total operators).
 *   Floor zoom: the lines on one floor, side-by-side cards.
 *   Line zoom: one line's config + its last cached KPI snapshot. Edit
 *     garment / operator count / production system in place; press
 *     "Run line" to fast-forward a 480-min sim and cache fresh KPIs.
 *
 * Lines and floors are real CRUD: add, rename, delete from the tree.
 */
export function FactoryTwinPage() {
  const navigate = useNavigate();
  const project = useProject();
  const garments = useGarments();
  const factory = project.factory;

  const [zoom, setZoom] = useState<Zoom>('factory');
  const [selFloorId, setSelFloorId] = useState<string>(factory.floors[0]?.id ?? '');
  const [selLineId, setSelLineId] = useState<string>(factory.lines[0]?.id ?? '');

  const selFloor = factory.floors.find((f) => f.id === selFloorId);
  const selLine = factory.lines.find((l) => l.id === selLineId);

  // ── Rollup KPIs across the whole factory ──────────────────────────────
  const rollup = useMemo(() => {
    const lines = factory.lines;
    const linesWithKpis = lines.filter((l) => !!l.lastKpis);
    const totalOperators = lines.reduce((s, l) => s + l.operators, 0);
    const totalProduced = linesWithKpis.reduce((s, l) => s + (l.lastKpis?.producedPieces ?? 0), 0);
    const totalThroughput = linesWithKpis.reduce((s, l) => s + (l.lastKpis?.throughputPerHr ?? 0), 0);
    const weightedEff = (() => {
      if (linesWithKpis.length === 0) return 0;
      const w = linesWithKpis.reduce((s, l) => s + l.operators, 0);
      const num = linesWithKpis.reduce((s, l) => s + l.operators * (l.lastKpis?.efficiencyPct ?? 0), 0);
      return w > 0 ? num / w : 0;
    })();
    return {
      lines: lines.length,
      floors: factory.floors.length,
      operators: totalOperators,
      throughput: totalThroughput,
      produced: totalProduced,
      efficiency: weightedEff,
      ranLines: linesWithKpis.length,
    };
  }, [factory]);

  // ── Run a line synchronously: build config, fast-forward 480 min ──────
  function runLine(line: Line) {
    const garment = garments.byId[line.garmentTemplateId];
    if (!garment) return;
    const opEfficiency = efficiencyFromSkillMatrix(project.skillMatrix, garment.operations);
    const config = buildSimConfig({ garment, operators: line.operators, opEfficiency });
    const sim = new Sim(config);
    sim.runUntil(SHIFT_MIN);
    const snapshot = sim.snapshot();
    const bottleneck = snapshot.stations[snapshot.bottleneckOpIndex];
    const samConsumedMin = snapshot.producedPieces * garment.totalSmv;
    const efficiencyPct = (samConsumedMin / (line.operators * SHIFT_MIN)) * 100;
    const throughputPerHr = (snapshot.producedPieces / Math.max(1e-6, snapshot.time)) * 60;
    project.setLineKpis(line.id, {
      producedPieces: snapshot.producedPieces,
      throughputPerHr,
      efficiencyPct,
      meanLeadTime: snapshot.meanLeadTime,
      utilization: snapshot.utilization,
      wipBundles: snapshot.totalArrivals - snapshot.produced,
      bottleneckOpName: bottleneck?.opName ?? '—',
      bottleneckQueue: bottleneck?.queueLen ?? 0,
    });
  }

  function runAllLines() {
    factory.lines.forEach(runLine);
  }

  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateColumns: '300px 1fr 340px', background: SW_COLORS.paperDeep }}>
      {/* LEFT — tree */}
      <div style={{ borderRight: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, overflow: 'auto', padding: 16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px' }}>FACTORY TREE</div>
          <Button variant="ghost" size="sm" onClick={runAllLines} icon="▶">Run all</Button>
        </div>

        <TreeNode
          label={project.meta.name || 'STITCHWORKS DEMO'}
          sub={`${factory.floors.length} floors · ${factory.lines.length} lines`}
          expanded
          active={zoom === 'factory'}
          onClick={() => setZoom('factory')}
        >
          {factory.floors.map((f) => {
            const floorLines = factory.lines.filter((l) => l.floorId === f.id);
            return (
              <TreeNode key={f.id} indent={1}
                label={f.name}
                sub={`${floorLines.length} line${floorLines.length === 1 ? '' : 's'}`}
                expanded={selFloorId === f.id}
                onClick={() => { setZoom('floor'); setSelFloorId(f.id); }}
                active={zoom === 'floor' && selFloorId === f.id}
                actions={
                  <button
                    onClick={(e) => { e.stopPropagation(); promptAddLine(project, f.id, () => { /* refresh-via-store */ }); }}
                    style={{ background:'transparent', border:'none', color: SW_COLORS.muted, cursor:'pointer', fontSize: 14, fontWeight: 800, padding: 0 }}
                    title="Add line to this floor"
                  >+</button>
                }
              >
                {floorLines.map((l) => {
                  const garment = garments.byId[l.garmentTemplateId];
                  return (
                    <TreeNode key={l.id} indent={2}
                      label={l.name}
                      sub={`${garment?.name.replace(/\s*\(.*\)/, '') ?? l.garmentTemplateId} · ${l.operators} ops · ${PRODUCTION_SYSTEMS[l.productionSystem as ProductionSystem]?.short ?? l.productionSystem}`}
                      onClick={() => { setZoom('line'); setSelFloorId(f.id); setSelLineId(l.id); }}
                      active={zoom === 'line' && selLineId === l.id}
                      hasKpis={!!l.lastKpis}
                    />
                  );
                })}
              </TreeNode>
            );
          })}
        </TreeNode>

        <div style={{ marginTop: 24, fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 8 }}>OVERLAYS</div>
        {[
          { id:'heat', label:'Bottleneck heat',       color: SW_COLORS.alarm,  on: true  },
          { id:'wip',  label:'WIP density',           color: SW_COLORS.thread, on: true  },
          { id:'op',   label:'Operator utilization',  color: SW_COLORS.bobbin, on: false },
          { id:'qual', label:'Defect zones',          color: SW_COLORS.press,  on: false },
        ].map(ov => (
          <label key={ov.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', cursor:'pointer', fontSize:12, fontWeight:600, color: SW_COLORS.ink }}>
            <input type="checkbox" defaultChecked={ov.on} style={{ accentColor: ov.color }}/>
            <span style={{ width:8, height:8, background: ov.color, borderRadius:2 }}/>
            {ov.label}
          </label>
        ))}
      </div>

      {/* CENTER — viewport */}
      <div style={{ position:'relative', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{
          padding:'12px 18px', background: SW_COLORS.paper,
          borderBottom:`1px solid ${SW_COLORS.line}`,
          display:'flex', alignItems:'center', gap: 12,
        }}>
          <ToggleGroup value={zoom} onChange={setZoom} options={[
            { value:'factory', label:'◰ Factory' },
            { value:'floor',   label:'▦ Floor' },
            { value:'line',    label:'═ Line' },
          ]}/>
          <div style={{ fontSize:12, color: SW_COLORS.muted }}>
            {zoom === 'factory' && `Whole factory · ${rollup.lines} lines · ${rollup.operators} operators`}
            {zoom === 'floor' && (selFloor ? `${selFloor.name} — ${selFloor.description}` : '—')}
            {zoom === 'line' && (selLine ? `${selLine.name} — close-up` : '—')}
          </div>
          <div style={{ flex:1 }}/>
          <Button variant="secondary" size="sm" icon="↻">Reset view</Button>
          <Button variant="dark" size="sm" icon="▶" onClick={()=>navigate('/sim')}>Open in sim</Button>
        </div>

        <div style={{ flex:1, overflow:'auto', background: `
          linear-gradient(${SW_COLORS.paperEdge}30 1px, transparent 1px),
          linear-gradient(90deg, ${SW_COLORS.paperEdge}30 1px, transparent 1px),
          ${SW_COLORS.paperDeep}
        `, backgroundSize:'24px 24px' }}>
          {zoom === 'factory' && (
            <FactoryView factory={factory} garments={garments}
              onPickLine={(l) => { setZoom('line'); setSelLineId(l.id); setSelFloorId(l.floorId); }}
              onRunLine={runLine}/>
          )}
          {zoom === 'floor' && selFloor && (
            <FloorView floor={selFloor} garments={garments} lines={factory.lines.filter((l) => l.floorId === selFloor.id)}
              onPickLine={(l) => { setZoom('line'); setSelLineId(l.id); }}
              onRunLine={runLine}
            />
          )}
          {zoom === 'line' && selLine && (
            <LineView line={selLine} garments={garments}
              onUpdate={(patch) => project.updateLine(selLine.id, patch)}
              onRun={() => runLine(selLine)}
              onDelete={() => {
                if (confirm(`Delete ${selLine.name}? This cannot be undone.`)) {
                  project.removeLine(selLine.id);
                  setZoom('floor');
                }
              }}
            />
          )}
          {(zoom === 'floor' && !selFloor) || (zoom === 'line' && !selLine) ? (
            <div style={{ padding: 32, color: SW_COLORS.muted, fontSize: 13 }}>
              Pick a {zoom} from the tree on the left.
            </div>
          ) : null}
        </div>
      </div>

      {/* RIGHT — context inspector */}
      <div style={{ borderLeft: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, overflow:'auto', padding:16 }}>
        <SectionHeader
          kicker="Inspector"
          title={
            zoom === 'factory' ? (project.meta.name || 'STITCHWORKS DEMO')
            : zoom === 'floor' ? (selFloor?.name ?? 'Floor')
            : (selLine?.name ?? 'Line')
          }
        />

        {zoom === 'factory' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, marginBottom: 14 }}>
              <Stat label="LINES"      value={rollup.lines}                                 color={SW_COLORS.brand}/>
              <Stat label="OPERATORS"  value={rollup.operators}                              color={SW_COLORS.bobbin}/>
              <Stat label="PRODUCED"   value={rollup.produced.toLocaleString()} unit="pcs"  color={SW_COLORS.ok}/>
              <Stat label="THRU/HR"    value={Math.round(rollup.throughput)}    unit="pcs"   color={SW_COLORS.thread}/>
              <Stat label="EFF"        value={rollup.efficiency.toFixed(1)}      unit="%"     color={rollup.efficiency >= 75 ? SW_COLORS.fabric : SW_COLORS.thread}/>
              <Stat label="RAN"        value={`${rollup.ranLines}/${rollup.lines}`}                                color={SW_COLORS.muted}/>
            </div>
            <div style={{ fontSize: 12, color: SW_COLORS.muted, lineHeight: 1.5, padding: 10, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm }}>
              {rollup.ranLines === 0
                ? 'No lines have run yet. Click "Run all" in the tree to populate KPIs across the factory.'
                : `${rollup.ranLines} of ${rollup.lines} lines have cached KPIs. Throughput is summed; efficiency is operator-weighted.`}
            </div>
          </>
        )}

        {zoom === 'floor' && selFloor && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, marginBottom: 14 }}>
              <Stat label="LINES"      value={factory.lines.filter((l) => l.floorId === selFloor.id).length} color={SW_COLORS.brand}/>
              <Stat label="OPERATORS"  value={factory.lines.filter((l) => l.floorId === selFloor.id).reduce((s, l) => s + l.operators, 0)} color={SW_COLORS.bobbin}/>
            </div>
            <input
              defaultValue={selFloor.name}
              onBlur={(e) => project.renameFloor(selFloor.id, e.target.value)}
              style={{ width:'100%', padding:'8px 10px', fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, border: `1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm, marginBottom: 8 }}
            />
            <Button variant="ghost" size="sm" onClick={() => {
              if (confirm(`Delete ${selFloor.name} and all its lines?`)) {
                project.removeFloor(selFloor.id);
                setZoom('factory');
              }
            }}>Delete floor</Button>
          </>
        )}

        {zoom === 'line' && selLine && (
          <LineInspector
            line={selLine}
            garments={garments}
            onUpdate={(patch) => project.updateLine(selLine.id, patch)}
            onRun={() => runLine(selLine)}
            onOpenSim={() => {
              project.setSelectedGarment(selLine.garmentTemplateId);
              project.setDefaultOperators(selLine.operators);
              navigate('/sim');
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Tree node ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  label: string;
  sub?: string;
  indent?: number;
  expanded?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  /** Show a small green dot if cached KPIs exist on this leaf. */
  hasKpis?: boolean;
  actions?: ReactNode;
}

function TreeNode({ label, sub, indent = 0, expanded, children, onClick, active, hasKpis, actions }: TreeNodeProps) {
  return (
    <div>
      <div onClick={onClick} style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'6px 8px', borderRadius: SW_RADIUS.sm,
        marginLeft: indent * 14,
        background: active ? SW_COLORS.brandLite : 'transparent',
        cursor: 'pointer',
        borderLeft: active ? `3px solid ${SW_COLORS.brand}` : '3px solid transparent',
      }}>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color: SW_COLORS.muted }}>{children ? '▾' : '·'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SW_FONTS.body, fontWeight: 700, fontSize: 12, color: SW_COLORS.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
          {sub && <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, fontWeight: 600 }}>{sub}</div>}
        </div>
        {hasKpis && <span style={{ width: 6, height: 6, borderRadius: '50%', background: SW_COLORS.ok }} title="Cached KPIs"/>}
        {actions}
      </div>
      {expanded && children}
    </div>
  );
}

// ── Animated flow banner ────────────────────────────────────────────────────

/**
 * SVG strip showing material moving across the factory: fabric receiving →
 * cutting → sewing → finishing → dispatch. Decorative; the real per-line
 * KPIs are below it. Five colour-coded dots travel along the same path,
 * staggered, so there's always something moving.
 */
function FlowAnimation() {
  const stages = [
    { label: 'FABRIC',    color: SW_COLORS.fabric },
    { label: 'CUTTING',   color: SW_COLORS.press },
    { label: 'SEWING',    color: SW_COLORS.brand },
    { label: 'FINISHING', color: SW_COLORS.thread },
    { label: 'DISPATCH',  color: SW_COLORS.ship },
  ];
  const W = 1000;
  const H = 64;
  const padX = 40;
  const innerW = W - padX * 2;
  const stageX = (i: number) => padX + (innerW * i) / (stages.length - 1);
  const y = H / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {/* path */}
      <line x1={padX} y1={y} x2={W - padX} y2={y} stroke={SW_COLORS.line} strokeWidth={2}/>
      {/* stage markers */}
      {stages.map((s, i) => (
        <g key={s.label} transform={`translate(${stageX(i)}, ${y})`}>
          <circle r={9} fill="#fff" stroke={s.color} strokeWidth={2}/>
          <circle r={4} fill={s.color}/>
          <text x={0} y={26} textAnchor="middle" fill={SW_COLORS.muted} fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={700}>{s.label}</text>
        </g>
      ))}
      {/* travelling bundle dots */}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} r={4} fill={stages[i % stages.length].color}>
          <animateMotion
            dur={`${6 + i * 0.6}s`}
            begin={`${i * 1.0}s`}
            repeatCount="indefinite"
            path={`M ${padX} ${y} L ${W - padX} ${y}`}
          />
        </circle>
      ))}
    </svg>
  );
}

// ── Factory view (zoom = factory) ───────────────────────────────────────────

interface FactoryViewProps {
  factory: { floors: Floor[]; lines: Line[] };
  garments: EffectiveGarments;
  onPickLine: (l: Line) => void;
  onRunLine: (l: Line) => void;
}

function FactoryView({ factory, garments, onPickLine, onRunLine }: FactoryViewProps) {
  // Animated flow banner — visualises material moving across floors as a
  // continuous pipeline: cutting → sewing → finishing → dispatch.
  const flow = (
    <div style={{ marginBottom: 18, padding: '12px 16px', background: SW_COLORS.paper, border: `1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.md, overflow: 'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '1px' }}>FACTORY FLOW</div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>fabric in → garments out</div>
      </div>
      <FlowAnimation/>
    </div>
  );
  return (
    <div style={{ padding: 24, display:'flex', flexDirection:'column', gap: 18 }}>
      {flow}
      {factory.floors.map((floor) => {
        const lines = factory.lines.filter((l) => l.floorId === floor.id);
        return (
          <div key={floor.id}>
            <div style={{ display:'flex', alignItems:'baseline', gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, color: SW_COLORS.ink }}>{floor.name}</span>
              <span style={{ fontSize: 11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>{floor.description}</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {lines.map((l) => <LineCard key={l.id} line={l} garments={garments} onPick={() => onPickLine(l)} onRun={() => onRunLine(l)}/>)}
              {lines.length === 0 && (
                <div style={{ padding: 14, fontSize: 12, color: SW_COLORS.muted, fontStyle: 'italic', border: `1px dashed ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm }}>
                  No lines on this floor. Click + on the tree to add one.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Floor view ──────────────────────────────────────────────────────────────

interface FloorViewProps {
  floor: Floor;
  lines: Line[];
  garments: EffectiveGarments;
  onPickLine: (l: Line) => void;
  onRunLine: (l: Line) => void;
}

function FloorView({ floor, lines, garments, onPickLine, onRunLine }: FloorViewProps) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, color: SW_COLORS.ink }}>{floor.name}</span>
        <span style={{ fontSize: 12, color: SW_COLORS.muted }}>{floor.description}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {lines.map((l) => <LineCard key={l.id} line={l} garments={garments} expand onPick={() => onPickLine(l)} onRun={() => onRunLine(l)}/>)}
      </div>
    </div>
  );
}

// ── Line card ───────────────────────────────────────────────────────────────

interface LineCardProps {
  line: Line;
  garments: EffectiveGarments;
  expand?: boolean;
  onPick: () => void;
  onRun: () => void;
}

function LineCard({ line, garments, expand, onPick, onRun }: LineCardProps) {
  const garment = garments.byId[line.garmentTemplateId];
  const k = line.lastKpis;
  return (
    <div
      onClick={onPick}
      style={{
        background: SW_COLORS.paper,
        border: `1px solid ${SW_COLORS.line}`,
        borderRadius: SW_RADIUS.md,
        padding: expand ? 16 : 12,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position:'absolute', top: 0, left: 0, right: 0, height: 3, background: k ? `linear-gradient(90deg, ${SW_COLORS.brand}, ${SW_COLORS.thread})` : SW_COLORS.line }}/>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop: 4 }}>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: expand ? 16 : 14, fontWeight: 900, color: SW_COLORS.ink }}>{line.name}</div>
        <Tag soft color={SW_COLORS.bobbin}>{line.productionSystem}</Tag>
      </div>
      <div style={{ fontSize: 11, color: SW_COLORS.muted, marginTop: 2 }}>
        {garment?.name.replace(/\s*\(.*\)/, '') ?? line.garmentTemplateId} · {line.operators} ops
      </div>

      {k ? (
        <div style={{ marginTop: 10, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 6 }}>
          <Stat label="OUT"  value={k.producedPieces.toLocaleString()}                          color={SW_COLORS.brand}/>
          <Stat label="THRU" value={Math.round(k.throughputPerHr)}                              color={SW_COLORS.ok}/>
          <Stat label="EFF"  value={`${k.efficiencyPct.toFixed(0)}`} unit="%" color={k.efficiencyPct >= 75 ? SW_COLORS.fabric : SW_COLORS.thread}/>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 11, color: SW_COLORS.muted, fontStyle:'italic' }}>
          Not run yet — click Run line.
        </div>
      )}

      <div style={{ marginTop: 12, display:'flex', gap: 6 }}>
        <Button variant="primary" size="sm" onClick={(e?: React.MouseEvent) => { e?.stopPropagation(); onRun(); }}>▶ Run line</Button>
        {k && (
          <span style={{ fontSize: 10, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, alignSelf:'center' }}>
            Bottleneck: {k.bottleneckOpName} (Q={k.bottleneckQueue})
          </span>
        )}
      </div>
    </div>
  );
}

// ── Line view (zoom = line) — large canvas card ─────────────────────────────

interface LineViewProps {
  line: Line;
  garments: EffectiveGarments;
  onUpdate: (patch: Partial<Line>) => void;
  onRun: () => void;
  onDelete: () => void;
}

function LineView({ line, garments, onUpdate, onRun, onDelete }: LineViewProps) {
  const garment = garments.byId[line.garmentTemplateId];
  const k = line.lastKpis;
  return (
    <div style={{ padding: 24, display:'flex', flexDirection:'column', gap: 18 }}>
      <div style={{ display:'flex', alignItems:'center', gap: 12, flexWrap: 'wrap' }}>
        <input
          defaultValue={line.name}
          onBlur={(e) => onUpdate({ name: e.target.value })}
          style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, color: SW_COLORS.ink, background:'transparent', border: `1px dashed ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm, padding: '4px 8px' }}
        />
        <Tag soft color={SW_COLORS.bobbin}>{line.productionSystem}</Tag>
        <div style={{ fontSize: 12, color: SW_COLORS.muted }}>
          {garment?.name ?? line.garmentTemplateId} · SAM {garment?.totalSmv.toFixed(2) ?? '—'} min · {line.operators} operators
        </div>
        <div style={{ flex: 1 }}/>
        <Button variant="primary" size="sm" onClick={onRun}>▶ Run line (480 min)</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>Delete line</Button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 10 }}>
        {k ? (
          <>
            <Stat big label="OUTPUT"     value={k.producedPieces.toLocaleString()} unit="pcs"   color={SW_COLORS.brand}/>
            <Stat big label="THROUGHPUT" value={Math.round(k.throughputPerHr).toLocaleString()} unit="pcs/hr" color={SW_COLORS.ok}/>
            <Stat big label="EFFICIENCY" value={k.efficiencyPct.toFixed(1)}    unit="%"     color={k.efficiencyPct >= 75 ? SW_COLORS.fabric : SW_COLORS.thread}/>
            <Stat big label="MEAN LEAD"  value={k.meanLeadTime.toFixed(1)}     unit="min"   color={SW_COLORS.bobbin}/>
            <Stat big label="WIP"        value={k.wipBundles.toLocaleString()} unit="bundles" color={SW_COLORS.warn}/>
            <Stat big label="UTIL"       value={(k.utilization * 100).toFixed(0)} unit="%"  color={SW_COLORS.thread}/>
          </>
        ) : (
          <div style={{ gridColumn:'1 / -1', padding: 18, fontSize: 13, color: SW_COLORS.muted, background: SW_COLORS.paper, border: `1px dashed ${SW_COLORS.line}`, borderRadius: SW_RADIUS.md }}>
            No KPIs yet for this line. Press <strong>Run line</strong> to fast-forward a 480-minute shift through the engine.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Right-pane line inspector — edit garment / operators / system ───────────

interface LineInspectorProps {
  line: Line;
  garments: EffectiveGarments;
  onUpdate: (patch: Partial<Line>) => void;
  onRun: () => void;
  onOpenSim: () => void;
}

function LineInspector({ line, garments, onUpdate, onRun, onOpenSim }: LineInspectorProps) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Garment</div>
        <select value={line.garmentTemplateId} onChange={(e) => onUpdate({ garmentTemplateId: e.target.value })}
          style={{ width:'100%', padding:'8px 10px', borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 600, background: SW_COLORS.paper }}
        >
          {garments.all.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 10, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, marginTop: -8 }}>
        SAM: {garments.byId[line.garmentTemplateId]?.totalSmv.toFixed(2) ?? '—'} min · {garments.byId[line.garmentTemplateId]?.operations.length ?? 0} operations
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Operators</div>
        <input type="number" min={4} max={120} value={line.operators}
          onChange={(e) => onUpdate({ operators: Math.max(4, Math.min(120, parseInt(e.target.value) || 4)) })}
          style={{ width:'100%', padding:'8px 10px', borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.mono, fontWeight: 700, fontSize: 14 }}
        />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Production system</div>
        <select value={line.productionSystem} onChange={(e) => onUpdate({ productionSystem: e.target.value })}
          style={{ width:'100%', padding:'8px 10px', borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 600, background: SW_COLORS.paper }}
        >
          {ALL_PRODUCTION_SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div style={{ display:'flex', gap: 6, marginTop: 4 }}>
        <Button variant="primary" full size="sm" onClick={onRun}>▶ Run line</Button>
        <Button variant="secondary" full size="sm" onClick={onOpenSim}>Open in sim</Button>
      </div>

      {line.lastKpis && (
        <div style={{ marginTop: 6, padding: 10, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.5 }}>
          Last run {line.lastRunAt ? new Date(line.lastRunAt).toLocaleString() : '—'}<br/>
          Bottleneck: <strong style={{ color: SW_COLORS.alarm }}>{line.lastKpis.bottleneckOpName}</strong> (Q={line.lastKpis.bottleneckQueue})<br/>
          Util {(line.lastKpis.utilization * 100).toFixed(0)}% · Mean lead {line.lastKpis.meanLeadTime.toFixed(1)} min
        </div>
      )}
    </div>
  );
}

// ── Misc helpers ────────────────────────────────────────────────────────────

function promptAddLine(project: ReturnType<typeof useProject.getState>, floorId: string, _refresh: () => void) {
  const name = prompt('Line name?', `Line ${project.factory.lines.length + 1}`);
  if (!name) return;
  project.addLine({
    name,
    floorId,
    garmentTemplateId: project.selectedGarmentId,
    operators: project.defaultOperators,
    productionSystem: 'PBS',
  });
}
