# book-of-adam

Research records for the LDS Restoration — a shell app hosting small data-review sub-apps
("mini-apps", the domus pattern). Long-term purpose: a verified research corpus covering sacred
texts, apocryphal works, journals, the Joseph Smith Papers, and historical data across the
Restoration traditions (LDS, Community of Christ / RLDS, fundamentalist and other branches).

Public home: **https://bookofadam.org** — live since 2026-10-23 (read-only; Library and Deseret). Deploy with `yarn deploy`; see [docs/deploy.md](docs/deploy.md).
Until 2026-10-23 this lived as `packages/memorial` in the kitsune monorepo; older docs and commit
messages still say "memorial".

Port **3006**. No dependency on the kitsune graph system — datasets live as flat JSON in this
package so every fact, source, and verification is a reviewable git diff.

## The verification loop

1. Claude (or a script) gathers facts into `data/<collection>.json` with source URLs.
2. You open the app, follow a record's source links, and mark each **fact** verified (or
   disputed, with a note) — birth date, birth place, death date, and death place are all
   independent verdicts. "Verify all" fills in every unreviewed fact of a row at once.
3. The dev server writes reviews into the `data/<collection>.reviews.json` sidecar — commit
   the diff and the dataset carries its own audit trail.

## Facts vs. reviews — the two-table model

Facts and review state are stored separately so the data shape stays clean as record types
grow (marriages, children, …):

