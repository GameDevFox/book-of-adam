// The Library menu. It drills down: opening a group slides its level in from the left over the
// current one, under a pinned header whose back button returns to the previous level where it
// was left. Rows truncate (one line on desktop, two on a phone), and a truncated title can be
// read in full in place — on hover or keyboard focus at once, on a phone by pressing and
// holding. Runs against a live server:
//   yarn check:menu [base-url]
// Needs a browser (`yarn playwright install chromium` once).
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3006";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
// The first discourse of JoD volume 1, so the volume is open: long titles beside short ones
// ("Salvation"). A bare volume URL is a group, not a reading, and opens nothing.
const JOD_VOLUME = "/library/jod/1/1";
const SHORT_TITLE = "Salvation";
const FIRST_SPEAKER = "Brigham Young";
// The pre-citation URL form of the discourse beginning on JD 1:6.
const LEGACY_DISCOURSE = "/library/jod-mrm/volume-01/d6";
const ELIZA_WORK = "Poems of Eliza R. Snow";
// Poem #9 — its first stanza is eight lines (research view; the poems are held back publicly).
const FARMERS_WIFE = "/library/eliza-r-snow-poems/9";
// Poem #444 — a 262-character byline (a long dedicatory subtitle).
const LONG_NOTES_POEM = "/library/eliza-r-snow-poems/444";
// "Queen Victoria" — one block on the source, reconstructed as 12 quatrains.
const QUEEN_VICTORIA = "/library/eliza-r-snow-poems/130";
// The edition-style form of the same poem — still opens it (no redirects).
// #145 is marked missing (its source text duplicated #144).
const MISSING_POEM = "/library/eliza-r-snow-poems/145";
const LEGACY_POEM = "/library/ers-lexicon/poems-126-150/130";
// Its section breaks are "* * * * *" rows.
const FUNERAL_OF_BRIGHAM_YOUNG = "/library/eliza-r-snow-poems/464";
const DECADE = "1840s";
// "Salvation" (JD 1:1-6) changes column once on each of its six pages (from the edition data).
const SALVATION_COLUMN_RULES = 6;
// How far below the header a jumped-to page rule may land (its scroll margin, plus slack).
const JUMP_LANDING_PX = 48;
// Short enough to fit any menu width.
const FITTING_ROW = "Volume 2";
// Must outlast the component's long-press delay (src/library/TitlePeek.tsx).
const HOLD_MS = 700;
// A slow tap: well past the ~100 ms Chrome defers page timers at a touchstart (so a missing
// delay would show), still short of the long-press delay. An 80 ms tap passed with no delay.
const TAP_MS = 300;
// How far the peek's text may sit from the row text it covers.
const ALIGN_TOLERANCE_PX = 1.5;
// "Immediately": the peek must be up within a frame or two of the hover.
const IMMEDIATE_MS = 100;

// A volume deep in the list, and a discourse far enough down volume 1 to need scrolling to.
const LAST_VOLUME = "Volume 26";
// Discourse ids follow the printed page (d1, d6, d16, …) — this is the 41st of volume 1.
const DEEP_DISCOURSE = "/library/jod/1/280";
const SLIDE_ANIMATION = "drill-in";
const SCROLLED_PX = 400;
// How far the menu may rise from its in-flow spot to its sticky spot (the layout's top gap).
const STICK_SETTLE_PX = 8;
// Longer than the slide (src/index.css .drill-level), so a level has settled.
const SLIDE_SETTLE_MS = 400;

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

/** Index of the first leaf row whose label is truncated (overflows its box), or -1. */
const firstTruncated = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".drill-level.current .tree-row.leaf .tree-label")].findIndex(
      (l) => l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > l.clientHeight + 1,
    ),
  );

const peekState = (page) =>
  page.evaluate(() => {
    const peek = document.querySelector(".tree-peek");
    if (!peek) return null;
    const range = document.createRange();
    range.selectNodeContents(peek);
    const first = range.getClientRects()[0];
    return {
      text: peek.textContent,
      styledPage: Boolean(peek.querySelector(".tree-page")),
      left: first.left,
      top: first.top,
      width: peek.offsetWidth,
    };
  });

