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

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  DataTable,
  readStoredSort,
  sortRows,
  LineRemarks,
  LineScopePicker,
  LineSimEmpty,
  SectionHeader,
  StationRemark,
  Sym,
  useToast,
  type DataTableColumn,
} from '../components';
import type { QuantityId } from '../simulation/notation';
import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_TYPE } from '../design/tokens';
import { alpha } from '../design/color-utils';
import {
  describeDistShape,
  meanOf,
  type StationHistoryPoint,
  type StationView,
} from '../simulation';
import {
  RemarkNumbers,
  SimTheoryVerdict,
  StationNeighbours,
  StationPosition,
  linkStationNames,
} from '../components/StationInsight';
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
import { WorkstationDetailDialog } from './WorkstationDetail';

export interface QueueIndexPageProps {
  /** Rendered inside another surface (INSIGHTS): drop the page chrome and the
   *  outer scroll container so the host owns both. */
  embedded?: boolean;
}

/**
 * The advisor's findings for the line in scope, and the action that applies
 * one. A hook so the Workstations table and the station pop-up opened from
 * the Over time charts read the same verdicts and apply them the same way.
 */
export function useStationAdvice(): {
  findings: QueueFinding[];
  apply: (finding: QueueFinding) => void;
} {
  const navigate = useNavigate();
  const { state, lines, twin } = useLineSim();
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
      navigate('/reports?report=balance');
      return;
    }
    const label = describePatch(finding.patch, state.stations);
    createScenarioFromTwin({
      name: label,
      notes: `Applied from Statistics: ${finding.title}`,
      twin: applyPatch(twin, finding.patch),
      activate: true,
    });
    toast({
      kind: 'success',
      message: `${label} — applied as a new scenario. Every surface now reads it; switch back on the Reports → Scenarios tab.`,
      duration: 7000,
    });
  };

  return { findings, apply };
}

