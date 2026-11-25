/**
 * Catalogue the poems of Eliza R. Snow from the Eliza R. Snow Lexicon
 * (https://erslexicon.wordpress.com/) into the memorial texts library.
 *
 * The site posts the 507 poems of Derr & Davidson, *Eliza R. Snow: The Complete Poetry* (2009)
 * as twenty WordPress pages of 25 poems each ("Poems 1–25" … "Poems 476–507"). Every poem is
 * anchored `<p style="text-align:center;"><a id="one"></a>1 Pity &c</p>`, followed by one <p>
 * per stanza with <br />-separated lines, editorial line numbers every fifth line
 * ("…pointed dart.         5"), and optional trailing notes ("published in Western Courier,
 * 13 August 1825", "composed 1828", "n.d.").
 *
 * Output (same source/content split as the Journal of Discourses — docs/design/texts-library.md):
 *   data/texts/content/ers-lexicon/poems-001-025.json  — page → poem → stanza unit trees (text)
 *   data/texts/sources/ers-lexicon/poems-001-025.json  — per-poem metadata, no text
 *   data/texts/sources/ers-lexicon/manifest.json       — page list, counts, known gaps
 *   data/texts/sources/ers-lexicon/.cache/<postId>.json — raw API responses (gitignored)
 * and registers the Work + Edition (idempotent).
 *
 * Fetching goes through the WordPress.com public REST API (one JSON request per page; the
 * site has no blog posts, only pages). Re-runs read the cache unless --force.
 *
 * Usage (from packages/memorial):
 *   node scripts/build-ers-poems.mjs            # build from cache, fetching what's missing
 *   node scripts/build-ers-poems.mjs --force    # refetch every page
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fixPoem, isOrnament } from "./ers-fixes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const TEXTS = path.join(PKG, "data/texts");
const EDITION_ID = "ers-lexicon";
const WORK_ID = "eliza-r-snow-poems";
const CONTENT_DIR = path.join(TEXTS, "content", EDITION_ID);
const SOURCES_DIR = path.join(TEXTS, "sources", EDITION_ID);
const CACHE_DIR = path.join(SOURCES_DIR, ".cache");
/** Per-poem formatting corrections (scripts/ers-fixes.mjs), keyed by poem number. */
const CORRECTIONS_FILE = path.join(SOURCES_DIR, "corrections.json");

const SITE = "erslexicon.wordpress.com";
const SITE_URL = `https://${SITE}/`;
const API = `https://public-api.wordpress.com/rest/v1.1/sites/${SITE}`;
const USER_AGENT =
  "memorial-research-archiver/0.1 (one-time archival of Eliza R. Snow's public-domain poems; gamedevfox@gmail.com)";
const PAGE_LIST_SIZE = 100; // the site has 44 pages; one request lists them all
const PAGE_TITLE_RE = /^Poems (\d+)[–-](\d+)$/;
const FETCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 800;
const TOTAL_POEMS = 507;
/** Width of the zero-padded poem numbers in file names ("poems-001-025"). */
const NUMBER_PAD = 3;

const force = process.argv.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- HTML helpers (no external deps) -----------------------------------------------------
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (_, n) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, n) ? NAMED_ENTITIES[n] : `&${n};`,
    );

/** No-break space — decoded &nbsp; and literal U+00A0 both become plain spaces. */
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
/** Unicode LINE SEPARATOR — the site uses it inside a <p> where the print edition broke a line. */
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
/** Soft hyphen — appears mid-word in a few transcriptions ("there­of"); never printed. */
const SOFT_HYPHEN = String.fromCodePoint(0xad);

/** Collapse internal whitespace runs. Applied AFTER line-number stripping, which needs the gap. */
const tidy = (s) => s.replace(/[ \t]+/g, " ").trim();

/**
 * One HTML paragraph's inner markup → its lines (tags out, entities decoded, trimmed). Internal
 * runs of spaces are kept: the editorial line number sits after a run of them.
 */
