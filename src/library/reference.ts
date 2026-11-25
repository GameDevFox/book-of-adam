import { editDistance } from "./edit-distance";
import { BOOKS, JOD_ALIASES, JOD_VOLUMES, type Book } from "./reference-books";

/**
 * A typed reference → the Library URL that opens it: "1 Ne 3:7" →
 * /library/bofm-lds/1-nephi/3?verse=7, "JD 1:62" → /library/jod/1/62. A port of the owner's
 * scripture shortcut (lessons/scripts/scripture.js): trailing numbers are chapter, verse and end
 * verse (":" and dashes count as spaces); the rest is the book, taken as the nearest name or
 * alias by edit distance, so a misspelling ("Moser 2") still lands; text with no chapter number
 * that is not exactly a book name is not a reference (isReference) and goes to the text search. The verse rides in the query
 * string, as on churchofjesuschrist.org, and the reader scrolls to and highlights it.
 *
 * suggestions() — the header's dropdown: once a chapter is typed, every book the letters begin
 * that has that chapter, as full references ("e 3" → Exodus 3, Ezra 3, …); none when more than
 * MAX_SUGGESTIONS would fit, and never a list of one book's chapters.
 */

/** The verse (or range) a reference URL asks for: `?verse=7` or `?verse=7-9`. */
export const VERSE_PARAM = "verse";
/** More books than this fit the letters typed, and the dropdown stays closed (decided 2026-10-24). */
export const MAX_SUGGESTIONS = 10;

const NUMBER_RE = /^\d+$/;
const SEPARATORS_RE = /[:\-–—]/g;
const JOD_LABEL = "JD";

export type Suggestion = { label: string; url: string };

/** Matching ignores case, spaces and punctuation: "1 Ne", "1ne" and "1-ne" are one key. */
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Target = { book: Book } | { jod: true };

const names = (target: Target) =>
  "jod" in target ? JOD_ALIASES : [target.book.title, target.book.file, ...target.book.aliases];

const TARGETS: Target[] = [...BOOKS.map((book) => ({ book })), { jod: true }];

/** The nearest book (or the JoD) to what was typed; the first of equals wins. */
const nearest = (key: string): Target => {
  let best = TARGETS[0];
  let bestDistance = Infinity;
  for (const target of TARGETS) {
    for (const name of names(target)) {
      const distance = editDistance(key, normalize(name));
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
  }
  return best;
};

/** "1 Ne 3:7" → book key "1ne", numbers [3, 7]; null when no book was typed. */
const parse = (input: string): { key: string; numbers: number[] } | null => {
  const parts = input.replace(SEPARATORS_RE, " ").trim().split(/\s+/);
  const numbers: number[] = [];
  while (parts.length && NUMBER_RE.test(parts[parts.length - 1]))
    numbers.unshift(Number(parts.pop()));
  const key = normalize(parts.join(" "));
  return key ? { key, numbers } : null;
};

type Place = { chapter: number; verse?: number; endVerse?: number };

/** A lone number in a one-chapter book is the verse: "AoF 13", "Jude 3". */
const placeIn = (book: Book, numbers: number[]): Place => {
  const [chapter = 1, verse, endVerse] =
    book.chapters === 1 && numbers.length === 1 ? [1, ...numbers] : numbers;
  return {
    chapter,
    verse,
    endVerse: endVerse !== undefined && endVerse > verse! ? endVerse : undefined,
  };
};

const urlFor = (target: Target, numbers: number[]): string => {
  if ("jod" in target) {
    const [volume = 1, page = 1] = numbers;
    return `/library/jod/${volume}/${page}`;
  }
  const { book } = target;
  const { chapter, verse, endVerse } = placeIn(book, numbers);
  const base = `/library/${book.edition}/${book.file}/${chapter}`;
  if (verse === undefined) return base;
  const range = endVerse !== undefined ? `${verse}-${endVerse}` : `${verse}`;
  return `${base}?${VERSE_PARAM}=${range}`;
};

/** Is the key exactly some book's name or alias (or the JoD's)? */
const namesABook = (key: string) =>
  TARGETS.some((target) => names(target).some((name) => normalize(name) === key));

/**
 * Should the header open this as a reference rather than search for its words? Yes when it ends
 * in a chapter number (the book is then forgiven, "Moser 2"), or when it is exactly a book name
 * ("Moroni"). Anything else is text: nearest() always finds some book, so without this rule
 * "new and everlasting covenant" opened whichever book name was the closest spelling.
 */
export const isReference = (input: string): boolean => {
  const parsed = parse(input);
  return parsed !== null && (parsed.numbers.length > 0 || namesABook(parsed.key));
};

export const referenceUrl = (input: string): string | null => {
  const parsed = parse(input);
  return parsed && isReference(input) ? urlFor(nearest(parsed.key), parsed.numbers) : null;
};

/** Does the target have the place the numbers name? (Verses are not checked.) */
const fits = (target: Target, numbers: number[]): boolean => {
  if ("jod" in target) return numbers[0] <= JOD_VOLUMES;
  const { chapter } = placeIn(target.book, numbers);
  return chapter >= 1 && chapter <= target.book.chapters;
};

const labelFor = (target: Target, numbers: number[]): string => {
  if ("jod" in target) return `${JOD_LABEL} ${numbers.join(":")}`;
  const { chapter, verse, endVerse } = placeIn(target.book, numbers);
  const verses = verse === undefined ? "" : `:${verse}${endVerse ? `–${endVerse}` : ""}`;
  return `${target.book.title} ${chapter}${verses}`;
};

export const suggestions = (input: string): Suggestion[] => {
  const parsed = parse(input);
  if (!parsed || parsed.numbers.length === 0) return [];
  const { key, numbers } = parsed;
  const begun = TARGETS.filter(
    (target) =>
      names(target).some((name) => normalize(name).startsWith(key)) && fits(target, numbers),
  );
  if (begun.length > MAX_SUGGESTIONS) return [];
  // A book the letters name exactly ("Mos" is Moses' abbreviation) leads; then table order.
  const exact = (target: Target) => names(target).some((name) => normalize(name) === key);
  return [...begun.filter(exact), ...begun.filter((t) => !exact(t))].map((target) => ({
    label: labelFor(target, numbers),
    url: urlFor(target, numbers),
  }));
};
