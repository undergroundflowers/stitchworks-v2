import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Card, Button, Stat, Tag, SectionHeader, Progress, ToggleGroup } from '../components';
import { Fragment, useState, useMemo } from 'react';
import {
  ALL_WORKER_ARCHETYPES,
  type WorkerArchetype,
  ALL_MACHINES,
  type MachineSpec,
  type MachineCode,
  type Operation,
  type OperationCategory,
  type SkillId,
  type GarmentTemplate,
  GARMENT_TEMPLATES,
} from '../domain';
import { useProject, useGarments, type EffectiveGarments } from '../store';

/**
 * Resources page — operators, machines, inventory and roster.
 *
 * Operators and machines are now derived from the apparel domain layer
 * (WORKER_ARCHETYPES + MACHINE_CATALOG) instead of hardcoded mock arrays.
 * Names and instance counts are seeded deterministically so the table is
 * stable across renders. Inventory and roster remain demo data for now;
 * those become live once the project file format and roster scheduler land.
 */
export function ResourcesPage() {
  const [tab, setTab] = useState<'operators' | 'machines' | 'inventory' | 'roster' | 'skills' | 'operations'>('operators');
  const project = useProject();
  const garments = useGarments();
  const skillMatrix = project.skillMatrix;
  const setSkill = project.setSkill;
  const resetSkillMatrix = project.resetSkillMatrix;
  const [skillsGarment, setSkillsGarment] = useState<string>(project.selectedGarmentId);

  const operators = useMemo(() => buildOperators(), []);
  const machines = useMemo(() => buildMachines(), []);

  const activeCount = operators.filter((o) => o.status === 'ACTIVE').length;
  const sickCount = operators.filter((o) => o.status === 'SICK').length;
  const trainingCount = operators.filter((o) => o.status === 'TRAINING').length;
  const avgEff = Math.round(operators.reduce((s, o) => s + o.eff, 0) / operators.length);

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', background: SW_COLORS.paperDeep }}>
      <div style={{ padding:'18px 24px', background: SW_COLORS.paper, borderBottom: `1px solid ${SW_COLORS.line}` }}>
        <SectionHeader kicker="Resources" title="People, machines & inventory"
          sub="Manage your factory's workforce and equipment. Operators and machines are seeded from the apparel domain catalog."
          right={
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" size="sm" icon="↑">Import</Button>
              <Button variant="primary" size="sm" icon="+">Add new</Button>
            </div>
          }/>
        <div style={{ marginTop: 8 }}>
          <ToggleGroup value={tab} onChange={setTab} options={[
            { value:'operators',  label:`👥 Operators · ${operators.length}` },
            { value:'machines',   label:`⚙ Machines · ${machines.length}` },
            { value:'operations', label:`🪡 Operations · ${garments.all.length} garments` },
            { value:'skills',     label:`🎯 Skill matrix` },
            { value:'inventory',  label:'📦 Inventory' },
            { value:'roster',     label:'🗓 Shift roster' },
          ]}/>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'24px' }}>
        {tab==='operators' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap: 18 }}>
            <Card padding={0}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily: SW_FONTS.body }}>
                <thead>
                  <tr style={{ background: SW_COLORS.paperDeep, borderBottom: `1px solid ${SW_COLORS.line}` }}>
                    {['ID','Name','Role','Eff %','SAM','Shift','Wage/hr','Status'].map(h => (
                      <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color: SW_COLORS.muted, letterSpacing:'1px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operators.map((o, i) => (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${SW_COLORS.line}`, fontSize:12 }}>
                      <td style={{ padding:'10px 12px', fontFamily: SW_FONTS.mono, fontWeight:700, color: SW_COLORS.muted }}>{o.id}</td>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:24, height:24, borderRadius:'50%', background: ['#FFE4D6','#D6F0E4','#E4DEFF','#FFEAD6','#D6E8FF'][i%5], display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color: SW_COLORS.ink }}>{o.name[0]}</div>
                          <span style={{ fontWeight:700 }}>{o.name}</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:18, height:18, borderRadius:4, background: o.archetype.color, color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>{o.archetype.icon}</span>
                          {o.archetype.label}
                        </span>
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontFamily: SW_FONTS.mono, fontWeight:700, width:30, color: o.eff>=80?SW_COLORS.ok:o.eff>=65?SW_COLORS.thread:SW_COLORS.alarm }}>{o.eff}%</span>
                          <div style={{ flex:1, maxWidth:60 }}><Progress value={o.eff} color={o.eff>=80?SW_COLORS.ok:o.eff>=65?SW_COLORS.thread:SW_COLORS.alarm} height={4}/></div>
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px', fontFamily: SW_FONTS.mono, fontWeight:700 }}>{o.sam}</td>
                      <td style={{ padding:'10px 12px' }}><Tag soft color={o.shift==='A'?SW_COLORS.brand:o.shift==='B'?SW_COLORS.bobbin:SW_COLORS.fabric}>{o.shift}</Tag></td>
                      <td style={{ padding:'10px 12px', fontFamily: SW_FONTS.mono, fontWeight:700, color: SW_COLORS.thread }}>${o.wage.toFixed(0)}</td>
                      <td style={{ padding:'10px 12px' }}>
                        <Tag soft color={o.status==='ACTIVE'?SW_COLORS.ok:o.status==='SICK'?SW_COLORS.alarm:SW_COLORS.thread} dot>{o.status}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div>
              <Card padding={16} style={{ marginBottom:14 }}>
                <div style={{ fontFamily: SW_FONTS.display, fontSize:13, fontWeight:900, marginBottom:10 }}>WORKFORCE</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <Stat label="ACTIVE" value={activeCount} color={SW_COLORS.ok}/>
                  <Stat label="SICK" value={sickCount} color={SW_COLORS.alarm}/>
                  <Stat label="TRAINING" value={trainingCount} color={SW_COLORS.thread}/>
                  <Stat label="AVG EFF" value={avgEff} unit="%"/>
                </div>
              </Card>
              <Card padding={16}>
                <div style={{ fontFamily: SW_FONTS.display, fontSize:13, fontWeight:900, marginBottom:10 }}>ROLE COVERAGE</div>
                {ALL_WORKER_ARCHETYPES.filter((a) => operators.some((o) => o.archetype.role === a.role)).map((a) => {
                  const c = operators.filter((o) => o.archetype.role === a.role).length;
                  return (
                    <div key={a.role} style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:600, marginBottom:3 }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                          <span style={{ color: a.color, fontSize:13 }}>{a.icon}</span>
                          {a.label}
                        </span>
                        <span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.muted }}>{c}</span>
                      </div>
                      <Progress value={c} max={8} color={a.color} height={5}/>
                    </div>
                  );
                })}
              </Card>
            </div>
          </div>
        )}

        {tab==='machines' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {machines.map(m => (
              <Card key={m.id} padding={14}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <div>
                    <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color: SW_COLORS.muted }}>{m.id} · {m.line} · {m.spec.code}</div>
                    <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginTop:2, color: m.spec.color }}>
                      <span style={{ marginRight:6 }}>{m.spec.icon}</span>{m.spec.shortName}
                    </div>
                    <div style={{ fontSize:11, color: SW_COLORS.muted }}>{m.brand} · {m.spec.label}</div>
                  </div>
                  <Tag color={m.status==='OK'?SW_COLORS.ok:m.status==='DOWN'?SW_COLORS.alarm:SW_COLORS.thread} soft dot>{m.status}</Tag>
                </div>
                <div style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, fontWeight:700, color: SW_COLORS.muted, marginBottom:3, fontFamily: SW_FONTS.mono }}>
                    <span>HEALTH</span><span>{m.health}%</span>
                  </div>
                  <Progress value={m.health} color={m.health>=70?SW_COLORS.ok:m.health>=40?SW_COLORS.thread:SW_COLORS.alarm} height={6}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>
                  <span>{m.hours.toLocaleString()} run hrs</span>
                  <span>${m.spec.costUsd.toLocaleString()}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab==='inventory' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:18 }}>
            <Card padding={20}>
              <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>RAW MATERIALS</div>
              {[
                { name:'Cotton jersey 180gsm', qty:1840, unit:'m', stock:'OK', col: SW_COLORS.fabric },
                { name:'Polyester blend',     qty:420,  unit:'m', stock:'LOW', col: SW_COLORS.alarm },
                { name:'White thread #40',    qty:120,  unit:'cones', stock:'OK', col: SW_COLORS.ok },
                { name:'Black thread #40',    qty:8,    unit:'cones', stock:'CRITICAL', col: SW_COLORS.alarm },
                { name:'Buttons 12mm white',  qty:15400,unit:'pcs', stock:'OK', col: SW_COLORS.ok },
                { name:'Care labels',         qty:2200, unit:'pcs', stock:'OK', col: SW_COLORS.ok },
              ].map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderTop: i?`1px solid ${SW_COLORS.line}`:'none' }}>
                  <div style={{ width: 8, height:36, background: r.col, borderRadius: 2 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{r.name}</div>
                    <div style={{ fontSize:11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>{r.qty.toLocaleString()} {r.unit}</div>
                  </div>
                  <Tag soft color={r.col} dot>{r.stock}</Tag>
                </div>
              ))}
            </Card>
            <Card padding={20}>
              <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>FINISHED GOODS</div>
              {[
                { name:'Polo S/S Classic — Navy', qty:840,  status:'READY TO SHIP', col: SW_COLORS.ok },
                { name:'Polo S/S Classic — White', qty:1200, status:'READY TO SHIP', col: SW_COLORS.ok },
                { name:'T-shirt Crew — Black', qty:240, status:'PACKING', col: SW_COLORS.thread },
                { name:'Dress shirt — Blue', qty:60, status:'INSPECT', col: SW_COLORS.bobbin },
              ].map((g, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderTop: i?`1px solid ${SW_COLORS.line}`:'none' }}>
                  <div style={{ width:36, height:36, background:`${g.col}20`, color: g.col, borderRadius: SW_RADIUS.sm, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👕</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{g.name}</div>
                    <div style={{ fontSize:11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>{g.qty} pcs</div>
                  </div>
                  <Tag soft color={g.col} dot>{g.status}</Tag>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab==='operations' && (
          <OperationsPanel garments={garments}/>
        )}

        {tab==='skills' && (
          <SkillMatrixPanel
            operators={operators}
            garmentId={skillsGarment}
            setGarmentId={setSkillsGarment}
            skillMatrix={skillMatrix}
            setSkill={setSkill}
            resetSkillMatrix={resetSkillMatrix}
            garments={garments}
          />
        )}

        {tab==='roster' && (
          <Card padding={20}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>WEEKLY ROSTER · DAY 14-20</div>
            <div style={{ display:'grid', gridTemplateColumns:'120px repeat(7, 1fr)', gap: 1, background: SW_COLORS.line }}>
              <div style={{ background: SW_COLORS.paperDeep, padding:8, fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700 }}>OPERATOR</div>
              {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
                <div key={d} style={{ background: SW_COLORS.paperDeep, padding:8, fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, textAlign:'center' }}>{d}</div>
              ))}
              {operators.slice(0,12).map(o => (
                <Fragment key={o.id}>
                  <div style={{ background: SW_COLORS.paper, padding: 8, fontSize:11, fontWeight:700 }}>{o.id} {o.name}</div>
                  {[...Array(7)].map((_, i) => {
                    const v = (Math.sin(parseInt(o.id.slice(4))*i) + 1)/2;
                    const code = v>0.7?'A':v>0.4?'B':v>0.2?'C':'OFF';
                    const col = code==='A'?SW_COLORS.brand:code==='B'?SW_COLORS.bobbin:code==='C'?SW_COLORS.fabric:SW_COLORS.paperEdge;
                    return (
                      <div key={i} style={{ background: code==='OFF'?SW_COLORS.paperDeep:`${col}20`, color: code==='OFF'?SW_COLORS.muted:col, padding:8, textAlign:'center', fontSize:11, fontFamily: SW_FONTS.mono, fontWeight:700 }}>{code}</div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Operations editor ───────────────────────────────────────────────────────

const ALL_SKILL_IDS: SkillId[] = [
  'stitching', 'overlock', 'flatlock', 'kansai', 'feed_of_arm',
  'buttonhole', 'button_sew', 'bartack', 'embroidery',
  'cutting_manual', 'cutting_cad', 'spreading', 'fusing',
  'pressing', 'inspection', 'packing', 'bundling',
  'material_handling', 'mechanical_maint', 'supervision',
];

const ALL_OPERATION_CATEGORIES: OperationCategory[] = [
  'sewing', 'manual', 'cutting', 'spreading', 'pressing',
  'fusing', 'inspection', 'embroidery', 'finishing',
];

interface OperationsPanelProps {
  garments: EffectiveGarments;
}

/**
 * Operation library editor — pick a garment, edit / add / reorder / delete
 * its operations. Edits are stored in `project.garmentEdits` (built-in or
 * custom) and flow through `useGarments()` so every read site (LiveSim,
 * Yamazumi, Twin run-line, etc.) picks them up immediately.
 */
function OperationsPanel({ garments }: OperationsPanelProps) {
  const project = useProject();
  const [garmentId, setGarmentId] = useState<string>(project.selectedGarmentId);
  const garment = garments.byId[garmentId] ?? garments.all[0];
  const builtIn = GARMENT_TEMPLATES[garmentId];
  const isEdited = project.garmentEdits[garmentId] !== undefined;
  const isBuiltIn = !!builtIn;

  function patch(p: Partial<Omit<GarmentTemplate, 'operations'>>) {
    project.patchGarment(garmentId, builtIn, p);
  }

  function addOp() {
    const newOp: Operation = {
      id: `${garmentId}-${Date.now().toString(36)}`,
      code: `OP-${(garment.operations.length + 1).toString().padStart(2, '0')}`,
      name: 'New operation',
      smv: 0.30,
      machineCode: 'SNL',
      skill: 'stitching',
      category: 'sewing',
    };
    project.addOperation(garmentId, builtIn, newOp);
  }

  function newCustomGarment() {
    const name = prompt('New garment name', 'Custom garment');
    if (!name) return;
    const id = `custom-${Date.now().toString(36)}`;
    const blank: GarmentTemplate = {
      id,
      name,
      class: 'top',
      description: 'User-defined garment.',
      operations: [],
      defaultBundleSize: 20,
      totalSmv: 0,
      hourlyTarget100: 0,
      bestFor: '',
    };
    project.setGarmentEdit(id, blank);
    setGarmentId(id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Garment picker + meta */}
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>GARMENT</span>
          <ToggleGroup value={garmentId} onChange={setGarmentId} options={garments.all.map((g) => ({
            value: g.id,
            label: g.name.replace(/\s*\(.*\)/, '') + (project.garmentEdits[g.id] ? ' ●' : ''),
          }))}/>
          <div style={{ flex: 1 }}/>
          <Button variant="secondary" size="sm" icon="+" onClick={newCustomGarment}>New garment</Button>
          {isEdited && isBuiltIn && (
            <Button variant="ghost" size="sm" onClick={() => {
              if (confirm(`Reset ${garment.name} back to its built-in defaults? Your edits will be discarded.`)) {
                project.resetGarment(garmentId);
              }
            }}>Reset to built-in</Button>
          )}
          {!isBuiltIn && (
            <Button variant="ghost" size="sm" onClick={() => {
              if (confirm(`Delete ${garment.name}?`)) {
                project.resetGarment(garmentId);
                setGarmentId('tshirt');
              }
            }}>Delete custom</Button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Name</div>
            <input value={garment.name} onChange={(e) => patch({ name: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700 }}/>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Default bundle size</div>
            <input type="number" min={1} max={500} value={garment.defaultBundleSize}
              onChange={(e) => patch({ defaultBundleSize: Math.max(1, parseInt(e.target.value) || 1) })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.mono, fontSize: 14, fontWeight: 700 }}/>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Total SAM</div>
            <div style={{ padding: '8px 10px', borderRadius: SW_RADIUS.sm, background: SW_COLORS.paperDeep, fontFamily: SW_FONTS.mono, fontSize: 14, fontWeight: 700 }}>
              {garment.totalSmv.toFixed(3)} min
              <span style={{ color: SW_COLORS.muted, fontWeight: 600, marginLeft: 6, fontSize: 11 }}>· {garment.operations.length} ops</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Description</div>
          <input value={garment.description} onChange={(e) => patch({ description: e.target.value })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.body, fontSize: 12, fontWeight: 600, color: SW_COLORS.ink }}/>
        </div>
      </Card>

      {/* Operations table */}
      <Card padding={0} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SW_FONTS.body, fontSize: 12 }}>
          <thead>
            <tr style={{ background: SW_COLORS.paperDeep, borderBottom: `1px solid ${SW_COLORS.line}` }}>
              {['#', 'Order', 'Code', 'Name', 'SMV (min)', 'Machine', 'Skill', 'Category', ''].map((h) => (
                <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {garment.operations.map((op, i) => (
              <tr key={op.id} style={{ borderBottom: `1px solid ${SW_COLORS.line}` }}>
                <td style={{ padding: '6px 10px', fontFamily: SW_FONTS.mono, fontWeight: 700, color: SW_COLORS.muted, width: 28 }}>{i + 1}</td>
                <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => project.moveOperation(garmentId, builtIn, op.id, -1)} disabled={i === 0}
                    style={miniBtn(i === 0)}>↑</button>
                  <button onClick={() => project.moveOperation(garmentId, builtIn, op.id, 1)} disabled={i === garment.operations.length - 1}
                    style={miniBtn(i === garment.operations.length - 1)}>↓</button>
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input value={op.code ?? ''}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { code: e.target.value })}
                    style={cellInput(60)}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input value={op.name}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { name: e.target.value })}
                    style={cellInput(220)}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input type="number" step={0.01} min={0.001} value={op.smv}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { smv: Math.max(0.001, parseFloat(e.target.value) || 0.001) })}
                    style={{ ...cellInput(72), fontFamily: SW_FONTS.mono, fontWeight: 700 }}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <select value={op.machineCode}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { machineCode: e.target.value as MachineCode })}
                    style={cellSelect()}
                  >
                    {ALL_MACHINES.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.shortName}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <select value={op.skill}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { skill: e.target.value as SkillId })}
                    style={cellSelect()}
                  >
                    {ALL_SKILL_IDS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <select value={op.category}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { category: e.target.value as OperationCategory })}
                    style={cellSelect()}
                  >
                    {ALL_OPERATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                  <button onClick={() => {
                    if (confirm(`Delete ${op.code ?? op.name}?`)) project.removeOperation(garmentId, builtIn, op.id);
                  }} style={{ ...miniBtn(false), background: 'transparent', color: SW_COLORS.alarm, fontSize: 13 }}>×</button>
                </td>
              </tr>
            ))}
            {garment.operations.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: SW_COLORS.muted, fontSize: 12, fontStyle: 'italic' }}>
                  No operations yet. Click <strong style={{ color: SW_COLORS.ink }}>+ Add operation</strong> below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paperDeep }}>
          <Button variant="primary" size="sm" icon="+" onClick={addOp}>Add operation</Button>
        </div>
      </Card>

      <div style={{ padding: 12, background: SW_COLORS.paper, border: `1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm, fontSize: 12, color: SW_COLORS.muted, lineHeight: 1.5 }}>
        Edits flow live to <strong style={{ color: SW_COLORS.ink }}>LiveSim</strong>, the <strong style={{ color: SW_COLORS.ink }}>Yamazumi chart</strong> on Reports, the
        <strong style={{ color: SW_COLORS.ink }}> Factory Twin's run-line</strong>, and the <strong style={{ color: SW_COLORS.ink }}>skill matrix</strong>. Total SAM auto-recomputes on every change.
        Built-in garments restore their defaults via <em>Reset to built-in</em>; custom garments live entirely in your project file.
      </div>
    </div>
  );
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 22, height: 22, marginRight: 2,
    background: disabled ? SW_COLORS.paperEdge : SW_COLORS.paper,
    color: disabled ? SW_COLORS.faint : SW_COLORS.ink,
    border: `1px solid ${SW_COLORS.line}`,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11,
    fontWeight: 800,
    fontFamily: SW_FONTS.mono,
  };
}

function cellInput(width: number): React.CSSProperties {
  return {
    width,
    padding: '5px 7px',
    border: `1px solid ${SW_COLORS.line}`,
    borderRadius: 4,
    fontFamily: SW_FONTS.body,
    fontSize: 12,
    fontWeight: 600,
    background: SW_COLORS.paper,
    color: SW_COLORS.ink,
  };
}

function cellSelect(): React.CSSProperties {
  return {
    padding: '5px 6px',
    border: `1px solid ${SW_COLORS.line}`,
    borderRadius: 4,
    fontFamily: SW_FONTS.mono,
    fontSize: 11,
    fontWeight: 600,
    background: SW_COLORS.paper,
    color: SW_COLORS.ink,
    cursor: 'pointer',
  };
}

// ── Skill matrix ────────────────────────────────────────────────────────────

interface SkillMatrixPanelProps {
  operators: SeededOperator[];
  garmentId: string;
  setGarmentId: (id: string) => void;
  skillMatrix: Record<string, Record<string, number>>;
  setSkill: (operatorId: string, opId: string, efficiency: number) => void;
  resetSkillMatrix: () => void;
  garments: EffectiveGarments;
}

/**
 * Operator × Operation efficiency grid for one garment template.
 *
 * Defaults: an operator gets 1.0 efficiency on operations whose required
 * skill is in their archetype's primarySkills, 0.7 on secondarySkills, and
 * 0 (= cannot perform) otherwise. The user overrides any cell — overrides
 * persist to the project store.
 *
 * Cell colour is a heat: green (≥0.9) → yellow (0.6–0.9) → red (<0.6) →
 * grey (0 = ineligible). Click any cell to type a new value.
 */
function SkillMatrixPanel({
  operators, garmentId, setGarmentId, skillMatrix, setSkill, resetSkillMatrix, garments,
}: SkillMatrixPanelProps) {
  const garment = garments.byId[garmentId] ?? garments.all[0];
  const ops = garment.operations;

  function defaultEfficiency(arch: WorkerArchetype, opSkill: SkillId): number {
    if (arch.primarySkills.includes(opSkill)) return arch.baseEfficiency;
    if (arch.secondarySkills?.includes(opSkill)) return arch.baseEfficiency * 0.7;
    return 0;
  }

  function effFor(op: SeededOperator, operation: Operation): number {
    const stored = skillMatrix[op.id]?.[operation.id];
    if (stored !== undefined) return stored;
    return defaultEfficiency(op.archetype, operation.skill);
  }

  function cellColor(eff: number): string {
    if (eff <= 0) return SW_COLORS.paperEdge;
    if (eff < 0.6) return `${SW_COLORS.alarm}60`;
    if (eff < 0.9) return `${SW_COLORS.thread}60`;
    return `${SW_COLORS.ok}80`;
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 14 }}>
      <div style={{ display:'flex', alignItems:'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>GARMENT</span>
          <ToggleGroup value={garmentId} onChange={setGarmentId} options={garments.all.map(g => ({ value: g.id, label: g.name.replace(/\s*\(.*\)/, '') }))}/>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display:'flex', alignItems:'center', gap: 14, fontSize: 11, fontFamily: SW_FONTS.mono, color: SW_COLORS.muted }}>
          <LegendChip color={SW_COLORS.ok} label="≥90"/>
          <LegendChip color={SW_COLORS.thread} label="60–89"/>
          <LegendChip color={SW_COLORS.alarm} label="<60"/>
          <LegendChip color={SW_COLORS.paperEdge} label="—"/>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm('Reset every skill cell to the role defaults?')) resetSkillMatrix();
        }}>Reset to defaults</Button>
      </div>

      <Card padding={0} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: SW_FONTS.body, fontSize: 11 }}>
          <thead>
            <tr style={{ background: SW_COLORS.paperDeep }}>
              <th style={{ position: 'sticky', left: 0, background: SW_COLORS.paperDeep, padding: '8px 10px', textAlign: 'left', minWidth: 200, borderRight: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '1px', zIndex: 1 }}>OPERATOR</th>
              {ops.map((op) => (
                <th key={op.id} title={`${op.code} ${op.name} · ${op.smv.toFixed(2)} min · ${op.machineCode}`}
                  style={{ padding: '8px 4px', textAlign: 'center', minWidth: 56, fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px', borderBottom: `1px solid ${SW_COLORS.line}`, verticalAlign: 'bottom' }}>
                  <div>{op.code ?? ''}</div>
                  <div style={{ fontSize: 8, color: SW_COLORS.faint, marginTop: 2 }}>{op.machineCode}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id} style={{ borderBottom: `1px solid ${SW_COLORS.line}` }}>
                <td style={{ position: 'sticky', left: 0, background: SW_COLORS.paper, padding: '6px 10px', borderRight: `1px solid ${SW_COLORS.line}`, zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 4, background: op.archetype.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{op.archetype.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{op.id} {op.name}</div>
                      <div style={{ fontSize: 9, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>{op.archetype.label}</div>
                    </div>
                  </div>
                </td>
                {ops.map((operation) => {
                  const eff = effFor(op, operation);
                  return (
                    <td key={operation.id} style={{ padding: 1, textAlign: 'center', background: cellColor(eff) }}>
                      <input
                        type="number" min={0} max={120} step={5} value={Math.round(eff * 100)}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(120, parseInt(e.target.value) || 0));
                          setSkill(op.id, operation.id, v / 100);
                        }}
                        style={{
                          width: '100%', padding: '4px 0', textAlign: 'center',
                          background: 'transparent', border: 'none',
                          fontFamily: SW_FONTS.mono, fontWeight: 700, fontSize: 10,
                          color: eff > 0 ? SW_COLORS.ink : SW_COLORS.faint,
                        }}
                        title={`${op.id} on ${operation.code}: ${(eff * 100).toFixed(0)}% efficiency`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ padding: 12, background: SW_COLORS.paper, border: `1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm, fontSize: 12, color: SW_COLORS.muted, lineHeight: 1.5 }}>
        Cells default to the operator's archetype: <strong style={{ color: SW_COLORS.ink }}>primary skills = base efficiency</strong> (≈85% for sewing operators), <strong style={{ color: SW_COLORS.ink }}>secondary = 70% of base</strong>, otherwise 0 (ineligible). Override any cell to capture per-operator know-how — values persist locally and travel with the .swproj file.
      </div>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }}/>
      {label}
    </span>
  );
}

