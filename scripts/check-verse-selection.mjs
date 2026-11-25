// Selecting passages and copying them as a quotation (src/library/useVerseSelection.ts,
// Passage.tsx, SelectionBar.tsx, quotation.ts): a click or tap toggles a passage, Shift+click a
// range; the URL carries the selection (?verse=4,7-8) without adding history entries; a bar at
// the bottom shows the reference and copies the quotation. Runs against a live server:
//   yarn check:selection [base-url] [insecure-base-url]
// The second URL — the same server at a plain-http LAN address — exercises the copy fallback
// for pages without the Clipboard API. Needs a browser (`yarn playwright install chromium`).
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3006";
const INSECURE_BASE = process.argv[3] ?? null;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const SETTLE_MS = 300;
// The owner's example (NEXT.md, 2026-11-08), verbatim.
const GALATIANS_17_18 = `"17 From henceforth let no man trouble me: for I bear in my body the marks of the Lord Jesus.

18 Brethren, the grace of our Lord Jesus Christ be with your spirit. Amen."
    - Galatians 6:17-18`;
const verse = (n) => `.reading .passage[data-verse="${n}"]`;

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

const state = (page) =>
  page.evaluate(() => {
    const bar = document.querySelector(".selection-bar");
    return {
      search: decodeURIComponent(location.search),
      marked: [...document.querySelectorAll(".reading .passage.highlighted")].map(
        (p) => p.dataset.verse,
      ),
      reference: bar?.querySelector(".selection-reference")?.textContent ?? null,
      copy: bar?.querySelector(".selection-copy")?.textContent ?? null,
      history: history.length,
      scrollY: Math.round(window.scrollY),
    };
  });

const click = async (page, n, modifiers = []) => {
  await page.locator(verse(n)).click({ modifiers });
  await page.waitForTimeout(SETTLE_MS);
};

const open = async (page, path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".reading .passage");
  await page.waitForTimeout(SETTLE_MS);
};

const browser = await chromium.launch();