const toLines = (inner) =>
  decodeEntities(
    inner
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, ""),
  )
    .replaceAll(NO_BREAK_SPACE, " ")
    .replaceAll(LINE_SEPARATOR, "\n")
    .replaceAll(SOFT_HYPHEN, "")
    .split("\n")
    // Leading tabs are the source's indentation (kept for verse lines); spaces go.
    .map((l) => l.replace(/^ +/, "").replace(/\s+$/, ""))
    .filter((l) => l.trim());

// --- fetch with cache + retry ------------------------------------------------------------
/** Did this run touch the network? If not, written files keep their previous timestamps. */
let fetchedNow = false;
const fetchJson = async (url, cacheName) => {
  const cacheFile = path.join(CACHE_DIR, cacheName);
  if (!force && existsSync(cacheFile)) return JSON.parse(await readFile(cacheFile, "utf8"));
  fetchedNow = true;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, text);
      await sleep(FETCH_DELAY_MS);
      return JSON.parse(text);
    } catch (error) {
      lastErr = error;
      if (attempt < MAX_RETRIES) await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw lastErr;
};

// --- parsing -----------------------------------------------------------------------------
const ANCHOR_RE = /<p[^>]*><a id="([a-z]+)"><\/a>(.*?)<\/p>/s;
const PARAGRAPH_RE = /<p([^>]*)>(.*?)<\/p>/gs;
/**
 * Editorial line number at the end of a verse line. The gap before it is anything from one
 * plain space to a run of &nbsp;s, so the number is recognised by VALUE instead: a multiple of
 * five within LINE_NUMBER_SLACK of our own running count (an epigraph the edition leaves
 * uncounted shifts the count by a line or two). A year ("…in 1830") is never that close.
 */
const LINE_NUMBER_RE = /\s(\d+)$/;
const LINE_NUMBER_STEP = 5;
const LINE_NUMBER_SLACK = 8;
const looksLikeLineNumber = (n, count) =>
  n % LINE_NUMBER_STEP === 0 && Math.abs(n - count) <= LINE_NUMBER_SLACK;
/** Trailing editorial notes, as printed on the site (lower-case "published" is the norm). */
/**
 * Note forms, as printed: "published in Ohio Star, …", "published by Ebenezer Robinson in
 * 1841", "published as a broadsheet, …", "lines 1–122 published in …", "entire poem published
 * in …", "composed 1828", "composed ca. 1840", "composed 1870s", "dated 11 March 1879".
 */
const NOTE_RES = {
  published: /^(?:(lines [\d–-]+|entire poem) )?published (?:in )?(.+)$/i,
  composed: /^composed (.+)$/i,
  dated: /^dated (.+)$/i,
};
/** A composed/dated note always names a year; a verse line starting "Composed …" does not. */
const DATED_NOTE_KEYS = ["composed", "dated"];
const UNDATED_RE = /^n\.\s?d\.?$/i; // "n.d.", and the site's "n. d." and "n.d"
const YEAR_RE = /1[89]\d\d/; // no boundaries: the site has "September1842" and "1870s"
const NOTE_SPLIT_RE = /\s*,\s*(?=published |composed |dated )/i;
/** Broken non-breaking-space entities the site left as visible text. */
const JUNK_RE = /^&?n[bs]?[bs]p;?$/i;
/** The "Poems 351–375" page was never filled in; every poem body is keyboard-mash filler. */
const PLACEHOLDER_RE = /^[a-z]{3,8}$/;
const PLACEHOLDER_MIN_SHARE = 0.9;

const pad = (n) => String(n).padStart(NUMBER_PAD, "0");

/**
 * A trailing note line → { key, value } or null. "composed 1 January 1840 , published in
 * Poems 1, 1856" is one line carrying both, so a line may yield several notes.
 */
const parseNotes = (line) => {
  const notes = [];
  for (const piece of line.split(NOTE_SPLIT_RE)) {
    const p = piece.replace(/^[,\s]+/, "").trim();
    if (!p) continue;
    const match = Object.entries(NOTE_RES).find(([, re]) => re.test(p));
    if (match && (!DATED_NOTE_KEYS.includes(match[0]) || YEAR_RE.test(p))) {
      const [key, re] = match;
      const groups = re.exec(p).slice(1).filter(Boolean);
      // "composed on 28 March 1859": the "on" is the site's wording, not part of the date.
      notes.push([
        key,
        groups
          .join(": ")
          .trim()
          .replace(/^on\s+/i, ""),
      ]);
    } else if (UNDATED_RE.test(p)) notes.push(["date", "n.d."]);
    else return null;
  }
  return notes.length ? notes : null;
};

