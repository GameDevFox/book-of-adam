// Phone-width layout check for the Library (and the shell around it). Runs against a live dev
// server — start one first (`yarn start`), then:
//   yarn check:mobile [base-url]
// Exits non-zero on the first failed assertion. Kept as a script rather than a vitest suite
// because it needs a browser (`yarn playwright install chromium` once).
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3006";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
// Minimum comfortable touch target (Apple HIG 44pt, WCAG 2.5.8 floor is 24; we aim for 40).
const MIN_TAP_PX = 40;
// Below this the reading pane wraps a few words per line — the whole point of the change.
const MIN_READING_PX = 300;
// A deep link to a passage: a bare /library is the landing prompt, not a reading view.
const READING_PATH = "/library/kjv/genesis/1";
const SEARCH_PATH = "/library/search?q=the%20spirit%20of%20god";
// The first search on a fresh dev server builds the index in memory (about 25 s).
const SEARCH_TIMEOUT_MS = 120000;
// The landing arrow's rotation: left at the sidebar on desktop, up-left at ☰ on a phone.
const ARROW_LEFT = "none";
const ARROW_UP_LEFT = "matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)";

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

/** Bare /library: prompt shown, no passage, menu at its top level, arrow aimed at the menu. */
const checkLanding = async (page, label, arrow) => {
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  await page.waitForSelector(".library-landing");
  const l = await page.evaluate(() => ({
    url: location.pathname,
    passages: document.querySelectorAll(".reading .passage").length,
    levels: document.querySelectorAll(".drill-level").length,
    leaves: document.querySelectorAll(".drill-level.current .tree-row.leaf").length,
    arrow: getComputedStyle(document.querySelector(".library-landing-arrow")).transform,
  }));
  check(l.url === "/library" && l.passages === 0, `${label} /library stays on the landing prompt`);
  check(l.levels === 1 && l.leaves === 0, `${label} landing menu is at the top level`);
  check(l.arrow === arrow, `${label} landing arrow points at the menu (${l.arrow})`);
};

const browser = await chromium.launch();

// --- phone ----------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await checkLanding(page, "phone", ARROW_UP_LEFT);
  await page.goto(`${BASE}${READING_PATH}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".reading .passage");

  const m = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s)?.getBoundingClientRect() ?? null;
    const nav = document.querySelector(".shell-header nav");
    return {
      scrollW: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      reading: rect(".reading")?.width ?? 0,
      navOverflow: nav ? nav.scrollWidth > nav.clientWidth + 1 : true,
      navRight: nav?.getBoundingClientRect().right ?? Infinity,
      sidebarVisible: (rect(".library-sidebar")?.width ?? 0) > 0,
      contentsBtn: document.querySelectorAll(".library-contents-toggle").length,
    };
  });
  // Compare against the *device* width, not innerWidth: mobile emulation widens the layout
  // viewport to fit overflowing content, so innerWidth would make an overflowing page pass.
  check(
    m.scrollW <= PHONE.width,
    `no horizontal page overflow (scrollWidth ${m.scrollW} <= device ${PHONE.width}; innerWidth ${m.vw})`,
  );
  check(
    m.reading >= MIN_READING_PX,
    `reading pane is readable (${Math.round(m.reading)}px >= ${MIN_READING_PX})`,
  );
  check(
    !m.navOverflow && m.navRight <= PHONE.width,
    `header nav fits the screen (right edge ${Math.round(m.navRight)} <= ${PHONE.width})`,
  );
  check(!m.sidebarVisible, "the Library sidebar is hidden on a phone");
  check(m.contentsBtn === 0, "no separate Contents button — the menu lives in the ☰ panel");

  // One menu: ☰ on a Library page holds the app links and, below them, the Contents drill-down.
  // Pick a different passage there and expect the panel to close on it.
  const before = page.url();
  const contentsRows = ".nav-panel.open .nav-panel-contents .drill-level.current .tree-row.leaf";
  const opened = await page
    .click(".nav-toggle", { timeout: 5000 })
    .then(() => page.waitForSelector(contentsRows, { state: "visible", timeout: 5000 }))
    .then(
      () => true,
      () => false,
    );
  check(opened, "☰ on a Library page shows the Contents menu in the panel");
  const leaf = await page.evaluate((sel) => {
    const rows = [...document.querySelectorAll(sel)];
    const r = rows.find((el) => !el.classList.contains("active"));
    const b = r?.getBoundingClientRect();
    const apps = [...document.querySelectorAll(".nav-panel .nav-panel-apps a")];
    const appsBottom = Math.max(...apps.map((a) => a.getBoundingClientRect().bottom));
    return {
      count: rows.length,
      apps: apps.length,
      height: b?.height ?? 0,
      inView: b ? b.left >= 0 && b.right <= innerWidth : false,
      belowApps: b ? b.top >= appsBottom : false,
    };
  }, contentsRows);
  check(leaf.apps >= 2 && leaf.belowApps, "the app links stay on top, the contents below them");
  check(leaf.count > 0, `the panel shows the passage's level (${leaf.count} rows)`);
  check(
    leaf.height >= MIN_TAP_PX,
    `menu rows are tap-sized (${leaf.height.toFixed(1)}px >= ${MIN_TAP_PX})`,
  );
  check(leaf.inView, "menu rows sit within the screen width");
  await page.click(`${contentsRows}:not(.active)`);
  await page.waitForFunction((prev) => location.href !== prev, before);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({
    panelOpen: Boolean(document.querySelector(".nav-panel.open")),
    scrollW: document.documentElement.scrollWidth,
  }));
  check(!after.panelOpen, "the panel closes after choosing a passage");
  check(after.scrollW <= PHONE.width, "still no horizontal overflow after navigation");

  // Sticky header: scroll into the text and the masthead must still sit at the top edge.
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(100);
  const hdr = await page.evaluate(() => {
    const h = document.querySelector(".shell-header")?.getBoundingClientRect();
    const nav = document.querySelector(".shell-header nav")?.getBoundingClientRect();
    const burger = document.querySelector(".nav-toggle")?.getBoundingClientRect();
    return { top: h?.top, navW: nav?.width ?? 0, burger, scrollY: window.scrollY };
  });
  check(
    hdr.scrollY > 0 && hdr.top === 0,
    `header stays pinned while scrolled (top ${hdr.top} at scrollY ${hdr.scrollY})`,
  );
  check(hdr.navW === 0, "phone hides the tab strip in the header");
  check(
    hdr.burger && hdr.burger.height >= MIN_TAP_PX && hdr.burger.left < 24,
    "hamburger sits at the header's left edge and is tappable",
  );

  // Hamburger opens a left-side panel with the app tabs; picking one navigates and closes it.
  const navOpened = await page
    .click(".nav-toggle", { timeout: 5000 })
    .then(() => page.waitForSelector(".nav-panel a", { state: "visible", timeout: 5000 }))
    .then(
      () => true,
      () => false,
    );
  check(navOpened, "tapping the hamburger opens the nav panel");
  const panel = await page.evaluate(() => {
    const p = document.querySelector(".nav-panel")?.getBoundingClientRect();
    const links = [...document.querySelectorAll(".nav-panel a")].map(
      (a) => a.getBoundingClientRect().height,
    );
    return { left: p?.left, width: p?.width ?? 0, links };
  });
  check(
    panel.left === 0 && panel.width < PHONE.width,
    `panel slides in from the left (left ${panel.left}, width ${Math.round(panel.width)})`,
  );
  check(
    panel.links.length >= 2 && panel.links.every((h) => h >= MIN_TAP_PX),
    `panel links are tap-sized (${panel.links.map((h) => h.toFixed(0)).join(",")})`,
  );
  // Any app other than the current one — the public build ships only some (src/apps.ts).
  const target = await page.getAttribute(".nav-panel .nav-panel-apps a:not(.active)", "href");
  const picked = await page
    .click(`.nav-panel a[href='${target}']`, { timeout: 5000 })
    .then(() => page.waitForURL((url) => url.pathname.startsWith(target ?? "?"), { timeout: 5000 }))
    .then(
      () => true,
      () => false,
    );
  check(picked, "choosing an app in the panel navigates to it");
  const navAfter = await page.evaluate(
    () => (document.querySelector(".nav-panel")?.getBoundingClientRect().width ?? 0) > 0,
  );
  check(!navAfter, "nav panel closes after choosing an app");
  await page.click(".nav-toggle");
  await page.waitForSelector(".nav-panel.open");
  const contentsElsewhere = await page.locator(".nav-panel .nav-panel-contents").count();
  check(contentsElsewhere === 0, `off the Library, ☰ holds only the app links (${target})`);
  await ctx.close();
}

