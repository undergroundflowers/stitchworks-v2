import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Card, Button, Tag, SectionHeader, ToggleGroup, Stat } from '../components';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject, useGarments, type Scenario, type ScenarioKpis, type EffectiveGarments } from '../store';
import { formatDate } from '../lib/format';

type Mode = 'list' | 'compare';

/**
 * Scenarios page — saved factory configurations + their post-shift KPIs.
 *
 * - List mode: each scenario is a card. Load restores its config into the
 *   live project; Rename / Delete edit the row; Open opens it in Reports
 *   for a re-run.
 * - Compare mode: pick 2–4 scenarios; their KPIs land side-by-side as a
 *   bar table with the leader on each metric highlighted.
 *
 * Saving a scenario lives on the Reports page ("Save scenario" button) so
 * the captured KPIs come from a deterministic full-shift run.
 */
export function ScenariosPage() {
  const navigate = useNavigate();
  const project = useProject();
  const garments = useGarments();
  const scenarios = project.scenarios;

  const [mode, setMode] = useState<Mode>('list');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');

  const selected = useMemo(
    () => selectedIds.map((id) => scenarios.find((s) => s.id === id)).filter((s): s is Scenario => !!s),
    [selectedIds, scenarios],
  );

  function toggleSelected(id: string) {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-4)));
  }

  function handleLoad(s: Scenario) {
    if (!confirm(`Load "${s.name}"? This replaces the current factory's garment, operators, skill matrix and Yamazumi assignment.`)) return;
    project.loadScenario(s.id);
    navigate('/sim');
  }

  function handleDelete(s: Scenario) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    project.deleteScenario(s.id);
    setSelectedIds((cur) => cur.filter((x) => x !== s.id));
  }

  function startRename(s: Scenario) {
    setRenamingId(s.id);
    setRenameDraft(s.name);
  }

  function commitRename() {
    if (renamingId && renameDraft.trim()) {
      project.renameScenario(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
    setRenameDraft('');
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: SW_COLORS.paperDeep, padding: 32 }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <SectionHeader
          kicker="Scenarios"
          title={scenarios.length === 0 ? 'No saved scenarios yet' : `${scenarios.length} saved scenario${scenarios.length === 1 ? '' : 's'}`}
          sub="Save a sim run from Simulation as a named scenario, then compare scenarios side-by-side to find the layout / staffing / system that wins on the KPIs you care about."
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ToggleGroup value={mode} onChange={setMode} options={[
                { value: 'list',    label: '◰ List' },
                { value: 'compare', label: `◇ Compare${selected.length > 0 ? ` (${selected.length})` : ''}` },
              ]}/>
              <Button variant="primary" size="sm" icon="✦" onClick={() => navigate('/sim')}>
                Run shift to save
              </Button>
            </div>
          }
        />

        {scenarios.length === 0 && (
          <Card padding={32} style={{ textAlign: 'center', marginTop: 24 }}>
            <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 12, color: SW_COLORS.brand }}>✦</div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
              Capture your first scenario
            </div>
            <div style={{ fontSize: 13, color: SW_COLORS.muted, maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
              Open <strong style={{ color: SW_COLORS.ink }}>Simulation</strong>, configure the garment / operator count / skill matrix / Yamazumi
              assignment you want to evaluate, then click <strong style={{ color: SW_COLORS.ink }}>Save scenario</strong>. The current
              KPIs and configuration are stored together so you can compare runs apples-to-apples later.
            </div>
            <div style={{ marginTop: 18 }}>
              <Button variant="primary" onClick={() => navigate('/sim')}>Open Simulation →</Button>
            </div>
          </Card>
        )}

        {scenarios.length > 0 && mode === 'list' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, marginTop: 6 }}>
            {scenarios.map((s) => {
              const garment = garments.byId[s.config.garmentTemplateId];
              const garmentName = garment?.name ?? s.config.garmentTemplateId;
              const isSelected = selectedIds.includes(s.id);
              const isRenaming = renamingId === s.id;
              const overrideCount = s.config.yamazumiOverride?.length ?? 0;
              const skillEntries = Object.values(s.config.skillMatrix ?? {}).reduce((sum, row) => sum + Object.keys(row).length, 0);
              return (
                <Card key={s.id} padding={0} style={{ overflow: 'hidden', borderColor: isSelected ? SW_COLORS.brand : undefined }}>
                  <div style={{
                    height: 8,
                    background: isSelected
                      ? `linear-gradient(90deg, ${SW_COLORS.brand}, ${SW_COLORS.thread})`
                      : `linear-gradient(90deg, ${SW_COLORS.bobbin}, ${SW_COLORS.fabric})`,
                  }}/>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isRenaming ? (
                          <input
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') { setRenamingId(null); setRenameDraft(''); }
                            }}
                            autoFocus
                            style={{
                              width: '100%', padding: '4px 8px',
                              fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900,
                              border: `1px solid ${SW_COLORS.brand}`, borderRadius: SW_RADIUS.sm,
                              background: SW_COLORS.brandLite, color: SW_COLORS.ink,
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => startRename(s)}
                            style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, color: SW_COLORS.ink, cursor: 'text', lineHeight: 1.2 }}
                            title="Click to rename"
                          >
                            {s.name}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, marginTop: 4 }}>
                          {formatDate(s.createdAt, project.units.dateFormat)} · {garmentName} · {s.config.operators} ops
                        </div>
                      </div>
                      <input
                        type="checkbox" checked={isSelected}
                        onChange={() => toggleSelected(s.id)}
                        title="Add to compare"
                        style={{ accentColor: SW_COLORS.brand, width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                      <Stat label="OUTPUT"  value={s.kpis.producedPieces.toLocaleString()} unit="pcs" color={SW_COLORS.brand}/>
                      <Stat label="THRU/HR" value={Math.round(s.kpis.throughputPerHr).toLocaleString()} unit="pcs" color={SW_COLORS.ok}/>
                      <Stat label="EFF"     value={s.kpis.efficiencyPct.toFixed(1)} unit="%" color={s.kpis.efficiencyPct >= 75 ? SW_COLORS.fabric : SW_COLORS.thread}/>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {overrideCount > 0 && (
                        <Tag soft color={SW_COLORS.brand}>Yamazumi override · {overrideCount}</Tag>
                      )}
                      {skillEntries > 0 && (
                        <Tag soft color={SW_COLORS.bobbin}>Skill cells · {skillEntries}</Tag>
                      )}
                      {overrideCount === 0 && skillEntries === 0 && (
                        <Tag soft color={SW_COLORS.muted}>Baseline (auto-assignment)</Tag>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: SW_COLORS.muted, marginBottom: 12 }}>
                      Bottleneck · <strong style={{ color: SW_COLORS.alarm }}>{s.kpis.bottleneckOpName}</strong> (Q={s.kpis.bottleneckQueue}) · Util {(s.kpis.utilization * 100).toFixed(0)}%
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button variant="primary" size="sm" onClick={() => handleLoad(s)}>Load</Button>
                      <Button variant="secondary" size="sm" onClick={() => startRename(s)}>Rename</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(s)}>Delete</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {scenarios.length > 0 && mode === 'compare' && (
          <CompareView
            scenarios={selected}
            garments={garments}
            onClearSelection={() => setSelectedIds([])}
            onPickMore={() => setMode('list')}
          />
        )}
      </div>
    </div>
  );
}

