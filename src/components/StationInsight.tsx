/**
 * The pieces of the station pop-up that are about ONE station in the context
 * of its line: where it stands, who feeds it, whether the run agrees with
 * theory, and how it moved over the shift. Each is a card; the pop-up decides
 * the order.
 *
 * Nothing here knows about the Workstations table, so the table's page can
 * import these without the two files importing each other.
 */

import { useState, type ReactNode } from 'react';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';
import { ToggleGroup } from './ToggleGroup';
import { Sym } from './Sym';
import {
  StationTimeseriesChart,
  type StationSeriesBasis,
} from './StationTimeseriesChart';
import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_TYPE } from '../design/tokens';
import { meanOf, type StationHistoryPoint, type StationView } from '../simulation';
import type { QuantityId } from '../simulation/notation';
import type { QueueFinding } from '../domain/queue-advisor';

const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : v > 0 ? '∞' : '—');
const num = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : v > 0 ? '∞' : '—');

/** A station's name as a link that switches the pop-up to it. */
function StationLink({
  station,
  onSelect,
  children,
}: {
  station: StationView;
  onSelect: (wsId: string) => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(station.wsId)}
      title={`Open ${station.opName}`}
      style={{
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
      }}
    >
      {children ?? station.opName}
    </button>
  );
}

/**
 * A remark's sentence with every OTHER station it names turned into a link.
 *
 * Remarks are written as prose ("starved, waiting on Side seam"), so the
 * station is found by its name in the text. Longest names are matched first,
 * so "Sleeve attach round" is not cut short by a station called "Sleeve
 * attach"; where two stations share a name the first on the line is the one
 * linked, which is the best a name alone can do.
 */
export function linkStationNames(
  text: string,
  stations: StationView[],
  selfWsId: string,
  onSelect: (wsId: string) => void,
): ReactNode {
  const byName = new Map<string, StationView>();
  for (const s of stations) {
    if (s.wsId !== selfWsId && s.opName.trim().length >= 3 && !byName.has(s.opName)) {
      byName.set(s.opName, s);
    }
  }
  if (byName.size === 0) return text;
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g',
  );
  return text.split(pattern).map((part, i) => {
    const hit = byName.get(part);
    return hit ? <StationLink key={i} station={hit} onSelect={onSelect} /> : part;
  });
}

/**
 * The arithmetic behind a remark: the traffic-intensity formula with this
 * station's own numbers in it, and — for a fix that adds an operator — the
 * same line worked again with the new count.
 */
