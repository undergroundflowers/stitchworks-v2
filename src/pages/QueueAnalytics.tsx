/**
 * Queue Analytics — cross-station view of the four queueing-theory observables
 * (operator saturation, bundles at station, bundle wait time, bundles waiting)
 * as time-series, sourced from the engine's `state.stationHistory`.
 *
 * One layout: a row per station, each a single chart with every selected
 * observable on it. The legend is said once, at the top, and each entry in it
 * is a switch — so the page covers everything from "all four on every
 * station" down to "one observable down the whole line", which is what the
 * separate Compare mode used to exist for. The scale switch finishes that
 * job: on a shared scale, heights compare from one station to the next.
 *
 * A second switch picks what each point averages over: the run so far (the
 * figure theory predicts, and the default) or its own five minutes (what the
 * station was actually doing then).
 *
 * Sister page to /queues (QueueIndex). The user enters here from a
 * "Compare stations →" button on QueueIndex when they want time-series
 * instead of the snapshot table.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  LineScopePicker,
  LineSimEmpty,
  StationMetricLegend,
  StationMetricReadout,
  StationTimeseriesChart,
  STATION_METRICS,
  stationScaleDomain,
  ToggleGroup,
  type StationMetric,
  type StationScaleId,
  type StationSeriesBasis,
} from '../components';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import type { StationView } from '../simulation';
import { useLineSim } from '../simulation/useLineSim';
import { useSimSession } from '../simulation/useSimSession';
import { constraintIndex } from '../domain/queue-advisor';
import { WorkstationDetailDialog } from './WorkstationDetail';
import { StationRecord, useStationAdvice } from './QueueIndex';

/** `station`: each chart fits its own data. `shared`: one scale for the line. */
type ScaleMode = 'station' | 'shared';

export interface QueueAnalyticsPageProps {
  /** Rendered inside another surface (INSIGHTS): drop the page chrome and the
   *  outer scroll container so the host owns both. */
  embedded?: boolean;
}

