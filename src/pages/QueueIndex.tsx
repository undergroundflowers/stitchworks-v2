/**
 * Queue Analysis index — one row per workstation on the sewing lines in
 * scope, showing the Kendall–Lee classification and the measured ρ̂ / L̄q
 * beside the closed-form ρ / Lq they should converge to.
 *
 * The table is the ONLY per-station view here. There used to be a second one
 * below it — a strip per station drawing the queue as dots and server boxes —
 * and a third on its own tab, the Diagnosis cards. All three were keyed by
 * the same stations, so the picture and the verdict are columns now: the
 * queue is drawn in the row, and what is wrong with a station is the REMARKS
 * cell at the end of it.
 *
 * Sim and theory sit in ADJACENT columns on purpose. The table used to print
 * only the analytical values under bare "ρ" and "Lq" headers, which read as
 * observations — so a station could look perfectly healthy while the run
 * disagreed, and nothing on screen would say so.
 *
 * This is the top-level entry point for the queueing-theory module: pick a
 * station here, drill in for the deep view.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  DataTable,
  LineRemarks,
  LineScopePicker,
  LineSimEmpty,
  SectionHeader,
  StationRemark,
  WipSparkline,
  Sym,
  useToast,
  type DataTableColumn,
} from '../components';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { alpha } from '../design/color-utils';
import { meanOf, type StationView } from '../simulation';
import { useLineSim } from '../simulation/useLineSim';
import { useSimSession } from '../simulation/useSimSession';
import { useTwin } from '../store/twin';
import {
  applyPatch,
  constraintIndex,
  describePatch,
  diagnoseQueues,
  lineFindings,
  stationFindings,
  type QueueFinding,
} from '../domain/queue-advisor';
import { DRILL_PATHS } from '../lib/routes';

export interface QueueIndexPageProps {
  /** Rendered inside another surface (INSIGHTS): drop the page chrome and the
   *  outer scroll container so the host owns both. */
  embedded?: boolean;
}