const labelState = (page, index) =>
  page.evaluate((i) => {
    const label = document.querySelectorAll(".drill-level.current .tree-row.leaf .tree-label")[i];
    const range = document.createRange();
    range.selectNodeContents(label);
    const first = range.getClientRects()[0];
    const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
    return {
      full: label.textContent,
      left: first.left,
      top: first.top,
      width: label.offsetWidth,
      lines: Math.round(label.clientHeight / lineHeight),
    };
  }, index);

const maxLines = (page) =>
  page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll(".drill-level.current .tree-label")].map((l) =>
        Math.round(l.clientHeight / parseFloat(getComputedStyle(l).lineHeight)),
      ),
    ),
  );

const current = ".drill-level.current";

/** The current level's title, back-button label, list scroll offset and level count. */
const levelState = (page) =>
  page.evaluate((sel) => {
    const level = document.querySelector(sel);
    const list = level?.querySelector(".drill-list");
    return {
      levels: document.querySelectorAll(".drill-level").length,
      title: level?.querySelector(".drill-title")?.textContent ?? null,
      back: level?.querySelector(".drill-back")?.textContent ?? null,
      backTop: level?.querySelector(".drill-back")?.getBoundingClientRect().top ?? null,
      scrollTop: list?.scrollTop ?? null,
      scrollable: list ? list.scrollHeight > list.clientHeight : false,
      animation: level ? getComputedStyle(level).animationName : null,
    };
  }, current);

const openRow = async (page, text) => {
  await page.locator(`${current} .tree-row`, { hasText: text }).first().click();
  await page.waitForTimeout(SLIDE_SETTLE_MS);
};

const browser = await chromium.launch();

// --- drill-down navigation (desktop) -----------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  await page.waitForSelector(`${current} .tree-row`);
  let s = await levelState(page);
  check(
    s.levels === 1 && s.back === null,
    "drill: the landing starts at the top level, no back button",
  );

  await page.locator(`${current} .tree-row`, { hasText: "Journal of Discourses" }).click();
  s = await levelState(page);
  check(
    s.animation === SLIDE_ANIMATION,
    `drill: opening a group slides its level in (${s.animation})`,
  );
  await page.waitForTimeout(SLIDE_SETTLE_MS);
  s = await levelState(page);
  check(
    s.levels === 2 && s.title === "Journal of Discourses",
    "drill: the group's level covers the old one",
  );
  check(/Library/.test(s.back ?? ""), `drill: the back button names where it goes (${s.back})`);

  check(s.scrollable, "drill: the volume list is long enough to scroll");
  const backTop = s.backTop;
  await page.evaluate(
    ([sel, px]) => {
      document.querySelector(`${sel} .drill-list`).scrollTop = px;
    },
    [current, SCROLLED_PX],
  );
  s = await levelState(page);
  check(s.scrollTop > 0, `drill: the list scrolls on its own (${s.scrollTop}px)`);
  check(s.backTop === backTop, "drill: the back button stays pinned while the list scrolls");
  const scrolled = s.scrollTop;

  await openRow(page, LAST_VOLUME);
  s = await levelState(page);
  check(s.levels === 3 && s.title === LAST_VOLUME, "drill: a second level stacks on the first");
  await page.click(`${current} .drill-back`);
  await page.waitForTimeout(SLIDE_SETTLE_MS);
  s = await levelState(page);
  check(
    s.levels === 2 && s.title === "Journal of Discourses",
    "drill: back returns to the previous level",
  );
  check(
    s.scrollTop === scrolled,
    `drill: ...at the scroll position it was left (${s.scrollTop}/${scrolled})`,
  );

  await page.goto(`${BASE}${DEEP_DISCOURSE}`, { waitUntil: "networkidle" });
  await page.waitForSelector(`${current} .tree-row.active`);
  s = await levelState(page);
  const visible = await page.evaluate((sel) => {
    const list = document.querySelector(`${sel} .drill-list`).getBoundingClientRect();
    const row = document.querySelector(`${sel} .tree-row.active`).getBoundingClientRect();
    return row.top >= list.top && row.bottom <= list.bottom;
  }, current);
  check(
    s.title === "Volume 1" && visible,
    "drill: a deep link opens its level, scrolled to the passage",
  );
  const pinned = await page.evaluate(async (sel) => {
    window.scrollTo(0, 0);
    const before = document.querySelector(`${sel} .drill-back`).getBoundingClientRect().top;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const back = document.querySelector(`${sel} .drill-back`).getBoundingClientRect();
    return { before, after: back.top, onScreen: back.top >= 0 && back.bottom <= innerHeight };
  }, current);
  // Before any scroll the menu sits in the page's flow, a few px below where it then sticks.
  check(
    pinned.onScreen && pinned.before - pinned.after <= STICK_SETTLE_PX,
    `drill: scrolling a long passage leaves the menu in place (${pinned.before} → ${pinned.after})`,
  );
  await ctx.close();
}

