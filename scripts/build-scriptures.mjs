/**
 * Ingest structured-JSON scripture editions (bcbooks/scriptures-json) into the memorial
 * texts-library format: one content unit-tree per book (book → chapter → verse), plus optional
 * front matter (title page, witness testimonies), and register the Work + Edition.
 *
 * Idempotent — re-running rewrites content and updates the edition's `contents` in place. The
 * raw source is cached under data/texts/sources/<edition>/source.json (downloaded once; pass
 * --refresh to re-fetch from the pinned commit).
 *
 * Run from packages/memorial:
 *   node scripts/build-scriptures.mjs            # all editions in scriptures-config
 *   node scripts/build-scriptures.mjs bofm-lds   # just one
 *   node scripts/build-scriptures.mjs --refresh  # re-download sources first
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EDITIONS, rawUrl, SOURCE_REF } from "./scriptures-config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const TEXTS = path.join(PKG, "data/texts");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

/** Book/section title → readable kebab id, so the reader's picker labels stay human. */
const slugify = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * bcbooks book → source-metadata mirror: the same book/chapter/verse tree as content, minus
 * the verse `text` (which lives only in content). Keeps every other field — `reference`,
 * `lds_slug`, headings — so the download is losslessly recoverable by joining meta + content.
 * Filename matches the content book file (slugify(book.book)).
 */
const bookToMeta = (book) => ({
  book: book.book,
  full_title: book.full_title,
  lds_slug: book.lds_slug,
  ...(book.heading ? { heading: book.heading } : {}),
  chapters: book.chapters.map((ch) => ({
    chapter: ch.chapter,
    ...(ch.reference ? { reference: ch.reference } : {}),
    ...(ch.heading ? { heading: ch.heading } : {}),
    verses: ch.verses.map((v) => ({
      verse: v.verse,
      ...(v.reference ? { reference: v.reference } : {}),
    })),
  })),
});

/** Per-source-file volume-level + front-matter provenance, not tied to any single book. */
const editionMeta = (editionId, sourceFiles, sources) => ({
  editionId,
  sourceRepo: "bcbooks/scriptures-json",
  sourceRef: SOURCE_REF,
  volumes: sources.map((source, i) => ({
    file: sourceFiles[i],
    title: source.title,
    ...(source.subtitle ? { subtitle: source.subtitle } : {}),
    ...(source.subsubtitle ? { subsubtitle: source.subsubtitle } : {}),
    version: source.version,
    last_modified: source.last_modified,
    lds_slug: source.lds_slug,
    ...(source.title_page
      ? {
          title_page: {
            title: source.title_page.title,
            subtitle: source.title_page.subtitle,
            translated_by: source.title_page.translated_by,
            textLineCount: source.title_page.text?.length ?? 0,
          },
        }
      : {}),
    ...(source.testimonies
      ? { testimonies: source.testimonies.map((t) => ({ title: t.title, witnesses: t.witnesses })) }
      : {}),
  })),
});

/**
 * Normalize a bcbooks source file to a uniform `books[]` shape. Most volumes already use
 * books→chapters→verses; the Doctrine and Covenants instead uses a flat `sections[]` array
 * (section→verse), which we wrap as a single book whose "chapters" are its sections.
 */
const toBooks = (source) => {
  if (source.books) return source.books;
  if (source.sections)
    return [
      {
        book: source.title.replace(/^The\s+/i, ""),
        full_title: source.title,
        lds_slug: source.lds_slug,
        chapters: source.sections.map((s) => ({
          chapter: s.section,
          reference: s.reference,
          ...(s.heading ? { heading: s.heading } : {}),
          verses: s.verses,
        })),
      },
    ];
  throw new Error("source has neither .books nor .sections");
};

/**
 * bcbooks verse/chapter → texts-library TextUnit tree for one book. With `shortTitles`, the
 * book also keeps the dataset's short name (`book`: "Genesis") for the menu beside its full
 * traditional title (`full_title`: "The First Book of Moses Called Genesis").
 */
const bookToUnit = (book, unitLabel, shortTitles) => ({
  id: slugify(book.book),
  title: book.full_title || book.book,
  ...(shortTitles && book.full_title && book.book !== book.full_title
    ? { shortTitle: book.book }
    : {}),
  ...(book.heading ? { meta: { heading: book.heading } } : {}),
  units: book.chapters.map((ch) => ({
    id: String(ch.chapter),
    title: `${unitLabel} ${ch.chapter}`,
    ...(ch.heading ? { meta: { heading: ch.heading } } : {}),
    units: ch.verses.map((v) => ({ id: String(v.verse), text: v.text })),
  })),
});

