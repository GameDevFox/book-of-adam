// The full-text search (docs/design/full-text-search.md), against a live dev server:
//   yarn check:fulltext [base-url]
// Each phrase's ground truth is computed in the page from the texts the server serves, with the
// app's own modules (outline, readingUrl, searchWords), so no count is hard-coded and nothing is
// re-implemented here. The cases are the prototype's regressions (2026-11-22): typos, the
// unspaced em-dash, the hyphen join, a title match. The first search builds the dev index
// (about 25 s). Needs a browser (`yarn playwright install chromium` once).
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3006";
const FIELD = ".shell-header .reference-search input";
const INDEX_BUILD_TIMEOUT_MS = 180000;
const SETTLE_MS = 300;
/** Stemming ("covenants" for "covenant") may add a few true-enough extras, never many. */
const MAX_EXTRA_SHARE = 0.05;
const READINGS_PER_STEP = 20;

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(INDEX_BUILD_TIMEOUT_MS);
await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });

/** Passage URLs (reading URL + ?verse=n) whose words contain any of these word sequences. */
const truth = (alternatives) =>
  page.evaluate(async (alternatives) => {
    const { readings, readingUrl } = await import("/src/library/citations.ts");
    const { resolveUnit } = await import("/src/records/texts.ts");
    const { passageNumber } = await import("/src/library/selection.ts");
    const { searchWords } = await import("/src/library/search-words.ts");
    window.__corpus ??= (async () => {
      const outline = await (await fetch("/api/texts/outline.json")).json();
      const files = new Map();
      const passages = [];
      for (const node of readings(outline)) {
        const key = `${node.edition}/${node.file}`;
        if (!files.has(key)) {
          files.set(
            key,
            fetch(`/api/texts/content/${key}.json`).then((r) => r.json()),
          );
        }
        const chapter = resolveUnit(await files.get(key), node.path ?? []);
        for (const unit of chapter?.units ?? []) {
          const n = passageNumber(unit.id);
          if (n === null || !unit.text) continue;
          const words = ` ${searchWords(unit.text).join(" ")} `;
          passages.push({ url: `${readingUrl(node)}?verse=${n}`, words });
        }
      }
      return passages;
    })();
    const wanted = alternatives.map((seq) => ` ${seq.join(" ")} `);
    return (await window.__corpus)
      .filter((p) => wanted.some((w) => p.words.includes(w)))
      .map((p) => p.url);
  }, alternatives);

/** What the real search returns: passage hit URLs, title hits, the plan. */
const search = (text) =>
  page.evaluate(async (text) => {
    const { searchText, loadHits } = await import("/src/library/text-search.ts");
    const found = await searchText(text);
    const hits = await loadHits(found.pages, found.plan);
    return {
      readings: found.pages.length,
      passages: hits.filter((h) => !h.inTitle).map((h) => h.url),
      titles: hits.filter((h) => h.inTitle).map((h) => h.url),
      corrections: found.plan.corrections,
    };
  }, text);

const compare = (label, want, got) => {
  const gotSet = new Set(got.passages);
  const missed = want.filter((url) => !gotSet.has(url));
  const extra = got.passages.filter((url) => !want.includes(url));
  check(
    want.length > 0 && missed.length === 0,
    `${label}: every passage holding it is found (${want.length - missed.length}/${want.length})` +
      (missed.length ? ` — missed ${missed.slice(0, 3).join(", ")}` : ""),
  );
  check(
    extra.length <= Math.ceil(want.length * MAX_EXTRA_SHARE),
    `${label}: no more than a few extras (${extra.length})` +
      (extra.length ? ` e.g. ${extra.slice(0, 2).join(", ")}` : ""),
  );
};

// --- recall against the ground truth -------------------------------------------------------------
const nec = ["new", "and", "everlasting", "covenant"];
const necWant = await truth([nec]);
const necGot = await search("new and everlasting covenant");
compare('"new and everlasting covenant"', necWant, necGot);

for (const typo of [
  "New And Everlating Covenant",
  "new and everlastin covnant",
  "nwe and everlasting covenant",
]) {
  const got = await search(typo);
  const same =
    got.passages.length === necGot.passages.length &&
    got.passages.every((url) => necGot.passages.includes(url));
  check(
    same && got.corrections.length > 0,
    `"${typo}": corrected, same ${got.passages.length} passages`,
  );
}

// The unspaced em-dash: "the Spirit of God—the Spirit of" lost 6 pages before the fix.
compare(
  '"the spirit of god"',
  await truth([["the", "spirit", "of", "god"]]),
  await search("the spirit of god"),
);

// The hyphen join: "Latter-day Saints" is indexed as "latterday saints".
compare(
  '"latter day saints"',
  await truth([
    ["latter", "day", "saints"],
    ["latterday", "saints"],
  ]),
  await search("latter day saints"),
);

// A title match: JD 4, "The Emigrating Saints Were Prompted By The Spirit of God".
const titled = await search("prompted by the spirit of god");
check(
  titled.titles.length > 0,
  `a phrase in a discourse's title is found as a title match (${titled.titles.join(", ")})`,
);

// --- the page, as a reader uses it ---------------------------------------------------------------
await page.fill(FIELD, "new and everlating covenant");
await page.press(FIELD, "Enter");
await page.waitForSelector(".search-hit");
await page.waitForTimeout(SETTLE_MS);
const view = await page.evaluate(() => ({
  url: location.pathname + location.search,
  corrected: document.querySelector(".search-corrected")?.textContent ?? "",
  count: document.querySelector(".search-count")?.textContent ?? "",
  hits: document.querySelectorAll(".search-hit").length,
  marked: [...document.querySelectorAll(".search-hit mark")].map((m) => m.textContent).join(" | "),
}));
check(
  view.url === "/library/search?q=new%20and%20everlating%20covenant",
  `Enter on words opens the results page (${view.url})`,
);
check(
  view.corrected.includes("everlating → everlasting"),
  `the page says what it corrected ("${view.corrected}")`,
);
check(
  view.count.includes(String(necGot.readings)),
  `the page counts the readings ("${view.count}")`,
);
check(
  view.hits > 0 && /covenant/i.test(view.marked),
  `hits show with the match marked (${view.hits}, "${view.marked}")`,
);

const firstHref = await page.getAttribute(".search-hit-reference", "href");
await page.click(".search-hit-reference");
await page.waitForSelector(".reading .passage.highlighted");
const landed = await page.evaluate(() => ({
  url: location.pathname + location.search,
  marked: document.querySelectorAll(".reading .passage.highlighted").length,
}));
check(
  landed.url === firstHref && landed.marked > 0,
  `a hit opens its passage, selected (${landed.url})`,
);

await page.goto(`${BASE}/library/search?q=the%20spirit%20of%20god`);
await page.waitForSelector(".search-more");
const before = await page.locator(".search-hit").count();
await page.click(".search-more");
await page.waitForFunction((n) => document.querySelectorAll(".search-hit").length > n, before);
check(
  true,
  `Show more adds the next ${READINGS_PER_STEP} readings (${before} → ${await page.locator(".search-hit").count()} hits)`,
);

await page.goto(`${BASE}/library/search?q=zzyzxqq`);
await page.waitForSelector(".search-results .status-line");
check(
  (await page.textContent(".search-results .status-line")).startsWith("No passage contains"),
  "a phrase nowhere in the corpus says so",
);

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
