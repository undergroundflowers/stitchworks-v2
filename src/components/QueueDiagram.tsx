/**
 * QueueDiagram — classical M/M/c queue iconography for one workstation.
 *
 *   λ → ●●●●● [Lq] → │■│■│□│ → μ        (bottom row: name · classification · ρ bar)
 *
 * Bundles waiting are drawn as dots; servers as boxes (filled if busy, outlined
 * if idle). Fed by live `StationView` values so the picture moves with the
 * simulator. Pure inline SVG/HTML — no charting deps.
 */

import type { CSSProperties } from 'react';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { meanOf, type StationView } from '../simulation';

export interface QueueDiagramProps {
  station: StationView;
  isBottleneck: boolean;
  onClick?: () => void;
}

const MAX_VISIBLE_QUEUE = 12;
const DOT_SIZE = 12;
const DOT_GAP = 4;
const SERVER_SIZE = 28;
const SERVER_GAP = 6;

export function QueueDiagram({ station, isBottleneck, onClick }: QueueDiagramProps) {
  const queueLen = Math.max(0, Math.round(station.queueLen));
  const busy = Math.max(0, Math.min(station.serversTotal, Math.round(station.busy)));
  const visibleDots = Math.min(queueLen, MAX_VISIBLE_QUEUE);
  const overflow = queueLen > MAX_VISIBLE_QUEUE ? queueLen - (MAX_VISIBLE_QUEUE - 1) : 0;
  const dotsToRender = overflow > 0 ? MAX_VISIBLE_QUEUE - 1 : visibleDots;
  const dotColor = queueLen >= station.serversTotal ? SW_COLORS.warn : SW_COLORS.muted;

  const muPerHr = station.serviceDist
    ? 60 / meanOf(station.serviceDist)
    : NaN;

  const rho = station.analytical.rho;
  const rhoColor = rhoToColor(rho);
  const rhoBarPct = Number.isFinite(rho) ? Math.min(100, Math.max(0, rho * 100)) : 100;

  const interactive = !!onClick;
  const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateRows: 'auto auto',
    gap: 8,
    padding: '12px 14px',
    borderRadius: SW_RADIUS.sm,
    border: `1px solid ${isBottleneck ? `${SW_COLORS.alarm}55` : SW_COLORS.line}`,
    background: isBottleneck ? `${SW_COLORS.alarm}08` : SW_COLORS.paper,
    cursor: interactive ? 'pointer' : 'default',
    textAlign: 'left',
    width: '100%',
    font: 'inherit',
    color: SW_COLORS.ink,
    transition: 'background 120ms, border-color 120ms',
  };

  const body = (
    <>
      {/* Top row: arrival · queue · servers · departure */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '88px 1fr auto 88px',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Arrival side */}
        <RateLabel label="λ" rate={station.lambda} caption="ARRIVE" align="left" />

        {/* Queue dots — drawn right-to-left so they back-up against the servers */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: DOT_GAP,
            minHeight: SERVER_SIZE,
            paddingRight: 6,
          }}
        >
          {overflow > 0 && (
            <span
              style={{
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                fontWeight: 800,
                color: SW_COLORS.alarm,
                marginRight: 4,
              }}
            >
              +{overflow}
            </span>
          )}
          {Array.from({ length: dotsToRender }).map((_, i) => (
            <span
              key={i}
              title={`Bundle ${i + 1} in queue`}
              style={{
                display: 'inline-block',
                width: DOT_SIZE,
                height: DOT_SIZE,
                borderRadius: '50%',
                background: dotColor,
                boxShadow: `0 0 0 2px ${dotColor}22`,
              }}
            />
          ))}
          {dotsToRender === 0 && overflow === 0 && (
            <span
              style={{
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                color: SW_COLORS.faint,
                fontStyle: 'italic',
              }}
            >
              empty queue
            </span>
          )}
          <Arrow color={SW_COLORS.faint} />
        </div>

        {/* Server bank */}
        <div
          style={{
            display: 'flex',
            gap: SERVER_GAP,
            padding: '4px 6px',
            border: `1px dashed ${SW_COLORS.line}`,
            borderRadius: SW_RADIUS.sm,
            background: SW_COLORS.paperDeep,
          }}
          title={`c = ${station.serversTotal} server${station.serversTotal === 1 ? '' : 's'} · ${busy} busy`}
        >
          {Array.from({ length: station.serversTotal }).map((_, i) => {
            const isBusy = i < busy;
            return (
              <span
                key={i}
                style={{
                  width: SERVER_SIZE,
                  height: SERVER_SIZE,
                  borderRadius: 4,
                  background: isBusy ? SW_COLORS.brand : 'transparent',
                  border: `1.5px solid ${isBusy ? SW_COLORS.brand : SW_COLORS.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isBusy ? SW_COLORS.paper : SW_COLORS.faint,
                  fontFamily: SW_FONTS.mono,
                  fontSize: 14,
                  fontWeight: 800,
                  animation:
                    isBusy && isBottleneck
                      ? 'sw-pulse-bottleneck 1.4s ease-in-out infinite'
                      : undefined,
                }}
              >
                {isBusy ? '▰' : '▱'}
              </span>
            );
          })}
        </div>

        {/* Departure side */}
        <RateLabel label="μ" rate={muPerHr} caption="DEPART" align="right" />
      </div>

      {/* Bottom row: name · notation · ρ bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr auto',
          alignItems: 'center',
          gap: 12,
          borderTop: `1px solid ${SW_COLORS.line}`,
          paddingTop: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <strong
            style={{
              fontSize: 13,
              color: SW_COLORS.ink,
              fontFamily: SW_FONTS.body,
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {station.opName}
          </strong>
          <span
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 10,
              color: SW_COLORS.muted,
              fontWeight: 700,
              letterSpacing: '0.4px',
            }}
          >
            {station.opCode ?? station.opId}
          </span>
          {isBottleneck && (
            <span
              style={{
                display: 'inline-block',
                padding: '1px 6px',
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.4px',
                background: `${SW_COLORS.alarm}20`,
                color: SW_COLORS.alarm,
                fontFamily: SW_FONTS.mono,
              }}
            >
              BOTTLENECK
            </span>
          )}
        </div>

        <span
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 11,
            color: SW_COLORS.muted,
            letterSpacing: '0.3px',
          }}
        >
          {station.notation.label} · Lq={fmt2(station.analytical.Lq)} · L={fmt2(station.analytical.L)}
        </span>

        <RhoBar pct={rhoBarPct} color={rhoColor} rho={rho} />
      </div>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={containerStyle}
        aria-label={`Open ${station.opName} analysis`}
      >
        {body}
      </button>
    );
  }
  return <div style={containerStyle}>{body}</div>;
}

// ─────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────

function RateLabel({
  label,
  rate,
  caption,
  align,
}: {
  label: string;
  rate: number;
  caption: string;
  align: 'left' | 'right';
}) {
  const ok = Number.isFinite(rate);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 2,
      }}
    >
      <span
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 13,
          fontWeight: 800,
          color: SW_COLORS.ink,
        }}
      >
        {label}={ok ? rate.toFixed(1) : '—'}<span style={{ color: SW_COLORS.muted, fontWeight: 600 }}>/hr</span>
      </span>
      <span
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 9,
          fontWeight: 700,
          color: SW_COLORS.faint,
          letterSpacing: '0.6px',
        }}
      >
        {align === 'left' ? `${caption} →` : `→ ${caption}`}
      </span>
    </div>
  );
}

function Arrow({ color }: { color: string }) {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
      <path
        d="M0 5 L11 5 M7 1 L11 5 L7 9"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RhoBar({ pct, color, rho }: { pct: number; color: string; rho: number }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 156 }}
      title="ρ = utilisation (λ / cμ)"
    >
      <div
        style={{
          position: 'relative',
          width: 100,
          height: 8,
          borderRadius: 4,
          background: `${SW_COLORS.line}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${pct}%`,
            background: color,
            transition: 'width 200ms',
          }}
        />
        {/* threshold ticks at 50, 85, 100 */}
        {[50, 85].map((t) => (
          <span
            key={t}
            style={{
              position: 'absolute',
              left: `${t}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: `${SW_COLORS.paper}90`,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 11,
          fontWeight: 800,
          color,
          minWidth: 36,
          textAlign: 'right',
        }}
      >
        {Number.isFinite(rho) ? `${(rho * 100).toFixed(0)}%` : '∞'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────

function rhoToColor(rho: number): string {
  if (!Number.isFinite(rho)) return SW_COLORS.alarm;
  if (rho >= 1)    return SW_COLORS.alarm;
  if (rho >= 0.85) return SW_COLORS.warn;
  if (rho >= 0.5)  return SW_COLORS.ok;
  return SW_COLORS.muted;
}

function fmt2(v: number): string {
  if (!Number.isFinite(v)) return v === Infinity ? '∞' : '—';
  return v.toFixed(2);
}
