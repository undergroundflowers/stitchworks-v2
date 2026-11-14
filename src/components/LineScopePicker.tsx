/**
 * Which sewing line the analysis surfaces are pointed at.
 *
 * Bound to the shared `useSimScope`, so switching lines here moves the Sim
 * screen too — there is one answer to "what am I looking at" rather than one
 * per page.
 *
 * A dropdown, not a row of chips. The chips printed every line's full name
 * side by side, so a four-line factory with real style names already wrapped
 * onto a second row and pushed the page down; a dropdown is one control wide
 * however many lines there are, and it is the same control RUN uses for the
 * same choice.
 */

import { SW_COLORS, SW_TYPE } from '../design/tokens';
import { HudSelect } from './HudSelect';
import { resolveSimScope, useSimScope } from '../store/simScope';
import type { SewingLine } from '../domain/twin';

export interface LineScopePickerProps {
  /** Every line in the twin. A single-line factory renders a static label —
   *  a one-option picker is just noise. */
  lines: SewingLine[];
}

export function LineScopePicker({ lines }: LineScopePickerProps) {
  const scope = resolveSimScope(useSimScope((s) => s.scope), lines);
  const setScope = useSimScope((s) => s.setScope);

  if (lines.length === 0) return null;

  if (lines.length === 1) {
    return (
      <div style={{ ...SW_TYPE.micro, color: SW_COLORS.muted }}>
        {lines[0].name}
      </div>
    );
  }

  // One string per option: 'factory', or 'line:<id>'.
  const value = scope.kind === 'line' ? `line:${scope.id}` : 'factory';

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
      <span style={{ ...SW_TYPE.overline, flex: 'none', color: SW_COLORS.faint }}>SCOPE</span>
      <HudSelect<string>
        value={value}
        size="sm"
        mono
        minWidth={320}
        title={
          scope.kind === 'line'
            ? 'Analysing this sewing line on its own'
            : 'Analysing every wired sewing line together'
        }
        options={[
          { value: 'factory', label: 'ALL LINES', meta: `${lines.length} lines` },
          ...lines.map((l) => ({ value: `line:${l.id}`, label: l.name })),
        ]}
        onChange={(v) =>
          setScope(v === 'factory' ? { kind: 'factory' } : { kind: 'line', id: v.slice(5) })
        }
      />
    </div>
  );
}
