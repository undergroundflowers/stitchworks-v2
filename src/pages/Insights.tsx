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

import { useSearchParams } from 'react-router-dom';
import {
  Card,
  LineScopePicker,
  LineSimEmpty,
  SectionHeader,
  ToggleGroup,
} from '../components';
import { SW_COLORS } from '../design/tokens';
import { useLineSim } from '../simulation/useLineSim';
import { UtilizationBarChart, QueueParetoChart } from '../components/charts';
import { QueueIndexPage } from './QueueIndex';
import { QueueAnalyticsPage } from './QueueAnalytics';
import { ReportsPage } from './Reports';

/**
 * INSIGHTS is the single analysis surface, so the pages that used to be their
 * own top-level tabs are mounted here as panels. They already read the shared
 * session and the shared scope, so nothing about them changes — they simply
 * stop being separate destinations the user has to know about.
 */
type InsightTab = 'queues' | 'stations' | 'timeline' | 'reports';

const INSIGHT_TABS: InsightTab[] = ['queues', 'stations', 'timeline', 'reports'];

/**
 * Default tab, and the one that carries no `?tab=` so the plain URL stays
 * clean. An old `?tab=diagnosis` link is not in the list above, so it falls
 * through to here — which is where the diagnosis now lives.
 */
const DEFAULT_TAB: InsightTab = 'queues';

export function InsightsPage() {
  const { state, allLines, emptyReason, unassignedStationCount } = useLineSim();
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
  const requested = searchParams.get('tab') as InsightTab | null;
  const tab: InsightTab = requested && INSIGHT_TABS.includes(requested) ? requested : DEFAULT_TAB;
  const setTab = (v: InsightTab) => {
    const next = new URLSearchParams(searchParams);
    if (v === DEFAULT_TAB) next.delete('tab');
    else next.set('tab', v);
    setSearchParams(next, { replace: true });
  };

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
    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: SW_COLORS.paperDeep, padding: 24 }}>
      {/* A toolbar, not a page header. The kicker / title / sub that used to
          sit here ("Insights — What to fix on this line") named the surface
          the nav had already named and spent three lines doing it, so the
          controls now start at the top of the page: the tabs at the left
          edge, aligned with the cards they switch, and the scope picker at
          the far right. Wraps at narrow widths instead of crushing either. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <ToggleGroup
          value={tab}
          onChange={(v) => setTab(v as InsightTab)}
          options={[
            { value: 'queues', label: 'Σ Per-station queues' },
            { value: 'stations', label: '▤ Where the load sits' },
            { value: 'timeline', label: '∿ Over time' },
            { value: 'reports', label: '⌬ Reports' },
          ]}
        />
        <LineScopePicker lines={allLines} />
      </div>

      {tab === 'queues' && <QueueIndexPage embedded />}
      {tab === 'timeline' && <QueueAnalyticsPage embedded />}
      {tab === 'reports' && <ReportsPage embedded />}

      {/* Side by side, not stacked. Both charts draw through a 600-unit
          viewBox at `width: 100%`, so a full-width card blew them up ~2.5×:
          giant bars, giant labels, and each panel taller than the viewport.
          At half width they land near their intended scale, and the two
          readings of the same run — who is saturated, where WIP piles up —
          can be compared without scrolling between them. `alignItems:
          start` so the shorter chart doesn't stretch to match the taller. */}
      {tab === 'stations' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            alignItems: 'start',
            gap: 16,
          }}
        >
          <Card>
            <SectionHeader
              title="Operator saturation by station"
              sub="ρ̂ measured from the run. The bar furthest right is the constraint — it sets what the line can deliver."
            />
            <UtilizationBarChart stations={state.stations.map((s) => ({ ...s, lineName: '' }))} />
          </Card>
          <Card>
            <SectionHeader
              title="Where WIP collects"
              sub="Average bundles waiting per station, worst first, with the cumulative share. A short head means a few stations hold most of your work-in-progress."
            />
            <QueueParetoChart stations={state.stations.map((s) => ({ ...s, lineName: '' }))} />
          </Card>
        </div>
      )}
    </div>
  );
}