interface CompareViewProps {
  scenarios: Scenario[];
  garments: EffectiveGarments;
  onClearSelection: () => void;
  onPickMore: () => void;
}

interface KpiRow {
  key: keyof ScenarioKpis | 'wip' | 'lead';
  /** Field key on `ScenarioKpis['std']` (when defined). */
  stdKey: keyof NonNullable<ScenarioKpis['std']>;
  label: string;
  unit: string;
  /** True when higher is better, false when lower is better. */
  higherIsBetter: boolean;
  format: (v: number) => string;
  read: (k: ScenarioKpis) => number;
  /** Whether the value is stored as a fraction (0..1) and should be ×100 for display. */
  fraction?: boolean;
  color: string;
}

const KPI_ROWS: KpiRow[] = [
  { key: 'producedPieces',  stdKey: 'producedPieces',  label: 'OUTPUT',       unit: 'pcs',     higherIsBetter: true,  format: (v) => Math.round(v).toLocaleString(), read: (k) => k.producedPieces,  color: SW_COLORS.brand },
  { key: 'throughputPerHr', stdKey: 'throughputPerHr', label: 'THROUGHPUT',   unit: 'pcs/hr',  higherIsBetter: true,  format: (v) => Math.round(v).toLocaleString(), read: (k) => k.throughputPerHr, color: SW_COLORS.ok },
  { key: 'efficiencyPct',   stdKey: 'efficiencyPct',   label: 'EFFICIENCY',   unit: '%',       higherIsBetter: true,  format: (v) => v.toFixed(1),                    read: (k) => k.efficiencyPct,   color: SW_COLORS.fabric },
  { key: 'utilization',     stdKey: 'utilization',     label: 'UTILISATION',  unit: '%',       higherIsBetter: true,  format: (v) => (v * 100).toFixed(0),            read: (k) => k.utilization, fraction: true, color: SW_COLORS.thread },
  { key: 'lead',            stdKey: 'meanLeadTime',    label: 'MEAN LEAD',    unit: 'min',     higherIsBetter: false, format: (v) => v.toFixed(1),                    read: (k) => k.meanLeadTime,    color: SW_COLORS.bobbin },
  { key: 'wip',             stdKey: 'wipBundles',      label: 'WIP',          unit: 'bundles', higherIsBetter: false, format: (v) => Math.round(v).toLocaleString(),  read: (k) => k.wipBundles,      color: SW_COLORS.warn },
];

