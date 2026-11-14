/**
 * Bind an operation bulletin (OB) to the stations of an imported machine
 * layout.
 *
 * The two sheets arrive separately and nothing in either one links them: the
 * layout says *where* each station sits and what is written on it, the OB says
 * *how long* each operation takes. A line imported from the layout alone has no
 * times on it, so it cannot be simulated honestly. This module supplies the
 * link, by the one thing both sheets share — the operation's name.
 *
 * Matching is deliberately strict. A station is bound only when its text IS a
 * bulletin operation (ignoring case, spacing and punctuation), or is several of
 * them joined with "&" / "+". Anything else is left unbound and reported, so
 * the user assigns it by hand rather than trusting a guess. A wrong time on a
 * station is worse than a missing one: it silently moves the bottleneck.
 *
 * What comes out is a *station bulletin* — a garment template with exactly one
 * operation per bound station, carrying that station's total work content:
 *
 *   • a station doing several bulletin ops   → their SMVs summed;
 *   • a bulletin op drawn on N stations      → its SMV split 1/N to each.
 *
 * One op per station is what the rest of the app expects (`Workstation.
 * operation.opId` holds a single id), and it keeps the layout's own station
 * count authoritative: the bulletin's "planned work stations" hint is ignored.
 */

import type { GarmentTemplate, Operation } from '../domain';

export interface LayoutStationRef {
  /** Operation text as written on the layout. */
  name: string;
  /** The layout's station number, when the sheet carries one. */
  codeNo?: number;
}

export interface ObBinding {
  /** The bulletin the stations were matched against. */
  source: GarmentTemplate;
  /** Station bulletin: one operation per bound station, in station order. */
  garment: GarmentTemplate;
  /** Parallel to the input stations: the op id in `garment`, or null when
   *  nothing in the bulletin matched that station. */
  opIdByStation: (string | null)[];
  /** How many stations were bound. */
  matched: number;
  /** Names of the stations left unbound. */
  unmatchedStations: string[];
  /** Bulletin operations no station claimed (off-line work such as buttons,
   *  cutting-room prep, or pressing folded into another station). */
  unplacedOps: Operation[];
}

/** Compare-key for an operation name: lowercase letters and digits only, so
 *  "COLLAR RUNSTITCH", "Collar run stitch" and "collar  run-stitch" agree. */
export function opNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Which bulletin operations a station's text names. Returns indexes into
 * `ops`; empty when the text is not a bulletin operation.
 *
 * The whole text is tried first, because operation names routinely contain
 * "&" themselves ("placket attach & close"). Only when that fails is the text
 * split on its joiners and matched piece by piece, and then every piece has to
 * be an operation — a half-recognised station is treated as unrecognised.
 */
