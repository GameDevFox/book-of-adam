# Full-text search — design

Find passages by their words: type `new and everlasting covenant` (or `New And Everlating
Covenant`) in the header and get every verse, JoD paragraph and poem stanza that contains the
phrase, each linking to the passage itself. This is the second search pass. The first, the
reference jump (`src/library/reference.ts`), stays as it is behind the same field.

Why this engine and these fixes: [docs/research/full-text-search.md](../research/full-text-search.md),
especially "Prototype results" (2026-11-22). In short: **Pagefind**, a static chunked index that
needs no server, does exact phrases when the phrase is quoted. It costs about 160 KB once per
visit, then 50–230 KB per first page of results. Neither Pagefind nor FTS5 forgives a typo inside
a phrase, so **spelling correction runs in the browser before the query**, against the corpus's
own word list.

## Scope

**v1 (this design):**

- An exact-phrase search over every published passage, typo- and case-tolerant.
- One results page, addressable by URL, listing passages with highlighted excerpts and links that
  open and select the passage.
- The header field routes a typed reference to the jump and everything else to the search.

**Deferred, decided now** (each is a follow-on in TODO.md, none needs v1 rebuilt):

- **Filters** (by work, by JoD speaker, by decade). Pagefind supports them. Add the
  `data-pagefind-filter` attributes when the filter UI is built, not before.
- **Slack and proximity** ("new and _an_ everlasting covenant", "faith" within 5 words of
  "works"). Pagefind cannot do this. FTS5 is the upgrade path, and the query layer carries over.
- **"Any of these words" mode**, and a fallback to it when a phrase finds nothing.
- **Concordance order** (reading order rather than relevance).
- **Archaic-spelling synonyms** (shew/show, hath/has). A hand-kept, reviewable data file once a
  real miss shows which pairs matter.
- **Search by meaning** (embeddings). Opt-in, later.
- **Topic pages.** These are the second caller of the search engine (see Design principles).
- **Immutable caching** of Pagefind's content-hashed files (see Deploy).

## How a query flows

```
header field ──► isReference(text)? ──yes──► referenceUrl(text) ──► navigate (as today)
                     │ no
                     ▼
     navigate to /library/search?q=<text>
                     │
                     ▼
  planQuery(text, words) ──► { phrases: [...], corrections: [...] }   pure, unit-tested
                     │
                     ▼
  runPlan(plan, pagefind) ──► passages, merged and de-duplicated      the only Pagefind caller
                     │
                     ▼
            results page (excerpts, "showing results for …")
```

## Build: the index

**`server/search-index.ts`**, called from `data-plugin.ts`'s `closeBundle` beside `emitStatic`.

- **The same published set as the data API.** It reads passages through `DataSource({ published })`,
  so the held-back and local-only rule is written once (`server/data-source.ts`) and the index
  cannot drift from what the Library serves.
- **One Pagefind page per group**, the parent of a passage: a chapter, a discourse or a poem.
  3,674 in the public corpus, indexed in about 25 s. The pages come from the outline's readings
  (`readings()`), so every hit is a page the menu links. Each passage is a heading followed by
  its text. The heading's id is the passage id (`7`, `p50`, `s3`), and its text is the passage's
  number as the reader sees it (`¶50`). Pagefind drops the anchor of an empty or
  `data-pagefind-ignore`d heading, so the number has to be indexed. That costs little, and it
  also stops a phrase matching across the end of one passage and the start of the next.
- **Citations ride as metadata, outside the indexed body.** Each passage's reference is the one
  Copy produces (`quotationFor`): `Brigham Young, JD 1:62 (April 6, 1853)`. If it were indexed, a
  search for a speaker would match every paragraph of their discourses.
- **A title is indexed only when it is the text's own**: a discourse's or a poem's (units with
  `meta`, the reading pane's own rule). "Chapter 3" is a label, and indexing it would make
  "chapter" match every chapter.
- **Page → HTML is a pure function** (`pageHtml`), tested without Pagefind. The function that
  adds pages to a Pagefind index (`buildSearchIndex`) is separate.
- **Normalisation of the indexed copy only.** Put spaces around every em-dash: Pagefind otherwise
  reads `God—the` as one word, and the prototype lost 6 of 580 pages to this. The reader always
  sees the original text, because a result's link opens the Library, not the excerpt.