export function RemarkNumbers({ station, finding }: { station: StationView; finding: QueueFinding }) {
  const mu = station.serviceDist ? 60 / meanOf(station.serviceDist) : NaN;
  const c = station.serversTotal;
  const rho = station.lambda / (c * mu);
  const patch = finding.patch;
  const line = (servers: number, value: number) => (
    <>
      <Sym quantity="rho" /> = <Sym quantity="lambda" /> / (<Sym quantity="servers" /> ·{' '}
      <Sym quantity="mu" />) = {num(station.lambda)} / ({servers} × {num(mu)}) ={' '}
      <strong style={{ color: value >= 1 ? SW_COLORS.alarm : SW_COLORS.ink }}>{pct(value)}</strong>
    </>
  );
  return (
    <div
      style={{
        fontFamily: SW_FONTS.mono,
        fontSize: 12,
        lineHeight: 1.7,
        color: SW_COLORS.muted,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div>{line(c, rho)}</div>
      <div>
        measured <Sym quantity="rho" /> {pct(station.utilization)} · <Sym quantity="Lq" />{' '}
        {num(station.LqObserved)} bundles · <Sym quantity="Wq" /> {num(station.WqObservedMin)} min
      </div>
      {patch?.kind === 'addServer' && patch.wsId === station.wsId && (
        <div style={{ color: SW_COLORS.ink }}>
          after the fix · {line(patch.to, station.lambda / (patch.to * mu))}
        </div>
      )}
      {patch?.kind === 'setBundleSize' && (
        <div style={{ color: SW_COLORS.ink }}>
          after the fix · bundle size {patch.from} → {patch.to} pieces
        </div>
      )}
      {patch?.kind === 'setBuffer' && (
        <div style={{ color: SW_COLORS.ink }}>after the fix · buffer capped at {patch.n} bundles</div>
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: ReactNode; value: ReactNode; note?: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...SW_TYPE.overline, color: SW_COLORS.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ ...SW_TYPE.numeric, fontSize: 16, color: SW_COLORS.ink }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** Where this station stands among the others on the line. */
export function StationPosition({
  station,
  index,
  stations,
}: {
  station: StationView;
  index: number;
  stations: StationView[];
}) {
  const busierThan = stations.filter((s) => s.utilization > station.utilization).length;
  const totalLq = stations.reduce((sum, s) => sum + Math.max(0, s.LqObserved), 0);
  const share = totalLq > 0 ? station.LqObserved / totalLq : 0;
  return (
    <Card>
      <SectionHeader title="Position on the line" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '12px 20px',
        }}
      >
        <Figure label="Station" value={`${index + 1} of ${stations.length}`} note="in line order" />
        <Figure
          label="Saturation rank"
          value={`${ordinal(busierThan + 1)} busiest`}
          note={`${pct(station.utilization)} of the shift busy`}
        />
        <Figure
          label="Share of waiting bundles"
          value={pct(share)}
          note={`${num(station.LqObserved)} of ${num(totalLq)} on the line`}
        />
      </div>
    </Card>
  );
}

interface FlowLink {
  fromWsId: string;
  toWsId: string;
}

/** The stations this one takes work from and hands work to. */
export function StationNeighbours({
  station,
  stations,
  connectors,
  onSelect,
}: {
  station: StationView;
  stations: StationView[];
  connectors: readonly FlowLink[];
  onSelect: (wsId: string) => void;
}) {
  const byId = new Map(stations.map((s) => [s.wsId, s]));
  const pick = (ids: string[]) =>
    [...new Set(ids)].map((id) => byId.get(id)).filter((s): s is StationView => !!s);
  const upstream = pick(connectors.filter((c) => c.toWsId === station.wsId).map((c) => c.fromWsId));
  const downstream = pick(connectors.filter((c) => c.fromWsId === station.wsId).map((c) => c.toWsId));
  if (upstream.length === 0 && downstream.length === 0) return null;

  const list = (title: string, items: StationView[], empty: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...SW_TYPE.overline, color: SW_COLORS.muted, marginBottom: 6 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: SW_COLORS.muted }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((s) => (
            <div
              key={s.wsId}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                padding: '6px 10px',
                border: `1px solid ${SW_COLORS.lineSoft}`,
                borderRadius: SW_RADIUS.sm,
                fontSize: 13,
              }}
            >
              <StationLink station={s} onSelect={onSelect} />
              <span
                style={{
                  flex: 'none',
                  fontFamily: SW_FONTS.mono,
                  fontSize: 11,
                  color: SW_COLORS.muted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Sym quantity="rho" /> {pct(s.utilization)} · <Sym quantity="Lq" /> {num(s.LqObserved)} ·
                queue now {Math.round(s.queueLen)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <SectionHeader title="Neighbours" sub="Click a station to open it here." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
        {list('Feeds this station', upstream, 'Nothing upstream: this is where the line starts.')}
        {list('Fed by this station', downstream, 'Nothing downstream: this is where the line ends.')}
      </div>
    </Card>
  );
}

/** How far a measured figure may sit from theory and still count as agreeing. */
const AGREE_WITHIN = 0.15;
/** Below this, both values are too small for a ratio to mean anything. */
const NEGLIGIBLE = 0.02;

type Verdict = 'agrees' | 'off' | 'unstable' | 'none';

interface Comparison {
  q: QuantityId;
  name: string;
  sim: number;
  theory: number;
  fmt: (v: number) => string;
}

function judge(sim: number, theory: number): { verdict: Verdict; gap: number } {
  if (theory === Infinity) return { verdict: 'unstable', gap: NaN };
  if (!Number.isFinite(sim) || !Number.isFinite(theory)) return { verdict: 'none', gap: NaN };
  const diff = Math.abs(sim - theory);
  if (diff <= NEGLIGIBLE) return { verdict: 'agrees', gap: 0 };
  const gap = theory !== 0 ? (sim - theory) / theory : Infinity;
  return { verdict: Math.abs(gap) <= AGREE_WITHIN ? 'agrees' : 'off', gap };
}

/**
 * Sim against theory as a verdict rather than a table to compare by eye:
 * which figures agree, which are off and by how much.
 */
export function SimTheoryVerdict({ station }: { station: StationView }) {
  const a = station.analytical;
  const rows: Comparison[] = [
    { q: 'rho', name: 'Saturation', sim: station.utilization, theory: a.rho, fmt: pct },
    { q: 'Lq', name: 'Bundles waiting', sim: station.LqObserved, theory: a.Lq, fmt: num },
    { q: 'L', name: 'Bundles at station', sim: station.LObserved, theory: a.L, fmt: num },
    { q: 'Wq', name: 'Wait, min', sim: station.WqObservedMin, theory: a.Wq * 60, fmt: num },
    { q: 'W', name: 'Time at station, min', sim: station.WqObservedMin + station.smv, theory: a.W * 60, fmt: num },
    { q: 'P0', name: 'Idle share', sim: 1 - station.utilization, theory: a.P0, fmt: pct },
  ];
  const judged = rows.map((r) => ({ ...r, ...judge(r.sim, r.theory) }));
  const agree = judged.filter((r) => r.verdict === 'agrees').length;
  const unstable = judged.some((r) => r.verdict === 'unstable');
  const tone = (v: Verdict) =>
    v === 'agrees' ? SW_COLORS.ok : v === 'off' ? SW_COLORS.warn : v === 'unstable' ? SW_COLORS.alarm : SW_COLORS.muted;

  return (
    <Card>
      <SectionHeader
        title="Sim against theory"
        sub={
          unstable
            ? 'Theory has no steady state here: the station is offered more than it can serve.'
            : `${agree} of ${judged.length} figures within ${AGREE_WITHIN * 100}% of theory.`
        }
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, 1.4fr) repeat(3, minmax(70px, 1fr)) minmax(120px, 1fr)',
          gap: '6px 16px',
          alignItems: 'baseline',
          fontSize: 13,
        }}
      >
        {['Figure', 'Sim', 'Theory', 'Gap', 'Verdict'].map((h, i) => (
          <div
            key={h}
            style={{ ...SW_TYPE.overline, color: SW_COLORS.muted, textAlign: i === 0 || i === 4 ? 'left' : 'right' }}
          >
            {h}
          </div>
        ))}
        {judged.map((r) => (
          <VerdictRow key={r.q} row={r} color={tone(r.verdict)} />
        ))}
      </div>
    </Card>
  );
}

function VerdictRow({
  row,
  color,
}: {
  row: Comparison & { verdict: Verdict; gap: number };
  color: string;
}) {
  const right = { ...SW_TYPE.numeric, textAlign: 'right' as const };
  const label =
    row.verdict === 'agrees'
      ? 'agrees'
      : row.verdict === 'off'
        ? row.gap > 0
          ? 'sim is higher'
          : 'sim is lower'
        : row.verdict === 'unstable'
          ? 'no steady state'
          : 'no closed form';
  return (
    <>
      <div style={{ color: SW_COLORS.ink }}>
        <Sym quantity={row.q} color={SW_COLORS.brandText} /> {row.name}
      </div>
      <div style={right}>{row.fmt(row.sim)}</div>
      <div style={{ ...right, color: SW_COLORS.muted }}>{row.fmt(row.theory)}</div>
      <div style={{ ...right, color }}>
        {Number.isFinite(row.gap) && row.gap !== 0
          ? `${row.gap > 0 ? '+' : ''}${(row.gap * 100).toFixed(0)}%`
          : '—'}
      </div>
      <div style={{ color, fontWeight: 600 }}>{label}</div>
    </>
  );
}

/** This station's four lines over the shift, on either basis. */
export function StationHistoryCard({
  station,
  history,
}: {
  station: StationView;
  history: StationHistoryPoint[];
}) {
  const [basis, setBasis] = useState<StationSeriesBasis>('average');
  return (
    <Card>
      <SectionHeader
        title="Over time"
        sub={
          basis === 'step'
            ? 'Each step is the mean over those 5 minutes alone. Dashed lines are the theory targets.'
            : 'Each point is the average since the run began. Dashed lines are the theory targets.'
        }
        right={
          <ToggleGroup<StationSeriesBasis>
            value={basis}
            options={[
              { value: 'average', label: 'Average' },
              { value: 'step', label: 'Instantaneous' },
            ]}
            onChange={setBasis}
          />
        }
      />
      <StationTimeseriesChart station={station} history={history} basis={basis} />
    </Card>
  );
}
