import { calSortKey, toCalDate, type CalDate, type EventRecord, type When } from "./events";
import { REVIEW_STATUSES, resolveFactPath, type Identified, type ReviewMap } from "./reviews";
import type { Edition, TextUnit, Work } from "./texts";
import type { PersonRecord, Source } from "./types";

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Full "YYYY-MM-DD" or partial "YYYY-MM" / "YYYY". */
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/**
 * ISO dates compare lexicographically, but partial dates ("1805" vs "1805-06-01") don't — so
 * compare only at the precision both sides share.
 */
const compareDates = (a: string, b: string): number => {
  const sharedLength = Math.min(a.length, b.length);
  return a.slice(0, sharedLength).localeCompare(b.slice(0, sharedLength));
};

const sourceProblems = (sources: Source[] | undefined, where: string): string[] => {
  const problems: string[] = [];
  if (!sources?.length) problems.push(`${where}: needs at least one source`);
  for (const source of sources ?? []) {
    if (!source.label?.trim()) problems.push(`${where}: source missing label`);
    if (!source.url?.startsWith("https://"))
      problems.push(`${where}: source url must be https — got "${source.url}"`);
  }
  return problems;
};

const MAX_MONTH = 12;
const MAX_DAY = 31;

const calDateProblems = (date: CalDate | undefined, where: string, label: string): string[] => {
  if (!date || !Number.isInteger(date.year) || date.year < 1) {
    return [`${where}: ${label} needs a positive integer year (use era "bce" for BC)`];
  }
  const problems: string[] = [];
  if (date.era !== undefined && date.era !== "bce")
    problems.push(`${where}: ${label} era must be "bce" or absent`);
  if (
    date.month !== undefined &&
    (!Number.isInteger(date.month) || date.month < 1 || date.month > MAX_MONTH)
  )
    problems.push(`${where}: ${label} month out of range`);
  if (date.day !== undefined && (!Number.isInteger(date.day) || date.day < 1 || date.day > MAX_DAY))
    problems.push(`${where}: ${label} day out of range`);
  if (date.day !== undefined && date.month === undefined)
    problems.push(`${where}: ${label} has a day but no month`);
  return problems;
};

/**
 * A person's born/died date is EITHER an ISO string (CE, modern people) or a CalDate object
 * (BC/antiquity) — validate whichever form it takes.
 */
const lifeDateProblems = (
  date: string | CalDate | undefined,
  where: string,
  label: string,
): string[] => {
  if (typeof date === "string")
    return DATE_RE.test(date) ? [] : [`${where}: ${label} is not ISO or a CalDate`];
  return calDateProblems(date, where, label);
};

/** Is `a` strictly before `b`? Two ISO strings compare by shared precision; else by CalDate key. */
const lifeDateBefore = (a: string | CalDate, b: string | CalDate): boolean =>
  typeof a === "string" && typeof b === "string"
    ? compareDates(a, b) < 0
    : calSortKey(toCalDate(a)) < calSortKey(toCalDate(b));

/**
 * Integrity check for a people collection. Returns a list of human-readable problems —
 * empty means the data is well-formed.
 */
export const validateRecords = (records: PersonRecord[]): string[] => {
  const problems: string[] = [];
  const seenIds = new Set<string>();

  for (const record of records) {
    const where = record.id || record.name || "<unidentified record>";
    if (!ID_RE.test(record.id ?? "")) problems.push(`${where}: id is not a kebab-case slug`);
    if (seenIds.has(record.id)) problems.push(`${where}: duplicate id`);
    seenIds.add(record.id);

    if (!record.name?.trim()) problems.push(`${where}: missing name`);
    if (!record.role?.trim()) problems.push(`${where}: missing role`);
    if (!record.groups?.length) problems.push(`${where}: needs at least one group tag`);

    const bornProblems = lifeDateProblems(record.born?.date, where, "born.date");
    const diedProblems = lifeDateProblems(record.died?.date, where, "died.date");
    problems.push(...bornProblems, ...diedProblems);
    if (
      !bornProblems.length &&
      !diedProblems.length &&
      lifeDateBefore(record.died.date, record.born.date)
    ) {
      problems.push(`${where}: died before born`);
    }

    problems.push(...sourceProblems(record.sources, where));
  }

  return problems;
};

const whenProblems = (when: When | undefined, where: string): string[] => {
  if (!when) return [`${where}: missing when`];
  switch (when.type) {
    case "instant":
      return calDateProblems(when.date, where, "date");
    case "span": {
      const problems = [
        ...calDateProblems(when.start, where, "span start"),
        ...calDateProblems(when.end, where, "span end"),
      ];
      if (!problems.length && calSortKey(when.start) > calSortKey(when.end))
        problems.push(`${where}: span ends before it starts`);
      return problems;
    }
    case "between": {
      const problems = [
        ...calDateProblems(when.earliest, where, "between earliest"),
        ...calDateProblems(when.latest, where, "between latest"),
      ];
      if (!problems.length && calSortKey(when.earliest) >= calSortKey(when.latest))
        problems.push(`${where}: between bounds must be ordered (earliest < latest)`);
      return problems;
    }
    default:
      return [`${where}: unknown when type "${(when as { type?: string }).type}"`];
  }
};