- **Output:** `dist/pagefind/` (about 42 MB, about 4,000 files).
- **Dev:** the dev middleware builds the index in memory on the first `/pagefind/` request
  (Pagefind's `getFiles()`), keeps it for the session, and serves from it. Nothing is written to
  disk and nothing goes stale between runs. It uses the dev server's own `published` flag, so the
  research view also searches held-back and local copies, which is what the reader there sees.

**The word list,** for spelling correction: `/api/texts/words.json` (path added to
`src/records/api-paths.ts`), emitted by the same build.

- Every distinct word in the indexed passages and titles, tokenised **the way Pagefind does**:
  lowercased, hyphens dropped rather than split (`latter-day` → `latterday`), em-dashes as
  breaks.
- With each word, how many passages contain it, to break ties between corrections.
- About 37k words, about 100 KB gzipped. Fetched once, when the first text search runs.

## Query: planning and running

**`src/library/text-query.ts`, `planQuery(text, words) → Plan`.** Pure, with no I/O, so every
case below is a unit test:

1. **Tokenise** like the index: lowercase, letters and digits, hyphens dropped.
2. **Join neighbours.** Where two adjacent words, joined, are in the list (`latter day` →
   `latterday`), offer the joined form as well. Without this, "latter day saints" finds 3 pages
   out of 1,037.
3. **Correct.** A word that is in the list is kept as typed. A word that isn't is replaced by the
   listed words at the smallest edit distance:
   - up to 1 typo for words of 3–4 letters, up to 2 for 5 or more, none for 1–2 letters;
   - at most 3 variants, ties broken by passage count.
   - A word the corpus has, but only once or twice, may be the corpus's own typo (`covnant`,
     once in the JoD). Its neighbours that are at least 100× commoner are tried as well
     (`covenant`).
4. **Make phrases.** Every combination of variants, capped at `MAX_PHRASES` (8). **Always quoted,
   one word included.** An unquoted word lets Pagefind fall back to prefix guesses: `zzyzxqq`
   returned eight "Z. Snow" discourses. The plan records each correction made, for the
   "Spelling corrected" line.

**Edit distance moves to `src/library/edit-distance.ts`.** `reference.ts` already has a
Levenshtein for book names, and this is its second use. Correction uses the
optimal-string-alignment variant, so a swapped pair (`nwe`) is one edit, not two. The book-name
lookup can keep plain Levenshtein or switch; its tests decide.

**`runPlan(plan, pf)`** runs each phrase through Pagefind and merges the results. A passage found
by more than one phrase appears once. When a correction gave several variants, the phrase match
itself discards the wrong ones (`nwe` → we/new/owe: only `new` makes the phrase). Results come
back in relevance order. When several phrases ran, a reading keeps its best rank. Pagefind's
`pagefind.js` is loaded with a dynamic import on the first text search, so a reader who never
searches downloads nothing.

**Pagefind finds the readings; the client finds the passages (`hitsOf`).** In exact-phrase mode
Pagefind reports only the **first** occurrence in each reading. Romans 8 came back with verse 9
and not verse 14, and "the spirit of god" listed 580 of its 1,016 passages. A reading's result
data carries its indexed text and the word position of every heading. Split on spaces, the text's
words are Pagefind's positions (checked on Romans 8: verse 2's heading at 24). So the client
scans each returned reading for every occurrence of the plan's phrases and maps each to the
passage whose heading precedes it.

- Excerpts are cut from that text: 12 words either side of the first match in the passage, "…"
  where cut, the phrase marked as one run.
- A space-separated chunk can hold two words when the source lost a space (`God,and`, JD 4:164
  ¶130). The scan runs over words, each knowing its chunk.
- A reading where the scan finds nothing matched on a stem only (Pagefind stems, quoted phrases
  included: "everlasting covenants" finds "everlasting covenant"). It keeps Pagefind's own single
  hit.

**From a hit to a link.** A sub-result's URL is the group's URL plus `#<passage id>`. That turns
into `?verse=<n>` with `selection.ts`'s `passageNumber`, so a click opens the passage already
selected, the same as the reference jump. The group part of the link comes from the Library's
own URL builder (`citations.ts`), so JoD hits get citation-style links (`/library/jod/1/62`), as
they do in the menu.

## The header field

**Rule change, needed for v1:** today `referenceUrl` never returns null for text. `parse` accepts
any input with letters in it, and `nearest` always finds _some_ book. So "new and everlasting
covenant" currently opens whichever book name is the closest spelling. New rule, in
`reference.ts` (`isReference(text)`):

- **A reference** when the input ends in a chapter number (`1 Ne 3`, `Moser 2`, `JD 1:62`). The
  forgiving nearest-book match stays for this case.
- **A reference** when the input, without numbers, is _exactly_ a book name or alias (`Moroni`,
  `Genesis`), so typing a book still opens it.
- **Otherwise, a text search.** The suggestion dropdown is unchanged. It only ever showed for
  typed chapters.

This changes what a misspelt bare book name does ("Moser" without a number becomes a search).
That case is rare, and the search page for it costs nothing.

## The results page

`/library/search?q=<text>`: a route inside the Library sub-app, so it ships wherever the Library
does, including the public build.

