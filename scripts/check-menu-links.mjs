// Library menu rows that open a passage are real links (src/library/TreeMenu.tsx): the browser's
// right-click menu offers "Open link in new tab", Ctrl/Cmd+click opens one, and a plain click
// still navigates in place. The phone press-and-hold title peek keeps the context menu away only
// during a hold. Runs against a live server:
//   yarn check:links [base-url]
// Needs a browser (`yarn playwright install chromium` once).
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3006";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const START = "/library/jod/1/1";
const LEAF = ".drill-level.current .tree-row.leaf";
const GROUP = ".drill-level.current .tree-row.group";
// Must outlast the long-press delay (src/library/TitlePeek.tsx), as in check-library-menu.mjs.
const HOLD_MS = 700;
const NEW_TAB_TIMEOUT_MS = 5000;

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

/** Raise a context-menu event on the element and report whether anything cancelled it. */
const contextMenuBlocked = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    return !el.dispatchEvent(event);
  }, selector);

const browser = await chromium.launch();

// --- desktop -------------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${START}`, { waitUntil: "networkidle" });
  await page.waitForSelector(LEAF);

  const target = `${LEAF}:not(.active)`;
  const link = await page.evaluate((sel) => {
    const row = document.querySelector(sel);
    return { tag: row.tagName, href: row.getAttribute("href") };
  }, target);
  check(
    link.tag === "A" && link.href?.startsWith("/library/"),
    `desktop: a passage row is a link (${link.tag} ${link.href})`,
  );
  check(
    !(await contextMenuBlocked(page, target)),
    "desktop: right-clicking a passage row gets the browser's menu",
  );
  check(
    !(await contextMenuBlocked(page, `${LEAF}.active`)),
    "desktop: ...and the current passage's row too",
  );

  const [tab] = await Promise.all([
    ctx.waitForEvent("page", { timeout: NEW_TAB_TIMEOUT_MS }).catch(() => null),
    page
      .locator(target)
      .first()
      .click({ modifiers: ["ControlOrMeta"] }),
  ]);
  if (tab) await tab.waitForLoadState("networkidle");
  const opened = tab ? new URL(tab.url()).pathname : null;
  check(
    opened === link.href && new URL(page.url()).pathname === START,
    `desktop: Ctrl/Cmd+click opens the passage in a new tab and leaves this one (${opened})`,
  );
  await tab?.close();

  await page.locator(target).first().click();
  await page.waitForURL((url) => url.pathname === link.href, { timeout: 5000 }).catch(() => {});
  check(
    new URL(page.url()).pathname === link.href && ctx.pages().length === 1,
    "desktop: a plain click still opens it in place",
  );

  await page.click(".drill-level.current .drill-back");
  await page.waitForSelector(GROUP);
  check(
    !(await contextMenuBlocked(page, GROUP)),
    "desktop: right-clicking a group row is not blocked either",
  );
  await ctx.close();
}

// --- phone: a press-and-hold keeps the context menu away ---------------------------------------
{
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  await page.goto(`${BASE}${START}`, { waitUntil: "networkidle" });
  await page.click(".nav-toggle");
  const row = `.nav-panel.open ${LEAF}:not(.active)`;
  await page.waitForSelector(row);
  const box = await page.locator(row).first().boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await touch("touchStart", x, y);
  await page.waitForTimeout(HOLD_MS);
  const duringHold = await contextMenuBlocked(page, row);
  await touch("touchEnd", x, y);
  check(duringHold, "phone: during a press-and-hold the context menu is held back for the peek");
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
