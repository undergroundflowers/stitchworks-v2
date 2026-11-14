import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { SW_COLORS, SW_MOTION, SW_RADIUS, SW_SHADOWS, SW_TYPE, SW_Z } from '../design/tokens';
import { alpha } from '../design/color-utils';
import { Button } from './Button';
import { Caret } from './Chevron';

/**
 * The app's data table.
 *
 * Every table in Stitchworks had been hand-rolled at its call site, and each
 * one drifted: its own header type, its own row rhythm, its own idea of what
 * a "quiet" row looks like. The worst of it was zebra striping — the station
 * table banded alternate rows with a hard-coded cream `#FAF7F0`, which had
 * been written against a light theme. On the Control Room ground (`paper` is
 * near-black, `ink` near-white) that band paints a white slab under
 * near-white text, and every second row of the table goes unreadable. A
 * banded row is decoration pretending to be structure; a hairline does the
 * same job with none of the contrast risk.
 *
 * So: no banding. One ground, hairline rules between rows, a header well that
 * reads as a header because of its type and its rule — not because it is a
 * different colour of paint. Numbers use `SW_TYPE.numeric` (tabular figures),
 * so a column of them lines up on the decimal without any extra work.
 *
 * ## Resizable columns
 *
 * A dense table is always a negotiation: `Operation` wants room to breathe,
 * `ρ theory` needs six characters and never more. Fixed widths guess that
 * negotiation once, at build time, for every factory. Instead each column
 * declares a starting width and the user drags the rule between headers to
 * settle it themselves. Double-click a handle to put that column back.
 *
 * Widths are plain pixels, and the grid is all-pixel, so a drag moves exactly
 * as far as the pointer does. When the columns outgrow the container the
 * table scrolls sideways rather than crushing every column to fit — the
 * crushing is what loses the information in the first place.
 *
 * ## Sorting
 *
 * A column that declares `sortValue` sorts when its header is clicked: once
 * for the direction that puts the interesting end first (largest number, or
 * A→Z), again to reverse, a third time to return to the order `rows` came in.
 * The arrow in the header is the only indicator — a sentence above the table
 * repeating it was noise.
 * Empty and NaN values sink to the bottom in either direction — "no reading"
 * is never the largest or the smallest of anything.
 *
 * Sorting reorders what is drawn, not what a row *is*: `cell`, `rowStyle` and
 * `onRowClick` always receive the row's index in the original `rows` array,
 * so a caller that keys off position ("row 12 is the bottleneck") stays right.
 *
 * ## Hiding columns
 *
 * The COLUMNS menu ticks columns in and out. It sits above the table's right
 * edge unless the page gives it somewhere else to live (`menuHost`). A column marked
 * `hideable: false` is the row's identity and is not offered.
 *
 * Pass `storageKey` and the user's widths, hidden columns and sort survive a
 * reload.
 *
 * ## Pinned columns
 *
 * Sideways scroll has one cost: whatever sits in the last column is off-screen
 * exactly when the table is at its densest. A column marked `pin: 'right'`
 * stays against the right edge while the others scroll beneath it, so the one
 * thing a row is *for* — a verdict, an action — never needs a scroll to reach.
 * Its resize handle is on its left edge, the side that still has a neighbour.
 */

export interface DataTableColumn<T> {
  /** Stable identity — used for React keys and for width persistence. */
  key: string;
  /** Header content. Plain strings get the overline treatment automatically. */
  header?: ReactNode;
  /** Starting width in px. The user's drag overrides it from then on. */
  width: number;
  /** Floor for a drag. Defaults to 48px — below that a header is unreadable. */
  minWidth?: number;
  /** Numbers and codes right-align; text left-aligns. Default 'left'. */
  align?: 'left' | 'right';
  /** Render the cell in tabular mono. Use for anything numeric. */
  numeric?: boolean;
  /** Hold this column against the right edge while the rest scroll under it.
   *  Pinned columns render last, whatever their position in `columns`. */
  pin?: 'right';
  /** Name shown in the COLUMNS menu. Defaults to `header`; set it when the
   *  header is too terse to stand alone. */
  label?: ReactNode;
  /** What to sort this column by. Omit it and the column does not sort.
   *  `index` is the row's position in `rows`. */
  sortValue?: (row: T, index: number) => number | string | null | undefined;
  /** `false` keeps the column out of the COLUMNS menu: it is always shown. */
  hideable?: boolean;
  /** Cell content for one row. `index` is the row's position in `rows`,
   *  whatever order the table is currently sorted into. */
  cell: (row: T, index: number) => ReactNode;
}

