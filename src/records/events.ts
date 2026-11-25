import { formatIsoDate, MONTHS } from "./format";
import type { Source } from "./types";

/**
 * A calendar date with explicit precision — year required, month/day optional. BC dates use a
 * positive year plus era: "bce" ("587 BC" = { year: 587, era: "bce" }); no negative years, no
 * year zero. `circa` marks the date itself as approximate ("c. 1820").
 */
export type CalDate = {
  year: number;
  era?: "bce";
  month?: number;
  day?: number;
  circa?: boolean;
};

/**
 * When an event happened. The union separates DURATION from UNCERTAINTY — the core semantic
 * distinction of the timeline data:
 * - instant  — happened at a point in time, to whatever precision is known.
 * - span     — a genuine duration: started at `start`, ended at `end` (render as a bar).
 * - between  — a point event at an unknown time within [earliest, latest] (render as an
 *              uncertainty bracket, NOT a bar).
 */
export type When =
  | { type: "instant"; date: CalDate; note?: string }
  | { type: "span"; start: CalDate; end: CalDate; note?: string }
  | { type: "between"; earliest: CalDate; latest: CalDate; note?: string };

export type EventRecord = {
  /** Kebab-case slug, unique within the collection. No dots — ids lead fact paths. */
  id: string;
  title: string;
  /** One factual line describing the event. */
  summary: string;
  /** Tags, e.g. "ancient", "biblical", "book-of-mormon", "restoration", "modern". */
  groups: string[];
  when: When;
  sources: Source[];
};

/** Astronomical year numbering: 1 BC → 0, 2 BC → -1, … — what timeline math wants. */
export const astronomicalYear = (date: CalDate): number =>
  date.era === "bce" ? 1 - date.year : date.year;

const YEAR_KEY = 10000;
const MONTH_KEY = 100;

/**
 * Sortable numeric key (astronomical year · 10000 + month · 100 + day). An unknown
 * month/day contributes 0, so year-only dates deterministically sort before dated events in
 * the same year.
 */
export const calSortKey = (date: CalDate): number =>
  astronomicalYear(date) * YEAR_KEY + (date.month ?? 0) * MONTH_KEY + (date.day ?? 0);

/** The date bounds of a When — `first` for sorting, `last` for range math. */
export const whenBounds = (when: When): { first: CalDate; last: CalDate } => {
  switch (when.type) {
    case "instant":
      return { first: when.date, last: when.date };
    case "span":
      return { first: when.start, last: when.end };
    case "between":
      return { first: when.earliest, last: when.latest };
  }
};

export const whenSortKey = (when: When): number => calSortKey(whenBounds(when).first);

/** Years below this get an explicit era label so "70" reads as a date. */
const ERA_LABEL_BELOW = 1000;

const eraSuffix = (date: CalDate): string => {
  if (date.era === "bce") return " BC";
  return date.year < ERA_LABEL_BELOW ? " AD" : "";
};

export const formatCalDate = (date: CalDate): string => {
  const circa = date.circa ? "c. " : "";
  const year = `${date.year}${eraSuffix(date)}`;
  if (!date.month) return `${circa}${year}`;
  const monthName = MONTHS[date.month - 1];
  return date.day ? `${circa}${monthName} ${date.day}, ${year}` : `${circa}${monthName} ${year}`;
};

export const formatWhen = (when: When): string => {
  switch (when.type) {
    case "instant":
      return formatCalDate(when.date);
    case "span":
      return `${formatCalDate(when.start)} – ${formatCalDate(when.end)}`;
    case "between":
      return `between ${formatCalDate(when.earliest)} and ${formatCalDate(when.latest)}`;
  }
};

/** ISO string ("1805-12-23", partial allowed) → CalDate. CE only, by construction. */
export const isoToCalDate = (iso: string): CalDate => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, ...(month ? { month } : {}), ...(day ? { day } : {}) };
};

/**
 * A life-event date is EITHER an ISO string (CE, the ergonomic form for modern people) or a
 * CalDate object (needed for BC / antiquity). These two helpers normalize + render across both.
 */
export const toCalDate = (date: string | CalDate): CalDate =>
  typeof date === "string" ? isoToCalDate(date) : date;

export const formatLifeDate = (date: string | CalDate): string =>
  typeof date === "string" ? formatIsoDate(date) : formatCalDate(date);
