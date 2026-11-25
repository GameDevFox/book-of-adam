/**
 * Download the Journal of Discourses (26 vols of public-domain LDS sermons, 1851–1886)
 * from jod.mrm.org into a diffable per-volume JSON, for the memorial texts library.
 *
 * This is source #1. The plan is to later pull a second source and diff the extracted TEXT
 * (not the HTML) to catch transcription errors on either side — so this script keeps the
 * paragraphs verbatim and records provenance.
 *
 * Politeness: descriptive User-Agent, rate-limited (default 700ms between page fetches),
 * retries with backoff. Resumable: every fetched page is cached as raw HTML under
 * data/texts/sources/jod-mrm/.cache/ (gitignored), so re-runs skip the network. Robust: the
 * site is a Gatsby/Emotion SPA with content-hashed class names, so we parse by SEMANTIC tags
 * (<article>, <h2>, <p>) rather than the volatile css-* classes.
 *
 * Usage (from packages/memorial):
 *   node scripts/download-jod.mjs                 # all 26 volumes
 *   node scripts/download-jod.mjs --vols 1-3      # a range
 *   node scripts/download-jod.mjs --vols 1 --limit 3   # first 3 discourses of vol 1 (smoke test)
 *   node scripts/download-jod.mjs --delay 1000    # gentler
 *   node scripts/download-jod.mjs --force         # ignore the HTML cache and refetch
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { paragraphsWithMarks } from "./jod-marks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const OUT_DIR = path.join(PKG, "data/texts/sources/jod-mrm");
const CACHE_DIR = path.join(OUT_DIR, ".cache");
// Full per-volume scrape (paragraphs included) — gitignored; build-jod-edition.mjs splits it
// into committed content/ (text) + sources/ (metadata). See docs/design/texts-library.md.
const RAW_DIR = path.join(OUT_DIR, "raw");
const BASE = "https://jod.mrm.org";
const USER_AGENT =
  "memorial-research-archiver/0.1 (one-time archival of the public-domain Journal of Discourses; gamedevfox@gmail.com)";

const FIRST_VOLUME = 1;
const LAST_VOLUME = 26;
const DEFAULT_DELAY_MS = 700;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 800;

// --- CLI ---------------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const volsArg = opt("vols", `${FIRST_VOLUME}-${LAST_VOLUME}`);
const [volFrom, volTo] = volsArg.includes("-")
  ? volsArg.split("-").map(Number)
  : [Number(volsArg), Number(volsArg)];
const delayMs = Number(opt("delay", `${DEFAULT_DELAY_MS}`));
const limit = opt("limit") ? Number(opt("limit")) : Infinity;
const force = flag("force");

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
  middot: "·",
  sect: "§",
  para: "¶",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  ccedil: "ç",
  pound: "£",
  deg: "°",
  ldquor: "„",
};

const MAX_DECODE_PASSES = 3;

const decodeOnce = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (_, n) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, n) ? NAMED_ENTITIES[n] : `&${n};`,
    );

// Idempotent: some source pages double-encode ("&amp;mdash;"), so decode until stable.
const decodeEntities = (s) => {
  let out = s;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
};

const stripTags = (s) =>
  s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "");

/** Tags out, entities decoded, whitespace collapsed. */
const clean = (s) => decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();

const slice = (html, startTag, endTag, from = 0) => {
  const a = html.indexOf(startTag, from);
  if (a < 0) return null;
  const b = html.indexOf(endTag, a);
  if (b < 0) return null;
  return { text: html.slice(a, b + endTag.length), start: a, end: b + endTag.length };
};

// --- fetch with cache + retry ------------------------------------------------------------
const fetchHtml = async (url, cacheName) => {
  const cacheFile = path.join(CACHE_DIR, cacheName);
  if (!force && existsSync(cacheFile))
    return { html: await readFile(cacheFile, "utf8"), cached: true };
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, html);
      return { html, cached: false };
    } catch (error) {
      lastErr = error;
      if (attempt < MAX_RETRIES) await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw new Error(`failed to fetch ${url} after ${MAX_RETRIES} tries: ${lastErr?.message}`);
};

