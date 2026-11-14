/**
 * Workstation Detail — one station, read as a queueing system.
 *
 * WHAT IT IS FOR. INSIGHTS ranks the whole line; this page answers the next
 * question about a single station on it: *is the model of this station
 * sound?* It opens on the textbook's probability questions for the station's
 * Kendall–Lee class, then spends the rest of its height putting the
 * simulator's measurements next to the closed-form steady state for that
 * class. A gap that refuses to close is the finding.
 *
 * WHAT IT DOES NOT SHOW. The station's classification, service distribution,
 * servers, buffer, discipline and every KPI figure are columns of the
 * Workstations table this page is reached from, and are not repeated here.
 *
 * READ-ONLY, like the rest of INSIGHTS. Nothing here edits the model or moves
 * the sim clock: parameters are changed in BUILD (the header's "Edit in Build"
 * opens it with this station selected) and the run is played from RUN.
 *
 * HOW YOU GET HERE. It is not a rail destination. The only way in is to click
 * a station from INSIGHTS: the *Per-station queues* table (or its queue
 * diagrams), or a strip/compare chart under *Over time*. Both drills tag the
 * URL with `?from=<tab>` so the back link can return to the exact table the
 * user left, rather than dropping them on Diagnosis.
 *
 * Route: /workstation/:deptId/:wsId
 *   `wsId` is a WORKSTATION id; the operation id is accepted as a fallback so
 *   older saved links still land. `deptId` is legacy — every caller passes
 *   'sewing' and nothing resolves through it — so it is no longer printed as
 *   though it were a real department.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Card,
  LineSimEmpty,
  SectionHeader,
} from '../components';
import { BalkRatePanel, ConvergenceChart, LittlesLawCheck } from '../components/charts';
import { ProbabilityQuestions } from '../components/QueueAnalysisPanel';
import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS, SW_Z } from '../design/tokens';
import { meanOf, type QueueDiscipline, type StationView } from '../simulation';
import { useLineSim } from '../simulation/useLineSim';
import { DRILL_PATHS } from '../lib/routes';

/** INSIGHTS tabs that drill in here, and how to name them going back. */
const BACK_TABS: Record<string, string> = {
  queues: 'Per-station queues',
  timeline: 'Over time',
};

/**
 * The route form: a full page with a back link. Kept so a saved link to
 * `/workstation/…` still lands; inside the app the station opens as a pop-up
 * over the table or chart it was clicked from (`WorkstationDetailDialog`).
 */
