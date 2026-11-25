import { searchIndexEntry, wordsUrl } from "../records/api-paths";
import { VERSE_PARAM } from "./reference";
import { searchWords } from "./search-words";
import { passageNumber } from "./selection";
import { planQuery, type QueryPlan, type WordCounts } from "./text-query";

/**
 * The full-text search in the browser (docs/design/full-text-search.md): what was typed →
 * planQuery's phrases → Pagefind → passage hits. runPlan is the only code that queries Pagefind;
 * the pure pieces (hitsOf, excerptParts, mergeRanked) are tested without it.
 */

export const SEARCH_SEGMENT = "search";
export const QUERY_PARAM = "q";
export const searchUrl = (text: string) =>
  `/library/${SEARCH_SEGMENT}?${QUERY_PARAM}=${encodeURIComponent(text.trim())}`;

/** The parts of Pagefind's API used here (pagefind.js has no published types). */
type PagefindSubResult = { title: string; url: string; excerpt: string };
/** A heading Pagefind found; `location` is its word position in `content`. */
type PagefindAnchor = { element: string; id: string; location: number };
export type PagefindData = {
  url: string;
  /** The reading's indexed text; split on spaces, its words are Pagefind's word positions. */
  content: string;
  anchors: PagefindAnchor[];
  meta: Record<string, string>;
  sub_results: PagefindSubResult[];
};
export type PagefindPage = { id: string; score: number; data: () => Promise<PagefindData> };
type Pagefind = {
  init: () => Promise<void>;
  search: (query: string) => Promise<{ results: PagefindPage[] }>;
};

export type ExcerptPart = { text: string; marked: boolean };
export type PassageHit = {
  key: string;
  url: string;
  reference: string;
  /** The match is in the reading's title, not one of its passages. */
  inTitle: boolean;
  excerpt: ExcerptPart[];
};

