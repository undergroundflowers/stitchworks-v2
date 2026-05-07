import { useParams } from 'react-router-dom';
import { PageStub } from './PageStub';

/**
 * Workstation Detail — third-level drill-down from Department Interior.
 * One workstation: machine, operator, current sub-op, cycle stats, skill
 * fit. Originally `SWWorkstationDetail` in the v2 design import (~150
 * lines, lives at the bottom of sw/sw-screens-dept.jsx).
 *
 * Drill-down route: /workstation/:deptId/:wsId
 */
export function WorkstationDetailPage() {
  const { deptId, wsId } = useParams();
  return (
    <PageStub
      kicker={`Workstation · ${deptId ?? '?'} / ${wsId ?? '?'}`}
      title="Workstation detail"
      sub="Machine + operator + current sub-op + cycle stats + skill fit."
      sourceLines={`sw/sw-screens-dept.jsx (SWWorkstationDetail at bottom of file) · deptId="${deptId ?? '?'}" · wsId="${wsId ?? '?'}"`}
    />
  );
}