export function WorkstationDetailPage() {
  const { wsId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Where the drill started. Unknown or absent ⇒ the station table, which is
  // the entry point for all but one of the links into this page.
  const from = searchParams.get('from') ?? 'queues';
  const backTab = from in BACK_TABS ? from : 'queues';
  const back = () => navigate(`/insights?tab=${backTab}`);
  return (
    <PageShell backTab={backTab} onBack={back}>
      <StationDetail wsId={wsId} onBack={back} backLabel={`Back to ${BACK_TABS[backTab]}`} />
    </PageShell>
  );
}

export interface WorkstationDetailDialogProps {
  /** The station to show; `null` keeps the pop-up closed. */
  wsId: string | null;
  onClose: () => void;
  /** Extra cards, drawn under the header: the page that opened the pop-up
   *  knows things about the station that this file does not (its remarks,
   *  which table columns are hidden). */
  extra?: (station: StationView, index: number) => ReactNode;
  /** Station ids in the order previous / next should walk them. Omit and the
   *  pop-up has no stepping controls. */
  order?: string[];
  /** Switch the pop-up to another station — from the stepping controls, or
   *  from a station link inside `extra`. */
  onSelect?: (wsId: string) => void;
}

/**
 * The station's detail as a pop-up over the page it was opened from.
 *
 * It used to be a page of its own, which meant clicking a row threw away the
 * table — its scroll position, its sort — to show one station, and "back"
 * had to rebuild it. Over the top, the table is still there underneath and
 * closing returns to exactly where the click happened. Closes on Escape, on
 * the × and on a press outside the panel.
 */
export function WorkstationDetailDialog({
  wsId,
  onClose,
  extra,
  order,
  onSelect,
}: WorkstationDetailDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const at = wsId && order ? order.indexOf(wsId) : -1;
  const prevId = at > 0 ? order![at - 1] : null;
  const nextId = at >= 0 && at < order!.length - 1 ? order![at + 1] : null;
  const canStep = !!onSelect && at >= 0;

  // A new station starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [wsId]);

  useEffect(() => {
    if (!wsId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // ← / → step stations — unless the keys are already doing a job where
      // the focus is: moving a text cursor, or a chart's crosshair.
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, svg, [contenteditable]')) return;
      if (e.key === 'ArrowLeft' && prevId && onSelect) onSelect(prevId);
      if (e.key === 'ArrowRight' && nextId && onSelect) onSelect(nextId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wsId, onClose, prevId, nextId, onSelect]);

  if (!wsId) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Station detail"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: SW_Z.modal,
        background: SW_COLORS.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={panelRef}
        style={{
          position: 'relative',
          width: 'min(1120px, 100%)',
          maxHeight: '100%',
          overflow: 'auto',
          padding: '20px 24px',
          background: SW_COLORS.paperDeep,
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: SW_RADIUS.md,
          boxShadow: SW_SHADOWS.overlay,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {canStep && (
            <>
              <span
                style={{
                  fontFamily: SW_FONTS.mono,
                  fontSize: 11,
                  color: SW_COLORS.muted,
                  marginRight: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                {at + 1} of {order!.length}
              </span>
              <button
                type="button"
                disabled={!prevId}
                onClick={() => prevId && onSelect!(prevId)}
                title="Previous station (←)"
                aria-label="Previous station"
                style={cornerBtn(!prevId)}
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!nextId}
                onClick={() => nextId && onSelect!(nextId)}
                title="Next station (→)"
                aria-label="Next station"
                style={cornerBtn(!nextId)}
              >
                ›
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            style={cornerBtn(false)}
          >
            ×
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <StationDetail wsId={wsId} onBack={onClose} backLabel="Close" inDialog extra={extra} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The station's header and cards, without any page or pop-up chrome. */
function StationDetail({
  wsId,
  onBack,
  backLabel,
  inDialog = false,
  extra,
}: {
  wsId: string | undefined;
  onBack: () => void;
  backLabel: string;
  /** Leaves room on the header's right for the pop-up's close button. */
  inDialog?: boolean;
  extra?: (station: StationView, index: number) => ReactNode;
}) {
  const navigate = useNavigate();

  // INSIGHTS observes; it does not edit the model or drive the clock. The
  // station's parameters are changed in BUILD (the header links there) and the
  // run is played from RUN.
  const { state, emptyReason, unassignedStationCount } = useLineSim();

  /**
   * Resolve the route parameter to a station.
   *
   * `wsId` is a WORKSTATION id. It used to be read as an operation id, which
   * cannot address a station at all on a balanced line: two stations running
   * the same operation are indistinguishable that way, and the first one always
   * won. The opId lookup is kept as a fallback so links saved before the change
   * still land somewhere sensible.
   */
  const stationIdx = useMemo(() => {
    if (!wsId) return -1;
    const byWs = state.stations.findIndex((s) => s.wsId === wsId);
    if (byWs >= 0) return byWs;
    return state.stations.findIndex((s) => s.opId === wsId);
  }, [state.stations, wsId]);

  const station: StationView | undefined = stationIdx >= 0 ? state.stations[stationIdx] : undefined;

  if (emptyReason) {
    return (
      <LineSimEmpty
        reason={emptyReason}
        unassignedStationCount={unassignedStationCount}
        what="Station analysis"
      />
    );
  }

  if (!station) {
    return (
        <Card>
          <SectionHeader title="Station not found" />
          <p style={{ fontSize: 13, color: SW_COLORS.muted }}>
            No station <code>{wsId}</code> on the line currently in scope. It may belong to a
            different line — change the line scope on STATISTICS and pick the station again.
          </p>
          <button type="button" onClick={onBack} style={navBtn()}>
            {backLabel}
          </button>
        </Card>
    );
  }

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          // Room for the pop-up's corner controls: counter, ‹ › and ×.
          paddingRight: inDialog ? 190 : 0,
        }}
      >
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
            Workstation · {station.opCode ?? station.opId}
          </div>
          <h1
            style={{
              fontFamily: SW_FONTS.display,
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: SW_COLORS.ink,
              margin: '6px 0 0 0',
            }}
          >
            {station.opName}
          </h1>
          <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 4 }}>
            {station.machineCode} · station {stationIdx + 1} of {state.stations.length} ·
            {' '}SMV {station.smv.toFixed(2)} min · {station.notation.label}
          </div>
          {/* The one-line summary the Over time rows used to carry beside each
              name. It lives here now, so the rows are a name and its figures. */}
          <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 2 }}>
            {station.serversTotal} {station.serversTotal === 1 ? 'operator' : 'operators'} ·{' '}
            {serviceRatePerHr(station).toFixed(1)}/hr · {disciplineLabel(station.notation.discipline)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(DRILL_PATHS.buildStation(station.wsId))}
          style={navBtn()}
          title="Open this station in BUILD to change its parameters"
        >
          Edit in Build →
        </button>
      </header>

      {extra?.(station, stationIdx)}

      {/* The station's classification, parameters and KPI figures are not
          repeated here: each is a column of the Workstations table this page
          is reached from. The probability questions are the one part of the
          queueing analysis a table row cannot hold — they take an input. */}
      <Card>
        <ProbabilityQuestions station={station} />
      </Card>

      {/*
        Sim-versus-theory convergence.

        This section is the payoff of instrumenting the engine. Until ρ̂ was a
        cumulative time-average from ∫busy dt, the "observed" line here was an
        instantaneous 0/1 square wave that could never settle onto the analytical
        target beside it — so drawing them together was actively misleading.
        Watching them meet is the clearest evidence the model is sound, and a gap
        that refuses to close is itself the finding.
      */}
      {station && (
        <Card>
          <SectionHeader
            title="Simulated vs. theory"
            sub="Solid = measured from the run. Dashed = the closed-form steady state for this station's Kendall–Lee class. They should converge as the shift plays."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* The two curves are one reading, not two: ρ̂ says how hard the
                operator is working and L̄q says what that does to the queue, and
                the interesting case is when only one of them has settled. Stacked
                full-width they could not be compared without moving your eyes a
                chart-height apart, and the SVG (600 units wide, drawn with
                `preserveAspectRatio: none`) was stretched ~2.5× horizontally at
                that width — squashed-looking axis labels on a chart nobody could
                read side by side anyway. Two columns puts them level with each
                other and lands the plot near its intended scale.

                `alignItems: start` because a chart that has not converged grows a
                divergence note underneath it; without this the shorter column
                would stretch to match and the two plots would stop being level,
                which is the whole point. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                alignItems: 'start',
                gap: 16,
              }}
            >
              <ConvergenceChart
                station={station}
                history={state.stationHistory[stationIdx] ?? []}
                metric="rho"
              />
              <ConvergenceChart
                station={station}
                history={state.stationHistory[stationIdx] ?? []}
                metric="Lq"
              />
            </div>
            <div style={{ borderTop: `1px solid ${SW_COLORS.line}`, paddingTop: 12 }}>
              <LittlesLawCheck station={station} />
            </div>
            <div style={{ borderTop: `1px solid ${SW_COLORS.line}`, paddingTop: 12 }}>
              <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.12em', marginBottom: 6 }}>
                BALKING
              </div>
              <BalkRatePanel station={station} />
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

/**
 * The page's own scroll box.
 *
 * Every surface in this app owns its scrolling: the shell's route outlet is
 * `overflow: hidden` at `100vh`, so a page that lays itself out as a bare
 * column just grows past the viewport and everything below the fold becomes
 * unreachable. This page did exactly that — around 4,000px of charts inside a
 * clipped 100vh box, flush against the sidebar with no padding, because it was
 * the one surface that never got the container the others have.
 */
/**
 * The page's scroll box, and the way out of it.
 *
 * SCROLLING. Every surface in this app owns its own scrolling: the shell's
 * route outlet is `overflow: hidden` at `100vh`, so a page that lays itself
 * out as a bare column just grows past the viewport and everything below the
 * fold becomes unreachable. This page did exactly that — some 4,000px of
 * charts inside a clipped 100vh box, flush against the sidebar with no
 * padding, because it was the one surface that never got the container the
 * others have. The scroll box is a plain block and the column lives inside it,
 * so the cards keep their natural heights instead of being flex-shrunk into
 * each other on a short viewport.
 *
 * BACK. The page is only ever arrived at by drilling, and it had no back
 * affordance of any kind — no breadcrumb, no button, and a sidebar that
 * highlighted MENU while you stood on it. The browser back button worked,
 * which is not the same as the app admitting there is anywhere to go.
 */
function PageShell({
  backTab,
  onBack,
  children,
}: {
  backTab: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '20px 24px',
        background: SW_COLORS.paperDeep,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: SW_FONTS.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            color: SW_COLORS.muted,
          }}
          title={`Back to Statistics · ${BACK_TABS[backTab]}`}
        >
          <span aria-hidden style={{ fontSize: 13 }}>←</span>
          Statistics · {BACK_TABS[backTab]}
        </button>
        {children}
      </div>
    </div>
  );
}

/** Bundles per hour one operator here can sew: 60 over the mean service time. */
function serviceRatePerHr(station: StationView): number {
  const mean = meanOf(station.serviceDist);
  return mean > 0 ? 60 / mean : 0;
}

/** The queue discipline in floor language. */
function disciplineLabel(d: QueueDiscipline): string {
  switch (d) {
    case 'FCFS': return 'FIFO cart';
    case 'SIRO': return 'Random pick';
    case 'Priority': return 'Rush first';
    default: return d;
  }
}

/** The small square buttons in the pop-up's top-right corner. */
const cornerBtn = (disabled: boolean): React.CSSProperties => ({
  width: 30,
  height: 30,
  padding: 0,
  fontSize: 16,
  lineHeight: 1,
  background: SW_COLORS.paper,
  border: `1px solid ${SW_COLORS.line}`,
  borderRadius: SW_RADIUS.sm,
  color: SW_COLORS.muted,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.35 : 1,
});

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
