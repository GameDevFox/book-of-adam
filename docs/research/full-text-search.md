# Full-text search — research (2026-10-25)

The second search pass: find passages by their words, not by reference. Research only; no
decision yet. The first pass (reference jump, `src/library/reference.ts`) is live. Both
candidate engines were prototyped on 2026-11-22: see "Prototype results".

## What we are searching

The published corpus, measured from `data/texts/content/` (held-back editions excluded):

| Edition                | Passages    | Words      | Text        |
| ---------------------- | ----------- | ---------- | ----------- |
| Journal of Discourses  | 52,226      | 5.94 M     | 32.0 MB     |
| KJV Bible              | 31,102      | 0.79 M     | 4.1 MB      |
| Book of Mormon         | 6,611       | 0.27 M     | 1.4 MB      |
| KJV Apocrypha          | 5,717       | 0.14 M     | 0.7 MB      |
| Eliza R. Snow poems    | 3,803       | 0.14 M     | 0.8 MB      |
| Doctrine and Covenants | 3,654       | 0.11 M     | 0.6 MB      |
| Pearl of Great Price   | 635         | 0.03 M     | 0.1 MB      |
| **Total**              | **103,748** | **7.42 M** | **39.8 MB** |

Constraints that decide the design:

- **No server.** The site is static files on S3 + CloudFront (`docs/deploy.md`). Whatever
  answers a query runs in the reader's browser, or is a new piece of infrastructure.
- **The JoD is 80% of the words.** A design that is fine for the scriptures alone (5 MB) is not
  automatically fine for the whole corpus.
- **Phrases matter.** Real use is phrase-shaped: `docs/research/new-and-everlasting-covenant-jd.md`
  is one exact phrase traced across 26 volumes. A search that ORs words together cannot do that.
- **Publishable.** No copyleft code (README, "Publishing constraints").

## How search engines work (the parts that matter here)

- **Inverted index.** For every word, the list of passages containing it (a _postings list_).
  A query looks up its words instead of scanning text. Lucene, Elasticsearch, SQLite FTS and
  every static-site search tool are built on this.
- **Positions.** Storing _where_ in the passage each word occurs enables phrase search
  ("new and everlasting covenant" as consecutive words) and proximity ("faith" within 5 words of
  "works"). It roughly doubles the index.
- **Analysis.** Text is normalised before indexing: case-folding, punctuation, diacritics,
  usually _stemming_ (Snowball: covenants/covenanted → covenant). Archaic spellings (hath, shew,
  doth) are a corpus-specific wrinkle; stemming does not fold them, a synonym list could.
- **Ranking.** BM25 is the standard relevance score: term frequency with saturation, rarer
  words count more, long passages are normalised. For scripture, reading order (book, chapter,
  verse) is often wanted instead of relevance — a concordance view.
- **Semantic search.** Each passage becomes a vector (an _embedding_) from a language model;
  a query's vector finds passages close in meaning, even with no shared words ("loaves and
  fishes" → the feeding of the five thousand). _Hybrid_ search runs keyword and semantic
  together and merges the rankings (reciprocal rank fusion).

## Options for a static site

### A. One in-memory index — MiniSearch, FlexSearch, Lunr, Orama

The whole index downloads and lives in memory. MiniSearch, Lunr (MIT), FlexSearch and Orama
(Apache-2.0) all work this way.

- **For:** simplest; instant queries once loaded; good fuzzy/prefix matching.
- **Against:** the index is a sizeable fraction of the 40 MB text — far too much to make every
  visitor download. Only workable per work (the scriptures alone, ~5 MB of text) or as a
  research-view-only tool. No published, comparable index-size benchmark was found; it would
  have to be measured on our corpus.

### B. A chunked static index — Pagefind (MIT)

Built for exactly this case: the index is split into many small files, and a query fetches only
the chunks for its words. Its site claims a 10,000-page site searches with under 300 kB total
transfer, library included. A Node API (`addCustomRecord`) indexes content that is not HTML, so
it can be fed our JSON directly. It returns sub-results per section of a page, filters (facets
— by work, speaker, decade), and tunable BM25-like ranking (term frequency, saturation, length
normalisation, title weight).

- **For:** made for static hosting; small per-query transfer; maintained (1.5.0 current);
  filters fit our data; borrow, not build.