function CompareView({ scenarios, garments, onClearSelection, onPickMore }: CompareViewProps) {
  if (scenarios.length < 2) {
    return (
      <Card padding={28} style={{ textAlign: 'center', marginTop: 16 }}>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900, marginBottom: 6 }}>
          Pick at least 2 scenarios to compare
        </div>
        <div style={{ fontSize: 13, color: SW_COLORS.muted, maxWidth: 480, margin: '0 auto 14px' }}>
          Switch to <strong>List</strong>, tick the checkbox on each scenario you want to compare (up to 4), then come back here.
        </div>
        <Button variant="primary" onClick={onPickMore}>Back to list →</Button>
      </Card>
    );
  }

  return (
    <Card padding={20} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900 }}>Side-by-side comparison</div>
          <div style={{ fontSize: 12, color: SW_COLORS.muted }}>
            Best value on each row is highlighted. Higher-is-better rows: Output · Throughput · Efficiency · Utilisation. Lower-is-better: Lead time · WIP. <strong>±</strong> values are 1σ across the run replications.
          </div>
        </div>
        <Button variant="secondary" size="sm" icon="↓" onClick={() => exportComparisonCsv(scenarios, garments)}>Export CSV</Button>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>Clear selection</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${scenarios.length}, 1fr)`, gap: 10, alignItems: 'stretch' }}>
        <div/>
        {scenarios.map((s) => {
          const garment = garments.byId[s.config.garmentTemplateId];
          return (
            <div key={s.id} style={{ background: SW_COLORS.paperDeep, padding: '10px 12px', borderRadius: SW_RADIUS.sm }}>
              <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, color: SW_COLORS.ink }}>{s.name}</div>
              <div style={{ fontSize: 10, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, marginTop: 2 }}>
                {garment?.name ?? s.config.garmentTemplateId} · {s.config.operators} ops
              </div>
            </div>
          );
        })}

        {KPI_ROWS.map((row) => {
          const values = scenarios.map((s) => row.read(s.kpis));
          const best = row.higherIsBetter ? Math.max(...values) : Math.min(...values);
          const peak = Math.max(...values, 0.0001);
          return (
            <FragmentRow key={row.key as string}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '6px 8px', fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>
                {row.label}
                <span style={{ marginLeft: 6, color: row.higherIsBetter ? SW_COLORS.ok : SW_COLORS.bobbin, fontSize: 11 }}>{row.higherIsBetter ? '↑' : '↓'}</span>
              </div>
              {values.map((v, i) => {
                const isBest = v === best;
                const w = peak > 0 ? Math.max(0.04, v / peak) * 100 : 0;
                const stdRaw = scenarios[i].kpis.std?.[row.stdKey];
                const stdShown = stdRaw !== undefined && stdRaw > 0
                  ? row.fraction ? stdRaw * 100 : stdRaw
                  : 0;
                return (
                  <div key={scenarios[i].id} style={{ background: SW_COLORS.paper, border: `1px solid ${isBest ? row.color : SW_COLORS.line}`, borderRadius: SW_RADIUS.sm, padding: '8px 10px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, bottom: 0, width: `${w}%`, height: 4, background: isBest ? row.color : `${row.color}40` }}/>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900, color: isBest ? row.color : SW_COLORS.ink }}>
                        {row.format(v)}
                      </span>
                      {stdShown > 0 && (
                        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted }}>±{row.format(stdShown)}</span>
                      )}
                      <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted }}>{row.unit}</span>
                      {isBest && (
                        <span style={{ marginLeft: 'auto', fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 800, color: row.color, letterSpacing: '0.5px' }}>BEST</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </FragmentRow>
          );
        })}
      </div>

      <div style={{ marginTop: 18, padding: 12, background: SW_COLORS.brandLite, borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.brand}30`, fontSize: 12, color: SW_COLORS.ink, lineHeight: 1.5 }}>
        <strong>Reading the comparison:</strong> each row is one KPI. The leader on that row gets the coloured border + "BEST" badge. Use this with the academic
        rubric — a layout/staffing change is "better" only when it wins on the KPIs that matter for the order, with statistically meaningful margin. Re-run a few
        seeds before declaring victory.
      </div>
    </Card>
  );
}