const MARK_RE = /<mark>(.*?)<\/mark>/g;
/** Pagefind escapes these in excerpts; a bare "&" it leaves as it is. */
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', "#39": "'" };
const ENTITY_RE = /&(lt|gt|amp|quot|#39);/g;
const decode = (text: string) => text.replace(ENTITY_RE, (_, name: string) => ENTITIES[name]);

/** Pagefind's excerpt HTML → plain and marked runs, rendered as text (never as HTML). */
export const excerptParts = (html: string): ExcerptPart[] => {
  const parts: ExcerptPart[] = [];
  let at = 0;
  for (const match of html.matchAll(MARK_RE)) {
    if (match.index > at) parts.push({ text: decode(html.slice(at, match.index)), marked: false });
    parts.push({ text: decode(match[1]), marked: true });
    at = match.index + match[0].length;
  }
  if (at < html.length) parts.push({ text: decode(html.slice(at)), marked: false });
  return parts;
};

const parseRefs = (json: string | undefined): Record<string, string> => {
  try {
    return json ? (JSON.parse(json) as Record<string, string>) : {};
  } catch {
    return {};
  }
};

/** Pagefind's own hits, used when the scan finds nothing (a match on a stem only). */
const subResultHits = (data: PagefindData, refs: Record<string, string>): PassageHit[] =>
  data.sub_results.map((sub) => {
    const [base, id] = sub.url.split("#");
    // Pagefind starts each excerpt with its section's heading ("¶50. …"): the reference says it.
    const lead = `${sub.title}. `;
    const excerpt = excerptParts(
      sub.excerpt.startsWith(lead) ? sub.excerpt.slice(lead.length) : sub.excerpt,
    );
    if (!id) {
      const reference = data.meta.reference ?? sub.title;
      return { key: sub.url, url: base, reference, inTitle: true, excerpt };
    }
    const n = passageNumber(id);
    const url = n === null ? base : `${base}?${VERSE_PARAM}=${n}`;
    return { key: sub.url, url, reference: refs[id] ?? sub.title, inTitle: false, excerpt };
  });

/** Words of context either side of a match in its excerpt. */
const EXCERPT_CONTEXT_WORDS = 12;
const ELLIPSIS = "…";

/** words[from, to) as excerpt runs, the words in `marked` highlighted, "…" where cut. */
const excerptOf = (
  words: string[],
  from: number,
  to: number,
  cutStart: boolean,
  cutEnd: boolean,
  marked: Set<number>,
): ExcerptPart[] => {
  const parts: ExcerptPart[] = [];
  const push = (text: string, mark: boolean) => {
    const last = parts.at(-1);
    if (last && last.marked === mark) last.text += text;
    else parts.push({ text, marked: mark });
  };
  if (cutStart) push(`${ELLIPSIS} `, false);
  for (let i = from; i < to; i++) {
    if (i > from) push(" ", marked.has(i - 1) && marked.has(i));
    push(words[i], marked.has(i));
  }
  if (cutEnd) push(` ${ELLIPSIS}`, false);
  return parts;
};

/**
 * One indexed reading → every passage holding one of the phrases (word sequences), and its title
 * if that holds one. Pagefind finds the right readings, but in exact-phrase mode reports only the
 * first occurrence in each, so the reading's own text is scanned for the rest. A reading where
 * the scan finds nothing matched on a stem only ("covenants"), and keeps Pagefind's own hit.
 */
export const hitsOf = (data: PagefindData, phrases: string[][]): PassageHit[] => {
  const refs = parseRefs(data.meta.refs);
  // Pagefind's positions count space-separated chunks; one chunk can hold two words when the
  // source lost a space ("God,and"), so the scan runs over words, each knowing its chunk.
  const words = data.content.split(/\s+/).filter(Boolean);
  const flat = words.flatMap((chunk, at) => searchWords(chunk).map((key) => ({ key, at })));
  const marked = new Set<number>();
  const matches: { start: number; end: number }[] = [];
  flat.forEach((_, i) => {
    for (const phrase of phrases) {
      if (phrase.length > 0 && phrase.every((w, j) => flat[i + j]?.key === w)) {
        const chunks = phrase.map((_w, j) => flat[i + j].at);
        matches.push({ start: chunks[0], end: chunks[chunks.length - 1] + 1 });
        chunks.forEach((at) => marked.add(at));
      }
    }
  });
  if (matches.length === 0) return subResultHits(data, refs);

  const headings = data.anchors
    .filter((a) => a.element === "h2")
    .sort((a, b) => a.location - b.location);
  // Each region: the title before the first heading, then each passage after its heading.
  const regions = [
    { id: null as string | null, from: 0, to: headings[0]?.location ?? words.length },
    ...headings.map((h, i) => ({
      id: h.id as string | null,
      from: h.location + 1,
      to: headings[i + 1]?.location ?? words.length,
    })),
  ];
  return regions.flatMap(({ id, from, to }): PassageHit[] => {
    const first = matches.find((m) => m.start >= from && m.start < to);
    if (!first) return [];
    const start = Math.max(from, first.start - EXCERPT_CONTEXT_WORDS);
    const end = Math.min(to, first.end + EXCERPT_CONTEXT_WORDS);
    const excerpt = excerptOf(words, start, end, start > from, end < to, marked);
    if (id === null) {
      return [
        {
          key: data.url,
          url: data.url,
          reference: data.meta.reference ?? data.meta.title,
          inTitle: true,
          excerpt,
        },
      ];
    }
    const n = passageNumber(id);
    return [
      {
        key: `${data.url}#${id}`,
        url: n === null ? data.url : `${data.url}?${VERSE_PARAM}=${n}`,
        reference: refs[id] ?? id,
        inTitle: false,
        excerpt,
      },
    ];
  });
};

/** The word sequences a plan searches for: its phrases without their quotes. */
export const phraseWords = (plan: QueryPlan): string[][] =>
  plan.phrases.map((p) => p.replace(/^"|"$/g, "").split(" ").filter(Boolean));

/** Several phrases' results → each page once, at its best score, best first. */
export const mergeRanked = <T extends { id: string; score: number }>(lists: T[][]): T[] => {
  const best = new Map<string, T>();
  for (const result of lists.flat()) {
    const seen = best.get(result.id);
    if (!seen || result.score > seen.score) best.set(result.id, result);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
};

export const runPlan = async (plan: QueryPlan, pagefind: Pagefind): Promise<PagefindPage[]> =>
  mergeRanked(await Promise.all(plan.phrases.map(async (p) => (await pagefind.search(p)).results)));

// Both loaded on the first search only, and kept; a failure is not kept, so a retry can work.
let words: Promise<WordCounts> | null = null;
let pagefind: Promise<Pagefind> | null = null;

const loadWords = (): Promise<WordCounts> => {
  words ??= fetch(wordsUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`word list: HTTP ${res.status}`);
      return res.json() as Promise<Record<string, number>>;
    })
    .then((counts) => new Map(Object.entries(counts)));
  return words.catch((error) => {
    words = null;
    throw error;
  });
};

const loadPagefind = (): Promise<Pagefind> => {
  // A runtime URL, not a module Vite should bundle: the index is built beside the app.
  pagefind ??= import(/* @vite-ignore */ searchIndexEntry).then(async (pf: Pagefind) => {
    await pf.init();
    return pf;
  });
  return pagefind.catch((error) => {
    pagefind = null;
    throw error;
  });
};

export type TextSearch = { plan: QueryPlan; pages: PagefindPage[] };

export const searchText = async (text: string): Promise<TextSearch> => {
  const plan = planQuery(text, await loadWords());
  const pages = plan.phrases.length ? await runPlan(plan, await loadPagefind()) : [];
  return { plan, pages };
};

export const loadHits = async (pages: PagefindPage[], plan: QueryPlan): Promise<PassageHit[]> => {
  const phrases = phraseWords(plan);
  return (await Promise.all(pages.map((page) => page.data()))).flatMap((data) =>
    hitsOf(data, phrases),
  );
};