// --- desktop -------------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  await open(page, "/library/kjv/galatians/6");
  check((await state(page)).reference === null, "no bar until something is selected");
  const before = (await state(page)).history;
  await click(page, 17);
  let s = await state(page);
  check(
    s.search === "?verse=17" && s.marked.join() === "17" && s.reference === "Galatians 6:17",
    `a click selects a verse, the URL and the bar follow (${s.search}, "${s.reference}")`,
  );
  await click(page, 18);
  s = await state(page);
  check(
    s.search === "?verse=17-18" && s.reference === "Galatians 6:17-18",
    `a second click adds it, neighbours merged in the URL (${s.search})`,
  );
  check(s.history === before, `selecting adds no history entries (${before} → ${s.history})`);
  const joined = await page.evaluate(() => {
    const [a, b] = [17, 18].map((n) =>
      getComputedStyle(document.querySelector(`.reading .passage[data-verse="${n}"]`)),
    );
    return {
      shadows: a.boxShadow.split("rgb").length - 1,
      meet: [a.borderBottomLeftRadius, b.borderTopLeftRadius],
      outer: [a.borderTopLeftRadius, b.borderBottomLeftRadius],
    };
  });
  check(
    joined.shadows === 2 && joined.meet.join() === "0px,0px" && joined.outer.join() === "2px,2px",
    `adjacent selected verses join into one block (${joined.shadows} shadows, corners ${joined.meet})`,
  );
  await page.click(".selection-copy");
  await page.waitForTimeout(SETTLE_MS);
  check((await clipboard()) === GALATIANS_17_18, "Copy puts the owner's example on the clipboard");
  check((await state(page)).copy === "Copied ✓", "the button says Copied ✓");
  await click(page, 18);
  s = await state(page);
  check(
    s.search === "?verse=17" && s.marked.join() === "17",
    "clicking a selected verse deselects it",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(SETTLE_MS);
  s = await state(page);
  check(s.search === "" && s.reference === null, "Esc clears the selection and the bar");

  // Shift+click ranges, both ways, and a non-consecutive selection.
  await open(page, "/library/kjv/revelation/3");
  await click(page, 4);
  await click(page, 7);
  await click(page, 9, ["Shift"]);
  s = await state(page);
  check(
    s.search === "?verse=4,7-9" && s.reference === "Revelation 3:4, 7-9",
    `Shift+click selects the range from the last-clicked verse (${s.search})`,
  );
  await click(page, 8, ["Shift"]);
  s = await state(page);
  check(
    s.search === "?verse=4,7",
    `Shift+click on a selected verse deselects the range (${s.search})`,
  );
  const apart = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.reading .passage[data-verse="4"]'))
        .borderBottomLeftRadius,
  );
  check(
    apart === "2px",
    `a selected verse with a gap after it stays a block of its own (${apart})`,
  );
  await page.click(".selection-copy");
  await page.waitForTimeout(SETTLE_MS);
  const gapped = await clipboard();
  check(
    /^"4 [\s\S]+\n\n…\n\n7 [\s\S]+"\n {4}- Revelation 3:4, 7$/.test(gapped),
    "a gap is a line of … in the copy",
  );
  await page.click(".selection-clear");
  await page.waitForTimeout(SETTLE_MS);
  check((await state(page)).reference === null, "✕ clears the selection");

  // Clicking does not jump the page; a link naming verses scrolls to the first.
  await open(page, "/library/bofm-lds/alma/32");
  await page.locator(verse(30)).scrollIntoViewIfNeeded();
  const y = (await state(page)).scrollY;
  await click(page, 30);
  await click(page, 29);
  s = await state(page);
  check(
    s.search === "?verse=29-30" && Math.abs(s.scrollY - y) <= 1,
    `clicking verses never scrolls the page (${y} → ${s.scrollY})`,
  );
  await open(page, "/library/kjv/revelation/3?verse=4,7-8");
  s = await state(page);
  const top = await page.locator(verse(4)).evaluate((p) => p.getBoundingClientRect().top);
  check(
    s.marked.join() === "4,7,8" &&
      s.reference === "Revelation 3:4, 7-8" &&
      s.scrollY > 0 &&
      top > 0,
    `a link with ?verse=4,7-8 selects them and scrolls to the first (${s.marked})`,
  );

  // The bar never covers the last passage.
  // A chapter long enough to scroll, its last verse selected.
  await open(page, "/library/bofm-lds/alma/32?verse=43");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(SETTLE_MS);
  const cover = await page.evaluate(() => ({
    last: [...document.querySelectorAll(".reading .passage")].at(-1).getBoundingClientRect().bottom,
    bar: document.querySelector(".selection-bar").getBoundingClientRect().top,
  }));
  check(
    cover.last <= cover.bar,
    `the last verse scrolls clear of the bar (${Math.round(cover.last)} ≤ ${Math.round(cover.bar)})`,
  );

  // Dragging across words to copy them is not a click on a passage.
  await open(page, "/library/kjv/galatians/6");
  // On screen first: mouse coordinates are the viewport's, and an off-screen drag selects
  // whatever happens to be under them.
  await page.locator(verse(14)).scrollIntoViewIfNeeded();
  const box = await page.locator(verse(14)).boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(SETTLE_MS);
  const dragged = await page.evaluate(() => getSelection().toString());
  check(
    (await state(page)).search === "" && dragged.length > 0 && !dragged.includes("\n"),
    `dragging to select words within a verse does not select it ("${dragged.slice(0, 30)}…")`,
  );

  // The JoD and the poems cite their own way (quotation.ts).
  await open(page, "/library/jod/1/1");
  await click(page, 1);
  await click(page, 2);
  s = await state(page);
  check(
    s.reference === "Brigham Young, JD 1:1 (January 16, 1853)",
    `JoD paragraphs cite speaker and page ("${s.reference}")`,
  );
  await page.click(".selection-copy");
  await page.waitForTimeout(SETTLE_MS);
  const jod = await clipboard();
  check(
    !/\n\n/.test(jod.split("\n    - ")[0]),
    "a paragraph split by a column break is copied as one",
  );
  await open(page, "/library/eliza-r-snow-poems/216?verse=8");
  s = await state(page);
  if (s.marked.length) {
    check(
      s.reference === "Eliza R. Snow, “The New Year 1852” (Deseret News, 10 January 1852)",
      `a poem's stanza cites title and printing ("${s.reference}")`,
    );
  } else {
    console.log("skip poem reference (the poems are not in this build)");
  }
  await ctx.close();
}

// --- the copy fallback, on a page without the Clipboard API ----------------------------------
if (INSECURE_BASE) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  await page.goto(`${INSECURE_BASE}/library/kjv/galatians/6?verse=17-18`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".selection-copy");
  const secure = await page.evaluate(() => window.isSecureContext);
  await page.click(".selection-copy");
  await page.waitForTimeout(SETTLE_MS);
  const said = await page.locator(".selection-copy").textContent();
  const reader = await ctx.newPage();
  await reader.goto(`${BASE}/library`);
  const pasted = await reader.evaluate(() => navigator.clipboard.readText());
  check(
    !secure && said === "Copied ✓" && pasted === GALATIANS_17_18,
    `plain-http LAN address: Copy still works (secure context ${secure}, "${said}")`,
  );
  await ctx.close();
} else {
  console.log("skip copy fallback (no insecure base URL given)");
}

// --- phone -----------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await open(page, "/library/kjv/galatians/6");
  await page.locator(verse(17)).tap();
  await page.waitForTimeout(SETTLE_MS);
  let s = await state(page);
  const bar = await page.evaluate(() => {
    const r = document.querySelector(".selection-bar")?.getBoundingClientRect();
    return r ? { width: r.width, bottom: r.bottom } : null;
  });
  check(
    s.search === "?verse=17" && bar && bar.width > PHONE.width * 0.9 && bar.bottom <= PHONE.height,
    `phone: a tap selects; the bar spans the screen at the bottom (${Math.round(bar?.width)}px)`,
  );
  await page.locator(".selection-clear").tap();
  await page.waitForTimeout(SETTLE_MS);
  s = await state(page);
  check(s.search === "" && s.reference === null, "phone: ✕ clears it");
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
