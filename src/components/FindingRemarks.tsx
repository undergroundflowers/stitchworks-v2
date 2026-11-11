/**
 * Diagnosis findings, written where the thing they are about already is.
 *
 * These used to be a tab of their own: a list of cards, each naming a station
 * and then explaining it. The station table one tab over showed the same
 * stations with the numbers behind every finding, so reading a diagnosis meant
 * holding a name in your head across a tab switch to find its row. A finding
 * is a remark ON a row; it belongs in the row.
 *
 *   <StationRemark>  one table cell — severity, verdict → fix, and Apply.
 *   <LineRemarks>    the findings about the line as a whole, above the table.
 *
 * The cell is one line, so it carries the short `remark`. The reasoning, the
 * expected effect and every further finding on the same station are one click
 * away in a popover — portalled, because the table cell clips and the pinned
 * column it lives in is `position: sticky`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS, SW_TYPE, SW_Z } from '../design/tokens';
import { alpha } from '../design/color-utils';
import {
  describePatch,
  type FindingSeverity,
  type QueueFinding,
} from '../domain/queue-advisor';
import type { StationView } from '../simulation/sim-state';
import { Button } from './Button';

/** A function, not a const: the colour tokens are read at render time. */
function severityStyle(severity: FindingSeverity): { color: string; label: string } {
  switch (severity) {
    case 'critical':
      return { color: SW_COLORS.alarm, label: 'CRITICAL' };
    case 'warn':
      return { color: SW_COLORS.warn, label: 'FIX THIS' };
    case 'opportunity':
      return { color: SW_COLORS.fabric, label: 'OPPORTUNITY' };
    case 'info':
      return { color: SW_COLORS.muted, label: 'NOTE' };
  }
}

/** Hover text: the reasoning the one-line remark has no room for. */
function fullText(f: QueueFinding): string {
  return [f.title + '.', f.detail, f.expect ? `Expect: ${f.expect}` : '']
    .filter(Boolean)
    .join('\n\n');
}

function applyLabel(f: QueueFinding): string {
  return f.patch?.kind === 'rebalance' ? 'Open balancer' : 'Apply';
}

function SeverityChip({ severity }: { severity: FindingSeverity }) {
  const sev = severityStyle(severity);
  return (
    <span
      style={{
        flex: 'none',
        padding: '2px 6px',
        borderRadius: 4,
        fontFamily: SW_FONTS.mono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.3px',
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        background: alpha(sev.color, 0.16),
        color: sev.color,
      }}
    >
      {sev.label}
    </span>
  );
}