export function QueueIndexPage({ embedded = false }: QueueIndexPageProps = {}) {
  const navigate = useNavigate();
  // The user's OWN lines, through the shared session — not a throwaway line
  // synthesised from the selected garment template, which is what this page
  // used to analyse.
  const { state, lines, allLines, twin, emptyReason, unassignedStationCount } = useLineSim();
  const step = useSimSession((s) => s.step);
  const reset = useSimSession((s) => s.reset);
  const toast = useToast();
  const createScenarioFromTwin = useTwin((s) => s.createScenarioFromTwin);

  const findings = useMemo(
    () =>
      diagnoseQueues({
        stations: state.stations,
        line: lines.length === 1 ? lines[0] : null,
        shiftMin: 480,
        produced: state.producedPieces,
      }),
    [state.stations, state.producedPieces, lines],
  );

  /**
   * Applying a fix forks the twin into a scenario rather than editing in
   * place: every remark is safe to try, the before/after comparison is a real
   * one, and "undo" is re-selecting the parent.
   */
  const apply = (finding: QueueFinding) => {
    if (!finding.patch) return;
    if (finding.patch.kind === 'rebalance') {
      // Rebalancing changes several stations at once, and the Line Balance
      // report is where that is done — with the bottleneck named, the pitch
      // line drawn, and a channel control on each station. Insights owns
      // `?tab=`; the Reports sub-tab is `?report=`.
      navigate('/insights?tab=reports&report=balance', { replace: true });
      return;
    }
    const label = describePatch(finding.patch, state.stations);
    createScenarioFromTwin({
      name: label,
      notes: `Applied from Insights: ${finding.title}`,
      twin: applyPatch(twin, finding.patch),
      activate: true,
    });
    toast({
      kind: 'success',
      message: `${label} — applied as a new scenario. Every surface now reads it; switch back on the Reports → Scenarios tab.`,
      duration: 7000,
    });
  };

  // The tagged row is the advisor's constraint, not the engine's live
  // bottleneck, so the BOTTLENECK tag and the remark that explains it can
  // never land on different rows.
  const bottleneckIdx = constraintIndex(state.stations);
  const subject = lines.length === 1 ? lines[0].name : `${lines.length} sewing lines`;

  if (emptyReason) {
    return (
      <div style={{ padding: '20px 24px', height: '100%' }}>
        <LineSimEmpty
          reason={emptyReason}
          unassignedStationCount={unassignedStationCount}
          what="Queueing analysis"
        />
      </div>
    );
  }

  return (
    <div
      style={
        embedded
          ? { display: 'flex', flexDirection: 'column', gap: 16 }
          : {
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: '20px 24px',
              height: '100%',
              overflow: 'auto',
            }
      }
    >
      {!embedded && (
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              letterSpacing: '0.6px',
              color: SW_COLORS.muted,
              textTransform: 'uppercase',
            }}
          >
            Σ · Queueing-theory analysis
          </div>
          <div style={{ marginTop: 6 }}>
            <LineScopePicker lines={allLines} />
          </div>
          <h1
            style={{
              fontFamily: SW_FONTS.display,
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: SW_COLORS.ink,
              margin: '6px 0 0 0',
            }}
          >
            Stations on {subject}
          </h1>
          <div style={{ fontSize: 13, color: SW_COLORS.muted, marginTop: 4 }}>
            One row per workstation, classified in Kendall–Lee notation and
            evaluated against Naidu's closed-form formulas alongside the
            simulator's observed values. Click any row to open the per-station
            inspector.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={navBtn()}
            title="Rewind the shared sim clock to the start of the shift"
          >
            ⟲ Rewind
          </button>
          <button
            type="button"
            onClick={() => step(60)}
            style={{ ...navBtn(), background: SW_COLORS.brand, color: SW_COLORS.paper, border: 'none' }}
            title="Advance sim by 1 hour"
          >
            +1 hr
          </button>
          <button
            type="button"
            onClick={() => navigate('/queues/analytics')}
            style={navBtn()}
            title="Open the time-series view"
          >
            Compare stations →
          </button>
        </div>
      </header>
      )}

      <Card>
        <SectionHeader title="Workstations" />
        <LineRemarks
          findings={lineFindings(findings)}
          stations={state.stations}
          onApply={apply}
        />
        <StationTable
          stations={state.stations}
          bottleneckIdx={bottleneckIdx}
          findings={findings}
          onApply={apply}
          onPick={(wsId) => navigate(DRILL_PATHS.workstation('sewing', wsId, 'queues'))}
        />
      </Card>

      {/* The chart and the instructions are two columns, not two stacked
          bands. The how-to is read once, beside something worth looking at;
          stacked, it sat below the fold at the moment it was any use. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.75fr) minmax(280px, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Card>
          <SectionHeader title="Line WIP over time" />
          <div style={{ fontSize: 13, color: SW_COLORS.muted, margin: '4px 0 12px' }}>
            Every bundle on the line — <Sym quantity="L" /> summed over stations.
          </div>
          <WipSparkline history={state.history} height={180} />
        </Card>

        <Card>
          <SectionHeader title="How to use this view" />
          <ol style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
            <li>
              <strong>Spot the bottleneck</strong> — the row tagged{' '}
              <Tag color={SW_COLORS.alarm}>BOTTLENECK</Tag> has the highest{' '}
              <Sym quantity="rho" /> sim and caps what the line can deliver.
            </li>
            <li>
              <strong>Read its remark</strong> — what is wrong at that station, and the fix.
              Click the remark for the reasoning; Apply tries the fix as a new scenario.
            </li>
            <li>
              <strong>Read the queue</strong> — Queue now and Busy are this instant.{' '}
              <Sym quantity="rho" />, <Sym quantity="Lq" /> and <Sym quantity="L" /> are
              averages over the run, sim beside theory.
            </li>
            <li>
              <strong>Open a station</strong> — click its row to change the service-time
              distribution or give it a finite buffer.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────

/**
 * One row per workstation.
 *
 * Fifteen columns of dense classification and measurement, which is exactly
 * the case a fixed layout cannot serve: `Operation` needs room for a real op
 * name, `ρ theory` needs six characters forever. So the widths here are only
 * a starting point — every rule between headers is draggable, and the choice
 * is remembered.
 *
 * Two kinds of number sit side by side and the headers keep them apart:
 * `Queue now` and `Busy` are the simulator's state at this instant (they are
 * the dots and server boxes the old strip drew), while every ρ / Lq / L is an
 * average over the run. REMARKS is pinned to the right edge, because the
 * table is wider than its card and the verdict is not something to scroll for.
 *
 * This used to band alternate rows with a hard-coded `#FAF7F0`, a light-theme
 * cream left behind by the move to the Control Room ground. On near-black
 * paper that band was a white slab under near-white text: every second row
 * was unreadable. Rows are separated by a hairline now, and the only row that
 * carries colour is the one that has earned it — the bottleneck.
 */
function StationTable({
  stations,
  bottleneckIdx,
  findings,
  onApply,
  onPick,
}: {
  stations: StationView[];
  bottleneckIdx: number;
  /** Every finding on the line; each row picks out its own. */
  findings: QueueFinding[];
  onApply: (f: QueueFinding) => void;
  /** Receives a WORKSTATION id — two stations can share an operation. */
  onPick: (wsId: string) => void;
}) {
  // Symbols go through <Sym>, which resets the header's inherited
  // `text-transform: uppercase`. Written as plain text they render as Λ, Ρ
  // and LQ — a different letter and a different quantity.
  const columns: DataTableColumn<StationView>[] = [
    {
      key: 'n',
      header: '#',
      width: 40,
      minWidth: 36,
      align: 'right',
      numeric: true,
      cell: (_s, i) => i + 1,
    },
    {
      key: 'operation',
      header: 'Operation',
      width: 240,
      minWidth: 120,
      // The name gives way first; the code and the tag never clip.
      cell: (s, i) => (
        <span
          title={`${s.opName} · ${s.opCode ?? s.opId}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
        >
          <strong
            style={{
              fontWeight: 600,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.opName}
          </strong>
          <span style={{ flex: 'none', color: SW_COLORS.muted, fontSize: 11 }}>
            {s.opCode ?? s.opId}
          </span>
          {i === bottleneckIdx && <Tag color={SW_COLORS.alarm}>BOTTLENECK</Tag>}
        </span>
      ),
    },
    {
      key: 'classification',
      header: 'Classification',
      width: 140,
      minWidth: 90,
      numeric: true,
      cell: (s) => <span title={s.notation.label}>{s.notation.label}</span>,
    },
    {
      key: 'servers',
      header: <Sym quantity="servers" />,
      width: 48,
      align: 'right',
      numeric: true,
      cell: (s) => s.serversTotal,
    },
    {
      key: 'lambda',
      header: <><Sym quantity="lambda" /> /hr</>,
      width: 78,
      align: 'right',
      numeric: true,
      cell: (s) => fmt2(s.lambda),
    },
    {
      key: 'rhoSim',
      header: <><Sym quantity="rho" /> sim</>,
      width: 120,
      minWidth: 88,
      align: 'right',
      numeric: true,
      cell: (s) => <RhoCell value={s.utilization} stable={s.isStable} />,
    },
    {
      key: 'rhoTheory',
      header: <><Sym quantity="rho" /> theory</>,
      width: 84,
      align: 'right',
      numeric: true,
      cell: (s) => <RhoTheoryCell value={s.analytical.rho} />,
    },
    {
      key: 'LqSim',
      header: <><Sym quantity="Lq" /> sim</>,
      width: 78,
      align: 'right',
      numeric: true,
      cell: (s) => fmt2(s.LqObserved),
    },
    {
      key: 'LqTheory',
      header: <><Sym quantity="Lq" /> theory</>,
      width: 92,
      align: 'right',
      numeric: true,
      cell: (s) => fmt2(s.analytical.Lq),
    },
    {
      key: 'mu',
      header: <><Sym quantity="mu" /> /hr</>,
      width: 78,
      align: 'right',
      numeric: true,
      cell: (s) => fmt2(s.serviceDist ? 60 / meanOf(s.serviceDist) : NaN),
    },
    {
      key: 'queueNow',
      header: 'Queue now',
      width: 128,
      minWidth: 64,
      numeric: true,
      cell: (s) => <QueueNowCell station={s} />,
    },
    {
      key: 'busy',
      header: 'Busy',
      width: 96,
      minWidth: 56,
      numeric: true,
      cell: (s) => <BusyCell station={s} />,
    },
    {
      key: 'LSim',
      header: <><Sym quantity="L" /> sim</>,
      width: 72,
      align: 'right',
      numeric: true,
      cell: (s) => fmt2(s.LObserved),
    },
    {
      key: 'LTheory',
      header: <><Sym quantity="L" /> theory</>,
      width: 84,
      align: 'right',
      numeric: true,
      cell: (s) => fmt2(s.analytical.L),
    },
    {
      key: 'remarks',
      header: 'Remarks',
      width: 380,
      minWidth: 140,
      pin: 'right',
      cell: (s) => (
        <StationRemark
          wsId={s.wsId}
          findings={stationFindings(findings, s.wsId)}
          stations={stations}
          onApply={onApply}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={stations}
      rowKey={(s) => s.wsId}
      onRowClick={(s) => onPick(s.wsId)}
      rowStyle={(_s, i) => (i === bottleneckIdx ? { tone: SW_COLORS.alarm } : null)}
      empty="Warming up the simulator…"
      // `.v2`: the column set changed, and a width remembered for the old
      // text-only ρ cell would crush the bar that lives there now.
      storageKey="queueIndex.stationTable.widths.v2"
      style={{ marginTop: 12 }}
    />
  );
}

/** Measured utilisation: the strip's bar, on the number the run produced. */
function RhoCell({ value, stable }: { value: number; stable: boolean }) {
  const color = rhoColor(value);
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value * 100)) : 100;
  const text = !Number.isFinite(value) ? '∞' : (value * 100).toFixed(0) + '%';
  return (
    <span
      title="Share of the run this station's operators were busy"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: '100%' }}
    >
      <span
        aria-hidden
        style={{
          position: 'relative',
          flex: '1 1 0',
          minWidth: 0,
          maxWidth: 72,
          height: 6,
          borderRadius: 3,
          background: SW_COLORS.line,
          overflow: 'hidden',
        }}
      >
        <span style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: color }} />
        {/* The thresholds the colour steps at: 50 and 85. */}
        {[50, 85].map((t) => (
          <span
            key={t}
            style={{
              position: 'absolute',
              left: `${t}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: alpha(SW_COLORS.paper, 0.6),
            }}
          />
        ))}
      </span>
      <span style={{ flex: 'none', minWidth: 52, textAlign: 'right', color, fontWeight: 700 }}>
        {text}
        {!stable && <span style={{ marginLeft: 4 }}>✕</span>}
      </span>
    </span>
  );
}

