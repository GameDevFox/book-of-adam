import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  COLLECTION_RE,
  collectionUrl,
  contentUrl,
  outlineUrl,
  registryUrl,
  SLUG_RE,
} from "../src/records/api-paths";
import type { Identified, ReviewMap } from "../src/records/reviews";
import type { CollectionData, TextsRegistry } from "../src/records/store";
import type { Edition, OutlineNode, TextUnit, Work } from "../src/records/texts";
import { arrangeByYear, type PoemEntry } from "./arrange";

/**
 * The data API's payloads, computed from the JSON files under data/ and independent of what
 * asks for them: the dev middleware (server/data-plugin.ts) answers requests with these, and
 * `emitStatic` writes the same payloads into dist/ for the published site.
 *
 * `published` is the one switch, set by the `public` build mode (src/mode.ts) — the
 * deployed site, or `yarn start:public` previewing it. Unpublished (the research view) reads
 * the gitignored data/texts/local/ (personal copies of copyrighted editions) as a fallback
 * root, lists `local-only` and `heldBack` editions and serves the review sidecars. Published
 * reads committed content only, drops those editions from the registry and the outline, and
 * serves every
 * collection with an empty review map — the first public version is read-only, and review
 * state means nothing to someone who cannot review.
 */
export type DataSourceOptions = { dataDir: string; published: boolean };

export type DataSource = {
  collectionNames: () => string[];
  collection: (name: string) => CollectionData<Identified> | null;
  registry: () => TextsRegistry;
  outline: () => OutlineNode[];
  content: (edition: string, unit: string) => TextUnit | null;
};

const REVIEWS_SUFFIX = ".reviews.json";
const JSON_SUFFIX = ".json";

/** Display order of works at the tree root (ids not listed fall to the end, in registry order). */
const WORK_ORDER = [
  "bible",
  "book-of-mormon",
  "doctrine-and-covenants",
  "pearl-of-great-price",
  "journal-of-discourses",
  "apocrypha",
];

/** Editions whose top-level books get wrapped in extra group nodes the data doesn't carry. */
const EDITION_GROUPS: Record<string, { title: string; start: number; end: number }[]> = {
  kjv: [
    { title: "Old Testament", start: 0, end: 39 },
    { title: "New Testament", start: 39, end: 66 },
  ],
};

/**
 * Editions whose menu is arranged from their readings rather than their files' order — the
 * reading units of every content file, with their notes, regrouped (arrange.ts).
 */
const EDITION_ARRANGEMENTS: Record<string, (entries: PoemEntry[]) => OutlineNode[]> = {
  "ers-lexicon": arrangeByYear,
};

const readJson = (filePath: string) => JSON.parse(readFileSync(filePath, "utf8"));

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * The unified library nav tree. Built from the content files by classifying every unit
 * STRUCTURALLY — no per-book code:
 *   - children are text leaves  → a "reading" node (clickable; renders in the pane)
 *   - children are branches     → a "group" node (expandable)
 * Depth is whatever the data is (D&C 2 deep, BoM/JoD 3, KJV+testaments 4), rendered generically.
 * Two flatten rules remove dead wrappers; one config adds grouping the data lacks (KJV OT/NT).
 */
const pruneUnit = (
  unit: TextUnit,
  edition: string,
  file: string,
  pathWithin: string[],
): OutlineNode | null => {
  const children = unit.units ?? [];
  if (children.length === 0) return null;
  const title = unit.shortTitle ?? unit.title ?? unit.id;
  const childrenAreLeaves = children.every((c) => (c.units ?? []).length === 0);
  if (childrenAreLeaves) {
    const pages = unit.meta?.pages;
    const speaker = unit.meta?.speaker;
    return {
      id: unit.id,
      title,
      kind: "reading",
      edition,
      file,
      path: pathWithin,
      ...(pages ? { pages } : {}),
      ...(speaker ? { speaker } : {}),
    };
  }
  return {
    id: unit.id,
    title,
    kind: "group",
    children: children
      .map((c) => pruneUnit(c, edition, file, [...pathWithin, c.id]))
      .filter((n): n is OutlineNode => n !== null),
  };
};

/** Drop a leading work-title prefix from an edition title ("Book of Mormon (1830)" → "1830"). */
const stripWorkPrefix = (title: string, workTitle: string) =>
  title.startsWith(workTitle)
    ? title
        .slice(workTitle.length)
        .replace(/^[\s(:–-]+/, "")
        .replace(/[)\s]+$/, "") || title
    : title;

/** Newest mtime across content files — cheap cache key so the outline rebuilds only on change. */
const maxMtime = (dir: string): number => {
  let max = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    max = Math.max(max, entry.isDirectory() ? maxMtime(full) : statSync(full).mtimeMs);
  }
  return max;
};