/** Tiny helper so we can stamp KPI rows into the parent grid without an extra wrapper. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Build + download a CSV with one row per scenario × KPI. */
function exportComparisonCsv(scenarios: Scenario[], garments: EffectiveGarments): void {
  const cols = ['Scenario', 'Garment', 'Operators', 'Replications',
    'Output mean', 'Output std',
    'Throughput mean', 'Throughput std',
    'Efficiency % mean', 'Efficiency % std',
    'Utilisation mean', 'Utilisation std',
    'Mean lead mean', 'Mean lead std',
    'WIP mean', 'WIP std',
    'Bottleneck', 'Bottleneck Q', 'Saved at (device wall time)'];
  const lines = [cols.map(csvCell).join(',')];
  for (const s of scenarios) {
    const garment = garments.byId[s.config.garmentTemplateId];
    const std = s.kpis.std;
    lines.push([
      s.name,
      garment?.name ?? s.config.garmentTemplateId,
      s.config.operators,
      s.kpis.replicationCount ?? 1,
      s.kpis.producedPieces.toFixed(1),
      std?.producedPieces?.toFixed(1) ?? '',
      s.kpis.throughputPerHr.toFixed(1),
      std?.throughputPerHr?.toFixed(1) ?? '',
      s.kpis.efficiencyPct.toFixed(2),
      std?.efficiencyPct?.toFixed(2) ?? '',
      s.kpis.utilization.toFixed(3),
      std?.utilization?.toFixed(3) ?? '',
      s.kpis.meanLeadTime.toFixed(2),
      std?.meanLeadTime?.toFixed(2) ?? '',
      s.kpis.wipBundles.toFixed(0),
      std?.wipBundles?.toFixed(0) ?? '',
      s.kpis.bottleneckOpName,
      s.kpis.bottleneckQueue,
      s.createdAt,
    ].map(csvCell).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stitchworks-scenarios-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