// --- citation-style JoD URLs (src/library/citations.ts) ---------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const visit = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".reading h3, .library-not-found", { timeout: 10000 });
    return page.evaluate(() => ({
      path: location.pathname,
      heading: document.querySelector(".reading h3")?.textContent ?? null,
      notFound: Boolean(document.querySelector(".library-not-found")),
      active: document.querySelector(".drill-level.current .tree-row.active")?.textContent ?? null,
    }));
  };

  let v = await visit("/library/jod/1/1");
  check(
    v.heading === SHORT_TITLE && v.path === "/library/jod/1/1",
    "url: /library/jod/1/1 opens the discourse beginning on p. 1",
  );
  v = await visit("/library/jod/1/3");
  check(
    v.heading === SHORT_TITLE && v.path === "/library/jod/1/3",
    "url: a page inside a discourse lands on it, the URL keeping the page asked for",
  );
  check(v.active?.startsWith("p. 1 –"), "url: ...with its menu row selected");
  // No redirects (decided 2026-10-23): the edition-style form still opens its passage, as is.
  v = await visit(LEGACY_DISCOURSE);
  check(
    v.path === LEGACY_DISCOURSE && v.heading === "Spiritual Communication",
    `url: an edition-style link opens its passage at that address (${v.path})`,
  );
  await visit("/library/jod/1/1");
  await page.locator(`${current} .tree-row.leaf`, { hasText: "Spiritual Communication" }).click();
  await page.waitForURL(/\/library\/jod\/1\/6$/, { timeout: 5000 }).catch(() => {});
  check(
    new URL(page.url()).pathname === "/library/jod/1/6",
    "url: menu links use the citation form",
  );
  // Printed-book breaks inside the discourse (src/library/marks.ts): Salvation runs pp. 1-6.
  await visit("/library/jod/1/1");
  const rules = await page.evaluate(() => ({
    pages: [...document.querySelectorAll(".reading .page-rule")].map((r) => r.textContent),
    columns: [...document.querySelectorAll(".reading .column-rule")].map((r) => r.textContent),
  }));
  check(
    rules.pages.join(",") === "p. 2,p. 3,p. 4,p. 5,p. 6",
    `marks: a page rule at each new page (${rules.pages.join(", ")})`,
  );
  check(
    rules.columns.length === SALVATION_COLUMN_RULES && rules.columns.every((c) => c === "col. b"),
    `marks: a column rule where each page's second column begins (${rules.columns.length})`,
  );
  await visit("/library/kjv/genesis/1");
  const plain = await page.locator(".reading .page-rule, .reading .column-rule").count();
  check(plain === 0, "marks: texts without page data show no rules");

  // Jump to page: a page inside a discourse scrolls its "p. N" rule to just under the header;
  // the discourse's opening page stays at the top.
  await visit("/library/jod/1/3");
  await page.waitForTimeout(SLIDE_SETTLE_MS);
  const jump = await page.evaluate(() => {
    const rule = document.querySelector('.reading .page-rule[data-page="3"]');
    const header = document.querySelector(".shell-header").getBoundingClientRect().bottom;
    return { scrollY: window.scrollY, ruleTop: rule?.getBoundingClientRect().top ?? null, header };
  });
  check(
    jump.scrollY > 0 &&
      jump.ruleTop !== null &&
      jump.ruleTop >= jump.header &&
      jump.ruleTop - jump.header <= JUMP_LANDING_PX,
    `jump: /library/jod/1/3 scrolls to the p. 3 rule (rule ${Math.round(jump.ruleTop)} under header ${Math.round(jump.header)})`,
  );
  await visit("/library/jod/1/1");
  await page.waitForTimeout(SLIDE_SETTLE_MS);
  check(
    (await page.evaluate(() => window.scrollY)) === 0,
    "jump: a discourse's opening page stays at the top",
  );

  // Bible books: the short name in the menu, the full traditional title above the text.
  await visit("/library/kjv/genesis/1");
  const names = await page.evaluate(() => ({
    level: document.querySelector(".drill-level.current .drill-title")?.textContent,
    heading: document.querySelector(".reading h2")?.textContent,
  }));
  check(
    names.level === "Genesis" && names.heading === "The First Book of Moses Called Genesis",
    `names: the menu says "${names.level}", the text keeps "${names.heading}"`,
  );
  await page.click(`${current} .drill-back`);
  await page.waitForTimeout(SLIDE_SETTLE_MS);
  const books = await page.locator(`${current} .tree-row`).allTextContents();
  check(
    books.slice(0, 3).join(",") === "Genesis›,Exodus›,Leviticus›",
    `names: the Old Testament lists short book names (${books.slice(0, 3).join(", ")})`,
  );

  await visit("/library/bofm-lds/1-nephi/1");
  const nephi = await page.locator(`${current} .drill-title`).textContent();
  check(nephi === "1 Nephi", `names: the Book of Mormon menu says "${nephi}"`);

  // Eliza R. Snow's poems by year (server/arrange.ts) — research view only: the edition is
  // held back from the public build, so this is skipped where it is absent.
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  const eliza = page.locator(`${current} .tree-row`, { hasText: ELIZA_WORK });
  if ((await eliza.count()) > 0) {
    await eliza.click();
    await page.waitForTimeout(SLIDE_SETTLE_MS);
    const groups = await page.locator(`${current} .tree-label`).allTextContents();
    check(
      groups[0] === "1820s" && groups.slice(-2).join(",") === "Year Uncertain,Year Unknown",
      `poems: decades first, then Year Uncertain and Year Unknown (${groups.join(", ")})`,
    );
    const counts = (await page.locator(`${current} .tree-count`).allTextContents()).map(Number);
    check(
      counts.length === groups.length && counts.every((c) => c > 0),
      `poems: each group shows how many poems it holds (${counts.join(", ")})`,
    );
    await page.locator(`${current} .tree-row`, { hasText: DECADE }).click();
    await page.waitForTimeout(SLIDE_SETTLE_MS);
    const inside = await page.evaluate((sel) => {
      const level = document.querySelector(sel);
      const dividers = [...level.querySelectorAll(".tree-divider")];
      return {
        years: dividers.map((d) => Number(d.textContent)),
        clickable: dividers.some((d) => d.closest("button")),
        poems: level.querySelectorAll(".tree-row.leaf").length,
      };
    }, current);
    check(
      inside.years.length > 1 &&
        inside.years.every((y, i) => i === 0 || y > inside.years[i - 1]) &&
        inside.years.every((y) => y >= 1840 && y < 1850),
      `poems: inside the ${DECADE}, a divider per year in order (${inside.years.join(", ")})`,
    );
    check(!inside.clickable && inside.poems > 0, "poems: dividers are labels, poems are the rows");
    const colors = await page.evaluate((sel) => {
      const level = document.querySelector(sel);
      const color = (el) => getComputedStyle(el).color;
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
      const probe = document.createElement("span");
      probe.style.color = ink;
      document.body.append(probe);
      const inkColor = color(probe);
      probe.remove();
      return {
        poem: color(level.querySelector(".tree-row.leaf:not(.active)")),
        year: color(level.querySelector(".tree-divider")),
        ink: inkColor,
      };
    }, current);
    check(
      colors.poem === colors.ink && colors.poem !== colors.year,
      `poems: poem rows in full ink, brighter than the year labels (${colors.poem} vs ${colors.year})`,
    );
  } else {
    console.log("skip poems by year (Eliza R. Snow is not in this build)");
  }

  // Line breaks in the text show line by line (src/library/labels.ts): a poem's stanzas, the
  // witnesses' signatures; prose paragraphs are untouched.
  const firstPassage = () =>
    page.evaluate(() => {
      const p = document.querySelector(".reading .passage");
      return {
        label: p?.querySelector(".unit-id")?.textContent,
        lines: [...(p?.querySelectorAll(".text-line") ?? [])].map((l) =>
          l.textContent.replace(/^\d+/, "").trim(),
        ),
      };
    });
  if (!(await visit(FARMERS_WIFE)).notFound) {
    const stanza = await firstPassage();
    check(
      stanza.label === "1" &&
        stanza.lines.length === 8 &&
        stanza.lines[0] === "If there’s a smile on nature’s face" &&
        stanza.lines[7] === "Are at the farmer’s wife’s command.",
      `lines: a stanza shows its eight lines, numbered "${stanza.label}"`,
    );
    // Reworked poems (scripts/ers-fixes.mjs): reconstructed stanzas, the source's indentation,
    // ornament rows as unnumbered dividers.
    await visit(QUEEN_VICTORIA);
    const qv = await page.evaluate(() => ({
      labels: [...document.querySelectorAll(".reading .passage .unit-id")].map(
        (l) => l.textContent,
      ),
      indented: [...document.querySelectorAll(".reading .text-line")].filter(
        (l) => parseFloat(getComputedStyle(l).marginLeft) > 0,
      ).length,
    }));
    check(
      qv.labels.join(",") === "1,2,3,4,5,6,7,8,9,10,11,12" && qv.indented > 0,
      `poems: a one-block poem shows as numbered stanzas, indented like the source (${qv.labels.length} stanzas, ${qv.indented} indented lines)`,
    );
    // Short poem URLs (src/library/citations.ts): by number; old batch links redirect.
    const qvPage = await page.evaluate(() => ({
      path: location.pathname,
      heading: document.querySelector(".reading h3")?.textContent,
    }));
    check(
      qvPage.path === QUEEN_VICTORIA && qvPage.heading === "Queen Victoria",
      "poem url: /library/eliza-r-snow-poems/130 opens the poem",
    );
    const legacy = await visit(LEGACY_POEM);
    check(
      legacy.path === LEGACY_POEM && legacy.heading === "Queen Victoria",
      `poem url: an edition-style link opens the poem at that address (${legacy.path})`,
    );
    await visit(QUEEN_VICTORIA);
    const menuLink = await page.evaluate(
      () => [...document.querySelectorAll(".drill-level.current .tree-row.leaf")].length,
    );
    await page.locator(`${current} .tree-row.leaf:not(.active)`).first().click();
    await page.waitForTimeout(SLIDE_SETTLE_MS);
    check(
      menuLink > 0 && /^\/library\/eliza-r-snow-poems\/\d+$/.test(new URL(page.url()).pathname),
      `poem url: menu links use the short form (${new URL(page.url()).pathname})`,
    );
    check(
      (await visit(MISSING_POEM)).notFound,
      "poem url: a poem with no text says it doesn't exist",
    );
    await visit(FUNERAL_OF_BRIGHAM_YOUNG);
    const divider = await page.evaluate(() => {
      const d = document.querySelector(".reading .passage.ornament");
      return d ? { text: d.textContent, labelled: Boolean(d.querySelector(".unit-id")) } : null;
    });
    check(
      divider?.text === "* * * * *" && !divider.labelled,
      "poems: an ornament row is an unnumbered divider",
    );
    await visit(FARMERS_WIFE);
    const head = await page.evaluate(() => ({
      batch: document.querySelector(".reading h2")?.textContent ?? null,
      byline: document.querySelector(".reading .discourse-byline")?.textContent ?? null,
    }));
    check(head.batch === null, `poem: no batch heading above it (${head.batch})`);
    check(head.byline === "Composed 1828", `poem: its notes as a byline (${head.byline})`);
    await visit(LONG_NOTES_POEM);
    const long = await page.evaluate(() => {
      const b = document.querySelector(".reading .discourse-byline");
      return {
        height: b.getBoundingClientRect().height,
        expand: b.querySelector("button")?.textContent,
      };
    });
    await page.click(".reading .discourse-byline button");
    const opened = await page.evaluate(
      () => document.querySelector(".reading .discourse-byline").getBoundingClientRect().height,
    );
    check(
      long.expand === "Expand" && opened > long.height * 1.5,
      `poem: long notes preview on one line, Expand shows them all (${Math.round(long.height)} → ${Math.round(opened)}px)`,
    );
    await visit(FARMERS_WIFE);
    // The number's digits, not just its box, must sit inside the passage (an inherited hanging
    // indent once pushed them off the card on phones).
    const gutter = await page.evaluate(() => {
      const p = document.querySelector(".reading .passage.lined");
      const range = document.createRange();
      range.selectNodeContents(p.querySelector(".unit-id"));
      return { digits: range.getClientRects()[0].left, passage: p.getBoundingClientRect().left };
    });
    check(
      gutter.digits >= gutter.passage - 0.5,
      `lines: the stanza number sits in its gutter (${Math.round(gutter.digits)} ≥ ${Math.round(gutter.passage)})`,
    );
  } else {
    console.log("skip stanza lines (the poems are not in this build)");
  }
  await visit("/library/jod/1/1");
  const prose = await firstPassage();
  check(
    prose.label === "¶1" && prose.lines.length === 0,
    "lines: a JoD paragraph stays one paragraph",
  );
  const jodHead = await page.evaluate(() => ({
    h2: document.querySelector(".reading h2")?.textContent,
    byline: document.querySelector(".reading .discourse-byline")?.textContent,
  }));
  check(
    jodHead.h2 === "Volume 1" && jodHead.byline?.startsWith("Brigham Young  ·  "),
    `lines: JoD keeps its volume heading and byline (${jodHead.h2}; ${jodHead.byline?.slice(0, 30)}…)`,
  );

  v = await visit("/library/jod/1/9999");
  check(v.notFound, "url: a page past the end of a volume says it doesn't exist");
  v = await visit("/library/kjv/genesis/999");
  check(v.notFound, "url: a chapter that doesn't exist says so instead of loading forever");
  await ctx.close();
}

