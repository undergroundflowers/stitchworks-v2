/**
 * Operator load — how busy each PERSON was over the run.
 *
 * The station table above it answers "how busy is this machine". On a line
 * where every operator has one station the two are the same number and this
 * panel would be a repeat. They part company the moment one operator covers
 * two stations: each station can sit at 40 % while the person running both is
 * flat out, and that person — not either machine — is the line's limit. This
 * is the chart a line-balancing study is read from.
 *
 * It also carries the one fact about a run that no per-station figure holds:
 * whether it ran the whole shift or stopped the moment its output target was
 * met, and when.
 */

import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_TYPE } from '../design/tokens';
import { alpha } from '../design/color-utils';
import type { Twin } from '../domain/twin';
import type { OperatorObserved } from '../simulation/pml-engine';
import type { SimRunSlot } from '../simulation/useSimSession';

/**
 * The bands the station table uses for ρ (`rhoColor` in QueueIndex), so a
 * colour means the same thing on a person as on a machine. "Saturated" is
 * whatever prints as 100 %: a utilisation is capped at 1 and a flat-out
 * operator lands a hair under it.
 */
function loadColor(u: number): string {
  if (Math.round(u * 100) >= 100) return SW_COLORS.alarm;
  if (u >= 0.85) return SW_COLORS.warn;
  if (u >= 0.5) return SW_COLORS.ok;
  return SW_COLORS.muted;
}

function minutesLabel(min: number): string {
  const rounded = Math.round(min * 10) / 10;
  return `${rounded.toLocaleString()} min`;
}

export function OperatorLoadPanel({ runs, twin }: { runs: SimRunSlot[]; twin: Twin }) {
  const withCrew = runs.filter((r) => (r.result?.operators.length ?? 0) > 0);
  if (withCrew.length === 0) return null;

  const stationName = new Map(twin.workstations.map((w) => [w.id, w.name]));
  const lineName = new Map((twin.lines ?? []).map((l) => [l.id, l.name]));

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ ...SW_TYPE.subhead, color: SW_COLORS.ink }}>Operator load</div>
      <div style={{ ...SW_TYPE.caption, color: SW_COLORS.muted, marginTop: 4, maxWidth: 620 }}>
        Share of the run each operator spent sewing. An operator who covers two
        stations is counted once, across both.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 16,
          marginTop: 14,
        }}
      >
        {withCrew.map((run) => {
          const result = run.result!;
          const crew = result.operators;
          const busiest = crew.reduce((m, o) => Math.max(m, o.utilization), 0);
          const mean = crew.reduce((s, o) => s + o.utilization, 0) / crew.length;
          return (
            <div
              key={run.lineId}
              style={{
                background: SW_COLORS.paper,
                border: `1px solid ${SW_COLORS.lineSoft}`,
                borderRadius: SW_RADIUS.md,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ ...SW_TYPE.heading, color: SW_COLORS.ink }}>
                  {lineName.get(run.lineId) ?? run.lineName}
                </div>
                <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted }}>
                  {crew.length} operators · mean {Math.round(mean * 100)}% · busiest{' '}
                  {Math.round(busiest * 100)}%
                </div>
              </div>

              {/* How the run ended. A stopped run is the answer to "how long
                  does the order take", so the time is the headline. */}
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  borderRadius: SW_RADIUS.sm,
                  background: result.stoppedAtTarget
                    ? alpha(SW_COLORS.brand, 0.12)
                    : alpha(SW_COLORS.ink, 0.05),
                  fontFamily: SW_FONTS.mono,
                  fontSize: 11,
                  color: result.stoppedAtTarget ? SW_COLORS.brandText : SW_COLORS.muted,
                }}
              >
                {result.stoppedAtTarget
                  ? `Reached ${result.totalProduced.toLocaleString()} pcs at ${minutesLabel(result.durationMin)} — run stopped at its output target`
                  : `Ran ${minutesLabel(result.durationMin)} · ${result.totalProduced.toLocaleString()} pcs finished`}
              </div>

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {crew.map((o) => (
                  <OperatorRow key={o.operatorId} operator={o} stationName={stationName} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OperatorRow({
  operator: o,
  stationName,
}: {
  operator: OperatorObserved;
  stationName: Map<string, string>;
}) {
  const color = loadColor(o.utilization);
  const pct = Math.round(o.utilization * 100);
  // Serve order is only worth a number when it actually differs.
  const ranked = o.mode === 'onDemand' && new Set(o.stations.map((s) => s.priority)).size > 1;
  const covers = o.stations
    .map((s) => {
      const name = stationName.get(s.wsId) ?? s.wsId;
      return ranked ? `${s.priority}· ${name}` : name;
    })
    .join('  +  ');
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '62px minmax(0, 1fr) 120px 40px',
        alignItems: 'center',
        gap: 10,
      }}
      title={o.stations
        .map((s) => `${stationName.get(s.wsId) ?? s.wsId}: ${Math.round(s.busyMin)} min`)
        .join('\n')}
    >
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, color: SW_COLORS.ink }}>
        {o.name}
      </div>
      <div
        style={{
          ...SW_TYPE.caption,
          color: SW_COLORS.muted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {o.mode !== 'dedicated' && (
          <span
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: SW_COLORS.brandText,
              marginRight: 6,
            }}
          >
            {o.mode === 'onDemand' ? 'ON DEMAND' : 'SPLIT'}
          </span>
        )}
        {covers}
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: alpha(SW_COLORS.ink, 0.08),
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 12,
          fontWeight: 700,
          color,
          textAlign: 'right',
        }}
      >
        {pct}%
      </div>
    </div>
  );
}