export const DataSource = ({ dataDir, published }: DataSourceOptions): DataSource => {
  const textsDir = path.join(dataDir, "texts");
  const worksPath = path.join(textsDir, "works.json");
  const editionsPath = path.join(textsDir, "editions.json");
  /** Committed content first, then (dev only) personal copies — same layout, same API. */
  const contentRoots = [
    path.join(textsDir, "content"),
    ...(published ? [] : [path.join(textsDir, "local")]),
  ];

  const collectionPath = (name: string) => path.join(dataDir, `${name}${JSON_SUFFIX}`);
  const reviewsPath = (name: string) => path.join(dataDir, `${name}${REVIEWS_SUFFIX}`);

  /** COLLECTION_RE admits no dot, so the "<name>.reviews" sidecars never list as collections. */
  const collectionNames = () =>
    readdirSync(dataDir)
      .filter((file) => file.endsWith(JSON_SUFFIX))
      .map((file) => file.slice(0, -JSON_SUFFIX.length))
      .filter((name) => COLLECTION_RE.test(name));

  const collection = (name: string): CollectionData<Identified> | null => {
    if (!COLLECTION_RE.test(name) || !existsSync(collectionPath(name))) return null;
    const reviews: ReviewMap =
      !published && existsSync(reviewsPath(name)) ? readJson(reviewsPath(name)) : {};
    return { records: readJson(collectionPath(name)), reviews };
  };

  const editions = (): Edition[] =>
    (readJson(editionsPath) as Edition[]).filter(
      (e) => !published || (e.licence !== "local-only" && !e.heldBack),
    );

  const contentFile = (edition: string, unit: string) =>
    contentRoots.map((dir) => path.join(dir, edition, `${unit}${JSON_SUFFIX}`)).find(existsSync);

  const content = (edition: string, unit: string): TextUnit | null => {
    if (!SLUG_RE.test(edition) || !SLUG_RE.test(unit)) return null;
    if (!editions().some((e) => e.id === edition)) return null;
    const file = contentFile(edition, unit);
    return file ? readJson(file) : null;
  };

  /**
   * The registry names only what this source can serve: works with a listed edition, and each
   * edition's contents trimmed to units found under the content roots — so in the published
   * build a unit present only in local/ is neither fetchable nor named.
   */
  const registry = (): TextsRegistry => {
    const works = readJson(worksPath) as Work[];
    const listed = editions().map((e) => ({
      ...e,
      contents: e.contents.filter((unit) => contentFile(e.id, unit)),
    }));
    return { works: works.filter((w) => listed.some((e) => e.workId === w.id)), editions: listed };
  };

  /** One edition → a group node whose children are its book/section/volume subtrees. */
  const editionNode = (edition: Edition): OutlineNode => {
    const arrange = EDITION_ARRANGEMENTS[edition.id];
    if (arrange) {
      const entries = edition.contents.flatMap((unitId) =>
        (content(edition.id, unitId)?.units ?? []).flatMap((unit) => {
          const node = pruneUnit(unit, edition.id, unitId, [unit.id]);
          return node?.kind === "reading" ? [{ node, meta: unit.meta }] : [];
        }),
      );
      return { id: edition.id, title: edition.title, kind: "group", children: arrange(entries) };
    }

    let children = edition.contents
      .map((unitId) => {
        const unit = content(edition.id, unitId);
        return unit ? pruneUnit({ ...unit, id: unitId }, edition.id, unitId, []) : null;
      })
      .filter((n): n is OutlineNode => n !== null);

    // Flatten: a lone top-unit group is a dead wrapper (D&C's single book → its sections).
    if (children.length === 1 && children[0].kind === "group")
      children = children[0].children ?? [];

    // Insert configured grouping the data lacks (KJV → Old/New Testament).
    const groups = EDITION_GROUPS[edition.id];
    if (groups) {
      children = groups.map((g) => ({
        id: slugify(g.title),
        title: g.title,
        kind: "group" as const,
        children: children.slice(g.start, g.end),
      }));
    }
    return { id: edition.id, title: edition.title, kind: "group", children };
  };

  /** Assemble the whole library: works at the root; single-edition works collapse to their contents. */
  const buildOutline = (): OutlineNode[] => {
    const works = readJson(worksPath) as Work[];
    const allEditions = editions();
    const rank = (id: string) => {
      const i = WORK_ORDER.indexOf(id);
      return i === -1 ? WORK_ORDER.length : i;
    };
    const orderedWorks = works
      .map((w, i) => ({ w, i }))
      .sort((a, b) => rank(a.w.id) - rank(b.w.id) || a.i - b.i);

    const nodes: OutlineNode[] = [];
    for (const { w: work } of orderedWorks) {
      const workEditions = allEditions.filter((e) => e.workId === work.id);
      if (workEditions.length === 0) continue;
      const workTitle = work.title.replace(/^The\s+/i, "");
      const children =
        workEditions.length === 1
          ? (editionNode(workEditions[0]).children ?? [])
          : workEditions.map((e) => ({
              ...editionNode(e),
              title: stripWorkPrefix(e.title, workTitle),
            }));
      nodes.push({ id: work.id, title: workTitle, kind: "group", children });
    }
    return nodes;
  };

  let outlineCache: { key: number; tree: OutlineNode[] } | null = null;
  const outline = (): OutlineNode[] => {
    const key = Math.max(
      statSync(editionsPath).mtimeMs,
      statSync(worksPath).mtimeMs,
      ...contentRoots.filter(existsSync).map(maxMtime),
    );
    if (!outlineCache || outlineCache.key !== key) outlineCache = { key, tree: buildOutline() };
    return outlineCache.tree;
  };

  return { collectionNames, collection, registry, outline, content };
};

/**
 * Write every GET payload into `outDir` at the path the client fetches (api-paths.ts), so the
 * published app works unchanged with no server. Content is emitted per registered unit of
 * each listed edition — the same set the outline links to. Returns the URLs written.
 */
export const emitStatic = (source: DataSource, outDir: string): string[] => {
  const written: string[] = [];
  const write = (url: string, body: unknown) => {
    const file = path.join(outDir, ...url.split("/").filter(Boolean));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
    written.push(url);
  };

  for (const name of source.collectionNames()) write(collectionUrl(name), source.collection(name));
  const registry = source.registry();
  write(registryUrl, registry);
  write(outlineUrl, source.outline());
  for (const edition of registry.editions) {
    for (const unit of edition.contents) {
      const body = source.content(edition.id, unit);
      if (body) write(contentUrl(edition.id, unit), body);
    }
  }
  return written;
};