// --- reduced motion -----------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  await page.waitForSelector(`${current} .tree-row`);
  await page.locator(`${current} .tree-row`, { hasText: "Holy Bible" }).click();
  let s = await levelState(page);
  check(
    s.animation === "none" && s.title === "Holy Bible",
    "reduced motion: levels swap without sliding",
  );
  await page.click(`${current} .drill-back`);
  s = await levelState(page);
  check(s.levels === 1, "reduced motion: back still returns at once");
  await ctx.close();
}

// --- desktop: hover and keyboard focus --------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${JOD_VOLUME}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".drill-level.current .tree-row.leaf .tree-label");

  check((await maxLines(page)) === 1, "desktop: every menu title is one line");
  const firstRow = await page.locator(".drill-level.current .tree-row.leaf .tree-label").first();
  check(
    (await firstRow.textContent()) === `p. 1 – ${FIRST_SPEAKER} – ${SHORT_TITLE}`,
    "desktop: a discourse row leads with its page, then its speaker",
  );
  const i = await firstTruncated(page);
  check(i >= 0, "desktop: long discourse titles are truncated");

  const rows = page.locator(".drill-level.current .tree-row.leaf");
  await rows.nth(i).hover();
  await page.waitForTimeout(IMMEDIATE_MS);
  const label = await labelState(page, i);
  const peek = await peekState(page);
  check(peek?.text === label.full, "desktop: hovering a truncated title shows it in full at once");
  check(peek?.styledPage, "desktop: the overlay keeps the page number's styling");
  check(
    peek &&
      Math.abs(peek.left - label.left) <= ALIGN_TOLERANCE_PX &&
      Math.abs(peek.top - label.top) <= ALIGN_TOLERANCE_PX,
    `desktop: the full title starts exactly on the truncated one (Δx ${(peek?.left - label.left).toFixed(1)}, Δy ${(peek?.top - label.top).toFixed(1)})`,
  );
  check(peek && peek.width > label.width, "desktop: the full title extends past the row");

  await page.mouse.move(DESKTOP.width - 1, DESKTOP.height - 1);
  check((await peekState(page)) === null, "desktop: moving away hides it");

  // Keyboard: arrive on the truncated row by Shift+Tab from the row below it.
  await page.mouse.move(DESKTOP.width - 1, DESKTOP.height - 1);
  await rows.nth(i + 1).focus();
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(IMMEDIATE_MS);
  check((await peekState(page))?.text === label.full, "desktop: keyboard focus shows it too");

  // A row that fits — a volume, one level up — gets no overlay. (Discourse rows now carry page
  // and speaker as well, so even "Salvation" truncates in the desktop sidebar.)
  await page.mouse.move(DESKTOP.width - 1, DESKTOP.height - 1);
  await page.click(`${current} .drill-back`);
  await page.waitForTimeout(SLIDE_SETTLE_MS);
  await page.locator(`${current} .tree-row`, { hasText: FITTING_ROW }).first().hover();
  await page.waitForTimeout(IMMEDIATE_MS);
  check((await peekState(page)) === null, "desktop: a title that fits gets no overlay");
  await ctx.close();
}

