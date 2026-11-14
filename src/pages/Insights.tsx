/**
 * INSIGHTS — what's wrong with this line, and one click to fix it.
 *
 * The rest of the app describes the line: the Sim screen shows it running, the
 * queueing tables quantify it. This surface is the only one that takes a
 * position on what the user should DO, which is the question they actually
 * arrived with.
 *
 * That position used to be a tab of its own — a list of Diagnosis cards. It is
 * now the REMARKS column of the station table on the first tab (see
 * `QueueIndex.tsx`), with the line-wide findings above it, so a verdict is
 * read on the row it is about and Apply sits beside the numbers behind it.
 */

import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LineScopePicker, LineSimEmpty, PageTitleBar, ViewSwitch } from '../components';
import { OperatorLoadPanel } from '../components/OperatorLoadPanel';
import { SW_COLORS } from '../design/tokens';
import { useLineSim } from '../simulation/useLineSim';
import { QueueIndexPage } from './QueueIndex';
import { QueueAnalyticsPage } from './QueueAnalytics';

/**
 * INSIGHTS is the single analysis surface, so the pages that used to be their
 * own top-level tabs are mounted here as panels. They already read the shared
 * session and the shared scope, so nothing about them changes — they simply
 * stop being separate destinations the user has to know about.
 */
type InsightTab = 'queues' | 'timeline';

const INSIGHT_TABS: InsightTab[] = ['queues', 'timeline'];

/**
 * `?tab=` values that used to be tabs here and now live on REPORTS, which has
 * its own place on the rail: `reports` itself, and `stations` ("Where the load
 * sits"), whose two charts Reports already drew. A saved link to either is
 * sent on to `/reports` rather than silently opening the queue table.
 */
const MOVED_TO_REPORTS = new Set(['reports', 'stations']);

/**
 * Default tab, and the one that carries no `?tab=` so the plain URL stays
 * clean. An old `?tab=diagnosis` link is not in the list above, so it falls
 * through to here — which is where the diagnosis now lives.
 */
const DEFAULT_TAB: InsightTab = 'queues';

export function InsightsPage() {
  const navigate = useNavigate();
  const { allLines, emptyReason, unassignedStationCount, runs, twin } = useLineSim();
  /**
   * The open tab lives in the URL, not in component state.
   *
   * Two of these tabs drill into `/workstation/:…`, and coming back from there
   * used to remount this page at its default tab — the user could land tabs
   * away from the chart they had clicked out of, with no sign of where they
   * had been. An addressable tab makes "back" mean something, and makes the view
   * linkable besides. `replace` so flipping tabs doesn't stack history entries
   * the browser back button then has to chew through.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('tab');
  const requested = param as InsightTab | null;
  const tab: InsightTab = requested && INSIGHT_TABS.includes(requested) ? requested : DEFAULT_TAB;
  const setTab = (v: InsightTab) => {
    const next = new URLSearchParams(searchParams);
    if (v === DEFAULT_TAB) next.delete('tab');
    else next.set('tab', v);
    setSearchParams(next, { replace: true });
  };

  if (param && MOVED_TO_REPORTS.has(param)) return <Navigate to="/reports" replace />;

  if (emptyReason) {
    return (
      <div style={{ padding: 24, height: '100%' }}>
        <LineSimEmpty
          reason={emptyReason}
          unassignedStationCount={unassignedStationCount}
          what="Line analysis"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: SW_COLORS.paperDeep,
      }}
    >
      {/* The same title bar RESOURCES, BUILD and RUN open with. The line
          picker sits in its centre — the same place RUN puts it — because it
          scopes every tab below, not any one of them. */}
      <PageTitleBar
        title="Statistics"
        onBack={() => navigate('/')}
        center={<LineScopePicker lines={allLines} />}
        right={
          // Table view / graph view. The same orange pill BUILD and RUN use
          // for their views, icons only — the two shapes say what the words
          // did, and the tooltip still names each.
          <ViewSwitch<InsightTab>
            inline
            value={tab}
            onChange={setTab}
            options={[
              { value: 'queues', label: <TableGlyph />, title: 'Table: per-station queues' },
              { value: 'timeline', label: <ChartGlyph />, title: 'Graphs: stations over time' },
            ]}
          />
        }
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      {tab === 'queues' && (
        <>
          <QueueIndexPage embedded />
          {/* Stations above, people below: the same run read by who did the
              work rather than where it was done. */}
          <OperatorLoadPanel runs={runs} twin={twin} />
        </>
      )}
      {tab === 'timeline' && <QueueAnalyticsPage embedded />}
      </div>
    </div>
  );
}

/** A table: an outlined grid with a header rule and two columns. */
function TableGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" />
      <path d="M1.75 6.25h12.5M1.75 9.75h12.5M6.5 6.25v7" />
    </svg>
  );
}

/** A line chart: two axes and a rising trace. */
function ChartGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 2v12h12" />
      <path d="M4.5 10.5l3-3.5 2.5 2 3.5-5" />
    </svg>
  );
}
