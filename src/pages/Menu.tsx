import { useNavigate } from 'react-router-dom';
import { Card, Button, Tag, Logo } from '../components';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { INITIAL_GAME } from '../lib/game';

/**
 * Splash / main menu — entry point of the app. Two-column layout:
 *   LEFT: brand mark, hero copy, primary CTAs, save slots, footer links
 *   RIGHT: live mini-factory illustration, today's events, recent badges
 *
 * Ported from SWMainMenu in STITCHWORKS.html (lines 1032–1199) plus the
 * MiniIsoFactory illustration (lines 1202–1251) which lives inline below.
 */
export function MenuPage() {
  const navigate = useNavigate();
  const game = INITIAL_GAME;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `
        radial-gradient(circle at 20% 20%, ${SW_COLORS.brandLite}40 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, #4F7CFF18 0%, transparent 50%),
        ${SW_COLORS.paper}
      `,
      display: 'grid', gridTemplateColumns: '1.2fr 1fr',
      overflow: 'auto',
    }}>
      {/* LEFT: hero + quick actions */}
      <div style={{ padding: '64px 56px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Logo size={32}/>

        <div>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, color: SW_COLORS.brand, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 12 }}>
            APPAREL FACTORY DIGITAL TWIN · v0.4
          </div>
          <h1 style={{
            fontFamily: SW_FONTS.display, fontSize: 56, fontWeight: 900,
            margin: 0, lineHeight: 0.95, letterSpacing: '-0.02em', color: SW_COLORS.ink,
            maxWidth: 580,
          }}>
            Build it.<br/>Run it.<br/><span style={{ color: SW_COLORS.brand }}>Optimize it.</span>
          </h1>
          <p style={{ fontSize: 16, color: SW_COLORS.muted, marginTop: 16, maxWidth: 480, lineHeight: 1.5 }}>
            A complete digital twin of your apparel production floor. Place machines, hire operators, run simulations across all 9 production systems, and watch your KPIs respond in real-time.
          </p>
        </div>

        {/* Continue / New */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" onClick={() => navigate('/floor')} icon="▶">
            CONTINUE — {game.factoryName}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate('/scenarios')} icon="✦">
            NEW SCENARIO
          </Button>
        </div>

        {/* Save slots */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '1.5px', marginBottom: 8 }}>
            SAVED FACTORIES · 3 / 5
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { name: 'Stitchworks Demo', mode: 'CAMPAIGN', day: 14, eff: 78 },
              { name: 'Polo Run #4',       mode: 'SCENARIO', day: 3,  eff: 91 },
              { name: 'Test Bench',        mode: 'SANDBOX',  day: 1,  eff: 64 },
            ].map((slot, i) => (
              <Card key={i} hover padding={14} style={{ flex: 1, minWidth: 0 }} onClick={() => navigate('/twin')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Tag soft color={
                    slot.mode === 'CAMPAIGN' ? SW_COLORS.brand :
                    slot.mode === 'SCENARIO' ? SW_COLORS.bobbin :
                    SW_COLORS.fabric
                  }>{slot.mode}</Tag>
                  <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>D{slot.day}</span>
                </div>
                <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 800, color: SW_COLORS.ink, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {slot.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, color: slot.eff >= 80 ? SW_COLORS.ok : SW_COLORS.thread }}>
                    {slot.eff}%
                  </span>
                  <span style={{ fontSize: 9, color: SW_COLORS.muted, fontWeight: 600 }}>EFFICIENCY</span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', gap: 18, fontSize: 11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/settings')}>SETTINGS</span>
          <span>·</span>
          <span style={{ cursor: 'pointer' }}>HELP</span>
          <span>·</span>
          <span style={{ cursor: 'pointer' }}>CHANGELOG</span>
          <span style={{ marginLeft: 'auto' }}>BUILD 0.4.2 · OFFLINE</span>
        </div>
      </div>

      {/* RIGHT: live status + achievements + isometric thumbnail */}
      <div style={{ padding: '64px 56px 64px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Mini factory illustration */}
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{
            height: 240, position: 'relative',
            background: `linear-gradient(135deg, ${SW_COLORS.steel}, ${SW_COLORS.steelLite})`,
            overflow: 'hidden',
          }}>
            <MiniIsoFactory/>
            <div style={{
              position: 'absolute', left: 16, bottom: 12,
              color: '#fff', fontFamily: SW_FONTS.body,
            }}>
              <div style={{ fontSize: 10, fontFamily: SW_FONTS.mono, color: '#ffffffaa', letterSpacing: '1px', fontWeight: 700 }}>LIVE NOW</div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900 }}>Floor 1 · Sewing</div>
              <div style={{ fontSize: 11, color: '#ffffffcc' }}>14 operators · 2 machines down · 184 pcs/hr</div>
            </div>
            <div style={{
              position: 'absolute', right: 14, top: 12,
              display: 'flex', gap: 6,
            }}>
              <Tag color={SW_COLORS.alarm}>● 2 ALERTS</Tag>
            </div>
          </div>
        </Card>

        {/* Today's tasks / events */}
        <Card padding={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 13, fontWeight: 900, color: SW_COLORS.ink }}>TODAY · DAY 14</div>
            <Tag soft color={SW_COLORS.brand} dot>3 EVENTS</Tag>
          </div>
          {[
            { t: '08:30', label: 'PO-4421 dispatch deadline',          color: SW_COLORS.brand },
            { t: '11:15', label: 'Operator OPR-09 sick leave',         color: SW_COLORS.alarm },
            { t: '14:00', label: 'Machine SM-04 scheduled service',    color: SW_COLORS.bobbin },
          ].map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderTop: i > 0 ? `1px solid ${SW_COLORS.line}` : 'none',
              fontSize: 12, color: SW_COLORS.ink,
            }}>
              <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, width: 44 }}>{e.t}</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color }}/>
              <span style={{ flex: 1, fontWeight: 600 }}>{e.label}</span>
            </div>
          ))}
        </Card>

        {/* Recent achievements */}
        <Card padding={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 13, fontWeight: 900 }}>RECENT BADGES</div>
            <span style={{ fontSize: 11, color: SW_COLORS.brand, fontWeight: 700, cursor: 'pointer' }}>View all →</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { icon: '⚡', label: 'Bottleneck Buster', when: 'D12', color: SW_COLORS.thread, locked: false },
              { icon: '◆', label: 'Zero Defects',      when: 'D10', color: SW_COLORS.fabric, locked: false },
              { icon: '⚙', label: 'Modular Master',    when: 'D8',  color: SW_COLORS.bobbin, locked: false },
              { icon: '?', label: 'Locked',            when: '—',   color: SW_COLORS.faint,  locked: true  },
            ].map((a, i) => (
              <div key={i} style={{
                textAlign: 'center', padding: '10px 4px',
                background: a.locked ? SW_COLORS.paperDeep : SW_COLORS.paper,
                border: `1px solid ${a.locked ? SW_COLORS.line : a.color + '40'}`,
                borderRadius: SW_RADIUS.sm,
                opacity: a.locked ? 0.5 : 1,
              }}>
                <div style={{ fontSize: 22, color: a.color, marginBottom: 4 }}>{a.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: SW_COLORS.ink, lineHeight: 1.2 }}>{a.label}</div>
                <div style={{ fontSize: 9, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, marginTop: 2 }}>{a.when}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Mini Isometric Factory illustration ----------------
function MiniIsoFactory() {
  return (
    <svg viewBox="0 0 600 240" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="iso-floor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff10"/>
          <stop offset="1" stopColor="#ffffff02"/>
        </linearGradient>
      </defs>

      {/* floor diamond */}
      <polygon points="300,40 540,140 300,220 60,140" fill="url(#iso-floor)" stroke="#ffffff20" strokeWidth="1"/>

      {/* sewing rows */}
      {[0, 1, 2, 3].flatMap((row) => {
        const y = 100 + row * 22;
        return [0, 1, 2, 3, 4].map((col) => {
          const x = 180 + col * 40 + row * 8;
          const isAct = (row + col) % 3 !== 0;
          return (
            <g key={`${row}-${col}`} transform={`translate(${x}, ${y})`}>
              <polygon points="0,0 18,9 18,22 0,13" fill={isAct ? SW_COLORS.brand : '#ffffff30'} stroke="#000" strokeOpacity="0.2"/>
              <polygon points="18,9 26,5 26,18 18,22" fill={isAct ? SW_COLORS.brandDeep : '#ffffff20'} stroke="#000" strokeOpacity="0.2"/>
              <polygon points="0,0 18,9 26,5 8,-4" fill={isAct ? '#FFD2B5' : '#ffffff20'} stroke="#000" strokeOpacity="0.2"/>
              {isAct && <circle cx="9" cy="-2" r="2.5" fill="#FFE4D6"/>}
            </g>
          );
        });
      })}

      {/* moving bundle dots */}
      <g>
        <circle cx="200" cy="105" r="3" fill={SW_COLORS.thread}>
          <animate attributeName="cx" from="120" to="440" dur="6s" repeatCount="indefinite"/>
          <animate attributeName="cy" from="120" to="180" dur="6s" repeatCount="indefinite"/>
        </circle>
        <circle cx="220" cy="120" r="3" fill={SW_COLORS.fabric}>
          <animate attributeName="cx" from="120" to="440" dur="8s" begin="2s" repeatCount="indefinite"/>
          <animate attributeName="cy" from="120" to="180" dur="8s" begin="2s" repeatCount="indefinite"/>
        </circle>
      </g>

      <text x="300" y="232" textAnchor="middle" fill="#ffffff60" fontFamily={SW_FONTS.mono} fontSize="9">FLOOR 01 · SEWING · 20 STATIONS</text>
    </svg>
  );
}
