/**
 * Onboarding — 3-step first-run intro modal.
 *
 * Ported from SWOnboarding in STITCHWORKS.html. The modal stores `step` and
 * `factory` state internally; the parent receives the result via `onFinish`.
 */

import { useState } from 'react';
import { Button } from '../components';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';

export interface OnboardingProps {
  onFinish: (skipped: boolean) => void;
}

interface StepDef {
  kicker: string;
  title: string;
  sub: string;
}

interface FactoryDef {
  id: 'small' | 'mid' | 'large';
  name: string;
  sub: string;
  best: string;
  cells: string;
}

const STEPS: StepDef[] = [
  {
    kicker: 'STEP 01 / 03',
    title: 'Pick your factory',
    sub: "Three starter floors, each with its own line count, operator pool, and machine mix. You can change everything later — this just sets your sandbox.",
  },
  {
    kicker: 'STEP 02 / 03',
    title: 'Meet your floor',
    sub: "Every factory is a chain of zones — fabric in, garments out. You'll watch operators, trolleys and bundles move through these zones in real time. Color tells you the health of each station.",
  },
  {
    kicker: 'STEP 03 / 03',
    title: 'Your first shift',
    sub: "Hit play. Tweak the role knobs at the bottom — add cutters when QC starves, drop sewing ops when WIP piles up. Hit on-time targets to earn XP and unlock new scenarios.",
  },
];

const FACTORIES: FactoryDef[] = [
  { id: 'small', name: 'Small Workshop', sub: '1 line · 18 ops · $40k', best: 'Learn the basics', cells: '5×7' },
  { id: 'mid', name: 'Mid Factory', sub: '3 lines · 35 ops · $120k', best: 'Most balanced', cells: '10×12' },
  { id: 'large', name: 'Large Plant', sub: '6 lines · 80 ops · $300k', best: 'Real challenge', cells: '18×16' },
];

