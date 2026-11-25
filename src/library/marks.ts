import type { TextUnit } from "../records/texts";

/**
 * The printed-book break that falls before a paragraph, if any: a new page (drawn as a page
 * rule) or, on the same page, the start of the second column (a column rule). Paragraphs carry
 * their page and column from the edition build (scripts/jod-marks.mjs); texts without that data
 * get no breaks, and nothing is marked before the first paragraph — the byline gives its pages.
 */
export type Break =
  { kind: "page"; page: number } | { kind: "column"; page: number; column: "a" | "b" };

export const breakBefore = (previous: TextUnit | null, unit: TextUnit): Break | null => {
  if (!previous || unit.page === undefined || previous.page === undefined) return null;
  if (unit.page !== previous.page) return { kind: "page", page: unit.page };
  if (unit.column && unit.column !== previous.column) {
    return { kind: "column", page: unit.page, column: unit.column };
  }
  return null;
};