// ── Demo seeding helpers — deterministic so the table is stable per session ──

interface SeededOperator {
  id: string;
  name: string;
  archetype: WorkerArchetype;
  eff: number;
  sam: string;
  shift: 'A' | 'B' | 'C';
  status: 'ACTIVE' | 'SICK' | 'TRAINING';
  wage: number;
}

const NAMES = ['Aanya','Rohan','Mei','Kofi','Lara','Yui','Tariq','Sara','Rafa','Nina','Diego','Eun','Jamal','Priya','Ola','Ravi','Lin','Pavel','Kemi','Iris','Boun','Asha','Nova','Tomi','Hina','Beto','Hai','Anya','Karim','Joon'];

/**
 * Distribute operators across worker archetypes proportional to each
 * archetype's typical headcount on a 100-operator finishing-room. Counts
 * sum to ~30 to keep the table readable.
 */
const ROLE_DISTRIBUTION: Partial<Record<WorkerArchetype['role'], number>> = {
  sew_op: 14, helper: 3, cutter: 2, spreader: 1, bundler: 2,
  qc_inline: 2, qc_final: 1, presser: 2, packer: 2, material_handler: 2,
  mechanic: 1, supervisor: 1,
};

function buildOperators(): SeededOperator[] {
  const out: SeededOperator[] = [];
  let n = 1;
  for (const archetype of ALL_WORKER_ARCHETYPES) {
    const count = ROLE_DISTRIBUTION[archetype.role] ?? 0;
    for (let i = 0; i < count; i++) {
      const idx = (n - 1) % NAMES.length;
      // Deterministic eff/wage variations seeded by id.
      const eff = Math.round(archetype.baseEfficiency * 100 + ((n * 17) % 25) - 12);
      const wage = archetype.baseCostHr + ((n * 7) % 5) * 0.5;
      const status: SeededOperator['status'] =
        n % 9 === 0 ? 'SICK' : n % 7 === 0 ? 'TRAINING' : 'ACTIVE';
      out.push({
        id: `OPR-${n.toString().padStart(2, '0')}`,
        name: NAMES[idx],
        archetype,
        eff: Math.max(40, Math.min(99, eff)),
        sam: (1.4 + ((n * 13) % 17) * 0.08).toFixed(2),
        shift: (['A', 'B', 'C'] as const)[n % 3],
        status,
        wage,
      });
      n++;
    }
  }
  return out;
}