/**
 * One poem's HTML (from its anchor up to the next) → { number, title, subtitle?, meta, stanzas,
 * lines, numberMismatches }. Stanzas are string[] of lines with the editorial line numbers
 * stripped; `numberMismatches` counts printed line numbers that disagree with our own count.
 */
const parsePoem = (block) => {
  const head = ANCHOR_RE.exec(block);
  const headLines = toLines(head[2]).map(tidy);
  // Poem 88's heading carries a stray ">" from a broken tag on the site; skip leading junk.
  const numberMatch = /^[\s>]*(\d+)\s+(.*)$/s.exec(headLines[0]);
  const number = Number(numberMatch[1]);
  const title = numberMatch[2].trim();
  const subtitle = headLines.slice(1).join(" ") || undefined;

  const stanzas = [];
  const meta = {};
  let lineCount = 0;
  let offset = 0;
  let synced = false;
  let numberMismatches = 0;
  for (const [, , inner] of block.slice(head.index + head[0].length).matchAll(PARAGRAPH_RE)) {
    const lines = toLines(inner);
    if (!lines.length || (lines.length === 1 && JUNK_RE.test(lines[0].trim()))) continue;
    // Editorial notes are the trailing lines of a paragraph — usually their own <p>, but often
    // the last lines of the final stanza. Peel them off the end; keep whatever verse precedes.
    // A note may wrap onto a second line at a print line break, so a failed single line is
    // retried joined with the line before it.
    let verseEnd = lines.length;
    const peeled = [];
    while (verseEnd > 0) {
      const one = parseNotes(tidy(lines[verseEnd - 1]));
      const two =
        !one && verseEnd > 1
          ? parseNotes(tidy(`${lines[verseEnd - 2]} ${lines[verseEnd - 1]}`))
          : null;
      if (!one && !two) break;
      peeled.unshift(one ?? two);
      verseEnd -= one ? 1 : 2;
    }
    for (const [key, value] of peeled.flat())
      meta[key] = meta[key] ? `${meta[key]}; ${value}` : value;
    if (verseEnd === 0) continue;
    const stanza = lines.slice(0, verseEnd).map((raw) => {
      // The source's indentation: kept as leading tabs, restored after tidy() collapses runs.
      const indent = /^\t*/.exec(raw)[0];
      const line = raw.slice(indent.length);
      const m = LINE_NUMBER_RE.exec(line);
      lineCount += 1;
      const printed = m ? Number(m[1]) : null;
      // Before the first number is seen, our count may run far ahead of the edition's (a long
      // prose preface it leaves uncounted), so the first multiple of five at or behind the
      // count is taken on trust and sets the offset; after that the slack window applies.
      // A printed "5" is also the start of a fresh sequence: long works number each chapter
      // from 1 (465 "Personification of Truth" restarts eight times).
      const restart = printed === LINE_NUMBER_STEP;
      const plausible =
        restart ||
        (synced
          ? looksLikeLineNumber(printed, lineCount + offset)
          : printed % LINE_NUMBER_STEP === 0 && printed <= lineCount + LINE_NUMBER_SLACK);
      if (printed === null || !plausible) return indent + tidy(line);
      synced = true;
      if (printed !== lineCount + offset) {
        if (!restart) numberMismatches += 1;
        offset = printed - lineCount; // resync: the edition skipped/added an uncounted line
      }
      return indent + tidy(line.slice(0, m.index));
    });
    stanzas.push(stanza);
  }
  return { number, title, subtitle, meta, stanzas, lines: lineCount, numberMismatches };
};

/** Split a page's HTML body into poem blocks (the two-column index at the top is dropped). */
const parsePage = (html) => {
  const body = html.split('<div style="clear:both;"></div>')[1] ?? html;
  const blocks = body.split(/(?=<p[^>]*><a id="[a-z]+"><\/a>)/).filter((b) => ANCHOR_RE.test(b));
  return blocks.map(parsePoem);
};

