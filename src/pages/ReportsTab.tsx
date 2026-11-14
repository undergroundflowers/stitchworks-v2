/**
 * REPORTS — its own surface on the rail.
 *
 * It was the third tab inside STATISTICS. It is a different kind of page from
 * the two it sat beside: those are tables and charts to read a run with, this
 * is the written-up result of one — KPIs, line balance, saved scenarios — and
 * it is being redesigned separately. Giving it a rail tab of its own takes it
 * out of the way of that work without changing anything inside it.
 *
 * The frame is the same as STATISTICS: the shared title bar with the line
 * picker in its centre, the same empty state when there is no line to report
 * on, and the report itself underneath.
 */

import { useNavigate } from 'react-router-dom';
import { LineScopePicker, LineSimEmpty, PageTitleBar } from '../components';
import { SW_COLORS } from '../design/tokens';
import { useLineSim } from '../simulation/useLineSim';
import { ReportsPage } from './Reports';

export function ReportsTabPage() {
  const navigate = useNavigate();
  const { allLines, emptyReason, unassignedStationCount } = useLineSim();

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
      <PageTitleBar
        title="Reports"
        onBack={() => navigate('/')}
        center={emptyReason ? undefined : <LineScopePicker lines={allLines} />}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
        {emptyReason ? (
          <LineSimEmpty
            reason={emptyReason}
            unassignedStationCount={unassignedStationCount}
            what="Reports"
          />
        ) : (
          <ReportsPage embedded />
        )}
      </div>
    </div>
  );
}