interface SeededMachine {
  id: string;
  spec: MachineSpec;
  brand: string;
  hours: number;
  health: number;
  status: 'OK' | 'DOWN' | 'SERVICE';
  line: string;
}

/**
 * Headcount per machine type for a balanced sewing line. Proportions match
 * the Brandix-era SMV sheet (4× 4OL, 10× SNL, 1× FB, 1× BS, 4× FL, 1× BH).
 */
const MACHINE_DISTRIBUTION: Partial<Record<MachineSpec['code'], number>> = {
  SNL: 10, '4OL': 4, FL: 4, FB: 1, KS: 1, BH: 1, BS: 1, BT: 1,
  CUT: 2, SPR: 1, FUSE: 1, PRESS: 3, EMB: 1, INSP: 2,
};

function buildMachines(): SeededMachine[] {
  const out: SeededMachine[] = [];
  let n = 1;
  for (const spec of ALL_MACHINES) {
    if (spec.isManual) continue;
    const count = MACHINE_DISTRIBUTION[spec.code] ?? 0;
    for (let i = 0; i < count; i++) {
      const brand = (spec.brands ?? ['Generic'])[i % (spec.brands?.length ?? 1)];
      const hours = 200 + ((n * 113) % 7800);
      const health = 30 + ((n * 41) % 70);
      const status: SeededMachine['status'] =
        n % 11 === 0 ? 'DOWN' : n % 6 === 0 ? 'SERVICE' : 'OK';
      out.push({
        id: `M-${n.toString().padStart(2, '0')}`,
        spec,
        brand,
        hours,
        health,
        status,
        line: `L${1 + (n % 4)}`,
      });
      n++;
    }
  }
  return out;
}