// --- phone: two lines, tap navigates, press-and-hold previews ----------------------------------
{
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });

  const openSheet = async () => {
    await page.goto(`${BASE}${JOD_VOLUME}`, { waitUntil: "networkidle" });
    await page.click(".nav-toggle");
    await page.waitForSelector(".nav-panel.open .drill-level.current .tree-row.leaf .tree-label");
  };
  // A deep link far down a volume: the ☰ panel is hidden while the page loads, so it must
  // bring the passage into view when it opens, not only on load.
  await page.goto(`${BASE}${DEEP_DISCOURSE}`, { waitUntil: "networkidle" });
  await page.click(".nav-toggle");
  await page.waitForTimeout(SLIDE_SETTLE_MS);
  const inSheet = await page.evaluate((sel) => {
    const list = document.querySelector(`${sel} .drill-list`).getBoundingClientRect();
    const row = document.querySelector(`${sel} .tree-row.active`).getBoundingClientRect();
    return row.top >= list.top && row.bottom <= list.bottom;
  }, ".nav-panel.open .drill-level.current");
  check(inSheet, "phone: opening ☰ on a deep link shows the passage's row");

  await openSheet();

  check((await maxLines(page)) <= 2, "phone: menu titles clamp to two lines");
  const i = await firstTruncated(page);
  check(i >= 0, "phone: the longest titles are still truncated at two lines");
  const full = (await labelState(page, i)).full;
  const box = await page.locator(".drill-level.current .tree-row.leaf").nth(i).boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

  const before = page.url();
  await touch("touchStart", x, y);
  await page.waitForTimeout(HOLD_MS);
  check((await peekState(page))?.text === full, "phone: pressing and holding shows the full title");
  await touch("touchEnd", x, y);
  await page.waitForTimeout(IMMEDIATE_MS);
  check((await peekState(page)) === null, "phone: releasing hides it");
  check(page.url() === before, "phone: releasing a hold does not open the discourse");

  await touch("touchStart", x, y);
  await page.waitForTimeout(TAP_MS);
  check((await peekState(page)) === null, "phone: no preview during an ordinary tap");
  await touch("touchEnd", x, y);
  await page.waitForTimeout(IMMEDIATE_MS * 5);
  check(page.url() !== before, "phone: an ordinary tap still opens the discourse");
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
