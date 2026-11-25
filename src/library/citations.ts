import { firstPage, type OutlineNode } from "../records/texts";

/**
 * Short Library URLs for works a reader looks up by number rather than by edition and file:
 *
 * Eliza R. Snow's poems — /library/eliza-r-snow-poems/130 — by poem number, unique across all
 * 507, whichever storage file holds the poem.
 *
 * The Journal of Discourses, mirroring how it is cited:
 * JD 1:62 → /library/jod/1/62. Any page inside a discourse's printed range lands on that
 * discourse, and the URL keeps the page asked for (for a later jump-to-page); the menu links
 * each discourse by its opening page.
 *
 * Discourses can share a page (745 do: one ends where the next begins). Such a page belongs to
 * the discourse that BEGINS on it — the only rule under which every discourse's own link, its
 * opening page, lands on that discourse.
 */

/** The URL segment for the JoD, and the edition it stands for. */
const JOD_SLUG = "jod";
const JOD_EDITION = "jod-mrm";
const VOLUME_FILE_RE = /^volume-(\d+)$/;
const POSITIVE_INT_RE = /^[1-9]\d*$/;
const VOLUME_DIGITS = 2;

/** The URL segment for Eliza R. Snow's poems (the work's id), and the edition it reads. */
const POEMS_SLUG = "eliza-r-snow-poems";
const POEMS_EDITION = "ers-lexicon";

/** Reading-node coordinates; `page` only for a JoD page citation. */
export type CitedCoords = { edition: string; file: string; path: string[]; page?: number };

const volumeFile = (volume: number) => `volume-${String(volume).padStart(VOLUME_DIGITS, "0")}`;

const pageRange = (pages: string): [number, number] => {
  const [start, end] = pages.split("-").map(Number);
  return [start, end ?? start];
};

/** Every reading in an outline, in menu order. */
export const readings = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.flatMap((node) => (node.kind === "reading" ? [node] : readings(node.children ?? [])));

/** Is this URL path (segments after /library/) in citation form, resolvable or not? */
export const isCitationPath = (segments: string[]): boolean =>
  segments[0] === JOD_SLUG || segments[0] === POEMS_SLUG;

/** `["eliza-r-snow-poems", "130"]` → poem 130, or null if there is no such poem. */
const resolvePoem = (segments: string[], outline: OutlineNode[]): CitedCoords | null => {
  const [, number] = segments;
  if (segments.length !== 2 || !POSITIVE_INT_RE.test(number)) return null;
  const poem = readings(outline).find(
    (node) => node.edition === POEMS_EDITION && node.path?.[0] === number,
  );
  return poem?.file ? { edition: POEMS_EDITION, file: poem.file, path: [number] } : null;
};

/** `["jod", "1", "62"]` → the discourse that page lands on, or null if it is no such citation. */
const resolveJod = (segments: string[], outline: OutlineNode[]): CitedCoords | null => {
  const [slug, volume, page] = segments;
  if (segments.length !== 3 || slug !== JOD_SLUG) return null;
  if (!POSITIVE_INT_RE.test(volume) || !POSITIVE_INT_RE.test(page)) return null;
  const file = volumeFile(Number(volume));
  const target = Number(page);
  const inVolume = readings(outline).filter(
    (node) => node.edition === JOD_EDITION && node.file === file && node.pages,
  );
  const ranged = inVolume.map((node) => ({ node, range: pageRange(node.pages ?? "") }));
  const found =
    ranged.find(({ range }) => range[0] === target) ??
    ranged.find(({ range }) => range[0] <= target && target <= range[1]);
  if (!found) return null;
  return { edition: JOD_EDITION, file, path: found.node.path ?? [], page: target };
};

/** A JoD discourse's citation URL (volume and opening page), or null for any other text. */
export const citationUrl = (node: OutlineNode): string | null => {
  if (node.edition === POEMS_EDITION && node.path?.length === 1) {
    return `/library/${POEMS_SLUG}/${node.path[0]}`;
  }
  const volume = node.file?.match(VOLUME_FILE_RE)?.[1];
  if (node.edition !== JOD_EDITION || !volume || !node.pages) return null;
  return `/library/${JOD_SLUG}/${Number(volume)}/${firstPage(node.pages)}`;
};

/** A short URL's segments → the reading it names, or null if it names none. */
export const resolveCitation = (segments: string[], outline: OutlineNode[]): CitedCoords | null =>
  segments[0] === POEMS_SLUG ? resolvePoem(segments, outline) : resolveJod(segments, outline);

/** A reading's edition-style URL, /library/<edition>/<file>/<path…> — every text has one. */
export const editionUrl = (c: { edition?: string; file?: string; path?: string[] }): string =>
  `/library/${c.edition}/${c.file}${(c.path ?? []).map((s) => `/${encodeURIComponent(s)}`).join("")}`;

/** A reading's URL as the menu links it: its citation where the text has one, else edition-style. */
export const readingUrl = (node: OutlineNode): string => citationUrl(node) ?? editionUrl(node);
