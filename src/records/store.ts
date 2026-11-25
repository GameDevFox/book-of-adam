import { collectionUrl, contentUrl, outlineUrl, registryUrl, reviewsUrl } from "./api-paths";
import type { Identified, ReviewInput, ReviewMap } from "./reviews";
import type { Edition, OutlineNode, TextUnit, Work } from "./texts";

/**
 * The first public version is read-only, so this is the public-build flag (src/mode.ts) under
 * the name its call sites mean. vite.config.ts `define`s it as a literal, so everything behind
 * `!READ_ONLY` — review controls, status, research hints — is dead code the minifier removes
 * from the published bundle, not UI that is merely hidden.
 */
export const READ_ONLY: boolean = import.meta.env.PUBLIC_BUILD;

/** What the data API serves: the facts plus the fact-path → review sidecar table. */
export type CollectionData<T extends Identified> = {
  records: T[];
  reviews: ReviewMap;
};

const responseError = async (res: Response): Promise<Error> => {
  const body = await res.text().catch(() => "");
  return new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`);
};

/**
 * The published site's SPA fallback answers a missing file with index.html and a 200, so an
 * ok status alone does not mean data arrived — check the type before parsing.
 */
const readJson = async (res: Response) => {
  if (!res.ok) throw await responseError(res);
  if (!res.headers.get("Content-Type")?.includes("json")) throw new Error(`no data at ${res.url}`);
  return res.json();
};

export const fetchCollection = async <T extends Identified>(
  collection: string,
): Promise<CollectionData<T>> => readJson(await fetch(collectionUrl(collection)));

export type TextsRegistry = { works: Work[]; editions: Edition[] };

export const fetchTexts = async (): Promise<TextsRegistry> => readJson(await fetch(registryUrl));

export const fetchTextContent = async (edition: string, unit: string): Promise<TextUnit> =>
  readJson(await fetch(contentUrl(edition, unit)));

export const fetchOutline = async (): Promise<OutlineNode[]> => readJson(await fetch(outlineUrl));

/** Posts a batch of review actions; the server persists them as one write. */
export const postReviews = async <T extends Identified>(
  collection: string,
  inputs: ReviewInput[],
): Promise<CollectionData<T>> => {
  const res = await fetch(reviewsUrl(collection), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
  if (!res.ok) throw await responseError(res);
  return res.json();
};