/** Row-sized Apply. `Button`'s `sm` is a touch tall for a 13px table row. */
function ApplyButton({
  finding,
  stations,
  onApply,
}: {
  finding: QueueFinding;
  stations: StationView[];
  onApply: (f: QueueFinding) => void;
}) {
  if (!finding.patch) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      title={describePatch(finding.patch, stations)}
      onClick={() => onApply(finding)}
      style={{ flex: 'none', height: CELL_H, padding: '0 9px', whiteSpace: 'nowrap' }}
    >
      {applyLabel(finding)}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  One finding, in full
// ─────────────────────────────────────────────────────────────────────────

function FindingBody({
  finding,
  stations,
  onApply,
}: {
  finding: QueueFinding;
  stations: StationView[];
  onApply: (f: QueueFinding) => void;
}) {
  const sev = severityStyle(finding.severity);
  return (
    <div style={{ borderLeft: `3px solid ${sev.color}`, paddingLeft: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <SeverityChip severity={finding.severity} />
        <span style={{ ...SW_TYPE.body, fontWeight: 600, color: SW_COLORS.ink }}>
          {finding.title}
        </span>
      </div>
      <p style={{ ...SW_TYPE.caption, color: SW_COLORS.muted, margin: '0 0 6px' }}>
        {finding.detail}
      </p>
      <div style={{ ...SW_TYPE.caption, color: SW_COLORS.ink, fontWeight: 600, display: 'flex', gap: 6 }}>
        <span style={{ color: sev.color, fontFamily: SW_FONTS.mono }}>→</span>
        <span>{finding.action}</span>
      </div>
      {finding.expect && (
        <div style={{ ...SW_TYPE.caption, color: SW_COLORS.faint, marginTop: 4 }}>
          Expect: {finding.expect}
        </div>
      )}
      {finding.patch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Button variant="primary" size="sm" onClick={() => onApply(finding)}>
            {applyLabel(finding)}
          </Button>
          <span style={{ ...SW_TYPE.caption, color: SW_COLORS.faint }}>
            {describePatch(finding.patch, stations)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  The table cell
// ─────────────────────────────────────────────────────────────────────────

const POPOVER_W = 380;

/** Height of the Apply button — and so of the cell, with or without one, so
 *  a row that has a remark is not taller than its neighbour that has none. */
const CELL_H = 24;

export interface StationRemarkProps {
  /** The station whose row this is. */
  wsId: string;
  /** This station's findings, worst first. Empty renders an empty cell. */
  findings: QueueFinding[];
  stations: StationView[];
  onApply: (f: QueueFinding) => void;
}

export function StationRemark({ wsId, findings, stations, onApply }: StationRemarkProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: -9999 });

  // Same contract as HelpDot: the note is portalled, so it needs its own hit
  // test, and the listeners exist only while a note is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!anchorRef.current?.contains(t) && !noteRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Under the remark, flipping above when the room below cannot hold it. */
  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 6;
    const EDGE = 8;
    const h = noteRef.current?.offsetHeight ?? 0;
    const below = window.innerHeight - r.bottom - GAP;
    const top = h > below && r.top - GAP > below ? r.top - GAP - h : r.bottom + GAP;
    const next = {
      left: Math.max(EDGE, Math.min(r.left, window.innerWidth - POPOVER_W - EDGE)),
      top: Math.max(EDGE, top),
    };
    setPos((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  const top = findings[0];
  if (!top) return <div style={{ height: CELL_H }} />;
  const more = findings.length - 1;
  // A line-wide finding that merely marks this row (a starved station) keeps
  // its one Apply above the table; a button on each of ten rows that all do
  // the same thing is ten buttons too many. It is still in the popover.
  const ownFix = top.wsId === wsId;

  return (
    // The row itself is a click target (it opens the station). Nothing in
    // this cell should trigger that, so the cell swallows its own clicks.
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, height: CELL_H }}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={fullText(top)}
        aria-expanded={open}
        aria-label={`${severityStyle(top.severity).label}: ${top.remark ?? top.title}. Show the reasoning.`}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: SW_COLORS.ink,
          font: 'inherit',
        }}
      >
        <SeverityChip severity={top.severity} />
        <span
          style={{
            ...SW_TYPE.body,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {top.remark ?? top.title}
        </span>
        {more > 0 && (
          <span
            title={findings.slice(1).map((f) => f.remark ?? f.title).join('\n')}
            style={{
              ...SW_TYPE.numeric,
              flex: 'none',
              fontSize: 11,
              fontWeight: 700,
              color: SW_COLORS.muted,
              padding: '1px 5px',
              borderRadius: 999,
              border: `1px solid ${SW_COLORS.line}`,
            }}
          >
            +{more}
          </span>
        )}
      </button>
      {ownFix && <ApplyButton finding={top} stations={stations} onApply={onApply} />}

      {open &&
        createPortal(
          <div
            ref={noteRef}
            role="dialog"
            aria-label="Remarks on this station"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              zIndex: SW_Z.popover,
              width: POPOVER_W,
              maxHeight: 'min(70vh, 520px)',
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              background: SW_COLORS.paperDeep,
              border: `1px solid ${SW_COLORS.line}`,
              borderRadius: SW_RADIUS.sm,
              boxShadow: SW_SHADOWS.float,
              textAlign: 'left',
              whiteSpace: 'normal',
            }}
          >
            {findings.map((f) => (
              <FindingBody
                key={f.id}
                finding={f}
                stations={stations}
                onApply={(x) => {
                  setOpen(false);
                  onApply(x);
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Above the table
// ─────────────────────────────────────────────────────────────────────────

export interface LineRemarksProps {
  /** Findings about the whole line, worst first. Empty renders nothing. */
  findings: QueueFinding[];
  stations: StationView[];
  onApply: (f: QueueFinding) => void;
}

/** One line per line-wide finding: severity, what is wrong, what to do. */
export function LineRemarks({ findings, stations, onApply }: LineRemarksProps) {
  if (findings.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
      {findings.map((f) => {
        const sev = severityStyle(f.severity);
        return (
          <div
            key={f.id}
            title={fullText(f)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: SW_RADIUS.sm,
              border: `1px solid ${alpha(sev.color, 0.35)}`,
              borderLeft: `3px solid ${sev.color}`,
              background: alpha(sev.color, 0.07),
            }}
          >
            <SeverityChip severity={f.severity} />
            <LineRemarkText title={f.title} action={f.action} arrow={sev.color} />
            <ApplyButton finding={f} stations={stations} onApply={onApply} />
          </div>
        );
      })}
    </div>
  );
}

function LineRemarkText({
  title,
  action,
  arrow,
}: {
  title: ReactNode;
  action: ReactNode;
  arrow: string;
}) {
  return (
    <span style={{ ...SW_TYPE.body, flex: 1, minWidth: 0, color: SW_COLORS.ink }}>
      <strong style={{ fontWeight: 600 }}>{title}</strong>
      <span style={{ color: arrow, fontFamily: SW_FONTS.mono, margin: '0 6px' }}>→</span>
      <span style={{ color: SW_COLORS.muted }}>{action}</span>
    </span>
  );
}