export function QueueAnalyticsPage({ embedded = false }: QueueAnalyticsPageProps = {}) {
  const navigate = useNavigate();
  // Real lines through the shared session; see useLineSim for what this
  // replaced.
  const { state, lines, allLines, twin, emptyReason, unassignedStationCount } = useLineSim();
  const step = useSimSession((s) => s.step);
  const reset = useSimSession((s) => s.reset);
  const subject = lines.length === 1 ? lines[0].name : `${lines.length} sewing lines`;
  // Same rule as the station table's BOTTLENECK tag and the advisor's remark:
  // highest measured saturation, not the engine's live deepest queue.
  const bottleneckIdx = constraintIndex(state.stations);

  const [metrics, setMetrics] = useState<StationMetric[]>(STATION_METRICS);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('station');
  const [basis, setBasis] = useState<StationSeriesBasis>('average');
  // The station whose detail pop-up is open, if any.
  const [openWsId, setOpenWsId] = useState<string | null>(null);
  const { findings, apply } = useStationAdvice();

  if (emptyReason) {
    return (
      <div style={{ padding: '20px 24px', height: '100%' }}>
        <LineSimEmpty
          reason={emptyReason}
          unassignedStationCount={unassignedStationCount}
          what="Queue analytics"
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
            Σ · Queue analytics · time-series
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
            How {subject} is moving
          </h1>
          <div style={{ fontSize: 13, color: SW_COLORS.muted, marginTop: 4 }}>
            Four observables per station over simulated time. Solid line = what
            the simulator saw; dashed line = the steady-state target from
            queueing theory. Watch for solid lines that don't settle near the
            dashed — those stations are the ones to tune first.
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
            title="Advance the sim by 1 hour"
          >
            +1 hr
          </button>
          <button
            type="button"
            onClick={() => navigate('/insights')}
            style={navBtn()}
            title="Back to the snapshot table"
          >
            ← Queue table
          </button>
        </div>
      </header>
      )}

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <StationMetricLegend active={metrics} onChange={setMetrics} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div title="Average: the mean since the run began. Instantaneous: the mean over each 5-minute step on its own.">
              <ToggleGroup<StationSeriesBasis>
                value={basis}
                options={[
                  { value: 'average', label: 'Average' },
                  { value: 'step', label: 'Instantaneous' },
                ]}
                onChange={setBasis}
              />
            </div>
            <div title="Own scale fits each station. Shared scale makes heights comparable down the line.">
              <ToggleGroup<ScaleMode>
                value={scaleMode}
                options={[
                  { value: 'station', label: 'Own scale' },
                  { value: 'shared', label: 'Shared scale' },
                ]}
                onChange={setScaleMode}
              />
            </div>
          </div>
        </div>
      </div>

      {state.stations.length === 0 ? (
        <Card>
          <p style={{ color: SW_COLORS.muted, fontSize: 13 }}>Warming up the simulator…</p>
        </Card>
      ) : (
        <StripView
          stations={state.stations}
          stationHistory={state.stationHistory}
          bottleneckIdx={bottleneckIdx}
          metrics={metrics}
          basis={basis}
          domain={
            scaleMode === 'shared'
              ? stationScaleDomain(state.stations, state.stationHistory, metrics, basis)
              : undefined
          }
          onDrill={setOpenWsId}
        />
      )}
      <WorkstationDetailDialog
        wsId={openWsId}
        onClose={() => setOpenWsId(null)}
        extra={(station, index) => (
          <StationRecord
            station={station}
            index={index}
            stations={state.stations}
            findings={findings}
            onApply={apply}
            history={state.stationHistory[index] ?? []}
            connectors={twin.connectors}
            onSelect={setOpenWsId}
          />
        )}
        // Previous / next follow the rows on this tab: line order.
        order={state.stations.map((s) => s.wsId)}
        onSelect={setOpenWsId}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Sub-views
// ─────────────────────────────────────────────────────────────────────────

function StripView({
  stations,
  stationHistory,
  bottleneckIdx,
  metrics,
  basis,
  domain,
  onDrill,
}: {
  stations: StationView[];
  stationHistory: import('../simulation').StationHistoryPoint[][];
  bottleneckIdx: number;
  metrics: StationMetric[];
  basis: StationSeriesBasis;
  /** Set when every chart shares one scale; omitted when each fits itself. */
  domain?: Record<StationScaleId, number>;
  /** Receives a WORKSTATION id — two stations can share an operation. */
  onDrill: (wsId: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {stations.map((s, i) => (
          <StationRow
            key={s.wsId}
            station={s}
            history={stationHistory[i] ?? []}
            isBottleneck={i === bottleneckIdx}
            metrics={metrics}
            basis={basis}
            domain={domain}
            onDrill={() => onDrill(s.wsId)}
          />
        ))}
      </div>
    </div>
  );
}

function StationRow({
  station,
  history,
  isBottleneck,
  metrics,
  basis,
  domain,
  onDrill,
}: {
  station: StationView;
  history: import('../simulation').StationHistoryPoint[];
  isBottleneck: boolean;
  metrics: StationMetric[];
  basis: StationSeriesBasis;
  domain?: Record<StationScaleId, number>;
  onDrill: () => void;
}) {
  return (
    <div
      style={{
        padding: 12,
        border: `1px solid ${isBottleneck ? SW_COLORS.alarm : SW_COLORS.line}`,
        borderRadius: SW_RADIUS.md,
        background: isBottleneck ? `${SW_COLORS.alarm}08` : SW_COLORS.paper,
      }}
    >
      <RowHeader
        station={station}
        history={history}
        metrics={metrics}
        basis={basis}
        isBottleneck={isBottleneck}
        onDrill={onDrill}
      />
      <div style={{ marginTop: 8 }}>
        <StationTimeseriesChart
          station={station}
          history={history}
          metrics={metrics}
          basis={basis}
          domain={domain}
          legend={false}
          height={230}
        />
      </div>
    </div>
  );
}

function RowHeader({
  station,
  history,
  metrics,
  basis,
  isBottleneck,
  onDrill,
}: {
  station: StationView;
  history: import('../simulation').StationHistoryPoint[];
  metrics: StationMetric[];
  basis: StationSeriesBasis;
  isBottleneck: boolean;
  onDrill: () => void;
}) {
  return (
    <div
      style={{
        // Name · figures · (empty). Equal outer columns hold the figures at
        // the centre of the row; a long name takes what it needs and pushes
        // them aside rather than running underneath.
        display: 'grid',
        gridTemplateColumns: 'minmax(max-content, 1fr) auto minmax(0, 1fr)',
        alignItems: 'baseline',
        columnGap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
        <button
          type="button"
          onClick={onDrill}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: SW_FONTS.display,
            fontSize: 16,
            fontWeight: 800,
            color: SW_COLORS.ink,
            textAlign: 'left',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            textDecorationColor: SW_COLORS.line,
          }}
          title="Open the full inspector for this station"
        >
          {station.opName}
        </button>
        {isBottleneck && (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.3px',
              background: `${SW_COLORS.alarm}20`,
              color: SW_COLORS.alarm,
              fontFamily: SW_FONTS.mono,
            }}
          >
            SLOWEST STATION
          </span>
        )}
      </div>
      <StationMetricReadout station={station} history={history} metrics={metrics} basis={basis} />
    </div>
  );
}

// Function (not a const) so tokens are read at render time — the vibe system
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