// --- phone: the full-text results page (src/library/SearchResults.tsx) --------------------------
{
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Common enough to fill a page and offer "Show more"; the first search builds the dev index.
  await page.goto(`${BASE}${SEARCH_PATH}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".search-more", { timeout: SEARCH_TIMEOUT_MS });
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    reading: document.querySelector(".reading")?.getBoundingClientRect().width ?? 0,
    more: document.querySelector(".search-more")?.getBoundingClientRect().height ?? 0,
  }));
  check(
    m.scrollW <= PHONE.width,
    `search results: no horizontal overflow (scrollWidth ${m.scrollW})`,
  );
  check(
    m.reading >= MIN_READING_PX,
    `search results: a readable column (${Math.round(m.reading)}px)`,
  );
  check(
    m.more >= MIN_TAP_PX,
    `search results: "Show more" is thumb-sized (${Math.round(m.more)}px)`,
  );
  await ctx.close();
}

// --- desktop: nothing regressed ---------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await checkLanding(page, "desktop", ARROW_LEFT);
  await page.goto(`${BASE}${READING_PATH}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".reading .passage");
  const d = await page.evaluate(() => ({
    sidebar: document.querySelector(".library-sidebar")?.getBoundingClientRect().width ?? 0,
    panelMenu: document.querySelectorAll(".nav-panel .drill").length,
    reading: document.querySelector(".reading")?.getBoundingClientRect().width ?? 0,
  }));
  check(d.sidebar > 200, `desktop keeps the sidebar (${Math.round(d.sidebar)}px)`);
  check(d.panelMenu === 0, "desktop keeps the menu in the sidebar, not the ☰ panel");
  check(d.reading > 500, `desktop reading pane unchanged (${Math.round(d.reading)}px)`);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(100);
  const dh = await page.evaluate(() => ({
    top: document.querySelector(".shell-header")?.getBoundingClientRect().top,
    navW: document.querySelector(".shell-header nav")?.getBoundingClientRect().width ?? 0,
    burger: document.querySelector(".nav-toggle")?.getBoundingClientRect().width ?? 0,
    scrollY: window.scrollY,
  }));
  check(
    dh.scrollY > 0 && dh.top === 0,
    `desktop header stays pinned while scrolled (top ${dh.top})`,
  );
  check(dh.navW > 0 && dh.burger === 0, "desktop keeps the tab strip and hides the hamburger");
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
