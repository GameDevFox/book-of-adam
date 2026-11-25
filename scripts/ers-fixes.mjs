/**
 * Formatting fixes for the Eliza R. Snow poems, applied by build-ers-poems.mjs to each parsed
 * poem ({ number, title, subtitle?, meta, stanzas: string[][] }). Found by a review of all 482
 * poems against the source site's HTML (2026-10-23).
 *
 * Two kinds:
 *   - rules, which hold for every poem: character glitches, ornament rows, numbered prose
 *     psalms, titles broken mid-phrase;
 *   - corrections, per poem, from data/texts/sources/ers-lexicon/corrections.json: heading lines
 *     to move out of the verse, epigraphs, footnotes, lines to join or drop, and where stanzas
 *     start. Lines are named by their exact text (leading indentation ignored), never by
 *     position, so a correction still lands after other fixes have moved lines about.
 * Stanza starts the source does not have are an editorial reconstruction from rhyme and metre;
 * such a poem records `meta.editorial`, which the reader does not show.
 *
 * A line keeps its leading tabs: the source indents lines with them (alternate lines of a
 * stanza, a centred CHORUS cue, a stepped half-line), and the reader indents to match.
 */

const NON_BREAKING_HYPHEN = String.fromCodePoint(0x2011);
const FOUR_PER_EM_SPACE = String.fromCodePoint(0x2005);
/** "‘Tis", "‘twill": an opening quote where the elision apostrophe belongs. */
const MISQUOTED_ELISION_RE = /‘(?=(?:t|T)(?:is|was|will|would|were)\b)/g;
/** The site left a space beside "death" (only there): "death ,", "death’ s", "Death ’s". */
const DEATH_SPACE_RE = /\b([Dd]eath)\s+(?=[,.:;!?]|’s\b)|\b([Dd]eath’)\s+(?=s\b)/g;
/** Poem 166 marks each acrostic letter as "M=ay"; the letters spell the name without it. */
const ACROSTIC_MARK_RE = /^(\t*[A-Z])=/;
/** A row with no letters or digits — "* * * * *", "≈≈≈≈≈" — is a divider, not verse. */
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u;
/** A numbered prose verse ("1 Praise the Lord…"); its print-width continuation lines follow. */
const NUMBERED_VERSE_RE = /^\t*\d+\s+\S/;
const MIN_NUMBERED_VERSES = 3;
const FIRST_VERSE_RE = /^\t*1\s/;
/** A heading inside a psalm ("PART FIRST.") — no lower-case letters. */
const LOWER_RE = /\p{Ll}/u;
/** A title that ends mid-phrase continues on its next heading line. */
/** A heading line that reads as the rest of the title's phrase. */
const CONTINUATION_START_RE = /^(?:of|and)\b/;
const TITLE_CONTINUES_RE = /(?:\b(?:to|of|and|the|a|an|on|for|in|by|with)|[—–-])\s*$/i;

export const EDITORIAL_STANZAS = "Stanza breaks reconstructed from rhyme and metre.";

/** A line's text for matching: indentation off, character glitches fixed. */
const key = (line) => fixLine(line).replace(/^\t+/, "");

export const fixLine = (line) =>
  line
    .replaceAll(NON_BREAKING_HYPHEN, "-")
    .replaceAll(FOUR_PER_EM_SPACE, " ")
    .replace(MISQUOTED_ELISION_RE, "’")
    .replace(DEATH_SPACE_RE, (_, word, wordApostrophe) => word ?? wordApostrophe)
    .replace(ACROSTIC_MARK_RE, "$1");

export const isOrnament = (line) => line.trim() !== "" && !LETTER_OR_DIGIT_RE.test(line);

/** Is a title broken mid-phrase — ending on "to"/"of"/a dash, or with a quote left open? */
/** A title and its continuation; no space after a dash ("The Fathers—Wouldn’t They…"). */
const joinTitle = (title, more) => (/[—–]$/.test(title) ? `${title}${more}` : `${title} ${more}`);

export const titleContinues = (title) => {
  const open = (title.match(/“/g) ?? []).length > (title.match(/”/g) ?? []).length;
  return open || TITLE_CONTINUES_RE.test(title);
};

/** Each divider row becomes a stanza of its own; the verse around it splits there. */
export const splitOrnaments = (stanzas) =>
  stanzas.flatMap((stanza) => {
    const out = [];
    let current = [];
    for (const line of stanza) {
      if (isOrnament(line)) {
        if (current.length) out.push(current);
        out.push([line.trim()]);
        current = [];
      } else current.push(line);
    }
    if (current.length) out.push(current);
    return out;
  });

/**
 * A numbered prose psalm keeps the printed page's line wraps inside each verse. Regroup it:
 * one paragraph per numbered verse, continuation lines joined on; a heading stays apart.
 */
export const regroupPsalm = (stanzas) => {
  const lines = stanzas.flat();
  const firstVerse = lines.findIndex((l) => NUMBERED_VERSE_RE.test(l));
  const numbered = lines.filter((l) => NUMBERED_VERSE_RE.test(l)).length;
  // Verses numbered from 1 — not a verse poem with a line or two that begins with a number.
  if (numbered < MIN_NUMBERED_VERSES || !FIRST_VERSE_RE.test(lines[firstVerse] ?? ""))
    return stanzas;
  const out = firstVerse > 0 ? [lines.slice(0, firstVerse)] : [];
  for (const line of lines.slice(firstVerse)) {
    const text = line.trim();
    const last = out[out.length - 1];
    if (NUMBERED_VERSE_RE.test(line) || !LOWER_RE.test(text)) out.push([text]);
    else if (last) last[last.length - 1] = `${last[last.length - 1]} ${text}`;
    else out.push([text]);
  }
  return out;
};