- `data/people.json` — facts only, no review state.
- `data/people.reviews.json` — a map from **fact path** → `{ status, reviewedAt, note? }`,
  e.g. `"joseph-smith-sr.born.place": { "status": "verified", … }`. A path is the record id
  plus real field names, so every review is mechanically checkable against the data (the
  integrity test rejects reviews pointing at facts that don't exist). A path absent from the
  map is unverified. Any new fact added to a record is reviewable with no schema change.

Source conflicts discovered during research are logged in [DISCREPANCIES.md](DISCREPANCIES.md)
(and summarized in the affected event's `note` field, visible in the UI).

## The date model (events)

Events (`data/events.json`) use a structured date model built for the future timeline tool
(`src/records/events.ts`):

- **`CalDate`** — `{ year, era?: "bce", month?, day?, circa? }`. Positive years with an era
  flag for BC (587 BC = `{ year: 587, era: "bce" }`; no negative years, no year zero); month
  and day are omitted when unknown; `circa` marks the date approximate. `astronomicalYear`
  converts for math (1 BC → 0), and `calSortKey` gives a total order across the BC/AD
  boundary.
- **`When`** — a discriminated union separating DURATION from UNCERTAINTY:
  - `{ type: "instant", date }` — happened at a point, to known precision.
  - `{ type: "span", start, end }` — genuinely lasted from start to end (timeline: a bar).
  - `{ type: "between", earliest, latest }` — a point event at an unknown time within the
    bounds (timeline: an uncertainty bracket, not a bar).

  An optional `note` on `when` carries precision subtleties ("early spring 1820", competing
  scholarly dates). The same idea underlies EDTF (the Library of Congress date standard),
  which distinguishes intervals from uncertain point-in-range dates.

**People dates** (`LifeEvent.date` in `src/records/types.ts`) are EITHER an ISO string —
`"YYYY-MM-DD"` / `"YYYY-MM"` / `"YYYY"`, the ergonomic form for modern (CE) figures — OR a
`CalDate` object, used for antiquity/BC people (e.g. Abraham `{ year: 1996, era: "bce", circa:
true }`), so Biblical and Book of Mormon figures share the events' BC-capable model. `toCalDate` /
`formatLifeDate` (`events.ts`) normalize + render across both forms; validation and the timeline
accept either. For a CalDate, `circa` lives on the date object; an ISO date uses the `LifeEvent.circa`
flag.

## Layout

- `data/` — the datasets: `<collection>.json` (facts) + `<collection>.reviews.json` (review
  sidecar). The data IS the product; the app is just a review surface. Canonical formatting is
  the data API's `JSON.stringify(…, null, 2)` write (the dir is prettier-ignored so review
  clicks never cause format churn).
- `server/` — the data API. URL grammar in `src/records/api-paths.ts` (shared by client, dev
  server and build, so they cannot drift); every GET resource is file-shaped —
  `/api/data/<collection>.json` (`{ records, reviews }`), `/api/texts/registry.json`,
  `/api/texts/outline.json`, `/api/texts/content/<edition>/<unit>.json`. `data-source.ts`
  computes the payloads; `data-plugin.ts` serves them live in dev (plus
  `POST /api/data/<collection>/reviews`, one `ReviewInput` or a batch applied as a single
  write) and, on `yarn build`, writes the same files under `dist/api/` for the static site.
  The build reads committed `content/` only: `data/texts/local/`, `local-only` editions and
  `sources/` never reach `dist/`. The published site has no write path.
- `src/analytics.ts` — Umami pageview tracking, public production builds only (docs/deploy.md,
  "Analytics").
- `src/apps.ts` — sub-app registry; the shell derives nav and routes from it. Add new sub-apps
  here. `src/routes.tsx` is the route table (data router): `Shell.tsx` as the layout, each
  sub-app owning `<id>/*`, a `*` catch-all "That page doesn't exist" page, and a root
  `ErrorBoundary` that replaces the shell on a crash. Both are needed on the published site,
  where CloudFront answers every unknown path with the app.
- `src/records/` — record types, the date model, pure review/validation logic (tested),
  client store.
- `src/people/` — sub-app: birth & death dates of Restoration figures.
- `src/events/` — sub-app: datable events (ancient → modern) with the when-model encoded;
  each event's dating is one reviewable fact (`<id>.when`).
- `src/timeline/` — sub-app: the zoomable canvas timeline. Architecture is deliberately
  layered: `time.ts` + `layout.ts` are the PURE core ((lanes, view) → draw list; fractional
  astronomical years, BC/AD tick ladder, label collision — all unit-tested with no DOM);
  `render.ts` is the Canvas 2D consumer of the draw list (swappable for Konva/Pixi/Three
  later without touching the core); `TimelineApp.tsx` hosts it with d3-zoom gestures. Lanes
  are event groups and people lifespans, toggled side by side; solid bars = spans (durations),
  dashed brackets = between (uncertainty), dots = instants; colors follow review status.
  See [docs/timeline-research.md](docs/timeline-research.md) for why build-on-d3 beat every
  off-the-shelf library. Dev probe: `window.__memorialTimeline` exposes base/view/transform
  for e2e drives.
- `scripts/` — text ingestion. `download-jod.mjs` scrapes the Journal of Discourses (26 vols,
  1,426 discourses) from jod.mrm.org into diffable per-volume JSON under
  `data/texts/sources/jod-mrm/` (polite, rate-limited, resumable via a gitignored raw-HTML
  cache; source #1 for a planned multi-source text diff). `build-jod-edition.mjs` converts
  those into the edition format below (volume → discourse → paragraph unit trees) and registers
  the Work + Edition. Re-runnable and idempotent. `build-ers-poems.mjs` catalogues the 507
  poems of Eliza R. Snow from erslexicon.wordpress.com (see "Eliza R. Snow poems" below).
  `check-mobile.mjs` is not ingestion: it drives a running dev server with Playwright at phone
  (390px) and desktop widths and asserts the shell + Library phone layout — the header stays
  pinned, the app tabs collapse into a left side panel behind the hamburger, no horizontal
  overflow, a readable reading pane, the tree behind a Contents sheet, thumb-sized rows — and
  that desktop keeps its tab strip and sidebar. Run it after any layout or `index.css` change:
  `yarn check:mobile`.
- `src/library/` — sub-app: the texts library reader (phase 1 of
  [docs/design/texts-library.md](docs/design/texts-library.md)). Work → Edition → unit-tree
  model; texts live under `data/texts/content/<edition>/` (public domain) or the gitignored
  `data/texts/local/` (personal copies of copyrighted editions — same API, clean repo).
  Read-only `/api/texts/…` resources (above). Annotation, linking, and edition comparison are phases 2–3.
  **URLs:** edition-style `/library/<edition>/<file>/<path…>` for every text; the Journal of
  Discourses is citation-style, `/library/jod/<volume>/<page>` (JD 1:62 → `/library/jod/1/62`),
  where any page in a discourse's range lands on it and a page two discourses share belongs to
  the one beginning there (`src/library/citations.ts`). Eliza R. Snow's poems are by number,
  `/library/eliza-r-snow-poems/<n>` (the work's id; unique across all 507, whatever file holds
  the poem). The edition-style form still opens any passage as it is — there are no redirects (decided
  2026-10-23). `?verse=7`, `?verse=7-9` or `?verse=4,7-8` on a chapter selects those passages
  and scrolls to the first.
- **Selecting and copying** — click or tap a passage (verse, JoD paragraph, poem stanza) to
  select it, Shift+click for a range; the URL follows (`?verse=`, `src/library/selection.ts`,
  no history entries) and a bar at the bottom copies the selection as a quotation with its
  reference. Each edition can format its own quotation (`src/library/quotation.ts`: scripture
  numbers verses, the JoD cites speaker and printed page, the poems title and date). Checked by
  `yarn check:selection [base] [plain-http LAN base]` — the second URL tests the copy fallback
  for pages without the Clipboard API.
- **Search** — the header's field takes a typed reference ("1 Ne 3:7", "D&C 76:22", "Sir 2:1",
  "JD 1:62") and opens it (`src/library/reference.ts`, book table in `reference-books.ts`): a
  port of the owner's rofi scripture shortcut, nearest book by edit distance so misspellings
  land. Once a chapter is typed, a dropdown lists every book the letters begin that has that
  chapter, as full references ("e 3" → Exodus 3, Ezra 3, … Sirach 3) — only when ten or fewer
  fit, and never one book's chapters. Checked by `yarn check:search`. A
  URL naming no passage says so.
- **Full-text search** — anything in that field that is not a reference (`isReference`: it ends
  in a chapter number, or is exactly a book name) searches the text: `/library/search?q=…` lists
  every passage holding the phrase, each cited as Copy cites it and linking to the passage
  selected. Typos and capitalisation are forgiven, and "latter day" finds "Latter-day".
  [docs/design/full-text-search.md](docs/design/full-text-search.md). The index is
  [Pagefind](https://pagefind.app/) (MIT), built with the site into `dist/pagefind/`, plus the
  corpus word list at `/api/texts/words.json` (`server/search-index.ts`; in dev, built in memory
  on the first search, about 25 s). The query side is `src/library/text-query.ts` (planning,
  pure) and `text-search.ts` (Pagefind, and finding every passage in a reading). Checked by
  `yarn check:fulltext`.
- `docs/` — research notes (timeline rendering library survey lives here), `docs/design/` for
  feature designs, and `docs/research/` for corpus-derived reference lists (every occurrence of
  a phrase in the JoD, with verified pages — generated by the `quote` skill's search, never
  retyped).

## Licensing and publication posture

**book-of-adam is intended for publication — treat anything written into this repo as immediately
public**, even while the app is still local. Two rules follow:

- **No copyleft dependencies.** A GPL library linked into the published app would put book-of-adam
  under GPL. (This is why the Deseret converter uses CMUdict rather than espeak-ng — see
  [docs/design/deseret-converter.md](docs/design/deseret-converter.md).) Public domain, MIT,
  ISC, BSD, and SIL OFL are all fine.
- **No source text in the repo that isn't clearly publishable.** `data/texts/content/` is for
  public-domain editions; the gitignored `data/texts/local/` holds personal copies of
  restricted ones, same API, clean repo. Research scripts that depend on a restricted corpus
  are committed, but skip when the corpus is absent and document how to fetch it. Statistics
  and short illustrative quotations from a restricted source are facts _about_ the work rather
  than the work, and are publishable with citation.

## JoD text data — page numbers and parsing artifacts

Quoting from the corpus goes through the `quote` skill (`.claude/skills/quote/`), which wraps
the facts below. Reach for it before writing lookup code by hand.

**Every paragraph carries its printed page and column** (since 2026-10-23): `page`, `column`
(`"a"`/`"b"`) and `continued` on each paragraph unit in `content/jod-mrm/`, so page data is in
version control and the Library draws page and column rules from it. jod.mrm.org sets each
printed page as `<div id="NN">` with one `<span class="columnbreak">`, and splits a paragraph at
every page or column break (resuming it as `<p class="continued">`), so every break falls
_between_ scraped paragraphs — checked across all 1,426 discourses, none falls inside one.
`scripts/jod-marks.mjs` reads them in the same pass that extracts the text. Columns count per
discourse: where a discourse starts partway down a page, the book closes the previous one in two
columns at the top and opens this one in two fresh columns below, so each page of a discourse
starts in column a. Re-deriving needs the gitignored HTML cache (138 MB; `download-jod.mjs`
re-parses it offline, keeping each volume's original `fetchedAt`).

Other artifacts worth knowing before treating the text as clean:

- **Words split across page breaks.** The printing hyphenates at the boundary ("cruelly mas-" /
  "sacring them"), and both the cache chunks and the parsed paragraphs preserve the split. Naive
  joining yields "mas- sacring"; rejoin without the hyphen when the next chunk starts lowercase.
  Paragraphs that begin mid-sentence are this, not a data error.
- **Text lives only in `content/jod-mrm/`; `sources/jod-mrm/` is metadata-only** (speaker, date,
  reporter, byline, url, `paragraphCount` — no paragraph text). The source/content split
  de-duplicated the prose (see [docs/design/texts-library.md](docs/design/texts-library.md),
  "Source/content split"); the full raw scrape now lives in the gitignored `sources/*/raw/`.
  Search the corpus in `content/`; join `sources/` by unit id for provenance.
- **`dateISO` is unreliable** — real dates, garbage time components (`1853-01-16T06:59:56.000Z`).
  The human-readable `date` field is correct. Some discourses have `date: null` despite a date in
  the byline.
- No search index exists; phrase lookup scans ~35 MB of JSON (a few seconds).

## Eliza R. Snow poems — source quirks

`scripts/build-ers-poems.mjs` catalogues the 507 poems of Derr & Davidson, _Eliza R. Snow: The
Complete Poetry_ (2009), as posted on the Eliza R. Snow Lexicon (erslexicon.wordpress.com, a
BYU student project; "published with permission"). Output is the JoD split: `content/ers-lexicon/`
(page → poem → stanza; stanza text is newline-joined lines) and `sources/ers-lexicon/` (per-poem
metadata, no text) + `manifest.json`. The raw WordPress.com API responses sit in the gitignored
`sources/ers-lexicon/.cache/` — 21 requests, so a fresh clone can simply re-run the script.

- **Licensing is a judgment call, recorded here.** The poems are public domain by age (all
  published 1825–1887). The site's text is the 2009 scholarly edition, posted there with
  permission. It was held back as `local-only` for a day while the 2009 apparatus was removed or
  replaced — line numbers stripped, storage batches and headings gone, the menu ordered by year,
  stanza breaks on 199 poems reconstructed — and published on 2026-10-23 as `public-domain`,
  the owner accepting what remains of the edition: its poem numbers (now in the URLs), its
  bracketed insertions ("[Edward]") and a few editor's notes, and its dating notes (facts, in
  the bylines).
- **Poems 351–375 have no text.** The site's "Poems 351–375" page is placeholder filler
  ("asdf", "wert") — 25 poems are catalogued in `sources/` (title + number) with `missing` set,
  and the content file is not written. Only the printed book has them.
- **Editorial notes become `meta`.** The trailing "published in …" / "composed …" / "dated …" /
  "n.d." lines (whether their own paragraph or the last lines of the final stanza) are peeled
  into `meta.published` / `meta.composed` / `meta.dated` / `meta.date`, as printed — venues and
  dates are not yet normalized. Multi-line titles split into `title` + `meta.subtitle`.
- **Line numbers are recognised by value, not spacing.** The site puts anything from one space
  to a run of `&nbsp;` before the number, so a trailing multiple of five near the running count
  is stripped; the count resyncs when the edition leaves an epigraph or heading uncounted, and
  the script reports how many printed numbers disagreed. Epigraphs, dedications, and prose
  prefaces stay in the text as their own stanza units.
- **The site's page slugs lie** (`/poems-51-55/` is "Poems 276–300"); pages are identified by
  their titles, and content files are named by poem range (`poems-276-300.json`).
- **Formatting fixes** (2026-10-23) come from a review of all 482 poems against the site's HTML
  and are applied at build time by `scripts/ers-fixes.mjs`, so a rebuild reproduces them:
  rules for every poem (non-breaking hyphens, "‘Tis" with the wrong quote, a stray space the site
  left only beside "death", the acrostic `=` in #166, ornament rows such as `* * * * *` as their
  own unnumbered divider units `orn1`…, numbered prose psalms regrouped one verse per paragraph,
  titles broken mid-phrase rejoined, "n. d." recognised), plus per-poem corrections in
  `data/texts/sources/ers-lexicon/corrections.json` (heading lines moved out of the verse,
  epigraphs, footnotes, joins, stanza starts) — lines named by their exact text, matched in
  order, and the build fails if one is not found. A word-for-word comparison before and after
  showed no word of any poem lost, added or changed.
- **Stanza breaks on pages 126–325 are reconstructed.** The site set each of those poems as one
  block (its tabs mark indentation, not stanzas), so the breaks were rebuilt from rhyme, metre,
  refrains and chorus cues by a reviewed agent pass; such poems carry
  `meta.editorial: "Stanza breaks reconstructed from rhyme and metre."` — recorded, not shown in
  the reader. 199 poems; git history holds the source's form.
- **Indentation is kept** as leading tabs on a line (the site's own), drawn as indent steps.

## Commands

```bash
yarn start        # dev server on port 3006
yarn test         # vitest — pure logic + data integrity checks
yarn lint         # eslint
yarn typecheck    # tsc --noEmit
yarn check:mobile # Playwright phone-layout checks against a running dev server (pass a URL to
                  # check another, e.g. https://bookofadam.org; first run on a machine needs
                  # `yarn playwright install chromium`)
yarn build:public # the deployable read-only site → dist/
yarn check:menu   # Library menu: drill-down levels, truncated titles + overlay, desktop and touch
yarn check:fulltext # full-text search vs ground truth computed from the texts (dev server only)
yarn check:public # assert dist/ is a safe public build (run before every deploy)
yarn start:public # dev server in public mode — previews exactly what deploys
yarn deploy       # publish to bookofadam.org (--dry-run to preview; docs/deploy.md)
```

### Research vs public build

The app has two faces, chosen by Vite mode (`src/mode.ts`). The **research** view (`yarn
start`, any mode but `public`) is the verification loop above: review controls, status
badges and filters, and writes through the dev server. The **public** view (`--mode public`)
is the published site, and its first version is read-only: no review surface at all, since
review state means nothing to a reader who cannot review. It also ships only the sub-apps
that are ready for readers — Library and Deseret at first; People, Events and Timeline join
when they are (the list is `SUB_APPS` in `src/apps.ts`).

The strip happens at compile time. `vite.config.ts` `define`s `import.meta.env.PUBLIC_BUILD`
as a literal; `SUB_APPS` picks its list on it, `READ_ONLY` (`src/records/store.ts`, the same
flag) guards every review surface, and the minifier drops the rest — unshipped apps and write
code are absent from the bundle, not hidden. Keep the guard a
literal: comparing `import.meta.env.MODE` to a constant imported from another module does not
fold, and the review UI ships while looking right. `yarn check:public` greps the bundle for
review-only and unshipped-app strings to catch exactly that. On the data side the public build emits every
collection with an empty review map, never reads `data/texts/local/`, and skips every edition
that is `local-only` or carries a `heldBack` reason (`editions.json` — e.g. the 1830 and PG #17
Books of Mormon, imported only as far as 1 Nephi 1); `yarn start:public`
serves the same and refuses review POSTs.

The data-integrity test (`src/records/validate.test.ts`) validates every record in
`data/people.json` (unique slug ids, ISO-or-CalDate dates, died-after-born, https sources) and every
review in `data/people.reviews.json` (paths must resolve to real facts), so a bad hand edit or
a malformed import fails CI-style.