/** Optional front matter → leading top-units, mirroring the printed book's front pages. */
const frontMatter = (source) => {
  const units = [];
  if (source.title_page?.text?.length) {
    const lines = [...source.title_page.text];
    if (source.title_page.translated_by) lines.push(source.title_page.translated_by);
    // Nest paragraphs under one untitled "chapter" so the reader's book→chapter→verse
    // rendering (which only shows leaf text two levels deep) displays it.
    units.push({
      id: "title-page",
      title: "Title Page",
      units: [{ id: "page", units: lines.map((text, i) => ({ id: `p${i + 1}`, text })) }],
    });
  }
  if (source.testimonies?.length) {
    units.push({
      id: "witnesses",
      title: "The Testimony of Witnesses",
      units: source.testimonies.map((t) => {
        const paras = [t.text];
        if (t.witnesses?.length) paras.push(t.witnesses.join("\n"));
        return {
          id: slugify(t.title),
          title: t.title,
          units: paras.map((text, i) => ({ id: `p${i + 1}`, text })),
        };
      }),
    });
  }
  return units;
};

/** Fetch (and cache in gitignored raw/) every source file for an edition, in order. */
const ensureSources = async (editionId, sourceFiles, refresh) => {
  const dir = path.join(TEXTS, "sources", editionId, "raw"); // gitignored full download
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const sourceFile of sourceFiles) {
    const file = path.join(dir, sourceFile);
    if (existsSync(file) && !refresh) {
      out.push(readJson(file));
      continue;
    }
    const url = rawUrl(sourceFile);
    process.stdout.write(`  fetching ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
    const json = await res.json();
    writeJson(file, json);
    out.push(json);
  }
  return out;
};

const upsert = (list, entry) => {
  const i = list.findIndex((e) => e.id === entry.id);
  if (i === -1) list.push(entry);
  else list[i] = { ...list[i], ...entry };
};

const run = async () => {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const wanted = args.filter((a) => !a.startsWith("--"));
  const targets = wanted.length ? EDITIONS.filter((e) => wanted.includes(e.editionId)) : EDITIONS;
  if (!targets.length) throw new Error(`no matching editions for: ${wanted.join(", ")}`);

  const works = readJson(path.join(TEXTS, "works.json"));
  const editions = readJson(path.join(TEXTS, "editions.json"));

  for (const cfg of targets) {
    process.stdout.write(`\n${cfg.editionId}:\n`);
    const sourceFiles = Array.isArray(cfg.sourceFile) ? cfg.sourceFile : [cfg.sourceFile];
    const sources = await ensureSources(cfg.editionId, sourceFiles, refresh);
    const unitLabel = cfg.unitLabel ?? "Chapter";

    // Merge books across source files (Bible = OT + NT), keeping file order.
    const srcBooks = sources.flatMap(toBooks);
    const front = cfg.frontMatter === false ? [] : sources.flatMap(frontMatter);
    const books = srcBooks.map((b) => bookToUnit(b, unitLabel, cfg.shortTitles === true));
    const contentUnits = [...front, ...books];

    const contentDir = path.join(TEXTS, "content", cfg.editionId);
    mkdirSync(contentDir, { recursive: true });
    for (const unit of contentUnits) writeJson(path.join(contentDir, `${unit.id}.json`), unit);

    // Source metadata: per-book mirror (verse text stripped) + volume/front-matter sidecar.
    const metaDir = path.join(TEXTS, "sources", cfg.editionId);
    mkdirSync(metaDir, { recursive: true });
    writeJson(
      path.join(metaDir, "_edition.json"),
      editionMeta(cfg.editionId, sourceFiles, sources),
    );
    for (const book of srcBooks)
      writeJson(path.join(metaDir, `${slugify(book.book)}.json`), bookToMeta(book));

    const verses = books.reduce((n, b) => n + b.units.reduce((m, ch) => m + ch.units.length, 0), 0);
    process.stdout.write(
      `  ${front.length} front + ${books.length} books, ${verses} verses → ${contentUnits.length} content + ${srcBooks.length + 1} meta files\n`,
    );

    upsert(works, cfg.work);
    upsert(editions, {
      id: cfg.editionId,
      workId: cfg.work.id,
      ...cfg.edition,
      contents: contentUnits.map((u) => u.id),
    });
  }

  writeJson(path.join(TEXTS, "works.json"), works);
  writeJson(path.join(TEXTS, "editions.json"), editions);
  process.stdout.write(`\nRegistered ${targets.length} edition(s).\n`);
};

run().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
