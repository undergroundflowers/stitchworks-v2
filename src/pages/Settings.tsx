import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import { Card, Button, SectionHeader, ToggleGroup, Slider } from '../components';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject, downloadProjectJson, pickProjectFile } from '../store';
import { ALL_GARMENT_TEMPLATES } from '../domain';

export function SettingsPage() {
  const navigate = useNavigate();
  const project = useProject((s) => s);
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Local UI state for the simulation sliders — these are presentational
  // toggles for now; the engine's actual variance lives in buildSimConfig.
  const [simSpeed, setSimSpeed] = useState(2);
  const [eventRate, setEventRate] = useState(30);
  const [effVariance, setEffVariance] = useState(15);
  const [breakdowns, setBreakdowns] = useState(2);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 32, background: SW_COLORS.paperDeep }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <SectionHeader
          kicker="Settings"
          title="Factory & project configuration"
          sub={`Last modified ${new Date(project.meta.modifiedAt).toLocaleString()} · Schema v${project.schemaVersion}`}
        />

        <Card padding={22} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginBottom: 14 }}>PROJECT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Project name</div>
              <input
                value={project.meta.name}
                onChange={(e) => project.rename(e.target.value)}
                style={{
                  marginTop: 4, width: '100%', padding: '8px 10px',
                  borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`,
                  fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700,
                }}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Default garment</div>
              <select
                value={project.selectedGarmentId}
                onChange={(e) => project.setSelectedGarment(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px',
                  borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`,
                  fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 600,
                  background: SW_COLORS.paper,
                }}
              >
                {ALL_GARMENT_TEMPLATES.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
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

        <Card padding={22} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginBottom: 14 }}>UNITS & FORMAT</div>
          {[
            { k: 'Length',      opts: ['Meters', 'Yards'], v: 'Meters' },
            { k: 'Currency',    opts: ['USD', 'EUR', 'INR', 'BDT'], v: 'USD' },
            { k: 'SAM display', opts: ['Minutes', 'Seconds'], v: 'Minutes' },
            { k: 'Date format', opts: ['DD/MM', 'MM/DD', 'YYYY-MM-DD'], v: 'YYYY-MM-DD' },
          ].map((r) => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: r.k !== 'Length' ? `1px solid ${SW_COLORS.line}` : 'none' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{r.k}</div>
              <ToggleGroup value={r.v} onChange={() => { /* presentational */ }} options={r.opts.map((o) => ({ value: o, label: o }))} />
            </div>
          ))}
        </Card>

        <Card padding={22}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginBottom: 14 }}>GAMIFICATION</div>
          {[
            { k: 'XP & badges',     desc: 'Earn XP, unlock badges', on: true },
            { k: 'Difficulty events', desc: 'Random crises (sickness, breakdowns, rush orders)', on: true },
            { k: 'Tutorial hints',  desc: 'Show contextual tips', on: false },
            { k: 'Sound effects',   desc: 'Sewing machines, alerts, chime', on: false },
          ].map((r, i) => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: i ? `1px solid ${SW_COLORS.line}` : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{r.k}</div>
                <div style={{ fontSize: 11, color: SW_COLORS.muted }}>{r.desc}</div>
              </div>
              <div style={{ width: 42, height: 24, background: r.on ? SW_COLORS.brand : SW_COLORS.paperEdge, borderRadius: 24, position: 'relative', cursor: 'pointer' }}>
                <div style={{ position: 'absolute', top: 2, left: r.on ? 20 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left 100ms', boxShadow: SW_SHADOWS.card }} />
              </div>
            </div>
          ))}
        </Card>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={() => navigate('/')}>Back to menu</Button>
          <Button variant="primary" onClick={() => navigate('/twin')}>Save</Button>
        </div>
      </div>
    </div>
  );
}
