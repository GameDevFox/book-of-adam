import type { When } from "./events";
import type { Source } from "./types";

/**
 * The texts library's three-layer model (see docs/design/texts-library.md):
 * WORK (abstract) → EDITION (a concrete published text, which OWNS text) → standoff
 * annotations (phase 2). There is no "the text of the Book of Mormon" — only the text of a
 * specific edition; comparison is a relationship between editions (alignment tables).
 */

export type Work = {
  /** Kebab-case slug. */
  id: string;
  title: string;
  /** Tradition tags, same vocabulary as events. */
  groups: string[];
  summary?: string;
};

/**
 * Where an edition's text may live:
 * - public-domain — full text committed in data/texts/content/.
 * - quoted-excerpts — only structure + short quotes committed.
 * - local-only — full text in the gitignored data/texts/local/ (personal copies of
 *   copyrighted works); tooling works identically, repo stays clean.
 */
export type EditionLicence = "public-domain" | "quoted-excerpts" | "local-only";

export type Edition = {
  /** Kebab-case slug, unique across editions. */
  id: string;
  workId: string;
  title: string;
  /** Publication dating — the same model events use, so editions can join the timeline. */
  when: When;
  licence: EditionLicence;
  /**
   * Set to keep the edition off the public site while it is incomplete or otherwise not ready
   * — the reason, in a sentence. The research view still lists it; the public build
   * (server/data-source.ts) skips it, like a `local-only` edition. Delete it to publish.
   */
  heldBack?: string;
  /** One line on where this digital text came from (transcription basis). */
  provenance: string;
  /** Top-level content unit ids available under data/texts/content/<edition>/. */
  contents: string[];
  sources: Source[];
};

/**
 * A node in an edition's unit tree. Structure follows the edition's REAL divisions (the 1830
 * Book of Mormon has chapters + paragraphs; 1920 has chapters + verses; an encyclopedic work
 * has entries). Leaf units carry text; branch units carry children — exactly one of the two.
 * A unit's path is the edition id plus the id chain ("bofm-1920.1-nephi.1.5") — the same
 * grammar as review fact paths.
 */
/**
 * A node in the unified library nav tree (GET /api/texts/outline). Built server-side by
 * classifying content units structurally: "group" nodes expand; "reading" nodes are clickable
 * and carry the coordinates to fetch their text (edition + content file + id path within it).
 */
export type OutlineNode = {
  id: string;
  title: string;
  /** "divider": a non-interactive label inside a level's list (a year within a decade). */
  kind: "group" | "reading" | "divider";
  edition?: string;
  file?: string;
  path?: string[];
  /** For a group: how many readings it holds, shown beside its name in the menu. */
  count?: number;
  /**
   * The printed page range of a reading unit (its `meta.pages`, e.g. "60-65"), for works read
   * and cited by page — the Journal of Discourses is cited by volume and page.
   */
  pages?: string;
  /** Who delivered a reading unit (its `meta.speaker`) — every JoD discourse names one. */
  speaker?: string;
  children?: OutlineNode[];
};

/** "60-65" → "60": the page a unit is cited by. */
export const firstPage = (pages: string): string => pages.split("-")[0];

export type TextUnit = {
  id: string;
  title?: string;
  /**
   * The name the Library menu shows, where shorter than `title` — "Genesis" for "The First Book
   * of Moses Called Genesis". The reading pane keeps the full title.
   */
  shortTitle?: string;
  text?: string;
  units?: TextUnit[];
  /**
   * Optional per-unit metadata (string → string), rendered as a byline. Used by works whose
   * units are authored pieces rather than scripture divisions — e.g. a Journal of Discourses
   * discourse carries { speaker, date, reporter, pages }. Absent for plain scripture units.
   */
  meta?: Record<string, string>;
  /**
   * Where a paragraph starts in the printed book (Journal of Discourses): its page, and its
   * column within the discourse's part of that page. `continued` marks a piece that resumes a
   * paragraph a page or column break split. Set by scripts/build-jod-edition.mjs.
   */
  page?: number;
  column?: "a" | "b";
  continued?: boolean;
};

/** Walk a content file's unit tree by id path (["36"] → chapter 36); [] → the file root itself. */
export const resolveUnit = (root: TextUnit, path: string[]): TextUnit | null =>
  path.reduce<TextUnit | null>((node, id) => node?.units?.find((u) => u.id === id) ?? null, root);