// --- parsing -----------------------------------------------------------------------------
/**
 * The volume index lists discourses as `<a href="/VOL/PAGE">Title</a>`, and each discourse's
 * metadata (page range, ISO date, speaker) sits in the DOM gap BEFORE its title link. So we
 * find the anchors in order and read the metadata out of the preceding gap.
 */
const parseVolumeIndex = (html, vol) => {
  const anchorRe = new RegExp(`<a href="/${vol}/(\\d+)"[^>]*>([\\s\\S]*?)</a>`, "g");
  const anchors = [];
  let m;
  while ((m = anchorRe.exec(html))) {
    anchors.push({
      page: Number(m[1]),
      title: clean(m[2]),
      start: m.index,
      end: anchorRe.lastIndex,
    });
  }
  const discourses = [];
  const seen = new Set();
  for (let i = 0; i < anchors.length; i++) {
    const { page, title } = anchors[i];
    if (seen.has(page)) continue;
    seen.add(page);
    const gap = html.slice(i === 0 ? 0 : anchors[i - 1].end, anchors[i].start);
    // ISO date lives in a title="...T...Z" attribute on the date cell.
    const isoM = gap.match(/title="([^"]*T[^"]*)"/);
    // Page range: "pp. <!-- -->6<!-- -->-<!-- -->15".
    const ppM = clean(gap).match(/pp\.\s*(\d+)\s*[-–]\s*(\d+)/);
    // Speaker is the last div text in the gap before the anchor.
    const divTexts = [...gap.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)]
      .map((d) => clean(d[1]))
      .filter(Boolean);
    const speaker = divTexts.length ? divTexts[divTexts.length - 1] : null;
    discourses.push({
      page,
      title,
      speaker: speaker && !/^pp\./i.test(speaker) ? speaker : null,
      dateISO: isoM ? isoM[1] : null,
      pages: ppM ? `${ppM[1]}-${ppM[2]}` : null,
    });
  }
  return discourses.sort((a, b) => a.page - b.page);
};

const parseDiscoursePage = (html) => {
  const article = slice(html, "<article", "</article>");
  if (!article) throw new Error("no <article> found");

  // React-helmet writes clean per-discourse metadata into <head>: the byline as the meta
  // description, and title + speaker + exact page range in og:title
  // ("Salvation, by Brigham Young (Journal of Discourses 1:1-6)"). Far more robust than the
  // content-hashed body markup.
  const meta = (re) => {
    const m = html.match(re);
    return m ? clean(m[1]) : null;
  };
  const byline = meta(/<meta[^>]+name="description"[^>]+content="([\s\S]*?)"/i);
  const ogTitle = meta(/<meta[^>]+property="og:title"[^>]+content="([\s\S]*?)"/i);

  const h2 = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/);
  const title = h2 ? clean(h2[1]) : ogTitle ? ogTitle.replace(/,?\s+by\s+.*$/, "").trim() : null;
  const ogSpeaker = ogTitle?.match(/\bby\s+(.+?)\s+\(Journal of Discourses/i);
  const cite = html.match(/Journal of Discourses\s+\d+:(\d+)[-–](\d+)/);

  // "Reported by G. D. Watt." sits in the body, but the name is broken up by HTML comments
  // (…by <!-- -->G. D. Watt<!-- -->.) and has internal periods — so clean the whole cell.
  const reporterBlock = html.match(/Reported by[\s\S]{0,240}?<\/div>/i);
  const reporter = reporterBlock
    ? clean(reporterBlock[0])
        .replace(/^Reported by\s*/i, "")
        .replace(/\.\s*$/, "")
        .trim() || null
    : null;
  const dateM = byline?.match(/([A-Z][a-z]+ \d{1,2},? \d{4})/);

  // Body: every <p> inside the article, verbatim — with the printed page and column each one
  // starts on (jod-marks.mjs), taken from the same pass so text and marks cannot drift apart.
  const body = paragraphsWithMarks(article.text, clean);
  const paragraphs = body.map((p) => p.text);
  const marks = body.map(({ page, column, continued }) => ({
    page,
    column,
    ...(continued ? { continued: true } : {}),
  }));

  return {
    title,
    byline,
    speaker: ogSpeaker ? ogSpeaker[1].trim() : null,
    pages: cite ? `${cite[1]}-${cite[2]}` : null,
    reporter,
    dateText: dateM ? dateM[1] : null,
    paragraphs,
    marks,
  };
};

