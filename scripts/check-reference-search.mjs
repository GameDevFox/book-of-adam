// The header's reference search (src/library/ReferenceSearch.tsx, reference.ts): type a
// reference, press Enter, land on the passage — the verse (or range) highlighted and scrolled to
// just under the pinned header. On a phone the field is a full-width row of its own. Runs against
// a live server:
//   yarn check:search [base-url]
// Needs a browser (`yarn playwright install chromium` once).
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3006";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const FIELD = ".shell-header .reference-search input";
// How far below the header a scrolled-to verse may land (its scroll margin, plus slack).
const LANDING_PX = 40;
// How far the phone field may fall short of the header's full width (the input's own border).
const FULL_WIDTH_SLACK_PX = 2;

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

const SETTLE_MS = 200;
const OPTIONS = ".reference-suggestions li";
// The owner's example (2026-10-24), as the book table resolves it.
const E3_ROWS = [
  "Exodus 3",
  "Ezra 3",
  "Esther 3",
  "Ecclesiastes 3",
  "Ezekiel 3",
  "Ephesians 3",
  "Enos 1:3",
  "Ether 3",
  "Sirach 3",
];

/** The dropdown's visible rows and which is chosen (-1 for none). */
const dropdown = async (page) => {
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate((sel) => {
    const rows = [...document.querySelectorAll(sel)].filter((li) => li.offsetParent !== null);
    return {
      rows: rows.map((li) => li.textContent),
      selected: rows.findIndex((li) => li.getAttribute("aria-selected") === "true"),
    };
  }, OPTIONS);
};

/**
 * Type into the header field and press Enter, from whatever page is open. Waits for the URL AND
 * the heading to change — the previous passage's heading is still on screen at first, so waiting
 * for a heading alone reads the old page (every search here moves to a different heading).
 */
const search = async (page, text) => {
  const before = await page.evaluate(() => ({
    url: location.href,
    heading: document.querySelector(".reading h3")?.textContent ?? null,
  }));
  await page.fill(FIELD, text);
  await page.press(FIELD, "Enter");
  await page.waitForFunction(
    (prev) =>
      location.href !== prev.url &&
      (document.querySelector(".reading h3")?.textContent ?? null) !== prev.heading &&
      document.querySelector(".reading h3, .library-not-found"),
    before,
    { timeout: 10000 },
  );
  await page.waitForTimeout(SETTLE_MS);
};

const landing = (page) =>
  page.evaluate(() => {
    const marked = [...document.querySelectorAll(".reading .passage.highlighted")];
    const header = document.querySelector(".shell-header").getBoundingClientRect().bottom;
    return {
      url: location.pathname + location.search,
      heading: document.querySelector(".reading h3")?.textContent ?? null,
      volume: document.querySelector(".reading h2")?.textContent ?? null,
      marked: marked.map((p) => p.dataset.unit),
      top: marked[0]?.getBoundingClientRect().top ?? null,
      header,
      field: document.querySelector(".reference-search input").value,
    };
  });

const browser = await chromium.launch();