export interface DataTableSort {
  key: string;
  dir: 'asc' | 'desc';
}

/** Per-row emphasis. `tone` tints the row and paints a left edge; `muted`
 *  is for rows that are present but not the point. */
export interface DataTableRowStyle {
  tone?: string | null;
  muted?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Whole-row click. Adds the pointer cursor and a hover lift. */
  onRowClick?: (row: T, index: number) => void;
  rowStyle?: (row: T, index: number) => DataTableRowStyle | null | undefined;
  /** Shown in place of the body when `rows` is empty. */
  empty?: ReactNode;
  /** localStorage key for the user's column widths, hidden columns and sort.
   *  Omit to keep them in-memory for the life of the mount. */
  storageKey?: string;
  /**
   * The surface the table sits on. Rows are transparent, so a pinned cell has
   * to paint this itself or the cells scrolling beneath would show through
   * it. Defaults to `paper` — what a `<Card>` is made of.
   */
  ground?: string;
  /**
   * An element to draw the COLUMNS button into, instead of above the table —
   * for a page that wants it in its own heading row. Pass the element from a
   * callback ref held in state; while it is still `null` the button waits
   * rather than flashing in its default place.
   */
  menuHost?: HTMLElement | null;
  /** Applied to the outer wrapper — the toolbar and the table together. */
  style?: CSSProperties;
}

/** Width of the invisible grab strip straddling each column rule. */
const HANDLE_W = 9;
const DEFAULT_MIN_W = 48;