// --- main --------------------------------------------------------------------------------
const run = async () => {
  await mkdir(RAW_DIR, { recursive: true });
  console.log(`Journal of Discourses → ${RAW_DIR}`);
  console.log(
    `volumes ${volFrom}–${volTo} · delay ${delayMs}ms · cache ${force ? "IGNORED" : "on"}\n`,
  );

  const manifest = [];
  let grandTotal = 0;

  for (let vol = volFrom; vol <= volTo; vol++) {
    const { html: idxHtml, cached: idxCached } = await fetchHtml(
      `${BASE}/${vol}/`,
      `idx-${vol}.html`,
    );
    if (!idxCached) await sleep(delayMs);
    // Did this run touch the network for this volume? If every page came from the cache, the
    // volume keeps its previous fetchedAt — a re-parse is not a fetch.
    let fetchedNow = !idxCached;
    const entries = parseVolumeIndex(idxHtml, vol);
    console.log(`Vol ${vol}: ${entries.length} discourses`);

    const discourses = [];
    let errors = 0;
    const take = Math.min(entries.length, limit);
    for (let i = 0; i < take; i++) {
      const entry = entries[i];
      const url = `${BASE}/${vol}/${entry.page}/`;
      try {
        const { html, cached } = await fetchHtml(url, `p-${vol}-${entry.page}.html`);
        if (!cached) fetchedNow = true;
        const parsed = parseDiscoursePage(html);
        discourses.push({
          volume: vol,
          page: entry.page,
          url,
          title: entry.title || parsed.title,
          speaker: entry.speaker || parsed.speaker,
          date: parsed.dateText,
          dateISO: entry.dateISO,
          reporter: parsed.reporter,
          pages: parsed.pages || entry.pages,
          byline: parsed.byline,
          paragraphs: parsed.paragraphs,
          marks: parsed.marks,
        });
        process.stdout.write(
          `  [${i + 1}/${take}] /${vol}/${entry.page} ${cached ? "(cached)" : ""} — ` +
            `${parsed.paragraphs.length}¶  ${entry.title?.slice(0, 48) ?? ""}\n`,
        );
        if (!cached) await sleep(delayMs);
      } catch (error) {
        errors++;
        console.warn(`  [${i + 1}/${take}] /${vol}/${entry.page} — ERROR: ${error.message}`);
        discourses.push({ volume: vol, page: entry.page, url, error: String(error.message) });
      }
    }

    const outFile = path.join(RAW_DIR, `vol-${String(vol).padStart(2, "0")}.json`);
    const previous = existsSync(outFile) ? JSON.parse(await readFile(outFile, "utf8")) : null;
    const fetchedAt =
      fetchedNow || !previous?.fetchedAt ? new Date().toISOString() : previous.fetchedAt;
    await writeFile(
      outFile,
      `${JSON.stringify({ volume: vol, source: BASE, fetchedAt, count: discourses.length, discourses }, null, 2)}\n`,
    );
    const ok = discourses.length - errors;
    grandTotal += ok;
    manifest.push({
      volume: vol,
      discourses: discourses.length,
      ok,
      errors,
      file: `raw/${path.basename(outFile)}`,
    });
    console.log(`  → wrote ${path.basename(outFile)} (${ok} ok, ${errors} errors)\n`);
  }

  await writeFile(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify({ source: BASE, generatedAt: new Date().toISOString(), totalDiscourses: grandTotal, volumes: manifest }, null, 2)}\n`,
  );
  console.log(
    `Done. ${grandTotal} discourses across ${manifest.length} volume(s). Manifest written.`,
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
