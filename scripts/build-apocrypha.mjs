/**
 * Ingest the KJV Apocrypha (the 14 books printed in the 1611 Authorized Version, absent from
 * the bcbooks standard-works dataset) from scrollmapper/bible_databases' KJVA text into the
 * memorial texts-library format — content (text) + deduplicated source metadata + gitignored
 * raw, the same split as build-scriptures.mjs. Registers the edition under the "bible" work.
 *
 * Idempotent. Run from packages/memorial:
 *   node scripts/build-apocrypha.mjs
 *   node scripts/build-apocrypha.mjs --refresh   # re-download the raw source
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const TEXTS = path.join(PKG, "data/texts");
const EDITION_ID = "kjv-apocrypha";

/** scrollmapper/bible_databases @ this commit — pinned so re-runs are byte-reproducible. */
const SOURCE_REF = "e1b254cef86d0e65b1a5d1a94b8b112d0f296a2c";
const SOURCE_FILE = "formats/json/KJVA.json";
const rawUrl = () =>
  `https://raw.githubusercontent.com/scrollmapper/bible_databases/${SOURCE_REF}/${SOURCE_FILE}`;

/** The 14 apocryphal books, in 1611 KJV order — the subset of KJVA beyond the 66 canonical. */
const APOCRYPHA_BOOKS = [
  "I Esdras",
  "II Esdras",
  "Tobit",
  "Judith",
  "Additions to Esther",
  "Wisdom",
  "Sirach",
  "Baruch",
  "Prayer of Azariah",
  "Susanna",
  "Bel and the Dragon",
  "Prayer of Manasses",
  "I Maccabees",
  "II Maccabees",
];

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

const slugify = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** KJVA book → content unit tree (book → chapter → verse). */
const bookToUnit = (book) => ({
  id: slugify(book.name),
  title: book.name,
  units: book.chapters.map((ch) => ({
    id: String(ch.chapter),
    title: `Chapter ${ch.chapter}`,
    units: ch.verses.map((v) => ({ id: String(v.verse), text: v.text })),
  })),
});

/** KJVA book → source metadata: same tree, verse text stripped (text lives in content). */
const bookToMeta = (book) => ({
  name: book.name,
  chapters: book.chapters.map((ch) => ({
    chapter: ch.chapter,
    verses: ch.verses.map((v) => ({ verse: v.verse })),
  })),
});

const ensureSource = async (refresh) => {
  const dir = path.join(TEXTS, "sources", EDITION_ID, "raw"); // gitignored full download
  const file = path.join(dir, "KJVA.json");
  if (existsSync(file) && !refresh) return readJson(file);
  mkdirSync(dir, { recursive: true });
  process.stdout.write(`  fetching ${rawUrl()}\n`);
  const res = await fetch(rawUrl());
  if (!res.ok) throw new Error(`fetch ${rawUrl()} → ${res.status} ${res.statusText}`);
  const json = await res.json();
  writeJson(file, json);
  return json;
};

const upsert = (list, entry) => {
  const i = list.findIndex((e) => e.id === entry.id);
  if (i === -1) list.push(entry);
  else list[i] = { ...list[i], ...entry };
};

const run = async () => {
  const refresh = process.argv.includes("--refresh");
  const source = await ensureSource(refresh);

  const byName = new Map(source.books.map((b) => [b.name, b]));
  const books = APOCRYPHA_BOOKS.map((name) => {
    const book = byName.get(name);
    if (!book) throw new Error(`KJVA source missing expected book "${name}"`);
    return book;
  });

  const contentDir = path.join(TEXTS, "content", EDITION_ID);
  const metaDir = path.join(TEXTS, "sources", EDITION_ID);
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(metaDir, { recursive: true });

  let verses = 0;
  for (const book of books) {
    const unit = bookToUnit(book);
    writeJson(path.join(contentDir, `${unit.id}.json`), unit);
    writeJson(path.join(metaDir, `${slugify(book.name)}.json`), bookToMeta(book));
    verses += book.chapters.reduce((n, ch) => n + ch.verses.length, 0);
  }
  writeJson(path.join(metaDir, "_edition.json"), {
    editionId: EDITION_ID,
    sourceRepo: "scrollmapper/bible_databases",
    sourceRef: SOURCE_REF,
    sourceFile: SOURCE_FILE,
    translation: source.translation,
    books: books.length,
  });

  const works = readJson(path.join(TEXTS, "works.json"));
  upsert(works, {
    id: "apocrypha",
    title: "The Apocrypha",
    groups: ["bible", "apocrypha"],
    summary:
      "The fourteen books of the Apocrypha printed between the Old and New Testaments in the 1611 King James Version; received as instructive but not canonical scripture (cf. D&C 91).",
  });
  writeJson(path.join(TEXTS, "works.json"), works);

  const editions = readJson(path.join(TEXTS, "editions.json"));
  upsert(editions, {
    id: EDITION_ID,
    workId: "apocrypha",
    title: "Apocrypha (KJV, 1611)",
    when: {
      type: "instant",
      date: { year: 1611 },
      note: "The fourteen books of the Apocrypha as printed in the 1611 Authorized Version (Blayney's 1769 text). Public domain.",
    },
    licence: "public-domain",
    provenance:
      "The fourteen books of the Apocrypha from the scrollmapper/bible_databases KJVA dataset (King James Version, glosses removed). Public domain.",
    contents: books.map((b) => slugify(b.name)),
    sources: [
      {
        label: "scrollmapper/bible_databases",
        url: "https://github.com/scrollmapper/bible_databases",
      },
    ],
  });
  writeJson(path.join(TEXTS, "editions.json"), editions);

  process.stdout.write(`\n${books.length} books, ${verses} verses → content + metadata. Registered edition.\n`);
};

run().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