/** λ / cμ. At 1 or more there is no steady state, so it reads as an alarm. */
function RhoTheoryCell({ value }: { value: number }) {
  const over = !Number.isFinite(value) || value >= 1;
  return (
    <span style={over ? { color: SW_COLORS.alarm, fontWeight: 700 } : undefined}>
      {fmt2(value)}
    </span>
  );
}

const MAX_QUEUE_DOTS = 6;

/**
 * Bundles waiting right now: the count, then one dot per bundle up to six.
 * The count sits in a fixed slot so the dots start at the same x on every row.
 */
function QueueNowCell({ station }: { station: StationView }) {
  const n = Math.max(0, Math.round(station.queueLen));
  const dots = Math.min(n, MAX_QUEUE_DOTS);
  // More waiting than there are operators to take them: a pile, not a buffer.
  const dotColor = n >= station.serversTotal ? SW_COLORS.warn : SW_COLORS.muted;
  return (
    <span
      title={n === 0 ? 'Nothing waiting' : `${n} bundle${n === 1 ? '' : 's'} waiting`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <span
        style={{
          minWidth: 26,
          textAlign: 'right',
          fontWeight: 700,
          color: n === 0 ? SW_COLORS.faint : SW_COLORS.ink,
        }}
      >
        {n}
      </span>
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {Array.from({ length: dots }).map((_, i) => (
          <span
            key={i}
            style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }}
          />
        ))}
        {n > MAX_QUEUE_DOTS && (
          <span style={{ color: SW_COLORS.alarm, fontWeight: 800, lineHeight: 1 }}>+</span>
        )}
      </span>
    </span>
  );
}