// --- desktop -------------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });

  const placement = await page.evaluate(() => {
    const field = document.querySelector(".reference-search").getBoundingClientRect();
    const title = document.querySelector(".masthead").getBoundingClientRect();
    const right = document.querySelector(".header-right").getBoundingClientRect();
    return { between: field.left > title.right && field.right < right.left, top: field.top };
  });
  check(placement.between, "desktop: the field sits between the title and the tabs");

  await search(page, "Alma 32:21-23");
  let v = await landing(page);
  check(
    v.url === "/library/bofm-lds/alma/32?verse=21-23" && v.marked.join(",") === "21,22,23",
    `desktop: a range lands on its chapter with each verse highlighted (${v.url}; ${v.marked})`,
  );
  check(
    v.top !== null && v.top >= v.header && v.top - v.header <= LANDING_PX,
    `desktop: the first verse is scrolled to just under the header (${Math.round(v.top)} vs ${Math.round(v.header)})`,
  );
  check(v.field === "", "desktop: the field clears after a search");

  await search(page, "1 Ne 3:7");
  v = await landing(page);
  check(
    v.url === "/library/bofm-lds/1-nephi/3?verse=7" && v.marked.join(",") === "7",
    `desktop: from one passage to another, a single verse highlighted (${v.url}; ${v.marked})`,
  );

  await search(page, "Sir 2:1");
  v = await landing(page);
  check(
    v.url === "/library/kjv-apocrypha/sirach/2?verse=1" && v.marked.join(",") === "1",
    `desktop: the Apocrypha (${v.url})`,
  );

  await search(page, "JD 1:62");
  v = await landing(page);
  check(
    v.url === "/library/jod/1/62" && v.volume === "Volume 1",
    `desktop: a JoD volume and page (${v.url}, ${v.volume}: "${v.heading}")`,
  );

  await search(page, "Gen 1");
  v = await landing(page);
  check(
    v.url === "/library/kjv/genesis/1" && v.marked.length === 0,
    "desktop: a chapter alone highlights nothing",
  );

  await page.fill(FIELD, "3:7");
  await page.press(FIELD, "Enter");
  const missed = await page.evaluate(() => ({
    invalid: document.querySelector(".reference-search input").getAttribute("aria-invalid"),
    path: location.pathname,
  }));
  check(
    missed.invalid === "true" && missed.path === "/library/kjv/genesis/1",
    "desktop: a reference with no book stays put and marks the field",
  );

  // The dropdown: full references, only once a chapter is typed and few books fit.
  await page.fill(FIELD, "e 3");
  const e3 = await dropdown(page);
  check(
    e3.rows.join(", ") === E3_ROWS.join(", ") && e3.selected === 0,
    `dropdown: "e 3" lists ${e3.rows.length} books at chapter 3, the first chosen (${e3.rows.join(", ")})`,
  );
  await page.press(FIELD, "ArrowDown");
  await page.press(FIELD, "Enter");
  await page.waitForURL(/\/library\/kjv\/ezra\/3$/, { timeout: 5000 }).catch(() => {});
  check(
    new URL(page.url()).pathname === "/library/kjv/ezra/3",
    "dropdown: ↓ then Enter opens the second row (Ezra 3)",
  );
  for (const [typed, why] of [
    ["Gen", "no chapter typed"],
    ["fi 3", "more than ten books fit"],
  ]) {
    await page.fill(FIELD, typed);
    check((await dropdown(page)).rows.length === 0, `dropdown: none for "${typed}" (${why})`);
  }
  await page.fill(FIELD, "e 3");
  await page.press(FIELD, "Escape");
  check((await dropdown(page)).rows.length === 0, "dropdown: Esc closes it");
  await page.fill(FIELD, "1 c 3");
  await page.locator(OPTIONS, { hasText: "1 Corinthians 3" }).click();
  await page.waitForURL(/1-corinthians\/3$/, { timeout: 5000 }).catch(() => {});
  check(
    new URL(page.url()).pathname === "/library/kjv/1-corinthians/3",
    "dropdown: clicking a row opens it",
  );
  await ctx.close();
}

// --- phone ---------------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  const row = await page.evaluate(() => {
    const field = document.querySelector(".reference-search").getBoundingClientRect();
    const header = document.querySelector(".shell-header").getBoundingClientRect();
    const title = document.querySelector(".masthead").getBoundingClientRect();
    return {
      below: field.top >= title.bottom,
      width: field.width,
      headerWidth: header.width,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  check(
    row.below && row.headerWidth - row.width <= FULL_WIDTH_SLACK_PX && !row.overflow,
    `phone: the field is a full-width row under the title (${Math.round(row.width)} of ${Math.round(row.headerWidth)}px)`,
  );
  await page.fill(FIELD, "1 c 3");
  await page.locator(OPTIONS, { hasText: "1 Chronicles 3" }).tap();
  await page.waitForURL(/1-chronicles\/3$/, { timeout: 5000 }).catch(() => {});
  check(
    new URL(page.url()).pathname === "/library/kjv/1-chronicles/3",
    "phone: tapping a dropdown row opens it",
  );
  await search(page, "D&C 76:22");
  const v = await landing(page);
  check(
    v.url === "/library/dc-lds/doctrine-and-covenants/76?verse=22" &&
      v.marked.join(",") === "22" &&
      v.top >= v.header &&
      v.top - v.header <= LANDING_PX,
    `phone: a search lands on the verse, just under the header (${v.url})`,
  );
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
