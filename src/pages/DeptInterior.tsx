import { useParams } from 'react-router-dom';
import { PageStub } from './PageStub';

/**
 * Department Interior — drill-down from Live Floor. Shows the inside of a
 * department (cutting, sewing, finishing, etc.) with workstations, sub-op
 * sequencing, machine catalogue, skill-matrix modal, and four view modes
 * (PLAN / FLOW / PEOPLE / NUMBERS).
 *
 * Source: sw/sw-screens-dept.jsx (1,227 lines). Port pending — this is the
 * single biggest new screen in the v2 design import.
 *
 * Drill-down route: /dept/:deptId
 *   deptIds we expect to see (per SW_DEPTS in the source):
 *     dock_in, fabric, spreading, cutting, bundling, sewing, qc, finishing,
 *     pack, dock_out
 */
export function DeptInteriorPage() {
  const { deptId } = useParams();
  return (
    <PageStub
      kicker={`Department · ${deptId ?? '?'}`}
      title="Inside the department"
      sub="Workstation grid, sub-op sequencer, skill matrix modal, plan/flow/people/numbers views."
      sourceLines={`sw/sw-screens-dept.jsx (1,227 lines) — SWDeptInterior + DeptCanvas + DeptInspector + SubopsRibbon + SubopsModal + SkillMatrixModal · deptId="${deptId ?? '?'}"`}
    />
  );
}