- The query, echoed, and "Spelling corrected: everlating → everlasting" when something was.
  (Deferred: a link to search the words exactly as typed.)
- A count of readings: "Found in 52 readings (chapters, discourses and poems)". Counting
  passages would mean fetching every reading's data up front.
- A list of passages. For each: its citation as Copy gives it (`Doctrine and Covenants 132:19`,
  `Brigham Young, JD 1:62 (April 6, 1853)`), the excerpt with the phrase marked, and a link to the
  passage. 20 readings at a time, with a "Show more" button. No infinite scroll.
- **A phrase in a group's title** (JD 4, "…Prompted By The Spirit of God") is listed as the group
  itself, labelled as a title match.
- **Empty and failed states are explicit.** "No passage contains …", and a different message when
  the index failed to load, so a network error never reads as "not in the corpus".
- Phone layout follows `index.css`'s existing rules. `yarn check:mobile` gains the page.

## Tests and checks

**Unit (vitest), written first:**

- `planQuery`: exact words kept; `everlating` → `everlasting`; `nwe` → three variants; `latter
day` → also `latterday`; short words never corrected; `MAX_PHRASES` respected; corrections
  reported.
- `pageHtml`: em-dashes spaced in text, headings carry passage ids, HTML escaped.
- The word-list tokeniser: hyphen and em-dash handling.
- `isReference`: the routing table above, including "new and everlasting covenant" → not a
  reference. That case is the bug in the current code.

**`yarn check:fulltext`** (Playwright against a running server, like `check:search`). Each case
computes its ground truth from `data/texts/content/` at run time with a plain regex, never a
hard-coded count, so new content cannot make it stale. The prototype's regression cases are the
first entries:

| Query                                                                                       | Must hold                                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `new and everlasting covenant`                                                              | every page with the phrase is found (52 today)                  |
| `New And Everlating Covenant`, `new and everlastin covnant`, `nwe and everlasting covenant` | the same set as the exact query                                 |
| `the spirit of god`                                                                         | every page with the phrase (580): the em-dash fix               |
| `latter day saints`                                                                         | every page with "Latter-day Saints" (1,037): the neighbour join |
| `prompted by the spirit of god`                                                             | includes JD 4's discourse, a title match                        |
| a passage hit's link                                                                        | opens with that passage selected                                |

Mutation, per the testing rules: switch off the em-dash spacing and the neighbour join one at a
time and watch the matching row go red.

## Deploy

- `dist/pagefind/` falls in deploy pass 2 (`no-cache`) by the existing "everything but
  `assets/`" line. No list to update. Add `/pagefind/*` to the CloudFront invalidation list in
  `scripts/deploy.sh`.
- The upload roughly doubles (about 42 MB more). Fine at this size, per docs/deploy.md.
- `yarn check:public` asserts `dist/pagefind/pagefind.js` exists and that no held-back edition id
  appears in the index's metadata.
- Follow-on: Pagefind's fragment and index files have content-hashed names, so they could take
  the immutable header like `assets/`. Only `pagefind.js` and `pagefind-entry.json` keep their
  names.

## Design principles

- **1 — separate the work from what starts it.** `planQuery` takes text and a word list and
  returns a plan. `runPlan` is the only code that talks to Pagefind. The header field and the
  results page are triggers. The second caller is real and already planned: topic pages, which
  run a stored phrase through the same two functions. Not built here. Likewise `pageHtml` is
  separate from adding pages to the index.
- **4 — generalise at the second use.** Spelling correction is edit distance's second use, so the
  function is extracted from `reference.ts`, not written again beside it.
- 2 and 3 (nothing rests transparent, nothing appears only on hover): no hover-revealed controls
  on the results page; "Show more" is a plain button.

## Settled during the build (2026-11-23)

- **Ignored headings:** a heading marked `data-pagefind-ignore` (or left empty) loses its anchor,
  so passages carry their visible number instead (Build, above).
- **Stemming:** Pagefind stems inside quoted phrases too. "everlasting covenants" finds
  "everlasting covenant", and "latter day saints" also finds the singular "Latter-day Saint"
  (24 extra passages, which `check:fulltext` allows).
- **`MAX_PHRASES`** is 8. No query in the checks needed more than 3.
- **First occurrence only, prefix fallback, corpus typos:** found by `check:fulltext` and fixed
  (Query, above).
- **Transfer, production build:** the first search moved about 1 MB uncompressed (`vite preview`),
  half of it the word list (514 KB raw, 203 KB gzipped). Worth shrinking: follow-on.
- **Mid-deploy:** a reader whose page loaded the old `pagefind-entry.json` asks for chunk files the
  new deploy deleted, and sees "The search could not load" until they reload. Deploys are rare.
  Keeping the previous index's files for a deploy would fix it: follow-on.
