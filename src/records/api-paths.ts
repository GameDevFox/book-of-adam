/**
 * The data API's URL grammar, shared by the client (store.ts), the dev middleware and the
 * static build (server/data-source.ts) so the three cannot drift. Every GET resource is
 * file-shaped (`.json`) because the published site serves these as plain files from dist/ —
 * `/api/texts` could not be both a file and the directory holding `/api/texts/outline`.
 */
const DATA_BASE = "/api/data";
const TEXTS_BASE = "/api/texts";
const JSON_EXT = ".json";

/** Collection names are data/<name>.json; sidecars ("people.reviews") are not collections. */
export const COLLECTION_RE = /^[a-z][a-z0-9-]*$/;
/** Text edition/unit ids may start with a digit ("1-nephi"). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export const collectionUrl = (collection: string) => `${DATA_BASE}/${collection}${JSON_EXT}`;
/** POST only, dev only — the published site has no write path. */
export const reviewsUrl = (collection: string) => `${DATA_BASE}/${collection}/reviews`;
export const registryUrl = `${TEXTS_BASE}/registry${JSON_EXT}`;
export const outlineUrl = `${TEXTS_BASE}/outline${JSON_EXT}`;
/** The full-text search's word list: word → passages holding it (spelling correction). */
export const wordsUrl = `${TEXTS_BASE}/words${JSON_EXT}`;
/**
 * Where the Pagefind index is served — not under /api: its files are Pagefind's own layout, not
 * this grammar's (docs/design/full-text-search.md).
 */
export const SEARCH_INDEX_BASE = "/pagefind";
export const searchIndexEntry = `${SEARCH_INDEX_BASE}/pagefind.js`;
export const contentUrl = (edition: string, unit: string) =>
  `${TEXTS_BASE}/content/${edition}/${unit}${JSON_EXT}`;

export type ApiPath =
  | { kind: "collection"; collection: string }
  | { kind: "reviews"; collection: string }
  | { kind: "registry" }
  | { kind: "outline" }
  | { kind: "words" }
  | { kind: "content"; edition: string; unit: string };

const stripJson = (segment: string | undefined): string | null =>
  segment?.endsWith(JSON_EXT) ? segment.slice(0, -JSON_EXT.length) : null;

const under = (pathname: string, base: string): string[] | null =>
  pathname.startsWith(`${base}/`)
    ? pathname
        .slice(base.length + 1)
        .split("/")
        .map(decodeURIComponent)
    : null;

/** The inverse of the builders above; null for anything outside the grammar. */
export const parseApiPath = (pathname: string): ApiPath | null => {
  const data = under(pathname, DATA_BASE);
  if (data) {
    if (data.length === 2 && data[1] === "reviews" && COLLECTION_RE.test(data[0])) {
      return { kind: "reviews", collection: data[0] };
    }
    const collection = data.length === 1 ? stripJson(data[0]) : null;
    return collection && COLLECTION_RE.test(collection) ? { kind: "collection", collection } : null;
  }

  const texts = under(pathname, TEXTS_BASE);
  if (!texts) return null;
  if (texts.length === 1 && texts[0] === `registry${JSON_EXT}`) return { kind: "registry" };
  if (texts.length === 1 && texts[0] === `outline${JSON_EXT}`) return { kind: "outline" };
  if (texts.length === 1 && texts[0] === `words${JSON_EXT}`) return { kind: "words" };
  if (texts.length === 3 && texts[0] === "content") {
    const unit = stripJson(texts[2]);
    if (SLUG_RE.test(texts[1]) && unit && SLUG_RE.test(unit)) {
      return { kind: "content", edition: texts[1], unit };
    }
  }
  return null;
};