- **Unknown — must be tested:** phrase search. Its ranking docs do not mention phrases or
  stemming, and an open issue (#329) reports that it treats all terms as ORed. If it cannot match
  an exact phrase it fails our main use. Also noted: an issue (#1351) where prefix fallback only
  checks chunks already loaded, so results can vary by session.
- **Unknown:** how it behaves at 104k passages / 7.4 M words — far past the 10,000 pages it
  advertises. Index size on disk and per-query transfer need measuring.

### C. SQLite FTS5 over HTTP range requests — sql.js-httpvfs (Apache-2.0)

A SQLite database file on the CDN; SQLite compiled to WebAssembly reads only the pages of the
file a query touches, by HTTP range request. The author's demo queries a 670 MB database with
about 1 KB transferred for a key lookup.

- **For:** the richest query language of any option — exact phrases, `NEAR` proximity,
  prefix, AND/OR/NOT, `bm25()` ranking, `snippet()` highlighting — all built into FTS5. One file,
  one build step from our JSON.
- **Against:** the library is in maintenance mode (last change August 2024) and needs a
  custom build with FTS5 enabled; a full-text query walks many index pages, so dozens of small
  requests per search; the database (text + positional index) would be on the order of 100 MB on
  the CDN, though readers fetch only slivers. Needs CloudFront to pass range requests (S3
  supports them).

### D. Semantic search in the browser

Two shapes:

- **A neural model in the browser** (Transformers.js with a small model such as gte-small):
  tens of MB of model plus per-query inference. Heavy for a casual visitor.
- **A static embedding model** — e.g. `sentence-transformers/static-retrieval-mrl-en-v1`
  (Apache-2.0): the "model" is a lookup table averaged over word pieces, no neural network at
  query time; reported ~87% of the quality of all-mpnet-base-v2 and 100–400× faster on CPU;
  Matryoshka-trained, so vectors truncate to 256 or fewer dimensions. Searchpack demonstrates the
  whole pipeline (256-bit binary codes for a first pass, int8 rescoring, BM25 fused in) — but it is
  **AGPL**, so the technique can be borrowed and the code cannot.

Size for our corpus, at 103,748 passages: 256-dim int8 vectors ≈ 27 MB; 256-bit binary codes ≈
3.3 MB; plus the model's table (searchpack reports ~31 MB, one-time and cacheable). Workable as an
opt-in "search by meaning" mode, not as the default.

### E. A search server

Lambda + a hosted index (OpenSearch, Typesense, Meilisearch, Turso). Every capability, any
corpus size — and new infrastructure, cost and an AWS change for the owner to review. Nothing
above has been ruled out badly enough to need it.

## Where this points

1. **Prototype Pagefind on the whole corpus first** — an hour's work with `addCustomRecord`,
   one record per chapter/discourse with each verse/paragraph as a sub-result. Measure: index
   size, transfer per query, and above all **whether "new and everlasting covenant" finds the
   phrase** and not merely the words.
2. **If phrases fail, SQLite FTS5 is the fallback** — it does phrases and proximity natively; the
   cost is a maintenance-mode library and chattier queries.
3. **Semantic search later, opt-in**, with a static embedding model and hybrid ranking — the
   searchpack technique, written ourselves.

Either way the search box is the header field that exists now: a typed reference still jumps
(`reference.ts`), anything else becomes a text search — the parser and the search engine stay
separate functions behind one field (design principle 1).

## Prototype results (2026-11-22)

Both engines were built over the whole published corpus (103,748 passages, 3,674
chapters/discourses/poems) and checked against a regex ground truth over the same passages. The
scripts are throwaway, in the gitignored `tmp/search-proto/`.

**Pagefind 1.5.0 does exact phrases, when the phrase is quoted.** `"new and everlasting covenant"`
returned 52 pages, the same 52 the ground truth gives, and every one of the first 20 was a real
hit. Issue #329 (terms ORed together) describes the unquoted query: that form returned 293 pages,
with only 6 of the first 20 on target. So the UI should quote multi-word input by default.

| Measured (cold, first page of 20) | Pagefind 1.5.0                                           | SQLite FTS5                            |
| --------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| On the CDN                        | 42 MB, 4,036 files (17 MB index + 25 MB fragments)       | 68 MB, one file (~40 MB of it is text) |
| Once per visit                    | 159 KB, 5 requests                                       | the wasm library (not measured)        |
| "new and everlasting covenant"    | 95 KB, 25 requests                                       | ~880 KB read in 4 KB pages             |
| "the spirit of god"               | 141 KB, 22 requests                                      | ~2.5 MB read                           |
| "and it came to pass"             | 230 KB, 23 requests                                      | —                                      |
| Result granularity                | passage: sub-results land on the paragraph (`…/d16#p50`) | passage (one row each)                 |
| Slack ("new and an everlasting")  | no — only as its own quoted query                        | yes, `NEAR`                            |
| Typo inside a phrase              | 0 results                                                | 0 results                              |
| Build time                        | 24 s                                                     | about a minute                         |

The FTS5 transfer figures are bytes SQLite read locally (`/proc/self/io`), which approximates what
range requests would fetch. Most of that is the posting lists of common words ("and", "the").
Measured on desktop SQLite 3.53. The browser library's wasm (sql.js-httpvfs 0.8.12) contains
FTS5 symbols, so the "custom build" concern above is probably unfounded, but it was not run.

**FTS5 `NEAR` counts the middle words.** `NEAR(a b c d, N)` caps every token between the first
and last word, the middle words included, so allowing _k_ extra words needs N = (word count − 2)

- _k_. With N = 4 it found exactly the 74 ground-truth passages for "new … everlasting …
  covenant", among them "new and **and** everlasting covenant" (a typo in the source) and
  "everlasting **gospel and** covenant".

**Spelling correction belongs in front of the engine, and it works.** Neither engine is fuzzy
inside a phrase, so each query word is checked against the corpus's own word list: 36,688 words,
102 KB gzipped, small enough to send to the browser. A word not in the list becomes the nearest
listed words: 1 typo for 3–4 letters, 2 for longer words, up to 3 spellings, ties broken by how
common the word is. `New And Everlating Covenant`, `new and everlastin covnant` and `nwe and
everlasting covenant` all found the same 69 exact passages. `nwe` became we/new/owe, and the
phrase match discarded the wrong ones. A phrase with several corrected words is run once per
combination of spellings, ORed together.

**Joined words: Pagefind reads an unspaced em-dash as part of a word.** Quoted "the spirit of god"
first returned 575 pages against the ground truth's 580. Six pages were missing, and every one
had an em-dash with no spaces touching the phrase ("the Spirit of God—the Spirit of", "upon their
missions—the Spirit of God"). Pagefind indexes "God—the" as one word. The corpus has 16,210 such
dashes (JoD style), so this affects any phrase next to one. **Fix:** the index build puts spaces
around every em-dash in the indexed copy only. The reader still sees the original. After that,
all 580 were found. The one remaining extra page (JD 4, "The Emigrating Saints Were Prompted By
The Spirit of God") is correct: the phrase is in its title, which Pagefind indexes and the ground
truth didn't check. "new and everlasting covenant" stayed at 52/52.

**Hyphens: Pagefind joins the parts, so the query must too.** A hyphenated word is indexed with
its parts joined: `latter-day` → `latterday`, `long-suffering` = `longsuffering` (both forms
find all 106 + 35 pages). Hyphens are the second most common word-joiner (12,176; `latter-day`
alone 5,553). But a quoted query typed with a space, "latter day saints", finds 3 pages against
the 1,037 that read "Latter-day Saints". **Fix, in the correction layer:** when two neighbouring
query words, joined, form a word in the list, also try the joined form. The word list must be
built the same way Pagefind tokenizes, with hyphens dropped rather than split.

The prototype's passage headings leaked into excerpts, which a real build avoids with
`data-pagefind-ignore`.

**Where this leaves it:** Pagefind plus the correction layer covers exact phrases, typos and
capitalisation at a tenth of FTS5's transfer. Its gap is slack and proximity. FTS5 is the upgrade
if that gap turns out to matter, and the correction layer carries over unchanged.

## Sources

- Pagefind: [site](https://pagefind.app/), [Node API](https://pagefind.app/docs/node-api/),
  [ranking](https://pagefind.app/docs/ranking/), [repo (MIT)](https://github.com/Pagefind/pagefind),
  issues [#329](https://github.com/Pagefind/pagefind/issues/329),
  [#802](https://github.com/Pagefind/pagefind/issues/802),
  [#1351](https://github.com/Pagefind/pagefind/issues/1351)
- sql.js-httpvfs: [author's write-up](https://www.gwern.net/docs/www/phiresky.github.io/2064590d6539dd345540a94047b7abfc5f16fbe3.html),
  [npm](https://npmjs.com/package/sql.js-httpvfs),
  [2026 walkthrough](https://recca0120.github.io/en/2026/03/07/sql-js-httpvfs-static-hosting/),
  [notes](https://notes.billmill.org/databases/sqlite/Statically_hosted_sqlite_with_range_queries.html)
- Semantic: [static-retrieval-mrl-en-v1](https://huggingface.co/sentence-transformers/static-retrieval-mrl-en-v1),
  [searchpack](https://github.com/ben-gy/searchpack),
  [Transformers.js semantic search](https://machinelearningmastery.com/building-semantic-search-with-transformers-js-and-sentence-embeddings/),
  [PGlite + Transformers.js](https://supabase.com/blog/in-browser-semantic-search-pglite)
- In-memory libraries: [MiniSearch](https://best-of-web.builder.io/library/lucaong/minisearch),
  [FlexSearch](https://github.com/nextapps-de/flexsearch),
  [Lunr](https://best-of-web.builder.io/library/olivernn/lunr.js)
