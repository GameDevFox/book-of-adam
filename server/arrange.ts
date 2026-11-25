import type { OutlineNode } from "../src/records/texts";

/**
 * Menu arrangements an edition can ask for instead of its own unit order (data-source.ts
 * EDITION_ARRANGEMENTS). The data keeps its structure; only the menu regroups, and every
 * reading node keeps its coordinates, so links do not change.
 *
 * arrangeByYear — Eliza R. Snow's poems, by the year each was written (decided 2026-10-23):
 *   - a poem's year is its composition date (`composed`/`dated`), else its first printing in a
 *     periodical (`published`: "Western Courier, 13 August 1825");
 *   - "Year Uncertain": known only from a reprint in her own Poems (1856/1877) — it existed by
 *     then, but when it was written is not known;
 *   - "Year Unknown": no year anywhere.
 * Grouped by decade ("1840s"), each year a divider in its decade's list (a year averages six
 * poems — too few for a level of its own). Within a year, by month and day where the note gives
 * them (undated-within-the-year last), then title; the two final groups are alphabetical.
 */

export const YEAR_UNCERTAIN = "Year Uncertain";
export const YEAR_UNKNOWN = "Year Unknown";

export type PoemEntry = { node: OutlineNode; meta?: Record<string, string> };

export type Dating =
  | { kind: "dated"; year: number; month?: number; day?: number }
  | { kind: "uncertain"; note: string }
  | { kind: "unknown" };

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
/** "[day] [Month] year" anywhere in a note: "13 July 1826", "August 1826", "1828". */
const DATE_RE = new RegExp(`(?:(\\d{1,2})\\s+)?(?:(${MONTHS.join("|")})\\s+)?(1[78]\\d\\d)`, "i");
/** A first printing that is a reprint in her own collected Poems, not a periodical. */
const COLLECTION_RE = /^\s*Poems\s+[12]\b/i;
/** Composition notes, most specific first. */
const COMPOSED_KEYS = ["composed", "dated", "date"];
/** Sorts after any real month or day, so a year's undated poems come last. */
const UNDATED_LAST = 99;
const YEARS_PER_DECADE = 10;
const LEADING_ARTICLE_RE = /^(the|a|an)\s+/i;
const LEADING_PUNCT_RE = /^[\s"'“‘(\[]+/;

const parseDate = (note: string): Dating | null => {
  const m = note.match(DATE_RE);
  if (!m) return null;
  const [, day, month, year] = m;
  return {
    kind: "dated",
    year: Number(year),
    ...(month ? { month: MONTHS.indexOf(month.toLowerCase()) + 1 } : {}),
    ...(month && day ? { day: Number(day) } : {}),
  };
};

/** How well a poem's year is known, from its notes. */
export const poemDating = (meta: Record<string, string> | undefined): Dating => {
  for (const key of COMPOSED_KEYS) {
    const dated = meta?.[key] ? parseDate(meta[key]) : null;
    if (dated) return dated;
  }
  const firstPrinting = meta?.published?.split(";")[0];
  if (firstPrinting) {
    if (COLLECTION_RE.test(firstPrinting))
      return { kind: "uncertain", note: meta?.published ?? "" };
    const dated = parseDate(firstPrinting);
    if (dated) return dated;
  }
  return { kind: "unknown" };
};

/** Catalogue order: case-insensitive, ignoring opening quotes and a leading The/A/An. */
export const titleSortKey = (title: string): string =>
  title.replace(LEADING_PUNCT_RE, "").replace(LEADING_ARTICLE_RE, "").toLowerCase();

const byTitle = (a: OutlineNode, b: OutlineNode) =>
  titleSortKey(a.title).localeCompare(titleSortKey(b.title));

/** A group that shows how many poems it holds (its dividers are not counted). */
const group = (id: string, title: string, children: OutlineNode[]): OutlineNode => ({
  id,
  title,
  kind: "group",
  count: children.filter((child) => child.kind === "reading").length,
  children,
});

export const arrangeByYear = (entries: PoemEntry[]): OutlineNode[] => {
  const years = new Map<number, { node: OutlineNode; month: number; day: number }[]>();
  const uncertain: OutlineNode[] = [];
  const unknown: OutlineNode[] = [];
  for (const { node, meta } of entries) {
    const dating = poemDating(meta);
    if (dating.kind === "uncertain") uncertain.push(node);
    else if (dating.kind === "unknown") unknown.push(node);
    else {
      const list = years.get(dating.year) ?? [];
      list.push({ node, month: dating.month ?? UNDATED_LAST, day: dating.day ?? UNDATED_LAST });
      years.set(dating.year, list);
    }
  }
  // A decade per group (9 entries at the top in all), its years as dividers in its list.
  const decades = new Map<number, OutlineNode[]>();
  for (const [year, poems] of [...years.entries()].sort(([a], [b]) => a - b)) {
    const decade = Math.floor(year / YEARS_PER_DECADE) * YEARS_PER_DECADE;
    const list = decades.get(decade) ?? [];
    list.push(
      { id: `year-${year}`, title: String(year), kind: "divider" },
      ...poems
        .sort((a, b) => a.month - b.month || a.day - b.day || byTitle(a.node, b.node))
        .map((p) => p.node),
    );
    decades.set(decade, list);
  }
  const decadeGroups = [...decades.entries()].map(([decade, children]) =>
    group(`decade-${decade}`, `${decade}s`, children),
  );
  return [
    ...decadeGroups,
    ...(uncertain.length ? [group("year-uncertain", YEAR_UNCERTAIN, uncertain.sort(byTitle))] : []),
    ...(unknown.length ? [group("year-unknown", YEAR_UNKNOWN, unknown.sort(byTitle))] : []),
  ];
};
