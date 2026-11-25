/**
 * Convert the scraped Journal of Discourses (data/texts/sources/jod-mrm/vol-NN.json) into the
 * memorial texts-library edition format: one content unit-tree per volume
 * (volume → discourse → paragraph), and register the Work + Edition.
 *
 * Idempotent — safe to re-run after re-scraping. Run from packages/memorial:
 *   node scripts/build-jod-edition.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const TEXTS = path.join(PKG, "data/texts");
const META = path.join(TEXTS, "sources/jod-mrm"); // committed metadata (paragraphs stripped)
const RAW = path.join(META, "raw"); // gitignored full scrape (paragraphs included)
const CONTENT = path.join(TEXTS, "content/jod-mrm");
const VOLUMES = 26;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const pad2 = (n) => String(n).padStart(2, "0");
const isoToHuman = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return m ? `${MONTHS[m - 1]} ${d || ""}, ${y}`.replace(" ,", ",") : `${y}`;
};

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Scrape fields that belong to content/ (the text and where it sits), not to sources/. */
const CONTENT_FIELDS = ["paragraphs", "marks"];
const omit = (obj, keys) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

mkdirSync(CONTENT, { recursive: true });
mkdirSync(META, { recursive: true });

let totalDiscourses = 0;
for (let v = 1; v <= VOLUMES; v++) {
  const src = readJson(path.join(RAW, `vol-${pad2(v)}.json`));
  const discourses = src.discourses
    .filter((d) => !d.error && d.paragraphs?.length)
    .map((d) => {
      const meta = {};
      if (d.speaker) meta.speaker = d.speaker;
      const human = d.date || (d.dateISO ? isoToHuman(d.dateISO.slice(0, 10)) : null);
      if (human) meta.date = human;
      if (d.reporter) meta.reporter = d.reporter;
      if (d.pages) meta.pages = d.pages;
      return {
        id: `d${d.page}`,
        title: d.title,
        ...(Object.keys(meta).length ? { meta } : {}),
        // Each paragraph carries the printed page and column it starts on, and whether it
        // continues a paragraph a page/column break split (jod-marks.mjs).
        units: d.paragraphs.map((text, i) => ({ id: `p${i + 1}`, text, ...(d.marks?.[i] ?? {}) })),
      };
    });
  totalDiscourses += discourses.length;
  writeJson(path.join(CONTENT, `volume-${pad2(v)}.json`), {
    id: `volume-${pad2(v)}`,
    title: `Volume ${v}`,
    units: discourses,
  });

  // Source metadata: every source field EXCEPT the paragraph bodies and their page/column marks
  // (both live in content), keyed by the same discourse id. Keeps all discourses, including any
  // errored/empty ones.
  writeJson(path.join(META, `volume-${pad2(v)}.json`), {
    volume: src.volume,
    source: src.source,
    fetchedAt: src.fetchedAt,
    count: src.count,
    discourses: src.discourses.map((d) => ({
      id: `d${d.page}`,
      ...omit(d, CONTENT_FIELDS),
      ...(d.paragraphs ? { paragraphCount: d.paragraphs.length } : {}),
    })),
  });
}

// Register the Work + Edition (idempotent).
const worksPath = path.join(TEXTS, "works.json");
const works = readJson(worksPath);
if (!works.some((w) => w.id === "journal-of-discourses")) {
  works.push({
    id: "journal-of-discourses",
    title: "Journal of Discourses",
    groups: ["lds", "restoration"],
    summary:
      "Twenty-six volumes of public sermons and addresses by early Latter-day Saint leaders, delivered 1851–1886 and published at Liverpool 1854–1886.",
  });
  writeJson(worksPath, works);
}

const edsPath = path.join(TEXTS, "editions.json");
const editions = readJson(edsPath);
if (!editions.some((e) => e.id === "jod-mrm")) {
  editions.push({
    id: "jod-mrm",
    workId: "journal-of-discourses",
    title: "Journal of Discourses (jod.mrm.org)",
    when: {
      type: "span",
      start: { year: 1854 },
      end: { year: 1886 },
      note: "Discourses delivered 1851–1886; the original 26-volume edition was published at Liverpool 1854–1886. Text from the jod.mrm.org digital transcription.",
    },
    licence: "public-domain",
    provenance:
      "Digital transcription from jod.mrm.org (Mormonism Research Ministry); paragraphs captured verbatim by scripts/download-jod.mjs. Source #1 for a planned multi-source diff.",
    contents: Array.from({ length: VOLUMES }, (_, i) => `volume-${pad2(i + 1)}`),
    sources: [{ label: "jod.mrm.org", url: "https://jod.mrm.org/" }],
  });
  writeJson(edsPath, editions);
}

console.log(
  `Built ${VOLUMES} volume content files (${totalDiscourses} discourses) + registered work/edition.`,
);
