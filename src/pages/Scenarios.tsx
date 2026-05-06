import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import { Card, Button, Tag, SectionHeader, ToggleGroup } from '../components';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function ScenariosPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'SANDBOX' | 'SCENARIO' | 'CAMPAIGN'>('SCENARIO');

  const scenarios = [
    { id: 'A1', stars: 3, title: '500 Polos in 3 Days', diff: 'EASY',   prize: 12000, brief: 'Existing line, modest order. Perfect first run.', pic: SW_COLORS.fabric },
    { id: 'A2', stars: 2, title: 'Absenteeism Crisis',  diff: 'MEDIUM', prize: 18000, brief: '40% of operators sick. Reassign and survive.',     pic: SW_COLORS.alarm },
    { id: 'A3', stars: 1, title: 'New Style Intro',     diff: 'MEDIUM', prize: 22000, brief: 'Switch from polos to button-up shirts mid-shift.', pic: SW_COLORS.bobbin },
    { id: 'A4', stars: 0, title: 'Bottleneck Buster',   diff: 'HARD',   prize: 28000, brief: 'Find and break the worst bottleneck without new hires.', pic: SW_COLORS.thread },
    { id: 'A5', stars: 0, title: 'Zero Defects Run',    diff: 'HARD',   prize: 35000, brief: '<0.5% defect rate while hitting 1200 pcs target.', pic: SW_COLORS.brand },
    { id: 'A6', stars: 0, title: 'Modular Migration',   diff: 'EXPERT', prize: 50000, brief: 'Convert PBS line to TSS modular. Layout & staff.',  pic: SW_COLORS.trim, locked: true },
  ];

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: SW_COLORS.paperDeep, padding: 32 }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <SectionHeader
          kicker="Choose mode"
          title="Start a new game"
          sub="Pick how you want to play. Switch any time from the main menu."
          right={
            <ToggleGroup value={mode} onChange={setMode} options={[
              { value: 'SANDBOX',  label: 'Sandbox' },
              { value: 'SCENARIO', label: 'Scenarios' },
              { value: 'CAMPAIGN', label: 'Campaign' },
            ]}/>
          }
        />

        <Card padding={20} style={{ marginBottom: 22 }} accent={
          mode === 'SANDBOX' ? SW_COLORS.fabric :
          mode === 'SCENARIO' ? SW_COLORS.bobbin :
          SW_COLORS.brand
        }>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: SW_RADIUS.md,
              background:
                mode === 'SANDBOX' ? `${SW_COLORS.fabric}15` :
                mode === 'SCENARIO' ? `${SW_COLORS.bobbin}15` :
                `${SW_COLORS.brand}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
              color:
                mode === 'SANDBOX' ? SW_COLORS.fabric :
                mode === 'SCENARIO' ? SW_COLORS.bobbin :
                SW_COLORS.brand,
            }}>
              {mode === 'SANDBOX' ? '◰' : mode === 'SCENARIO' ? '✦' : '◆'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900 }}>
                {mode === 'SANDBOX' && 'Sandbox · build your own'}
                {mode === 'SCENARIO' && 'Scenarios · 24 challenges'}
                {mode === 'CAMPAIGN' && 'Campaign · 12 chapters · 90 days'}
              </div>
              <div style={{ fontSize: 13, color: SW_COLORS.muted, marginTop: 4 }}>
                {mode === 'SANDBOX' && 'Empty floor. Unlimited budget. Place anything, run any production system, edit time freely. No win condition — just build.'}
                {mode === 'SCENARIO' && 'Discrete challenges, each a 1-3 day production problem. Earn currency and stars based on how well you hit the target.'}
                {mode === 'CAMPAIGN' && 'Story mode. Start with a small line, grow into a multi-floor factory across 90 simulated days. Real consequences, persistent state.'}
              </div>
            </div>
            <Button variant="primary" size="lg" onClick={() => navigate(mode === 'SANDBOX' ? '/twin' : '/orders')}>
              {mode === 'SANDBOX' ? 'Start Sandbox' : 'Pick a scenario'} →
            </Button>
          </div>
        </Card>

        {mode === 'SCENARIO' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {scenarios.map(s => (
              <Card key={s.id} hover padding={0} style={{ overflow: 'hidden', opacity: s.locked ? 0.55 : 1 }}
                onClick={s.locked ? undefined : () => navigate('/orders')}>
                <div style={{
                  height: 110,
                  background: `linear-gradient(135deg, ${s.pic}, ${s.pic}aa)`,
                  position: 'relative',
                }}>
                  <div style={{ position: 'absolute', top: 10, left: 12, color: '#fff' }}>
                    <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, opacity: 0.85, letterSpacing: '1px' }}>
                      {s.id} · {s.diff}
                    </div>
                  </div>
                  <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 2 }}>
                    {[0,1,2].map(i => (
                      <span key={i} style={{ color: i < s.stars ? '#FFE066' : '#ffffff40', fontSize: 16 }}>★</span>
                    ))}
                  </div>
                  {s.locked && (
                    <div style={{ position: 'absolute', inset: 0, background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 800 }}>
                      🔒  Complete A4 to unlock
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 10, left: 12, fontFamily: SW_FONTS.display, color: '#fff', fontSize: 17, fontWeight: 900, lineHeight: 1.1 }}>
                    {s.title}
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, color: SW_COLORS.muted, lineHeight: 1.5, minHeight: 36 }}>{s.brief}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, fontWeight: 700 }}>PRIZE</span>
                    <span style={{ fontFamily: SW_FONTS.mono, fontSize: 14, fontWeight: 800, color: SW_COLORS.thread }}>${s.prize.toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {mode === 'CAMPAIGN' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 1, name: 'Garage Lab', day: '01-08',  status: 'DONE',     desc: 'Single sewing machine, learn the ropes.', score: 3 },
              { id: 2, name: 'First Order', day: '08-14', status: 'DONE',     desc: '50 t-shirts for a local retailer. Don\'t miss deadline.', score: 2 },
              { id: 3, name: 'Hire Up',     day: '14-21', status: 'ACTIVE',   desc: 'Triple your operator count, expand to 3 lines.', score: null },
              { id: 4, name: 'New Style',   day: '21-28', status: 'LOCKED',   desc: 'Add dress shirts to the production mix.', score: null },
              { id: 5, name: 'Bigger Floor',day: '28-42', status: 'LOCKED',   desc: 'Lease the next-door unit. Wash + finishing.', score: null },
              { id: 6, name: 'Big Brand',   day: '42-60', status: 'LOCKED',   desc: '5000-piece export order. Don\'t fail.', score: null },
            ].map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: 16,
                background: c.status === 'ACTIVE' ? SW_COLORS.paper : (c.status === 'LOCKED' ? SW_COLORS.paperDeep : SW_COLORS.paper),
                border: `1px solid ${c.status === 'ACTIVE' ? SW_COLORS.brand : SW_COLORS.line}`,
                borderRadius: SW_RADIUS.md,
                opacity: c.status === 'LOCKED' ? 0.55 : 1,
                boxShadow: c.status === 'ACTIVE' ? `0 0 0 3px ${SW_COLORS.brand}25` : SW_SHADOWS.card,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: c.status === 'DONE' ? SW_COLORS.ok : (c.status === 'ACTIVE' ? SW_COLORS.brand : SW_COLORS.paperEdge),
                  color: c.status === 'LOCKED' ? SW_COLORS.muted : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900,
                }}>{c.status === 'DONE' ? '✓' : (c.status === 'LOCKED' ? '🔒' : c.id)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900 }}>Ch. {c.id} · {c.name}</span>
                    <Tag soft color={c.status === 'ACTIVE' ? SW_COLORS.brand : (c.status === 'DONE' ? SW_COLORS.ok : SW_COLORS.muted)}>
                      {c.status}
                    </Tag>
                    <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted, fontWeight: 600 }}>DAY {c.day}</span>
                  </div>
                  <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 2 }}>{c.desc}</div>
                </div>
                {c.score != null && (
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[0,1,2].map(i => <span key={i} style={{ color: i < (c.score as number) ? SW_COLORS.thread : SW_COLORS.paperEdge, fontSize: 16 }}>★</span>)}
                  </div>
                )}
                {c.status === 'ACTIVE' && (
                  <Button variant="primary" onClick={() => navigate('/twin')}>Continue →</Button>
                )}
              </div>
            ))}
          </div>
        )}

        {mode === 'SANDBOX' && (
          <Card padding={28}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
              {[
                { name: 'Empty Floor',   sub: '5000 sqft, no machines',    cost: 'FREE' },
                { name: 'Starter Line',  sub: '10 machines, 12 operators', cost: '$25,000' },
                { name: 'Mid Factory',   sub: '3 lines, 35 operators',     cost: '$120,000' },
              ].map((t, i) => (
                <div key={i} style={{ border: `1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.md, padding: 18, cursor: 'pointer' }} onClick={() => navigate('/layout')}>
                  <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 4 }}>{t.sub}</div>
                  <div style={{ fontFamily: SW_FONTS.mono, fontSize: 13, fontWeight: 800, color: SW_COLORS.brand, marginTop: 12 }}>{t.cost}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
