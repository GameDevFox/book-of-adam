/**
 * The passages a reader has selected in a chapter, as the URL carries them: `?verse=4,7-8`
 * (decided 2026-11-09). One keyword for every text — a verse, a JoD paragraph (¶7) or a poem's
 * stanza is `verse=7`; an ornament divider has no number and cannot be selected. A selection is
 * a sorted list of numbers; written back, neighbours merge, so one selection has one address.
 */

/** A passage's number from its unit id: "7", "p7" (JoD ¶7), "s7" (stanza 7); "orn1" → null. */
const PASSAGE_ID_RE = /^[ps]?(\d+)$/;
const RANGE_RE = /^(\d+)(?:-(\d+))?$/;

export const passageNumber = (unitId: string): number | null => {
  const m = PASSAGE_ID_RE.exec(unitId);
  return m ? Number(m[1]) : null;
};

const sorted = (numbers: Iterable<number>): number[] => [...new Set(numbers)].sort((a, b) => a - b);

const between = (a: number, b: number): number[] =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i);

/** `?verse=` → the numbers it names; anything that is not a verse or range is ignored. */
export const parseSelection = (param: string | null): number[] =>
  sorted(
    (param ?? "").split(",").flatMap((part) => {
      const m = RANGE_RE.exec(part.trim());
      if (!m) return [];
      const [start, end] = [Number(m[1]), Number(m[2] ?? m[1])];
      return between(start, end).filter((n) => n > 0);
    }),
  );

/** Runs of consecutive numbers, as [first, last] pairs: [4, 7, 8] → [[4, 4], [7, 8]]. */
export const runsOf = (numbers: number[]): [number, number][] => {
  const runs: [number, number][] = [];
  for (const n of sorted(numbers)) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs;
};

/** The `?verse=` value for a selection: [8, 4, 7] → "4,7-8". */
export const formatSelection = (numbers: number[]): string =>
  runsOf(numbers)
    .map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`))
    .join(",");

export const toggle = (selection: number[], n: number): number[] =>
  selection.includes(n) ? selection.filter((m) => m !== n) : sorted([...selection, n]);

/**
 * Shift+click: everything from the last-clicked passage to this one takes the state a click
 * would give the clicked one — selected if it was unselected, deselected if it was selected.
 */
export const toggleRange = (selection: number[], anchor: number | null, n: number): number[] => {
  if (anchor === null) return toggle(selection, n);
  const range = between(anchor, n);
  return selection.includes(n)
    ? selection.filter((m) => !range.includes(m))
    : sorted([...selection, ...range]);
};
