import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import { Card, Button, SectionHeader, ToggleGroup, Slider, HudSelect, Tag, TimeChip } from '../components';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject, downloadProjectJson, pickProjectFile, isFactoryNameTaken } from '../store';
import { ALL_GARMENT_TEMPLATES } from '../domain';
import { formatDate } from '../lib/format';
import type { UnitsPrefs } from '../store/project';
import { fmtMinutesAsHHMM, parseHHMM, type ModelTimeUnit } from '../simulation/timeUnit';

export function SettingsPage() {
  const navigate = useNavigate();
  const project = useProject();
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Local UI state for the simulation sliders — these are presentational
  // toggles for now; the engine's actual variance lives in buildSimConfig.
  const [simSpeed, setSimSpeed] = useState(2);
  const [eventRate, setEventRate] = useState(30);
  const [effVariance, setEffVariance] = useState(15);
  const [breakdowns, setBreakdowns] = useState(2);

  // Local pending value for the project-name input. Commits to the store
  // on blur or Enter when valid; lets the user keep typing through an
  // invalid intermediate state without snap-back. Re-syncs if the store
  // name changes from elsewhere (e.g. loading a saved factory).
  const [pendingName, setPendingName] = useState(project.meta.name);
  useEffect(() => { setPendingName(project.meta.name); }, [project.meta.name]);
  const trimmedPending = pendingName.trim();
  // The active factory's own name should not flag itself as a duplicate,
  // so we exclude it from the check by short-circuiting when the typed
  // value equals the currently-committed name (case-insensitive).
  const nameUnchanged = trimmedPending.toLowerCase() === project.meta.name.trim().toLowerCase();
  const nameInvalid =
    trimmedPending.length === 0 ||
    (!nameUnchanged && isFactoryNameTaken(trimmedPending));
  const commitName = () => {
    if (nameInvalid) {
      setPendingName(project.meta.name); // snap back on blur if invalid
      return;
    }
    if (!nameUnchanged) project.rename(trimmedPending);
  };

  const [gamification, setGamification] = useState([
    { k: 'XP & badges',       desc: 'Earn XP, unlock badges', on: true },
    { k: 'Difficulty events', desc: 'Random crises (sickness, breakdowns, rush orders)', on: true },
    { k: 'Tutorial hints',    desc: 'Show contextual tips', on: false },
    { k: 'Sound effects',     desc: 'Sewing machines, alerts, chime', on: false },
  ]);
  const toggleGamification = (i: number) =>
    setGamification((prev) => prev.map((p, idx) => (idx === i ? { ...p, on: !p.on } : p)));

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 32, background: SW_COLORS.paperDeep }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <SectionHeader
          kicker="Settings"
          title="Factory & project configuration"
          sub={`Last modified ${formatDate(project.meta.modifiedAt, project.units.dateFormat)} · Schema v${project.schemaVersion}`}
        />

        <Card padding={22} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginBottom: 14 }}>PROJECT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Project name</div>
              <input
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                aria-invalid={nameInvalid || undefined}
                style={{
                  marginTop: 4, width: '100%', padding: '8px 10px',
                  borderRadius: SW_RADIUS.sm,
                  border: `1px solid ${nameInvalid ? SW_COLORS.alarm : SW_COLORS.line}`,
                  fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700,
                  outline: 'none',
                }}
              />
              {nameInvalid && (
                <div style={{
                  marginTop: 4,
                  fontFamily: SW_FONTS.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: SW_COLORS.alarm,
                }}>
                  {trimmedPending.length === 0
                    ? 'Factory name cannot be empty.'
                    : `A saved factory named "${trimmedPending}" already exists. Pick a different name.`}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Default garment</div>
              <HudSelect
                value={project.selectedGarmentId}
                onChange={(v) => project.setSelectedGarment(v)}
                variant="light"
                width="100%"
                options={ALL_GARMENT_TEMPLATES.map((g) => ({ value: g.id, label: g.name }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Default operators</div>
              <input
                type="number" min={4} max={120} value={project.defaultOperators}
                onChange={(e) => project.setDefaultOperators(parseInt(e.target.value) || 25)}
                style={{
                  width: '100%', padding: '8px 10px',
                  borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`,
                  fontFamily: SW_FONTS.mono, fontSize: 14, fontWeight: 700,
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            <Button variant="secondary" icon="⤓" onClick={() => downloadProjectJson(project)}>
              Export .swproj
            </Button>
            <Button
              variant="secondary"
              icon="⤒"
              onClick={async () => {
                try {
                  const data = await pickProjectFile();
                  const result = project.loadProject(data);
                  if (result.ok) setImportMsg({ kind: 'ok', text: 'Project imported.' });
                  else setImportMsg({ kind: 'err', text: result.reason });
                } catch (e) {
                  setImportMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
                }
              }}
            >
              Import .swproj
            </Button>
            <Button
              variant="danger"
              icon="↺"
              onClick={() => {
                if (confirm('Reset the project? Local changes will be lost.')) {
                  project.resetProject();
                  setImportMsg({ kind: 'ok', text: 'Project reset.' });
                }
              }}
            >
              Reset project
            </Button>
            {importMsg && (
              <div
                style={{
                  alignSelf: 'center',
                  padding: '6px 10px',
                  borderRadius: SW_RADIUS.sm,
                  background: importMsg.kind === 'ok' ? `${SW_COLORS.ok}20` : `${SW_COLORS.alarm}20`,
                  color: importMsg.kind === 'ok' ? SW_COLORS.ok : SW_COLORS.alarm,
                  fontSize: 12, fontWeight: 700,
                }}
              >
                {importMsg.text}
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, padding: 10, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.5 }}>
            Project state (factory name, default garment, operator names, Yamazumi overrides, skill matrix) auto-saves to <code style={{ fontFamily: SW_FONTS.mono }}>localStorage</code> on every change. Use Export to share or back up; Import restores from a <code style={{ fontFamily: SW_FONTS.mono }}>.swproj</code> JSON file.
          </div>
        </Card>

        <Card padding={22} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginBottom: 14 }}>SIMULATION</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Slider label="Default sim speed" value={simSpeed} min={0.5} max={10} step={0.5} format={(v) => `${v}×`} onChange={setSimSpeed} />
            <Slider label="Random event rate" value={eventRate} min={0} max={100} format={(v) => `${v}%`} onChange={setEventRate} />
            <Slider label="Operator eff. variance" value={effVariance} min={0} max={50} format={(v) => `±${v}%`} onChange={setEffVariance} />
            <Slider label="Machine breakdown freq." value={breakdowns} min={0} max={10} step={1} format={(v) => `${v}/shift`} onChange={setBreakdowns} />
          </div>
        </Card>

        {/*
          TIME — the three kinds of time a simulation must distinguish.
          Per Big Book of Simulation Modelling (AnyLogic, Ch. 16): model
          time is virtual sim clock; calendar time is its real-date
          projection; wall time is the user's device clock. Each section
          below labels whether it affects engine behaviour or display only.
        */}
        <Card padding={22} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900 }}>TIME</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <TimeChip kind="MODEL" />
              <TimeChip kind="CAL" />
              <TimeChip kind="WALL" />
            </div>
          </div>

          {/* ── Section A: model semantics (affects the engine) ─────────── */}
          <div style={{ marginBottom: 6 }}>
            <Tag soft color={SW_COLORS.brand}>AFFECTS SIMULATION</Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Model time unit</div>
              <ToggleGroup
                value={project.time.modelTimeUnit}
                onChange={(v) => project.setTime('modelTimeUnit', v as ModelTimeUnit)}
                options={[
                  { value: 'second', label: 'Second' },
                  { value: 'minute', label: 'Minute' },
                  { value: 'hour',   label: 'Hour' },
                  { value: 'day',    label: 'Day' },
                ]}
              />
              <div style={{ fontSize: 11, color: SW_COLORS.muted, marginTop: 4 }}>
                What one tick of <code style={{ fontFamily: SW_FONTS.mono }}>t</code> means everywhere in the UI.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Shift duration</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min={30} max={1440} step={30}
                  value={project.time.shiftDurationMin}
                  onChange={(e) => project.setTime('shiftDurationMin', Math.max(30, Math.min(1440, parseInt(e.target.value) || 480)))}
                  style={{
                    width: 88, padding: '8px 10px',
                    borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`,
                    fontFamily: SW_FONTS.mono, fontSize: 13, fontWeight: 700,
                  }}
                />
                <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted }}>min</span>
                <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted }}>
                  = {(project.time.shiftDurationMin / 60).toFixed(1)} h
                </span>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: SW_COLORS.line, margin: '16px 0' }} />

          {/* ── Section B: calendar anchoring (display only) ────────────── */}
          <div style={{ marginBottom: 6 }}>
            <Tag soft color={SW_COLORS.bobbin}>AFFECTS DISPLAY</Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Simulation start date</div>
              <input
                type="date"
                value={project.time.startDate.slice(0, 10)}
                onChange={(e) => {
                  const day = e.target.value;
                  if (!day) return;
                  // Preserve the time-of-day portion of the existing startDate.
                  const existing = new Date(project.time.startDate);
                  const next = new Date(day);
                  if (!Number.isNaN(existing.getTime())) {
                    next.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
                  }
                  project.setTime('startDate', next.toISOString());
                }}
                style={{
                  width: '100%', padding: '8px 10px',
                  borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`,
                  fontFamily: SW_FONTS.mono, fontSize: 13, fontWeight: 700,
                }}
              />
              <div style={{ fontSize: 11, color: SW_COLORS.muted, marginTop: 4 }}>
                Maps <code style={{ fontFamily: SW_FONTS.mono }}>t = 0</code> to this calendar date.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Shift start time-of-day</div>
              <input
                type="time"
                value={fmtMinutesAsHHMM(project.time.shiftStartMinuteOfDay)}
                onChange={(e) => project.setTime('shiftStartMinuteOfDay', parseHHMM(e.target.value))}
                style={{
                  width: '100%', padding: '8px 10px',
                  borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`,
                  fontFamily: SW_FONTS.mono, fontSize: 13, fontWeight: 700,
                }}
              />
            </div>
          </div>

          <div style={{ height: 1, background: SW_COLORS.line, margin: '16px 0' }} />

          {/* ── Section C: execution pacing (affects the engine) ────────── */}
          <div style={{ marginBottom: 6 }}>
            <Tag soft color={SW_COLORS.brand}>AFFECTS SIMULATION</Tag>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Execution mode</div>
            <ToggleGroup
              value={project.time.executionMode}
              onChange={(v) => project.setTime('executionMode', v as 'virtual' | 'realtime')}
              options={[
                { value: 'realtime', label: 'Real-time (paced)' },
                { value: 'virtual',  label: 'Virtual (as fast as possible)' },
              ]}
            />
          </div>

          {project.time.executionMode === 'realtime' && (
            <div style={{ marginTop: 14 }}>
              <Slider
                label="Real-time scale"
                value={project.time.realTimeScale}
                min={1} max={480} step={1}
                format={(v) => `${v}× — ${v} model-${project.time.modelTimeUnit} / real-sec`}
                onChange={(v) => project.setTime('realTimeScale', v)}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[
                  { v: 1,   l: 'Real-time (1×)' },
                  { v: 10,  l: '10×' },
                  { v: 60,  l: 'Fast (1 hr/s)' },
                  { v: 480, l: 'Very fast (shift/s)' },
                ].map((p) => (
                  <Button
                    key={p.v}
                    variant="secondary"
                    onClick={() => project.setTime('realTimeScale', p.v)}
                  >
                    {p.l}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card padding={22} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginBottom: 14 }}>UNITS & FORMAT</div>
          {([
            { k: 'Length',      field: 'length',      opts: ['Meters', 'Yards'] },
            { k: 'Currency',    field: 'currency',    opts: ['USD', 'EUR', 'INR', 'BDT'] },
            { k: 'SAM display', field: 'samDisplay',  opts: ['Minutes', 'Seconds'] },
            { k: 'Date format', field: 'dateFormat',  opts: ['DD/MM', 'MM/DD', 'YYYY-MM-DD'] },
          ] as const).map((r) => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: r.k !== 'Length' ? `1px solid ${SW_COLORS.line}` : 'none' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{r.k}</div>
              <ToggleGroup
                value={project.units[r.field]}
                onChange={(v) => project.setUnit(r.field, v as UnitsPrefs[typeof r.field])}
                options={r.opts.map((o) => ({ value: o, label: o }))}
              />
            </div>
          ))}
        </Card>

        <Card padding={22}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginBottom: 14 }}>GAMIFICATION</div>
          {gamification.map((r, i) => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: i ? `1px solid ${SW_COLORS.line}` : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{r.k}</div>
                <div style={{ fontSize: 11, color: SW_COLORS.muted }}>{r.desc}</div>
              </div>
              <div
                role="switch"
                aria-checked={r.on}
                aria-label={r.k}
                tabIndex={0}
                onClick={() => toggleGamification(i)}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleGamification(i); } }}
                style={{ width: 42, height: 24, background: r.on ? SW_COLORS.brand : SW_COLORS.paperEdge, borderRadius: 24, position: 'relative', cursor: 'pointer', transition: 'background 120ms' }}
              >
                <div style={{ position: 'absolute', top: 2, left: r.on ? 20 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left 100ms', boxShadow: SW_SHADOWS.card }} />
              </div>
            </div>
          ))}
        </Card>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={() => navigate('/')}>Back to menu</Button>
          <Button variant="primary" onClick={() => navigate('/builder')}>Save</Button>
        </div>
      </div>
    </div>
  );
}