const MAX_SERVER_BOXES = 8;

/** One box per operator at the station, filled while that operator is busy. */
function BusyCell({ station }: { station: StationView }) {
  const c = station.serversTotal;
  const busy = Math.max(0, Math.min(c, Math.round(station.busy)));
  const label = `${busy} of ${c} busy`;
  // Past eight the boxes stop being countable at a glance; say it in figures.
  if (c > MAX_SERVER_BOXES) return <span title={label}>{busy}/{c}</span>;
  return (
    <span title={label} aria-label={label} style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: c }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 11,
            height: 11,
            borderRadius: 2,
            background: i < busy ? SW_COLORS.brand : 'transparent',
            border: `1.5px solid ${i < busy ? SW_COLORS.brand : SW_COLORS.line}`,
          }}
        />
      ))}
    </span>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.3px',
        flex: 'none',
        background: alpha(color, 0.13),
        color,
        fontFamily: SW_FONTS.mono,
      }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────

function rhoColor(rho: number): string {
  if (!Number.isFinite(rho) || rho >= 1) return SW_COLORS.alarm;
  if (rho >= 0.85) return SW_COLORS.warn;
  if (rho >= 0.5) return SW_COLORS.ok;
  return SW_COLORS.muted;
}

function fmt2(v: number): string {
  if (!Number.isFinite(v)) return v === Infinity ? '∞' : '—';
  return v.toFixed(2);
}

// Functions (not consts) so tokens are read at render time — the vibe system
// mutates SW_COLORS/SW_FONTS in place.
const navBtn = (): React.CSSProperties => ({
  background: SW_COLORS.paper,
  border: `1px solid ${SW_COLORS.line}`,
  borderRadius: SW_RADIUS.sm,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: SW_FONTS.body,
  color: SW_COLORS.ink,
});
