/**
 * How a text unit is labelled and laid out in the reading pane.
 *
 * Unit ids carry their kind as a prefix — "p3" a prose paragraph (JoD), "s3" a poem's stanza
 * (Eliza R. Snow), a bare number a verse — and the label shows it the way a reader expects:
 * ¶3, 3, 3. Only the label changes; the stored id is what links and quotes use.
 */
const PARAGRAPH_ID_RE = /^p(?=\d)/;
const STANZA_ID_RE = /^s(?=\d)/;

export const unitLabel = (id: string): string =>
  id.replace(PARAGRAPH_ID_RE, "¶").replace(STANZA_ID_RE, "");

/**
 * A unit's text as the lines it was set in. A poem's stanza stores its lines newline-joined (as
 * do the witnesses' signatures); prose has no line breaks and comes back whole.
 */
export const textLines = (text: string): string[] => text.split("\n");

/** A poem with no date says so in its notes as "n.d."; the byline leaves that out. */
const NO_DATE = "n.d.";
const BYLINE_SEPARATOR = "  ·  ";

/**
 * The line under a reading's title, from its notes. A JoD discourse: speaker, date, reporter,
 * pages. An Eliza R. Snow poem: its subtitle (often a dedication), when it was composed or
 * dated, and where it was printed. A note a unit does not have is skipped.
 */
export const bylineOf = (meta: Record<string, string>): string =>
  [
    meta.speaker,
    meta.subtitle,
    meta.composed ? `Composed ${meta.composed}` : null,
    meta.dated ? `Dated ${meta.dated}` : null,
    meta.date !== NO_DATE ? meta.date : null,
    meta.published ? `Published in ${meta.published}` : null,
    meta.reporter ? `reported by ${meta.reporter}` : null,
    meta.pages ? `pp. ${meta.pages}` : null,
  ]
    .filter(Boolean)
    .join(BYLINE_SEPARATOR);

/** Deepest indent drawn: a stepped half-line can carry 12 tabs, which would run off a phone. */
const MAX_INDENT_LEVEL = 8;
const LEADING_TABS_RE = /^\t*/;

/** A line's leading tabs (the source's indentation) as an indent level, and its text. */
export const lineIndent = (line: string): { text: string; level: number } => {
  const tabs = LEADING_TABS_RE.exec(line)?.[0].length ?? 0;
  return { text: line.slice(tabs), level: Math.min(tabs, MAX_INDENT_LEVEL) };
};

/** A divider stanza — an ornament row such as "* * * * *" (scripts/ers-fixes.mjs: "orn1"…). */
export const isOrnamentUnit = (id: string): boolean => id.startsWith("orn");