/** Lines as { text, stanza }: the source stanza each came from, so edits keep the breaks. */
const toEntries = (stanzas) =>
  stanzas.flatMap((lines, stanza) => lines.map((text) => ({ text, stanza })));

const groupByStanza = (entries) => {
  const groups = new Map();
  for (const { text, stanza } of entries) groups.set(stanza, [...(groups.get(stanza) ?? []), text]);
  return [...groups.values()];
};

const takeOut = (entries, wanted) => {
  const taken = [];
  for (const want of wanted) {
    const i = entries.findIndex((e) => key(e.text) === key(want));
    if (i === -1) throw new Error(`line not found: ${want}`);
    taken.push(entries.splice(i, 1)[0].text.trim());
  }
  return taken;
};

/**
 * Split a poem's verse lines into stanzas at the named lines, matched IN ORDER: a refrain line
 * that opens several stanzas is named once per stanza, and an earlier occurrence that is not
 * the next named start does not split.
 */
export const splitAt = (lines, starts) => {
  const startKeys = starts.map(key);
  let next = 0;
  const stanzas = [];
  for (const line of lines) {
    if (stanzas.length === 0) stanzas.push([line]);
    else if (next < startKeys.length && key(line) === startKeys[next]) {
      next += 1;
      stanzas.push([line]);
    } else stanzas[stanzas.length - 1].push(line);
  }
  if (next < startKeys.length)
    throw new Error(`stanza start not found (in order): ${startKeys.slice(next).join(" | ")}`);
  return stanzas;
};

/**
 * Apply one poem's correction. Fields (all optional):
 *   title, subtitle      — replace the heading outright
 *   headingLines         — lines to take out of the verse into the subtitle (or, when the title
 *                          is broken mid-phrase, onto the title)
 *   noteLines            — a footnote or editor's note: out of the verse into meta.note
 *   removeLines          — lines to drop (a divider that only fenced off a moved note)
 *   epigraphLines        — the epigraph, kept as a stanza of its own before the verse
 *   joinLines            — lines to join to the line after them (a prose wrap)
 *   stanzaStarts         — the first line of each stanza after the first, over the whole poem
 *   editorial            — true when stanzaStarts reconstructs breaks the source lacks
 *   meta                 — fields to set on meta (null deletes)
 */
export const applyCorrection = (poem, correction) => {
  if (!correction) return poem;
  const entries = toEntries(poem.stanzas);
  let { title, subtitle } = poem;
  const meta = { ...poem.meta };

  for (const heading of takeOut(entries, correction.headingLines ?? [])) {
    // A heading line continues the title when the title breaks mid-phrase, or when the line
    // itself reads as the rest of a phrase ("of July, 1862", "and Emily Matilda Hyde");
    // otherwise it is a subtitle ("on the Death of Her Son").
    if (!subtitle && (titleContinues(title) || CONTINUATION_START_RE.test(heading)))
      title = joinTitle(title, heading);
    else subtitle = subtitle ? `${subtitle} ${heading}` : heading;
  }
  const notes = takeOut(entries, correction.noteLines ?? []);
  if (notes.length) meta.note = notes.join(" ");
  takeOut(entries, correction.removeLines ?? []);
  for (const join of correction.joinLines ?? []) {
    const i = entries.findIndex((e) => key(e.text) === key(join));
    if (i === -1 || i === entries.length - 1) throw new Error(`cannot join: ${join}`);
    const joined = `${entries[i].text} ${entries[i + 1].text.trim()}`;
    entries.splice(i, 2, { text: joined, stanza: entries[i].stanza });
  }
  const epigraph = takeOut(entries, correction.epigraphLines ?? []);

  // Reconstructed breaks replace the source's; otherwise the source's stanzas stand.
  let stanzas = correction.stanzaStarts
    ? splitAt(
        entries.map((e) => e.text),
        correction.stanzaStarts,
      )
    : groupByStanza(entries);
  if (epigraph.length) stanzas = [epigraph, ...stanzas];
  if (correction.editorial) meta.editorial = EDITORIAL_STANZAS;
  for (const [k, v] of Object.entries(correction.meta ?? {})) {
    if (v === null) delete meta[k];
    else meta[k] = v;
  }
  return {
    ...poem,
    title: correction.title ?? title,
    subtitle: correction.subtitle === null ? undefined : (correction.subtitle ?? subtitle),
    meta,
    stanzas,
  };
};

/** Every fix, in order: characters, the poem's correction, then the rules over its shape. */
export const fixPoem = (poem, correction) => {
  const cleaned = { ...poem, stanzas: poem.stanzas.map((s) => s.map(fixLine)) };
  const corrected = applyCorrection(cleaned, correction);
  let { title, subtitle } = corrected;
  if (!correction?.title && subtitle && titleContinues(title)) {
    title = joinTitle(title, subtitle);
    subtitle = undefined;
  }
  return {
    ...corrected,
    title,
    subtitle,
    stanzas: splitOrnaments(regroupPsalm(corrected.stanzas)),
  };
};