function readStoredWidths(storageKey: string | undefined): Record<string, number> {
  if (!storageKey) return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function readStoredHidden(storageKey: string | undefined): string[] {
  if (!storageKey) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${storageKey}.hidden`) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function readStoredSort(storageKey: string | undefined): DataTableSort | null {
  if (!storageKey) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(`${storageKey}.sort`) ?? 'null') as
      | Partial<DataTableSort>
      | null;
    if (!parsed || typeof parsed.key !== 'string') return null;
    return { key: parsed.key, dir: parsed.dir === 'asc' ? 'asc' : 'desc' };
  } catch {
    return null;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full quota is not worth failing a table render over.
  }
}

type SortValue = number | string | null | undefined;

/** No reading at all — sorts last in both directions. ∞ is a real reading
 *  (an unstable queue) and sorts as the largest number. */
const isMissing = (v: SortValue) =>
  v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a < b ? -1 : 1;
  // `numeric` so WS2 sorts before WS10.
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * `rows` in the order a sort puts them, each still carrying its index in the
 * original array. Exported so a caller that steps through the table's rows
 * from outside it (a detail pop-up's previous / next) walks them in the order
 * the table is showing, not the order the data arrived in.
 */
export function sortRows<T>(
  rows: T[],
  sortColumn: DataTableColumn<T> | undefined,
  sort: DataTableSort | null,
): { row: T; index: number }[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  const valueOf = sortColumn?.sortValue;
  if (!sort || !valueOf) return indexed;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return indexed
    .map((e) => ({ ...e, v: valueOf(e.row, e.index) }))
    .sort((a, b) => {
      const am = isMissing(a.v);
      const bm = isMissing(b.v);
      if (am || bm) return am === bm ? a.index - b.index : am ? 1 : -1;
      return sign * compareValues(a.v, b.v) || a.index - b.index;
    });
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowStyle,
  empty,
  storageKey,
  ground,
  menuHost,
  style,
}: DataTableProps<T>) {
  const [widths, setWidths] = useState<Record<string, number>>(() => readStoredWidths(storageKey));
  const [hidden, setHidden] = useState<string[]>(() => readStoredHidden(storageKey));
  const [sort, setSort] = useState<DataTableSort | null>(() => readStoredSort(storageKey));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hoverHandle, setHoverHandle] = useState<string | null>(null);
  const [hoverHeader, setHoverHeader] = useState<string | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (storageKey) store(storageKey, widths);
  }, [storageKey, widths]);
  useEffect(() => {
    if (storageKey) store(`${storageKey}.hidden`, hidden);
  }, [storageKey, hidden]);
  useEffect(() => {
    if (storageKey) store(`${storageKey}.sort`, sort);
  }, [storageKey, sort]);

  // The menu closes on a press anywhere outside it, and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const down = (ev: MouseEvent) => {
      if (!menuRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [menuOpen]);

  const hideable = useMemo(() => columns.filter((c) => c.hideable !== false), [columns]);
  const shown = useMemo(
    () => columns.filter((c) => c.hideable === false || !hidden.includes(c.key)),
    [columns, hidden],
  );
  const hiddenCount = columns.length - shown.length;

  /**
   * The rows in drawing order, each still carrying its index in `rows`.
   * Ties (and missing values) fall back to that index, so the sort is stable
   * and a column of identical values leaves the table in its natural order.
   */
  const sortColumn = sort ? columns.find((c) => c.key === sort.key && c.sortValue) : undefined;
  const view = useMemo(() => sortRows(rows, sortColumn, sort), [rows, sort, sortColumn]);

  /** Header click: interesting end first → reversed → back to natural order. */
  const cycleSort = (col: DataTableColumn<T>) => {
    const valueOf = col.sortValue;
    if (!valueOf) return;
    // Numbers open largest-first (the busiest station is the one you came
    // for); text opens A→Z.
    const sample = rows.map((r, i) => valueOf(r, i)).find((v) => !isMissing(v));
    const first: DataTableSort['dir'] = typeof sample === 'number' ? 'desc' : 'asc';
    setSort((cur) => {
      if (!cur || cur.key !== col.key) return { key: col.key, dir: first };
      if (cur.dir === first) return { key: col.key, dir: first === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  };

  const toggleHidden = (key: string) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));

  const customised = hiddenCount > 0 || sort !== null || Object.keys(widths).length > 0;
  const resetLayout = () => {
    setWidths({});
    setHidden([]);
    setSort(null);
  };

  const widthOf = useCallback(
    (c: DataTableColumn<T>) => widths[c.key] ?? c.width,
    [widths],
  );

  /**
   * All-pixel tracks plus one flexible filler at the tail.
   *
   * The pixel tracks are what make a drag move exactly as far as the pointer
   * does. The filler soaks up whatever width is left over so the table still
   * fills its card instead of ending in a ragged edge — and it collapses to
   * zero the moment the columns outgrow the box, handing the overflow to the
   * horizontal scroll. Nothing is placed into it: grid auto-placement fills
   * the first N tracks and leaves the last one empty.
   */
  /**
   * Pinned columns go AFTER the filler, so they sit at the right edge of a
   * table that has room to spare as well as one that scrolls. That puts the
   * filler in the middle of the track list, where auto-placement would drop a
   * real cell into it — so with pins in play an empty element is rendered to
   * occupy it (`ordered` carries a `null` at that position).
   */
  const flow = useMemo(() => shown.filter((c) => c.pin !== 'right'), [shown]);
  const pinned = useMemo(() => shown.filter((c) => c.pin === 'right'), [shown]);
  const ordered = useMemo<(DataTableColumn<T> | null)[]>(
    () => (pinned.length > 0 ? [...flow, null, ...pinned] : flow),
    [flow, pinned],
  );

  const template = useMemo(
    () =>
      [
        ...flow.map((c) => `${widthOf(c)}px`),
        'minmax(0, 1fr)',
        ...pinned.map((c) => `${widthOf(c)}px`),
      ].join(' '),
    [flow, pinned, widthOf],
  );

  /** Distance from the right edge at which a pinned column sticks: the widths
   *  of the pinned columns to its right. */
  const pinOffset = (c: DataTableColumn<T>) =>
    pinned.slice(pinned.indexOf(c) + 1).reduce((sum, p) => sum + widthOf(p), 0);

  const surface = ground ?? SW_COLORS.paper;

  /**
   * Drag a column rule.
   *
   * Bound to `window` rather than the handle so the drag survives the pointer
   * running ahead of the element — at speed the cursor leaves a 9px strip
   * long before the layout catches up, and a handle-bound listener would drop
   * the gesture mid-pull.
   */
  const beginResize = (col: DataTableColumn<T>, startX: number) => {
    const from = widthOf(col);
    const floor = col.minWidth ?? DEFAULT_MIN_W;
    // A right-pinned column is dragged by its LEFT edge, so pulling left grows it.
    const dir = col.pin === 'right' ? -1 : 1;
    setDragKey(col.key);
    const move = (ev: MouseEvent) => {
      const next = Math.max(floor, Math.round(from + dir * (ev.clientX - startX)));
      setWidths((w) => ({ ...w, [col.key]: next }));
    };
    const up = () => {
      setDragKey(null);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const resetColumn = (col: DataTableColumn<T>) =>
    setWidths((w) => {
      const next = { ...w };
      delete next[col.key];
      return next;
    });

  const columnName = (c: DataTableColumn<T>) => c.label ?? c.header ?? c.key;

  const columnsMenu = hideable.length > 0 && (
      <div ref={menuRef} style={{ position: 'relative', flex: 'none' }}>
        <Button size="sm" onClick={() => setMenuOpen((o) => !o)} title="Show or hide columns">
          Columns
          <Caret open={menuOpen} />
        </Button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Show or hide columns"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              zIndex: SW_Z.dropdown,
              minWidth: 200,
              maxHeight: 480,
              overflowY: 'auto',
              padding: 6,
              background: SW_COLORS.paperDeep,
              border: `1px solid ${SW_COLORS.line}`,
              borderRadius: SW_RADIUS.sm,
              boxShadow: SW_SHADOWS.float,
            }}
          >
            {hideable.map((c) => {
              const on = !hidden.includes(c.key);
              return (
                <label
                  key={c.key}
                  role="menuitemcheckbox"
                  aria-checked={on}
                  style={{
                    ...SW_TYPE.caption,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 6px',
                    borderRadius: SW_RADIUS.sm,
                    color: on ? SW_COLORS.ink : SW_COLORS.muted,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleHidden(c.key)}
                    style={{ margin: 0, accentColor: SW_COLORS.brand, cursor: 'pointer' }}
                  />
                  {columnName(c)}
                </label>
              );
            })}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 6,
                paddingTop: 6,
                borderTop: `1px solid ${SW_COLORS.lineSoft}`,
              }}
            >
              <Button
                size="sm"
                variant="ghost"
                disabled={hiddenCount === 0}
                onClick={() => setHidden([])}
              >
                Show all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!customised}
                onClick={resetLayout}
                title="Default widths, every column shown, no sort"
              >
                Reset layout
              </Button>
            </div>
          </div>
        )}
      </div>
  );
  return (
    <div style={style}>
      {menuHost && createPortal(columnsMenu, menuHost)}
      {/* The COLUMNS menu's default home: above the table's right edge,
          outside the scroll box so the menu is never clipped by it. A page
          that hosts the menu itself gets no row here at all. */}
      {menuHost === undefined && columnsMenu && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          {columnsMenu}
        </div>
      )}

      <div
        style={{
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: SW_RADIUS.sm,
          // The table paints its own ground. Inside a card this changes
          // nothing; placed straight on a page it keeps the rows on the
          // surface the pinned cells and the hover tint were chosen against.
          background: surface,
          // The columns own their widths; when their sum outgrows the box the
          // table scrolls. Squeezing instead is what loses the numbers.
          overflowX: 'auto',
          // A resize drag would otherwise select the header text it passes over.
          userSelect: dragKey ? 'none' : undefined,
          cursor: dragKey ? 'col-resize' : undefined,
        }}
      >
        <div style={{ minWidth: 'min-content' }}>
          {/* Header. It reads as a header through type and the rule beneath it,
              not through a slab of contrasting paint. */}
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: template,
              alignItems: 'end',
              background: SW_COLORS.paperDeep,
              borderBottom: `1px solid ${SW_COLORS.line}`,
            }}
          >
            {ordered.map((c, ci) => {
              if (c === null) return <div key="__filler" aria-hidden />;
              const sortable = c.sortValue !== undefined;
              const sorted = sort?.key === c.key ? sort.dir : null;
              const hot = hoverHeader === c.key;
              const handleLive = dragKey === c.key || hoverHandle === c.key;
              return (
                // The header cell itself does NOT clip. The resize handle
                // straddles the cell's edge, and a clipping cell cut the
                // handle in half — a 4px invisible target nobody could find.
                // The label clips inside its own box instead.
                <div
                  key={c.key}
                  role="columnheader"
                  aria-sort={
                    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                  }
                  style={{
                    position: 'relative',
                    minWidth: 0,
                    ...(c.pin === 'right'
                      ? {
                          position: 'sticky' as const,
                          right: pinOffset(c),
                          zIndex: 2,
                          background: SW_COLORS.paperDeep,
                          borderLeft: `1px solid ${SW_COLORS.line}`,
                        }
                      : null),
                  }}
                >
                  <div
                    onClick={sortable ? () => cycleSort(c) : undefined}
                    onMouseEnter={sortable ? () => setHoverHeader(c.key) : undefined}
                    onMouseLeave={
                      sortable ? () => setHoverHeader((k) => (k === c.key ? null : k)) : undefined
                    }
                    title={sortable ? 'Click to sort' : undefined}
                    style={{
                      ...SW_TYPE.overline,
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
                      gap: 4,
                      padding: '9px 10px',
                      color: sorted || hot ? SW_COLORS.ink : SW_COLORS.muted,
                      cursor: sortable ? 'pointer' : undefined,
                      transition: `color ${SW_MOTION.instant}ms linear`,
                    }}
                  >
                    {/* Headers never wrap: a two-line header misaligns the
                        whole row and hides which column you are resizing. */}
                    <span
                      style={{
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.header}
                    </span>
                    {/* The arrow never clips — a sorted column that cannot
                        say which way is worse than an unsorted one. */}
                    {(sorted || hot) && (
                      <span
                        aria-hidden
                        style={{
                          flex: 'none',
                          fontSize: 8,
                          letterSpacing: 0,
                          color: sorted ? SW_COLORS.brand : SW_COLORS.faint,
                        }}
                      >
                        {sorted === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                  {(c.pin === 'right' || ci < ordered.length - 1) && (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize column ${c.key}`}
                      title="Drag to resize · double-click to reset"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        beginResize(c, e.clientX);
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        resetColumn(c);
                      }}
                      onMouseEnter={() => setHoverHandle(c.key)}
                      onMouseLeave={() => setHoverHandle((k) => (k === c.key ? null : k))}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        // Centred on the rule between two columns; a pinned
                        // column's rule is its own left border.
                        ...(c.pin === 'right'
                          ? { left: -HANDLE_W / 2 }
                          : { right: -HANDLE_W / 2 }),
                        width: HANDLE_W,
                        cursor: 'col-resize',
                        // The rule itself is a thin core inside the grab strip,
                        // so the target is finger-sized while the line stays
                        // hair-thin — until the pointer is on it.
                        display: 'flex',
                        justifyContent: 'center',
                        // Above the next header, below a pinned one (z 2) — a
                        // handle that has scrolled under the pin must not be
                        // grabbable through it.
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          width: handleLive ? 3 : 1,
                          height: '100%',
                          background: handleLive
                            ? SW_COLORS.brand
                            : c.pin === 'right'
                              ? 'transparent'
                              : SW_COLORS.line,
                          transition: `background ${SW_MOTION.instant}ms linear`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {rows.length === 0 && empty !== undefined ? (
            <div style={{ ...SW_TYPE.caption, padding: '14px 12px', color: SW_COLORS.muted }}>
              {empty}
            </div>
          ) : (
            view.map(({ row, index }, vi) => {
              const key = rowKey(row, index);
              const rs = rowStyle?.(row, index);
              const tone = rs?.tone ?? null;
              const hovered = hoverRow === key;
              return (
                <div
                  key={key}
                  role="row"
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  onMouseEnter={() => setHoverRow(key)}
                  onMouseLeave={() => setHoverRow((r) => (r === key ? null : r))}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: template,
                    alignItems: 'center',
                    // One ground for every row. Emphasis is a tint on top of
                    // it, never an alternating slab.
                    background: tone
                      ? alpha(tone, hovered ? 0.16 : 0.1)
                      : hovered
                        ? SW_COLORS.paperDeep
                        : 'transparent',
                    borderBottom:
                      vi === view.length - 1 ? 'none' : `1px solid ${SW_COLORS.lineSoft}`,
                    // A tone-carrying row gets a left edge in its own colour —
                    // the structural signal the banding was failing to give.
                    boxShadow: tone ? `inset 3px 0 0 0 ${tone}` : undefined,
                    cursor: onRowClick ? 'pointer' : undefined,
                    opacity: rs?.muted ? 0.62 : 1,
                    transition: `background ${SW_MOTION.instant}ms linear`,
                  }}
                >
                  {ordered.map((c) =>
                    c === null ? (
                      <div key="__filler" aria-hidden />
                    ) : (
                      <div
                        key={c.key}
                        role="cell"
                        style={{
                          ...(c.numeric ? SW_TYPE.numeric : SW_TYPE.body),
                          minWidth: 0,
                          padding: '9px 10px',
                          textAlign: c.align === 'right' ? 'right' : 'left',
                          color: SW_COLORS.ink,
                          // A pinned cell repaints the row's own ground,
                          // opaque: the same tint or hover the row carries,
                          // laid over the surface, so it matches its row and
                          // hides what scrolls beneath it.
                          ...(c.pin === 'right'
                            ? {
                                position: 'sticky' as const,
                                right: pinOffset(c),
                                zIndex: 1,
                                alignSelf: 'stretch',
                                display: 'flex',
                                alignItems: 'center',
                                background: tone
                                  ? `linear-gradient(${alpha(tone, hovered ? 0.16 : 0.1)}, ${alpha(tone, hovered ? 0.16 : 0.1)}), ${surface}`
                                  : hovered
                                    ? SW_COLORS.paperDeep
                                    : surface,
                                borderLeft: `1px solid ${SW_COLORS.line}`,
                              }
                            : null),
                          // Cells clip rather than wrap: a wrapped cell changes
                          // the height of its whole row and breaks the scan
                          // down a column. If a value is cut off, widen the
                          // column — that is what the handles are for.
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {c.pin === 'right' ? (
                          // The pinned cell is a flex box (it stretches to the
                          // row and centres its content), so the clipping the
                          // plain cell does for itself moves to this wrapper.
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {c.cell(row, index)}
                          </div>
                        ) : (
                          c.cell(row, index)
                        )}
                      </div>
                    ),
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