export function matchStationOps(stationName: string, keyToIndex: Map<string, number>): number[] {
  const whole = keyToIndex.get(opNameKey(stationName));
  if (whole != null) return [whole];

  const parts = stationName.split(/\s*[&+]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [];

  // Segment the parts into consecutive groups that each name one operation.
  // Longest group first, so "A & B & C" resolves to ["A & B", "C"] when
  // "A & B" is itself an operation.
  const solve = (from: number): number[] | null => {
    if (from === parts.length) return [];
    for (let to = parts.length; to > from; to--) {
      const idx = keyToIndex.get(opNameKey(parts.slice(from, to).join('&')));
      if (idx == null) continue;
      const rest = solve(to);
      if (rest) return [idx, ...rest];
    }
    return null;
  };
  const found = solve(0);
  // A station naming the same op twice would double its time.
  return found ? Array.from(new Set(found)) : [];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Match every station against the bulletin and build the station bulletin.
 *
 * `lineLabel` names the line in the new garment ("Line 3"); it also keeps the
 * id stable, so importing the same layout again replaces the station bulletin
 * instead of piling up copies.
 */
export function bindObToLayout(
  stations: LayoutStationRef[],
  ob: GarmentTemplate,
  lineLabel: string,
): ObBinding {
  const keyToIndex = new Map<string, number>();
  ob.operations.forEach((op, i) => {
    const key = opNameKey(op.name);
    // First wins on a duplicated name; the duplicate stays unplaced and shows
    // up in the report rather than being merged silently.
    if (key && !keyToIndex.has(key)) keyToIndex.set(key, i);
  });

  const perStation = stations.map((s) => matchStationOps(s.name, keyToIndex));

  // How many stations share each bulletin op — its SMV splits evenly.
  const claims = new Map<number, number>();
  for (const idxs of perStation) for (const i of idxs) claims.set(i, (claims.get(i) ?? 0) + 1);

  const garmentId = `${ob.id}--${slug(lineLabel) || 'line'}`;
  const operations: Operation[] = [];
  const opIdByStation: (string | null)[] = [];
  const unmatchedStations: string[] = [];

  stations.forEach((station, si) => {
    const idxs = perStation[si];
    if (idxs.length === 0) {
      opIdByStation.push(null);
      unmatchedStations.push(station.name);
      return;
    }
    const src = idxs.map((i) => ob.operations[i]);
    const smv = round(idxs.reduce((sum, i) => sum + ob.operations[i].smv / (claims.get(i) ?? 1), 0), 4);
    const shared = Math.max(...idxs.map((i) => claims.get(i) ?? 1));
    const number = station.codeNo ?? si + 1;
    const id = `${garmentId}-ws${number}-${si + 1}`;
    const first = src[0];
    operations.push({
      // A station that is exactly one whole bulletin op keeps everything
      // authored on it (distribution, buffer, discipline, rework).
      ...(src.length === 1 && shared === 1 ? first : {}),
      id,
      code: `WS${number}`,
      name: src.map((o) => o.name.trim()).join(' + ') + (shared > 1 ? ` (1/${shared})` : ''),
      smv,
      machineCode: first.machineCode,
      notes: `Bulletin ${src.map((o) => o.code ?? o.name.trim()).join(', ')}` + (shared > 1 ? ` · shared by ${shared} stations` : ''),
      // The layout decides how many stations an operation gets. The bulletin's
      // planned-work-station hint would otherwise double-count a shared op.
      servers: 1,
    });
    opIdByStation.push(id);
  });

  const unplacedOps = ob.operations.filter((_, i) => !claims.has(i));
  const totalSmv = round(operations.reduce((s, o) => s + o.smv, 0), 3);
  const slowest = operations.reduce((m, o) => Math.max(m, o.smv), 0);

  const garment: GarmentTemplate = {
    id: garmentId,
    name: `${ob.name} · ${lineLabel}`,
    description:
      `${ob.name} placed on the ${lineLabel} layout, one operation per station. ` +
      `${operations.length} of ${stations.length} stations matched a bulletin operation; ` +
      `${unplacedOps.length} bulletin operation${unplacedOps.length === 1 ? ' has' : 's have'} no station.`,
    operations,
    totalSmv,
    hourlyTarget100: slowest > 0 ? Math.round(60 / slowest) : 0,
  };

  return {
    source: ob,
    garment,
    opIdByStation,
    matched: operations.length,
    unmatchedStations,
    unplacedOps,
  };
}

/**
 * Pick the bulletin that belongs to a layout, from the garments on hand.
 *
 * A bulletin read from the same workbook is the strongest evidence and wins
 * outright. Failing that, the layout's style number has to appear in exactly
 * one garment's name — two candidates is an ambiguity, and guessing between
 * bulletins would put the wrong times on the line.
 */
export function pickObForLayout(
  layout: { fileName: string; style?: string },
  all: { garment: GarmentTemplate; fileName?: string }[],
): GarmentTemplate | undefined {
  // A station bulletin built by an earlier import carries its source's style
  // in its name too. Left in, re-importing a layout would see two candidates
  // and bind nothing — so set aside anything derived from another candidate.
  const candidates = all.filter(
    (c) => !all.some((o) => o !== c && c.garment.id.startsWith(`${o.garment.id}--`)),
  );
  const sameFile = candidates.filter((c) => c.fileName != null && c.fileName === layout.fileName);
  if (sameFile.length === 1) return sameFile[0].garment;

  const style = (layout.style ?? '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
  if (style.length < 4) return undefined;
  const byStyle = candidates.filter((c) => opNameKey(c.garment.name).includes(style));
  return byStyle.length === 1 ? byStyle[0].garment : undefined;
}
