import { firstPage, type TextUnit } from "../records/texts";
import { lineIndent, textLines } from "./labels";
import { BOOKS } from "./reference-books";
import { runsOf } from "./selection";

/**
 * Selected passages → a quotation to paste, with its reference (decided 2026-11-09):
 *
 *   "17 From henceforth let no man trouble me: …
 *
 *   18 Brethren, the grace of our Lord Jesus Christ be with your spirit. Amen."
 *       - Galatians 6:17-18
 *
 * In quotation marks; passages a blank line apart; a line of "…" for each gap; the reference on
 * its own indented line. Each edition can bring its own formatter — numbering and reference
 * differ by text, and by edition rather than work (the 1830 Book of Mormon cites pages, not
 * verses); editions without one quote as scripture.
 */

export type Passage = { n: number; unit: TextUnit };
export type QuoteSource = {
  edition: string;
  file: string;
  book: TextUnit;
  chapter: TextUnit;
  /** In reading order. */
  passages: Passage[];
};
export type Quotation = { text: string; reference: string };
type Formatter = (source: QuoteSource) => Quotation;

const GAP = "…";
const PASSAGE_BREAK = "\n\n";
const REFERENCE_INDENT = "    ";

/** Runs of consecutive passages: [4, 7, 8] → [[4], [7, 8]]. */
const runsOfPassages = (passages: Passage[]): Passage[][] => {
  const byNumber = new Map(passages.map((p) => [p.n, p]));
  return runsOf(passages.map((p) => p.n)).map(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, i) => byNumber.get(first + i)!),
  );
};

/** The shared shape: quotation marks, passages a blank line apart, "…" for gaps, reference. */
const assemble = (runs: string[][], reference: string): Quotation => {
  const body = runs
    .map((run) => run.join(PASSAGE_BREAK))
    .join(`${PASSAGE_BREAK}${GAP}${PASSAGE_BREAK}`);
  return { text: `"${body}"\n${REFERENCE_INDENT}- ${reference}`, reference };
};

/** "4, 7-8" — runs of numbers as a reference lists them. */
const listRuns = (numbers: number[]): string =>
  runsOf(numbers)
    .map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`))
    .join(", ");

const textOf = (p: Passage) => p.unit.text ?? "";

/** The book's name as the reference search knows it ("Doctrine and Covenants"), else its own. */
const bookName = ({ edition, file, book }: QuoteSource): string =>
  BOOKS.find((b) => b.edition === edition && b.file === file)?.title ??
  book.shortTitle ??
  (book.title ?? book.id).replace(/^The /, "");

/** Scripture: verse numbers when two or more; "Revelation 3:4, 7-8". */
const scripture: Formatter = (source) => {
  const numbered = source.passages.length > 1;
  const runs = runsOfPassages(source.passages).map((run) =>
    run.map((p) => (numbered ? `${p.n} ${textOf(p)}` : textOf(p))),
  );
  const verses = listRuns(source.passages.map((p) => p.n));
  return assemble(runs, `${bookName(source)} ${source.chapter.id}:${verses}`);
};

const VOLUME_FILE_RE = /^volume-(\d+)$/;

/**
 * The Journal of Discourses: no numbers in the body (paragraph numbers are ours, not the
 * printing's), a paragraph a page or column break split rejoined, cited by speaker and printed
 * page — "Brigham Young, JD 1:3-4 (April 6, 1853)".
 */
const journalOfDiscourses: Formatter = (source) => {
  const { chapter, passages } = source;
  // A piece that continues the one before it joins it with a space, not a blank line.
  const runs = runsOfPassages(passages).map((run) =>
    run.reduce<string[]>((out, p, i) => {
      if (i > 0 && p.unit.continued) out[out.length - 1] = `${out[out.length - 1]} ${textOf(p)}`;
      else out.push(textOf(p));
      return out;
    }, []),
  );
  const opening = Number(firstPage(chapter.meta?.pages ?? ""));
  const pages = passages.map((p) => p.unit.page ?? opening).filter((n) => n > 0);
  const volume = Number(VOLUME_FILE_RE.exec(source.file)?.[1] ?? 0);
  const speaker = chapter.meta?.speaker;
  const date = chapter.meta?.date;
  const citation = `JD ${volume}:${listRuns(pages)}`;
  return assemble(
    runs,
    [speaker ? `${speaker}, ${citation}` : citation, date ? `(${date})` : null]
      .filter(Boolean)
      .join(" "),
  );
};

const POET = "Eliza R. Snow";
const NO_DATE = "n.d.";

/** A poem's date note for its reference: where first printed, else when composed or dated. */
const poemDate = (meta: Record<string, string> | undefined): string | null => {
  const printed = meta?.published?.split(";")[0].trim();
  if (printed) return printed;
  if (meta?.composed) return `composed ${meta.composed}`;
  if (meta?.dated && meta.dated !== NO_DATE) return `dated ${meta.dated}`;
  return null;
};

/**
 * Eliza R. Snow's poems: no numbers (stanza breaks on 199 poems are our reconstruction), each
 * stanza's lines kept without the source's indentation, cited by title and date —
 * "Eliza R. Snow, “The New Year 1852” (Deseret News, 10 January 1852)".
 */
const elizaRSnowPoems: Formatter = ({ chapter, passages }) => {
  const stanza = (p: Passage) =>
    textLines(textOf(p))
      .map((line) => lineIndent(line).text)
      .join("\n");
  const date = poemDate(chapter.meta);
  const title = `${POET}, “${chapter.title ?? chapter.id}”`;
  return assemble(
    runsOfPassages(passages).map((run) => run.map(stanza)),
    date ? `${title} (${date})` : title,
  );
};

const FORMATTERS: Record<string, Formatter> = {
  "jod-mrm": journalOfDiscourses,
  "ers-lexicon": elizaRSnowPoems,
};

export const quotationFor = (source: QuoteSource): Quotation =>
  (FORMATTERS[source.edition] ?? scripture)(source);