/** Integrity check for an events collection — same contract as validateRecords. */
export const validateEvents = (events: EventRecord[]): string[] => {
  const problems: string[] = [];
  const seenIds = new Set<string>();

  for (const event of events) {
    const where = event.id || event.title || "<unidentified event>";
    if (!ID_RE.test(event.id ?? "")) problems.push(`${where}: id is not a kebab-case slug`);
    if (seenIds.has(event.id)) problems.push(`${where}: duplicate id`);
    seenIds.add(event.id);

    if (!event.title?.trim()) problems.push(`${where}: missing title`);
    if (!event.summary?.trim()) problems.push(`${where}: missing summary`);
    if (!event.groups?.length) problems.push(`${where}: needs at least one group tag`);

    problems.push(...whenProblems(event.when, where));
    problems.push(...sourceProblems(event.sources, where));
  }

  return problems;
};

const EDITION_LICENCES = ["public-domain", "quoted-excerpts", "local-only"];

/** Integrity check for the texts registries (works + editions). */
export const validateTexts = (works: Work[], editions: Edition[]): string[] => {
  const problems: string[] = [];
  const workIds = new Set<string>();
  for (const work of works) {
    const where = work.id || work.title || "<unidentified work>";
    if (!ID_RE.test(work.id ?? "")) problems.push(`${where}: id is not a kebab-case slug`);
    if (workIds.has(work.id)) problems.push(`${where}: duplicate work id`);
    workIds.add(work.id);
    if (!work.title?.trim()) problems.push(`${where}: missing title`);
    if (!work.groups?.length) problems.push(`${where}: needs at least one group tag`);
  }

  const editionIds = new Set<string>();
  for (const edition of editions) {
    const where = edition.id || edition.title || "<unidentified edition>";
    if (!ID_RE.test(edition.id ?? "")) problems.push(`${where}: id is not a kebab-case slug`);
    if (editionIds.has(edition.id)) problems.push(`${where}: duplicate edition id`);
    editionIds.add(edition.id);
    if (!workIds.has(edition.workId))
      problems.push(`${where}: workId "${edition.workId}" is not a registered work`);
    if (!edition.title?.trim()) problems.push(`${where}: missing title`);
    if (!EDITION_LICENCES.includes(edition.licence))
      problems.push(`${where}: invalid licence "${edition.licence}"`);
    if (!edition.provenance?.trim()) problems.push(`${where}: missing provenance`);
    if (!edition.contents?.length) problems.push(`${where}: needs at least one content unit`);
    for (const content of edition.contents ?? []) {
      if (!ID_RE.test(content)) problems.push(`${where}: content id "${content}" is not a slug`);
    }
    problems.push(...whenProblems(edition.when, where));
    problems.push(...sourceProblems(edition.sources, where));
  }

  return problems;
};

/**
 * Integrity check for a unit tree: slug ids, no duplicate sibling ids, and every unit is
 * EITHER a leaf (text) or a branch (units) — never both, never neither.
 */
export const validateUnitTree = (unit: TextUnit, where: string): string[] => {
  const problems: string[] = [];
  const here = `${where}.${unit.id ?? "<no-id>"}`;
  if (!ID_RE.test(unit.id ?? "")) problems.push(`${here}: unit id is not a kebab-case slug`);
  const isLeaf = typeof unit.text === "string";
  const isBranch = Array.isArray(unit.units);
  if (isLeaf === isBranch)
    problems.push(`${here}: unit must have exactly one of text (leaf) or units (branch)`);
  if (isLeaf && !unit.text?.trim()) problems.push(`${here}: leaf unit has empty text`);
  if (isBranch) {
    const seen = new Set<string>();
    for (const child of unit.units ?? []) {
      if (seen.has(child.id)) problems.push(`${here}: duplicate child unit id "${child.id}"`);
      seen.add(child.id);
      problems.push(...validateUnitTree(child, here));
    }
  }
  return problems;
};

/**
 * Integrity check for a review table against its records: every review must point at a fact
 * that exists, carry a valid status, and be stamped.
 */
export const validateReviews = (records: Identified[], reviews: ReviewMap): string[] => {
  const problems: string[] = [];
  for (const [path, review] of Object.entries(reviews)) {
    if (resolveFactPath(records, path) === undefined)
      problems.push(`${path}: does not resolve to a fact in the records`);
    if (!REVIEW_STATUSES.includes(review?.status)) problems.push(`${path}: invalid review status`);
    if (!review?.reviewedAt) problems.push(`${path}: missing reviewedAt`);
  }
  return problems;
};
