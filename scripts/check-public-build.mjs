// Asserts that dist/ is a read-only public build (`yarn build:public`): the review surface and
// the sub-apps not yet shipped (src/apps.ts) are absent from the JS bundle — stripped at compile
// time via PUBLIC_BUILD, not merely hidden — and the emitted data carries no review state and no
// local-only text. Run before every deploy.
//
// The markers are strings that exist only in review code or only in an unshipped app. A guard
// written so the minifier cannot fold it (e.g. comparing against a constant imported from
// another module) leaves them in the bundle while the UI looks right — this is the check that
// notices.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const DIST = path.resolve(import.meta.dirname, "../dist");
const ASSETS = path.join(DIST, "assets");
const DATA = path.join(DIST, "api", "data");
const EDITIONS = path.resolve(import.meta.dirname, "../data/texts/editions.json");

const REVIEW_MARKERS = [
  "Mark verified",
  "Verify all",
  "Dispute note",
  "Save failed",
  "/reviews",
  "facts verified",
  "datings verified",
  "data/deseret-lexicon.json",
];

/** The analytics tracker must ship (src/analytics.ts) — a deploy without it is silently blind. */
const ANALYTICS_MARKERS = {
  "Umami script": "https://analytics.gamedevfox.org/script.js",
  "bookofadam.org website id": "95336653-1c05-4b86-9cd4-d94ed82762ba",
};

/** One string unique to each sub-app the public build leaves out. Remove an app's line when it ships. */
const UNSHIPPED_APP_MARKERS = {
  people: "Search name, role, group",
  events: "Search title, summary, group",
  timeline: "lane-picker-label",
};

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
};

if (!existsSync(ASSETS) || !existsSync(DATA)) {
  console.error("dist/ is missing or has no data — run `yarn build:public` first.");
  process.exit(1);
}

const bundles = readdirSync(ASSETS).filter((file) => file.endsWith(".js"));
check(bundles.length > 0, `found ${bundles.length} JS bundle(s)`);
const js = bundles.map((file) => readFileSync(path.join(ASSETS, file), "utf8")).join("\n");
for (const marker of REVIEW_MARKERS) check(!js.includes(marker), `bundle has no "${marker}"`);
for (const [what, marker] of Object.entries(ANALYTICS_MARKERS)) {
  check(js.includes(marker), `bundle loads analytics (${what})`);
}
for (const [app, marker] of Object.entries(UNSHIPPED_APP_MARKERS)) {
  check(!js.includes(marker), `bundle has no ${app} app ("${marker}")`);
}

for (const file of readdirSync(DATA)) {
  const { reviews } = JSON.parse(readFileSync(path.join(DATA, file), "utf8"));
  check(Object.keys(reviews).length === 0, `api/data/${file} carries no reviews`);
}

// Editions the public site must not carry: restricted text (local-only) or not ready (heldBack).
const unpublished = JSON.parse(readFileSync(EDITIONS, "utf8"))
  .filter((edition) => edition.licence === "local-only" || edition.heldBack)
  .map((edition) => edition.id);
const contentDir = path.join(DIST, "api", "texts", "content");
const shipped = existsSync(contentDir) ? readdirSync(contentDir) : [];
check(
  shipped.every((edition) => !unpublished.includes(edition)),
  `no local-only or held-back edition under api/texts/content (${unpublished.join(", ")})`,
);
const registry = JSON.parse(readFileSync(path.join(DIST, "api", "texts", "registry.json"), "utf8"));
check(
  registry.editions.every((edition) => !unpublished.includes(edition.id)),
  "the published registry names none of them",
);

// The full-text search index: present, and holding no page of those editions. Each fragment is
// one indexed page, gzipped, its JSON after Pagefind's signature.
const INDEX = path.join(DIST, "pagefind");
const FRAGMENT_SIGNATURE = "pagefind_dcd";
check(
  existsSync(path.join(INDEX, "pagefind.js")),
  "the search index is built (pagefind/pagefind.js)",
);
const fragmentDir = path.join(INDEX, "fragment");
const fragments = existsSync(fragmentDir) ? readdirSync(fragmentDir) : [];
const indexedUrls = fragments.map((file) => {
  const raw = gunzipSync(readFileSync(path.join(fragmentDir, file))).toString("utf8");
  return JSON.parse(raw.slice(FRAGMENT_SIGNATURE.length)).url;
});
check(
  fragments.length > 0 &&
    indexedUrls.every((url) => !unpublished.some((id) => url.startsWith(`/library/${id}/`))),
  `the search index holds none of them (${fragments.length} pages checked)`,
);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed — this dist/ is not safe to publish.`);
  process.exit(1);
}
console.log("\npublic build checks passed");
