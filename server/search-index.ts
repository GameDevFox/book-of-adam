import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readingUrl, readings } from "../src/library/citations";
import { unitLabel } from "../src/library/labels";
import { quotationFor, type Passage } from "../src/library/quotation";
import { searchWords } from "../src/library/search-words";
import { passageNumber } from "../src/library/selection";
import { SEARCH_INDEX_BASE, wordsUrl } from "../src/records/api-paths";
import { resolveUnit, type OutlineNode, type TextUnit } from "../src/records/texts";
import type { DataSource } from "./data-source";

/**
 * The full-text search index (docs/design/full-text-search.md): one Pagefind page per reading
 * (chapter, discourse, poem), each passage a sub-result under a heading carrying its id.
 *
 * searchPages() reads the corpus through the DataSource, so the index holds exactly what the
 * Library serves (the held-back / local-only rule lives in data-source.ts alone). pageHtml() and
 * wordCounts() are pure; buildSearchIndex() is the only code that drives Pagefind.
 */

export type SearchPassage = { id: string; text: string; reference: string };
export type SearchPage = {
  url: string;
  title: string;
  /** Is the title the text's own (a discourse's, a poem's) rather than a label like "Chapter 3"? */
  titleIndexed: boolean;
  /** The whole reading's citation, shown for a match in its title. */
  reference: string;
  passages: SearchPassage[];
};
export type IndexFile = { path: string; content: Uint8Array };

/** Pagefind reads "God—the" as one word, so the indexed copy spaces every em-dash. */
const EM_DASH_RE = /—/g;
const spaced = (text: string) => text.replace(EM_DASH_RE, " — ");

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ESCAPES[c]);

export const pageHtml = (page: SearchPage): string => {
  const refs = Object.fromEntries(page.passages.map((p) => [p.id, p.reference]));
  // Metadata sits outside the indexed body: a reference ("Brigham Young, JD 1:62") on every
  // paragraph would make a search for the speaker match each one.
  const meta = [
    `<div data-pagefind-meta="title">${escapeHtml(page.title)}</div>`,
    `<div data-pagefind-meta="reference">${escapeHtml(page.reference)}</div>`,
    `<div data-pagefind-meta="refs">${escapeHtml(JSON.stringify(refs))}</div>`,
  ].join("");
  // The heading's number is what makes a passage a sub-result (Pagefind drops an empty or
  // ignored heading's anchor), and it keeps a phrase from matching across two passages.
  const passages = page.passages
    .map(
      (p) =>
        `<h2 id="${escapeHtml(p.id)}">${escapeHtml(unitLabel(p.id))}</h2><p>${escapeHtml(spaced(p.text))}</p>`,
    )
    .join("");
  const heading = page.titleIndexed ? `<h1>${escapeHtml(spaced(page.title))}</h1>` : "";
  return `<html lang="en"><body>${meta}<main data-pagefind-body>${heading}${passages}</main></body></html>`;
};

/** Word → how many passages (and indexed titles) hold it: the list spelling correction uses. */
export const wordCounts = (pages: SearchPage[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  const count = (text: string) => {
    for (const word of new Set(searchWords(text))) counts[word] = (counts[word] ?? 0) + 1;
  };
  for (const page of pages) {
    if (page.titleIndexed) count(page.title);
    for (const passage of page.passages) count(passage.text);
  }
  return counts;
};

export const searchPages = (source: DataSource): SearchPage[] => {
  const files = new Map<string, TextUnit | null>();
  const fileOf = (edition: string, file: string) => {
    const key = `${edition}/${file}`;
    if (!files.has(key)) files.set(key, source.content(edition, file));
    return files.get(key) ?? null;
  };

  return readings(source.outline()).flatMap((node) => {
    const { edition, file } = node;
    const book = edition && file ? fileOf(edition, file) : null;
    const chapter = book ? resolveUnit(book, node.path ?? []) : null;
    if (!edition || !file || !book || !chapter) return [];
    const passages: Passage[] = (chapter.units ?? []).flatMap((unit) => {
      const n = passageNumber(unit.id);
      return n !== null && unit.text ? [{ n, unit }] : [];
    });
    if (passages.length === 0) return [];
    const cite = (selected: Passage[]) =>
      quotationFor({ edition, file, book, chapter, passages: selected }).reference;
    return [
      {
        url: readingUrl(node),
        title: chapter.title ?? node.title,
        // The reading pane's own rule: a unit with meta (a discourse, a poem) has a real title.
        titleIndexed: Boolean(chapter.meta && chapter.title),
        reference: cite(passages),
        passages: passages.map((p) => ({
          id: p.unit.id,
          text: p.unit.text ?? "",
          reference: cite([p]),
        })),
      },
    ];
  });
};

/** The Pagefind index for these pages, in memory: the files to serve under /pagefind/. */
export const buildSearchIndex = async (pages: SearchPage[]): Promise<IndexFile[]> => {
  // Loaded on demand: Pagefind starts a native binary, which no test or plain dev run needs.
  const pagefind = await import("pagefind");
  const { index, errors } = await pagefind.createIndex({});
  if (!index) throw new Error(`pagefind: ${errors.join("; ")}`);
  try {
    for (const page of pages) {
      const added = await index.addHTMLFile({ url: page.url, content: pageHtml(page) });
      if (added.errors.length) throw new Error(`pagefind ${page.url}: ${added.errors.join("; ")}`);
    }
    const { files, errors: written } = await index.getFiles();
    if (written.length) throw new Error(`pagefind: ${written.join("; ")}`);
    return files;
  } finally {
    await pagefind.close();
  }
};

export type SearchCorpus = {
  words: () => Record<string, number>;
  /** The index files; built once per corpus version (about 25 s for the whole Library). */
  files: () => Promise<IndexFile[]>;
};

/**
 * The search payloads for one DataSource, rebuilt whenever its outline changes — the outline is
 * cached until a content file changes, so in dev an edited text is searchable on the next
 * request rather than after a restart.
 */
export const SearchCorpus = (source: DataSource): SearchCorpus => {
  type Version = {
    outline: OutlineNode[];
    pages: SearchPage[];
    words?: Record<string, number>;
    files?: Promise<IndexFile[]>;
  };
  let version: Version | null = null;
  const current = (): Version => {
    const outline = source.outline();
    if (version?.outline !== outline) version = { outline, pages: searchPages(source) };
    return version;
  };
  return {
    words: () => {
      const v = current();
      v.words ??= wordCounts(v.pages);
      return v.words;
    },
    files: () => {
      const v = current();
      // A failed build is not kept, so the next request tries again.
      v.files ??= buildSearchIndex(v.pages).catch((error) => {
        v.files = undefined;
        throw error;
      });
      return v.files;
    },
  };
};

/** Write the word list and the Pagefind index into a static build. Returns the paths written. */
export const emitSearch = async (corpus: SearchCorpus, outDir: string): Promise<string[]> => {
  const write = (url: string, body: string | Uint8Array) => {
    const file = path.join(outDir, ...url.split("/").filter(Boolean));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    return url;
  };
  const files = await corpus.files();
  return [
    write(wordsUrl, JSON.stringify(corpus.words())),
    ...files.map((f) => write(`${SEARCH_INDEX_BASE}/${f.path}`, f.content)),
  ];
};