export function QueueIndexPage({ embedded = false }: QueueIndexPageProps = {}) {
  const navigate = useNavigate();
  // The slot in the card heading that the table's COLUMNS button renders into.
  // State, not a ref: the table has to re-render once the element exists.
  const [columnsHost, setColumnsHost] = useState<HTMLDivElement | null>(null);
  // The station whose detail pop-up is open, if any.
  const [openWsId, setOpenWsId] = useState<string | null>(null);
  // The user's OWN lines, through the shared session — not a throwaway line
  // synthesised from the selected garment template, which is what this page
  // used to analyse.
  const { state, lines, allLines, twin, emptyReason, unassignedStationCount } = useLineSim();
  const step = useSimSession((s) => s.step);
  const reset = useSimSession((s) => s.reset);

  const { findings, apply } = useStationAdvice();

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

      {/* No card around the table: it sits directly on the page, and its own
          border is the only frame it needs. */}
      <div>
        {/* One row: the line's remarks on the left, the table's COLUMNS button
            (drawn into the slot) on the right. They used to be two rows, which
            left a band of empty page above the first remark. `-12` cancels the
            top margin LineRemarks carries for when it sits under a heading. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, marginTop: -12 }}>
            <LineRemarks
              findings={lineFindings(findings)}
              stations={state.stations}
              onApply={apply}
            />
          </div>
          <div ref={setColumnsHost} style={{ flex: 'none' }} />
        </div>
        <StationTable
          stations={state.stations}
          bottleneckIdx={bottleneckIdx}
          findings={findings}
          onApply={apply}
          onPick={setOpenWsId}
          columnsHost={columnsHost}
        />
      </div>
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
        // Previous / next follow the table as it is sorted right now.
        order={tableOrder(state.stations, findings, apply)}
        onSelect={setOpenWsId}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────

/** Station ids in the order the Workstations table currently shows them. */
function tableOrder(
  stations: StationView[],
  findings: QueueFinding[],
  onApply: (f: QueueFinding) => void,
): string[] {
  const sort = readStoredSort(STATION_TABLE_KEY);
  const column = sort
    ? buildStationColumns({
        stations,
        bottleneckIdx: constraintIndex(stations),
        findings,
        onApply,
      }).find((c) => c.key === sort.key && c.sortValue)
    : undefined;
  return sortRows(stations, column, sort).map((e) => e.row.wsId);
}

const SEVERITY_COLOR = (sev: QueueFinding['severity']): string =>
  sev === 'critical'
    ? SW_COLORS.alarm
    : sev === 'warn'
      ? SW_COLORS.warn
      : sev === 'opportunity'
        ? SW_COLORS.thread
        : SW_COLORS.muted;

/** The table's hidden-column keys, as the Columns menu last saved them. */
function readHiddenColumns(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${STATION_TABLE_KEY}.hidden`) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export interface StationRecordProps {
  station: StationView;
  /** The station's position in `stations`. */
  index: number;
  stations: StationView[];
  findings: QueueFinding[];
  onApply: (f: QueueFinding) => void;
  /** This station's samples over the run, for its chart. */
  history: StationHistoryPoint[];
  /** The line's wiring, for finding who feeds whom. */
  connectors: readonly { fromWsId: string; toWsId: string }[];
  /** Switch the pop-up to another station. */
  onSelect: (wsId: string) => void;
}

/**
 * What the station pop-up adds to its row of the Workstations table.
 *
 *  - REMARKS, in full. The table has room for a few words per row; here each
 *    finding gets its reasoning, the fix, and what the fix should change.
 *  - The columns HIDDEN in the table. Hiding a column narrows the table, it
 *    does not make the figure unwanted — so the pop-up is where it goes.
 *    Drawn from the table's own column list, so label and value match it.
 */
export function StationRecord({
  station,
  index,
  stations,
  findings,
  onApply,
  connectors,
  onSelect,
}: StationRecordProps) {
  const own = stationFindings(findings, station.wsId);
  const bottleneckIdx = constraintIndex(stations);
  const hiddenKeys = readHiddenColumns();
  const hidden = buildStationColumns({ stations, bottleneckIdx, findings, onApply }).filter(
    // Remarks are shown in full above, whether or not their column is hidden.
    (c) => c.key !== 'remarks' && c.hideable !== false && hiddenKeys.includes(c.key),
  );

  return (
    <>
      <Card>
        <SectionHeader title="Remarks" />
        {own.length === 0 ? (
          <div style={{ fontSize: 13, color: SW_COLORS.muted }}>
            Nothing flagged at this station.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {own.map((f) => {
              const color = SEVERITY_COLOR(f.severity);
              // A line-wide finding that merely marks this station is applied
              // from above the table, not once per station it touches.
              const applyHere = f.patch && f.wsId === station.wsId;
              return (
                <div
                  key={f.id}
                  style={{
                    paddingLeft: 12,
                    borderLeft: `3px solid ${color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Tag color={color}>{f.severity.toUpperCase()}</Tag>
                    <strong style={{ fontSize: 14, color: SW_COLORS.ink }}>{f.title}</strong>
                    {applyHere && (
                      <span style={{ marginLeft: 'auto' }}>
                        <Button size="sm" onClick={() => onApply(f)} title="Try this fix as a new scenario">
                          Apply
                        </Button>
                      </span>
                    )}
                  </div>
                  <RemarkLine label="Why">
                    {linkStationNames(f.detail, stations, station.wsId, onSelect)}
                  </RemarkLine>
                  <RemarkLine label="Do">
                    {linkStationNames(f.action, stations, station.wsId, onSelect)}
                  </RemarkLine>
                  {f.expect && <RemarkLine label="Expect">{f.expect}</RemarkLine>}
                  <RemarkLine label="Numbers">
                    <RemarkNumbers station={station} finding={f} />
                  </RemarkLine>
                  {(() => {
                    // Every other station this finding marks, as links.
                    const also = [...new Set([f.wsId, ...(f.wsIds ?? [])])]
                      .filter((id): id is string => !!id && id !== station.wsId)
                      .map((id) => stations.find((x) => x.wsId === id))
                      .filter((x): x is StationView => !!x);
                    if (also.length === 0) return null;
                    return (
                      <RemarkLine label="Also">
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                          {also.map((x) => (
                            <button
                              key={x.wsId}
                              type="button"
                              onClick={() => onSelect(x.wsId)}
                              style={stationLinkStyle()}
                            >
                              {x.opName}
                            </button>
                          ))}
                        </span>
                      </RemarkLine>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <StationPosition station={station} index={index} stations={stations} />
      <StationNeighbours
        station={station}
        stations={stations}
        connectors={connectors}
        onSelect={onSelect}
      />
      <SimTheoryVerdict station={station} />

      {hidden.length > 0 && (
        <Card>
          <SectionHeader
            title="Hidden columns"
            sub="Figures for the columns switched off in the Workstations table."
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '12px 20px',
            }}
          >
            {hidden.map((c) => (
              <div key={c.key} style={{ minWidth: 0 }}>
                <div style={{ ...SW_TYPE.overline, color: SW_COLORS.muted, marginBottom: 4 }}>
                  {c.label ?? c.header}
                </div>
                <div
                  style={{
                    ...(c.numeric ? SW_TYPE.numeric : SW_TYPE.body),
                    color: SW_COLORS.ink,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {c.cell(station, index)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

const stationLinkStyle = (): React.CSSProperties => ({
  padding: 0,
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontWeight: 600,
  color: SW_COLORS.brandText,
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  cursor: 'pointer',
  textAlign: 'left',
});

function RemarkLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
      <span
        style={{
          ...SW_TYPE.overline,
          flex: 'none',
          width: 64,
          paddingTop: 4,
          color: SW_COLORS.muted,
        }}
      >
        {label}
      </span>
      <span style={{ color: SW_COLORS.ink }}>{children}</span>
    </div>
  );
}

/** localStorage key for the Workstations table's layout. `.v2`: the column set
 *  changed, and a width remembered for the old text-only ρ cell would crush
 *  the bar that lives there now. */
export const STATION_TABLE_KEY = 'queueIndex.stationTable.widths.v2';

interface StationColumnContext {
  stations: StationView[];
  bottleneckIdx: number;
  /** Every finding on the line; each row picks out its own. */
  findings: QueueFinding[];
  onApply: (f: QueueFinding) => void;
}

/**
 * The Workstations table's columns. A function, not a constant inside the
 * table, because the station pop-up draws from the same list: a column hidden
 * in the table is shown there, with the same label and the same cell, so a
 * figure can never read one way in the table and another way in the pop-up.
 */
export function buildStationColumns({
  stations,
  bottleneckIdx,
  findings,
  onApply,
}: StationColumnContext): DataTableColumn<StationView>[] {
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
      label: 'Station number',
      sortValue: (_s, i) => i,
      cell: (_s, i) => i + 1,
    },
    {
      key: 'operation',
      header: 'Operation',
      width: 240,
      minWidth: 120,
      // The row's identity: never hidden.
      hideable: false,
      sortValue: (s) => s.opName,
      // Name and tag only. The station's code is in its pop-up's header (and
      // this cell's tooltip): in the table it was a long id that pushed the
      // name out of its own column.
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
      sortValue: (s) => s.notation.label,
      cell: (s) => <span title={s.notation.label}>{s.notation.label}</span>,
    },
    {
      // The classification's service letter only says M, D, Ek or G. `G` is
      // every other family at once, so the family and its spread get a column
      // of their own; the mean is left to the μ column.
      key: 'serviceDist',
      header: 'Service distribution',
      width: 204,
      minWidth: 90,
      sortValue: (s) => (s.serviceDist ? describeDistShape(s.serviceDist) : null),
      cell: (s) =>
        s.serviceDist ? (
          <span title={describeDistShape(s.serviceDist)}>{describeDistShape(s.serviceDist)}</span>
        ) : null,
    },
    {
      key: 'servers',
      header: <HeaderSym quantity="servers" />,
      width: 66,
      align: 'right',
      numeric: true,
      label: <><HeaderSym quantity="servers" /> · operators</>,
      sortValue: (s) => s.serversTotal,
      cell: (s) => s.serversTotal,
    },
    {
      key: 'lambda',
      header: <><HeaderSym quantity="lambda" /> /hr</>,
      width: 96,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.lambda,
      cell: (s) => fmt2(s.lambda),
    },
    {
      key: 'rhoSim',
      header: <><HeaderSym quantity="rho" /> sim</>,
      width: 138,
      minWidth: 88,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.utilization,
      cell: (s) => <RhoCell value={s.utilization} stable={s.isStable} />,
    },
    {
      key: 'rhoTheory',
      header: <><HeaderSym quantity="rho" /> theory</>,
      width: 102,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.rho,
      cell: (s) => <RhoTheoryCell value={s.analytical.rho} />,
    },
    {
      key: 'LqSim',
      header: <><HeaderSym quantity="Lq" /> sim</>,
      width: 96,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.LqObserved,
      cell: (s) => fmt2(s.LqObserved),
    },
    {
      key: 'LqTheory',
      header: <><HeaderSym quantity="Lq" /> theory</>,
      width: 110,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.Lq,
      cell: (s) => fmt2(s.analytical.Lq),
    },
    {
      key: 'mu',
      header: <><HeaderSym quantity="mu" /> /hr</>,
      width: 96,
      align: 'right',
      numeric: true,
      sortValue: (s) => (s.serviceDist ? 60 / meanOf(s.serviceDist) : NaN),
      cell: (s) => fmt2(s.serviceDist ? 60 / meanOf(s.serviceDist) : NaN),
    },
    {
      key: 'queueNow',
      header: 'Queue now',
      width: 128,
      minWidth: 64,
      numeric: true,
      sortValue: (s) => s.queueLen,
      cell: (s) => <QueueNowCell station={s} />,
    },
    {
      key: 'busy',
      header: 'Busy',
      width: 96,
      minWidth: 56,
      numeric: true,
      sortValue: (s) => s.busy,
      cell: (s) => <BusyCell station={s} />,
    },
    {
      key: 'LSim',
      header: <><HeaderSym quantity="L" /> sim</>,
      width: 90,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.LObserved,
      cell: (s) => fmt2(s.LObserved),
    },
    {
      key: 'LTheory',
      header: <><HeaderSym quantity="L" /> theory</>,
      width: 102,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.L,
      cell: (s) => fmt2(s.analytical.L),
    },
    // ── Everything below was only on the station page's KPI list. It lives
    // here now so a figure has one home and can be sorted across the line;
    // the Columns menu is how the table is narrowed again.
    {
      key: 'WqSim',
      header: <><HeaderSym quantity="Wq" /> sim min</>,
      width: 122,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.WqObservedMin,
      cell: (s) => fmt2(s.WqObservedMin),
    },
    {
      key: 'WqTheory',
      header: <><HeaderSym quantity="Wq" /> theory min</>,
      width: 142,
      align: 'right',
      numeric: true,
      // queueing.ts returns waits in HOURS.
      sortValue: (s) => s.analytical.Wq * 60,
      cell: (s) => fmt2(s.analytical.Wq * 60),
    },
    {
      key: 'WSim',
      header: <><HeaderSym quantity="W" /> sim min</>,
      width: 118,
      align: 'right',
      numeric: true,
      // W = Wq + service time: the engine measures the wait, and adding the
      // mean service time is exact for one server.
      sortValue: (s) => s.WqObservedMin + s.smv,
      cell: (s) => fmt2(s.WqObservedMin + s.smv),
    },
    {
      key: 'WTheory',
      header: <><HeaderSym quantity="W" /> theory min</>,
      width: 136,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.W * 60,
      cell: (s) => fmt2(s.analytical.W * 60),
    },
    {
      key: 'P0Sim',
      header: <><HeaderSym quantity="P0" /> sim</>,
      width: 98,
      align: 'right',
      numeric: true,
      sortValue: (s) => 1 - s.utilization,
      cell: (s) => fmtPct(1 - s.utilization),
    },
    {
      key: 'P0Theory',
      header: <><HeaderSym quantity="P0" /> theory</>,
      width: 114,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.P0,
      cell: (s) => fmtPct(s.analytical.P0),
    },
    // The next three have no measured counterpart: they are read off the
    // closed form only.
    {
      key: 'pWait',
      header: <><HeaderSym quantity="pWait" /> theory</>,
      width: 128,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.pWait,
      cell: (s) => fmtPct(s.analytical.pWait),
    },
    {
      key: 'pNoWait',
      header: <><HeaderSym quantity="pNoWait" /> theory</>,
      width: 128,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.pNoWait,
      cell: (s) => fmtPct(s.analytical.pNoWait),
    },
    {
      key: 'D',
      header: <><HeaderSym quantity="D" /> theory</>,
      width: 106,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.D,
      cell: (s) => fmt2(s.analytical.D),
    },
    {
      key: 'lambdaEffSim',
      header: <><HeaderSym quantity="lambdaEff" /> sim /hr</>,
      width: 134,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.lambdaEff,
      cell: (s) => fmt2(s.lambdaEff),
    },
    {
      key: 'lambdaEffTheory',
      header: <><HeaderSym quantity="lambdaEff" /> theory /hr</>,
      width: 154,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.lambdaEff,
      cell: (s) => fmt2(s.analytical.lambdaEff),
    },
    {
      key: 'pBalkSim',
      header: <><HeaderSym quantity="pBalk" /> sim</>,
      width: 98,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.balkFraction,
      cell: (s) => fmtPct(s.balkFraction),
    },
    {
      key: 'pBalkTheory',
      header: <><HeaderSym quantity="pBalk" /> theory</>,
      width: 114,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.analytical.pBalk,
      cell: (s) => fmtPct(s.analytical.pBalk),
    },
    {
      key: 'done',
      header: 'Bundles done',
      width: 116,
      align: 'right',
      numeric: true,
      sortValue: (s) => s.produced,
      cell: (s) => s.produced,
    },
    {
      key: 'remarks',
      header: 'Remarks',
      width: 380,
      minWidth: 140,
      pin: 'right',
      // Stations with something to say first.
      sortValue: (s) => stationFindings(findings, s.wsId).length || null,
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
  return columns;
}

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
  columnsHost,
}: {
  stations: StationView[];
  bottleneckIdx: number;
  /** Every finding on the line; each row picks out its own. */
  findings: QueueFinding[];
  onApply: (f: QueueFinding) => void;
  /** Receives a WORKSTATION id — two stations can share an operation. */
  onPick: (wsId: string) => void;
  /** Where the table's COLUMNS button is drawn: the card's heading row. */
  columnsHost: HTMLElement | null;
}) {
  const columns = buildStationColumns({ stations, bottleneckIdx, findings, onApply });

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
      storageKey={STATION_TABLE_KEY}
      menuHost={columnsHost}
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

/**
 * A quantity's symbol as it appears in a column header: in brackets and in the
 * brand text colour, so the symbol reads as the variable and the words around
 * it ("sim", "theory", "/hr") read as plain description.
 */
function HeaderSym({ quantity }: { quantity: QuantityId }) {
  return <Sym quantity={quantity} bracketed color={SW_COLORS.brandText} />;
}

/** A probability or share as a percentage; a dash where the model has none. */
function fmtPct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
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