export function Onboarding({ onFinish }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [factory, setFactory] = useState<FactoryDef['id']>('mid');

  const finish = (skipped: boolean) => {
    try {
      localStorage.setItem('sw_onboarded', '1');
    } catch {
      /* no-op */
    }
    onFinish(skipped);
  };

  const cur = STEPS[step];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: SW_COLORS.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: SW_FONTS.body,
      }}
    >
      <div
        style={{
          width: 'min(960px, 92vw)',
          height: 'min(620px, 92vh)',
          background: SW_COLORS.paper,
          border: `2px solid ${SW_COLORS.ink}`,
          borderRadius: SW_RADIUS.lg,
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Left rail — brand + step list */}
        <div
          style={{
            background: SW_COLORS.ink,
            color: SW_COLORS.paper,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <svg width="28" height="28" viewBox="0 0 32 32">
              <rect x="2" y="2" width="28" height="28" rx="5" fill={SW_COLORS.brand} />
              <path
                d="M9 9 L23 9 M9 16 L23 16 M9 23 L23 23"
                stroke="#fff"
                strokeWidth="2.4"
                strokeLinecap="square"
                strokeDasharray="2 2"
              />
              <path
                d="M9 9 Q9 16 23 16 Q23 23 9 23"
                stroke="#fff"
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="square"
              />
            </svg>
            <div>
              <div
                style={{
                  fontFamily: SW_FONTS.display,
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: '-0.01em',
                }}
              >
                STITCHWORKS
              </div>
              <div
                style={{
                  fontFamily: SW_FONTS.mono,
                  fontSize: 9,
                  color: '#ffffff80',
                  letterSpacing: '1.5px',
                  fontWeight: 700,
                }}
              >
                WELCOME, SUPERVISOR
              </div>
            </div>
          </div>

          {/* Step list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div
                  key={i}
                  onClick={() => setStep(i)}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                    opacity: active ? 1 : done ? 0.85 : 0.45,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      background: done ? SW_COLORS.ok : active ? SW_COLORS.brand : '#ffffff15',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: SW_FONTS.display,
                      fontWeight: 900,
                      fontSize: 12,
                      borderRadius: SW_RADIUS.sm,
                      flexShrink: 0,
                    }}
                  >
                    {done ? '✓' : i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: SW_FONTS.mono,
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#ffffff80',
                        letterSpacing: '1.5px',
                      }}
                    >
                      STEP 0{i + 1}
                    </div>
                    <div
                      style={{
                        fontFamily: SW_FONTS.display,
                        fontSize: 13,
                        fontWeight: 900,
                        marginTop: 2,
                      }}
                    >
                      {s.title}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            onClick={() => finish(true)}
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 10,
              fontWeight: 700,
              color: '#ffffff60',
              letterSpacing: '1.5px',
              cursor: 'pointer',
              borderTop: '1px solid #ffffff15',
              paddingTop: 14,
            }}
          >
            SKIP TUTORIAL →
          </div>
        </div>

        {/* Right pane — step content */}
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 10,
              fontWeight: 700,
              color: SW_COLORS.brand,
              letterSpacing: '2px',
            }}
          >
            {cur.kicker}
          </div>
          <div
            style={{
              fontFamily: SW_FONTS.display,
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              marginTop: 4,
            }}
          >
            {cur.title}
          </div>
          <div
            style={{
              fontSize: 14,
              color: SW_COLORS.muted,
              lineHeight: 1.5,
              marginTop: 10,
              maxWidth: 520,
            }}
          >
            {cur.sub}
          </div>

          {/* Step body */}
          <div style={{ flex: 1, marginTop: 22, minHeight: 0, overflow: 'auto' }}>
            {step === 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {FACTORIES.map((f) => {
                  const sel = factory === f.id;
                  const lineCount = f.id === 'small' ? 2 : f.id === 'mid' ? 4 : 6;
                  const lineGap = f.id === 'small' ? 14 : f.id === 'mid' ? 7 : 5;
                  return (
                    <div
                      key={f.id}
                      onClick={() => setFactory(f.id)}
                      style={{
                        border: `2px solid ${sel ? SW_COLORS.ink : SW_COLORS.line}`,
                        background: sel ? SW_COLORS.brandLite : SW_COLORS.paper,
                        borderRadius: SW_RADIUS.md,
                        padding: 14,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        transition: 'border-color 100ms',
                      }}
                    >
                      <svg viewBox="0 0 100 60" style={{ width: '100%', height: 70 }}>
                        <rect
                          x="2"
                          y="14"
                          width="96"
                          height="42"
                          fill={SW_COLORS.paperDeep}
                          stroke={SW_COLORS.steel}
                          strokeWidth="1"
                        />
                        {Array.from({ length: lineCount }).map((_, i) => {
                          const y = 18 + i * lineGap;
                          return (
                            <line
                              key={i}
                              x1="6"
                              y1={y}
                              x2="94"
                              y2={y}
                              stroke={f.id === 'mid' ? SW_COLORS.brand : SW_COLORS.bobbin}
                              strokeWidth="1.5"
                              strokeDasharray="2 2"
                            />
                          );
                        })}
                        <rect x="2" y="2" width="20" height="12" fill={SW_COLORS.brand} />
                        <text
                          x="6"
                          y="11"
                          fontFamily={SW_FONTS.mono}
                          fontSize="6"
                          fontWeight="700"
                          fill="#fff"
                        >
                          {f.cells}
                        </text>
                      </svg>
                      <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900 }}>
                        {f.name}
                      </div>
                      <div
                        style={{
                          fontFamily: SW_FONTS.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          color: SW_COLORS.muted,
                          letterSpacing: '0.5px',
                        }}
                      >
                        {f.sub}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: SW_COLORS.steel,
                          marginTop: 'auto',
                        }}
                      >
                        Best for: <strong>{f.best}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  {[
                    { l: 'FABRIC', c: '#FFE9D9', s: '#FF5B26' },
                    { l: 'CUTTING', c: '#D7F5E5', s: '#1FB36B' },
                    { l: 'SEWING', c: '#D6E2FF', s: '#4F7CFF' },
                    { l: 'QC+PRESS', c: '#FFD7DD', s: '#C73E5F' },
                    { l: 'DISPATCH', c: '#CFEFEF', s: '#0EA5A4' },
                  ].map((z, i) => (
                    <div
                      key={i}
                      style={{
                        background: z.c,
                        border: `2px solid ${z.s}`,
                        borderRadius: SW_RADIUS.sm,
                        padding: '14px 8px',
                        textAlign: 'center',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: z.s,
                        }}
                      />
                      <div
                        style={{
                          fontFamily: SW_FONTS.display,
                          fontSize: 11,
                          fontWeight: 900,
                          marginTop: 12,
                        }}
                      >
                        {z.l}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { dot: SW_COLORS.ok, label: 'GREEN', desc: 'Flowing well — utilization 40-75%, no WIP build-up.' },
                    { dot: SW_COLORS.thread, label: 'AMBER', desc: 'Busy 75-92% — close to limit, watch it.' },
                    { dot: SW_COLORS.alarm, label: 'RED', desc: 'Choking — WIP piling up, throttle is here.' },
                    { dot: SW_COLORS.bobbin, label: 'BLUE', desc: 'Starved — no work arriving, upstream is the issue.' },
                  ].map((row, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: 10,
                        background: SW_COLORS.paperDeep,
                        borderRadius: SW_RADIUS.sm,
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: row.dot,
                          marginTop: 4,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div
                          style={{
                            fontFamily: SW_FONTS.display,
                            fontSize: 12,
                            fontWeight: 900,
                            letterSpacing: '0.05em',
                          }}
                        >
                          {row.label}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: SW_COLORS.muted,
                            marginTop: 2,
                            lineHeight: 1.4,
                          }}
                        >
                          {row.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { n: '01', t: 'Hit play ▶', d: 'The shift clock starts. Bundles flow, KPIs update on the right rail.' },
                  { n: '02', t: 'Read the coach', d: 'A floating tip calls out the bottleneck in plain English. Trust it — it watches every zone.' },
                  { n: '03', t: 'Tweak role knobs', d: '+1 cutter, -1 packer. The util bars on each role card show exactly who is over- and under-loaded.' },
                  { n: '04', t: 'Hit your target', d: 'Beat 480 pcs/shift to bank XP, currency and unlock harder scenarios.' },
                ].map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: 12,
                      background: SW_COLORS.paperDeep,
                      border: `1px solid ${SW_COLORS.line}`,
                      borderRadius: SW_RADIUS.sm,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: SW_FONTS.display,
                        fontSize: 22,
                        fontWeight: 900,
                        color: SW_COLORS.brand,
                        lineHeight: 1,
                        minWidth: 36,
                      }}
                    >
                      {row.n}
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: SW_FONTS.display,
                          fontSize: 14,
                          fontWeight: 900,
                        }}
                      >
                        {row.t}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: SW_COLORS.muted,
                          marginTop: 2,
                          lineHeight: 1.4,
                        }}
                      >
                        {row.d}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 18,
              paddingTop: 14,
              borderTop: `1px solid ${SW_COLORS.line}`,
            }}
          >
            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 6 }}>
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === step ? 22 : 6,
                    height: 6,
                    background: i <= step ? SW_COLORS.ink : SW_COLORS.line,
                    borderRadius: 3,
                    transition: 'width 200ms',
                  }}
                />
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)}>
                ← Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Next →
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon="▶" onClick={() => finish(false)}>
                Start my shift
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