const isPlaceholderPage = (poems) => {
  const bodies = poems.flatMap((p) => p.stanzas.flat());
  if (!bodies.length) return false;
  const junk = bodies.filter((l) => PLACEHOLDER_RE.test(l.trim())).length;
  return junk / bodies.length >= PLACEHOLDER_MIN_SHARE;
};

// --- main --------------------------------------------------------------------------------
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const readJsonIfAny = async (file) => (existsSync(file) ? readJson(file) : null);

/**
 * A poem's stanzas as text units. A divider row (an ornament) is its own unit, "orn1", "orn2";
 * verse stanzas count on without it, "s1", "s2", so stanza numbers have no gaps.
 */
const stanzaUnits = (stanzas) => {
  let verse = 0;
  let ornament = 0;
  return stanzas.map((lines) =>
    lines.length === 1 && isOrnament(lines[0])
      ? { id: `orn${++ornament}`, text: lines[0] }
      : { id: `s${++verse}`, text: lines.join("\n") },
  );
};

const main = async () => {
  await mkdir(CONTENT_DIR, { recursive: true });
  await mkdir(SOURCES_DIR, { recursive: true });
  const corrections = (await readJsonIfAny(CORRECTIONS_FILE)) ?? {};

  const listing = await fetchJson(
    `${API}/posts/?type=page&number=${PAGE_LIST_SIZE}&fields=ID,title,URL`,
    "pages.json",
  );
  const pages = listing.posts
    .map((p) => ({ ...p, range: PAGE_TITLE_RE.exec(decodeEntities(p.title)) }))
    .filter((p) => p.range)
    .map((p) => ({
      id: p.ID,
      title: decodeEntities(p.title),
      url: p.URL,
      from: Number(p.range[1]),
      to: Number(p.range[2]),
    }))
    .sort((a, b) => a.from - b.from);
  console.log(`Eliza R. Snow Lexicon → ${pages.length} poem pages`);

  const manifest = [];
  const contents = [];
  const seen = new Set();
  let poemsWithText = 0;
  let totalLines = 0;
  let totalMismatches = 0;
  for (const page of pages) {
    const post = await fetchJson(
      `${API}/posts/${page.id}?fields=ID,title,slug,URL,date,modified,content`,
      `${page.id}.json`,
    );
    const poems = parsePage(post.content).map((poem) => fixPoem(poem, corrections[poem.number]));
    const placeholder = isPlaceholderPage(poems);
    const fileId = `poems-${pad(page.from)}-${pad(page.to)}`;
    const expected = page.to - page.from + 1;
    if (poems.length !== expected)
      console.warn(`  ${page.title}: expected ${expected} poems, parsed ${poems.length}`);
    for (const poem of poems) {
      if (seen.has(poem.number)) console.warn(`  duplicate poem number ${poem.number}`);
      seen.add(poem.number);
      totalMismatches += poem.numberMismatches;
      if (poem.numberMismatches)
        console.warn(
          `  ${poem.number} ${poem.title}: ${poem.numberMismatches} printed line number(s) disagree with the count`,
        );
    }

    const poemUnit = (poem) => ({
      id: `${poem.number}`,
      title: poem.title,
      meta: {
        ...(poem.subtitle ? { subtitle: poem.subtitle } : {}),
        number: `${poem.number}`,
        ...poem.meta,
      },
      units: stanzaUnits(poem.stanzas),
    });

    // A correction can mark one poem's text missing (#145: the site repeats #144's text).
    const missingReason = (poem) =>
      placeholder ? "source page holds placeholder text" : corrections[poem.number]?.missing;
    const withText = poems.filter((poem) => !missingReason(poem));
    if (!placeholder) {
      await writeJson(path.join(CONTENT_DIR, `${fileId}.json`), {
        id: fileId,
        title: page.title,
        units: withText.map(poemUnit),
      });
      contents.push(fileId);
      poemsWithText += withText.length;
      totalLines += withText.reduce((n, p) => n + p.lines, 0);
    } else {
      console.warn(`  ${page.title}: placeholder text on the source site — no content written`);
    }

    // Source metadata: every poem (including placeholders), no text.
    const sourceFile = path.join(SOURCES_DIR, `${fileId}.json`);
    const previous = await readJsonIfAny(sourceFile);
    await writeJson(sourceFile, {
      page: page.title,
      postId: post.ID,
      url: post.URL,
      published: post.date,
      modified: post.modified,
      fetchedAt: fetchedNow || !previous?.fetchedAt ? new Date().toISOString() : previous.fetchedAt,
      count: poems.length,
      ...(placeholder ? { placeholder: true } : {}),
      poems: poems.map((poem) => ({
        id: `${poem.number}`,
        number: poem.number,
        title: poem.title,
        ...(poem.subtitle ? { subtitle: poem.subtitle } : {}),
        ...poem.meta,
        ...(missingReason(poem)
          ? { missing: missingReason(poem) }
          : { stanzaCount: poem.stanzas.length, lineCount: poem.lines }),
      })),
    });
    manifest.push({
      file: fileId,
      page: page.title,
      postId: post.ID,
      url: post.URL,
      poems: poems.length,
      ...(placeholder ? { placeholder: true } : {}),
    });
  }

  const missingNumbers = [];
  for (let n = 1; n <= TOTAL_POEMS; n++) if (!seen.has(n)) missingNumbers.push(n);
  if (missingNumbers.length)
    console.warn(`  poem numbers never seen: ${missingNumbers.join(", ")}`);

  const manifestFile = path.join(SOURCES_DIR, "manifest.json");
  const previousManifest = await readJsonIfAny(manifestFile);
  await writeJson(manifestFile, {
    source: SITE_URL,
    generatedAt:
      fetchedNow || !previousManifest?.generatedAt
        ? new Date().toISOString()
        : previousManifest.generatedAt,
    citation:
      "Derr, Jill Mulvay and Karen Lynn Davidson. Eliza R. Snow: The Complete Poetry. Provo and Salt Lake City, Utah: Brigham Young University Press and University of Utah Press, 2009.",
    totalPoems: seen.size,
    poemsWithText,
    pages: manifest,
  });

  // Register the Work + Edition (idempotent).
  const worksPath = path.join(TEXTS, "works.json");
  const works = await readJson(worksPath);
  if (!works.some((w) => w.id === WORK_ID)) {
    works.push({
      id: WORK_ID,
      title: "The Poems of Eliza R. Snow",
      groups: ["lds", "restoration", "poetry"],
      summary:
        "The 507 poems Eliza R. Snow (1804–1887) published in her lifetime, 1825–1887, in newspapers, church periodicals, hymnals, and her two-volume Poems, Religious, Historical, and Political (1856, 1877).",
    });
    await writeJson(worksPath, works);
  }
  const editionsPath = path.join(TEXTS, "editions.json");
  const editions = await readJson(editionsPath);
  if (!editions.some((e) => e.id === EDITION_ID)) {
    editions.push({
      id: EDITION_ID,
      workId: WORK_ID,
      title: "Eliza R. Snow: The Complete Poetry (erslexicon.wordpress.com)",
      when: {
        type: "instant",
        date: { year: 2009 },
        note: "The poems themselves appeared 1825–1887; this text follows the 2009 Derr & Davidson edition as posted (with permission) on the Eliza R. Snow Lexicon site.",
      },
      // Published (2026-10-23), after a day held back: the poems are public domain by age, and
      // the owner accepted what remains of the 2009 edition's apparatus. README, "Eliza R. Snow
      // poems".
      licence: "public-domain",
      provenance:
        "Scraped from erslexicon.wordpress.com (BYU student lexicon project) by scripts/build-ers-poems.mjs; the site reproduces Derr & Davidson 2009. Poem text is public domain by age; the edition's editorial line numbers are stripped, its bracketed insertions and publication notes kept. Poems 351–375 are placeholder text on the site and have no content here.",
      contents,
      sources: [{ label: "Eliza R. Snow Lexicon — Poems", url: `${SITE_URL}poems/` }],
    });
    await writeJson(editionsPath, editions);
  }

  console.log(
    `Done. ${seen.size} poems catalogued (${poemsWithText} with text, ${totalLines} lines, ${totalMismatches} line-number mismatches) across ${contents.length} content files.`,
  );
};

await main();
