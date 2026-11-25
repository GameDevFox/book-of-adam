# book-of-adam — to do

The backlog. Items chosen to work on next move to [NEXT.md](NEXT.md).

- [x] **Finish the move out of kitsune** (already done in kitsune `d450e8c`, found 2026-10-23) — delete `packages/memorial` there and reduce its
      README/CLAUDE.md/TODO.md mentions to "moved to ~/projects/book-of-adam" (this repo was
      split out 2026-10-23).

- [ ] **Menu: collapse any level with a single entry into that entry.** A group whose only child
      is one item is a wasted tap — open "Obadiah", find only "Chapter 1". The menu (not the
      data) should replace such a group with its one child, so tapping "Obadiah" opens the
      chapter directly; repeat until no menu level has exactly one entry (chains collapse fully).
      18 such groups on the public site (counted 2026-10-23): Obadiah, Philemon, 2 John, 3 John,
      Jude; BoM Title Page, Enos, Jarom, Omni, Words of Mormon, 4 Nephi; PGP Joseph
      Smith—Matthew, Joseph Smith—History, Articles of Faith; Apocrypha Prayer of Azariah,
      Susanna, Bel and the Dragon, Prayer of Manasses. Default: the collapsed entry keeps the
      group's name ("Obadiah", not "Chapter 1") and its URL stays the child's. Belongs in the
      outline build (`server/data-source.ts`, beside the existing flatten rules), with a test
      asserting the invariant over the whole outline: no group has exactly one child.

- [x] **Search, first pass: jump to a reference.** A search field in the header (no hotkey);
      type shorthand ("1 Ne 3:7", "D&C 76:22", "Sir 2:1", "JD 1:62") and land on that passage,
      verses highlighted. Scripture, Apocrypha and the Journal of Discourses (built 2026-10-24,
      ported from lessons/scripts/scripture.js).
  - [x] A dropdown while typing (built 2026-10-24): once a chapter is typed, the books the
        letters begin that have it, as full references, when ten or fewer fit. A typo no prefix
        matches ("Moser 2") still lists nothing and lands by edit distance on Enter.
  - [ ] Check verses, not just chapters, in the dropdown ("Enos 1:45" is listed though Enos
        has 27 verses) — needs verse counts in the book table.
  - [ ] Several references at once ("John 3:16; 1 Ne 3:7").
  - [ ] Add Eliza R. Snow's poems to the reference jump, by poem number (e.g. "ERS 130" →
        `/library/eliza-r-snow-poems/130`).
- [x] **Search, second pass: full-text search over the corpus** with modern indexing (ranked,
      phrase and fuzzy matching; a prebuilt index shipped with the static build, since the
      public site has no server). Supersedes the JoD "Search index over the corpus" item.
      Designed 2026-11-23: [docs/design/full-text-search.md](docs/design/full-text-search.md)
      (Pagefind + in-browser spelling correction; v1 = exact phrases, typo- and case-tolerant).
      Built 2026-11-23: `/library/search?q=…`, `yarn check:fulltext`.
  - [ ] "Search for the words exactly as typed" link beside "Spelling corrected".
  - [ ] Shrink the word list (514 KB raw / 203 KB gzipped, half the first search's transfer):
        drop the counts below some floor, or a compact format.
  - [ ] Keep the previous deploy's `pagefind/` chunks for one deploy, so a reader whose page
        loaded the old index can still search until they reload.
  - [ ] Filters: by work, JoD speaker, decade.
  - [ ] Slack and proximity ("new and _an_ everlasting covenant") — FTS5 is the upgrade path.
  - [ ] "Any of these words" mode, and falling back to it when a phrase finds nothing.
  - [ ] Concordance order (reading order instead of relevance).
  - [ ] Archaic-spelling synonyms (shew/show, hath/has) as a reviewable data file, once a real
        miss shows which pairs matter.
  - [ ] Search by meaning (static embeddings, opt-in).
  - [ ] Topic pages: a stored phrase run through the same query planner (the engine's second
        caller).
  - [ ] Immutable caching for Pagefind's content-hashed files.
- [ ] **Redirect `www.bookofadam.org` to the apex.** The `www` alias serves the site
      directly (200, not a redirect), so the same pages live at two hosts — and Umami's
      `data-domains` is pinned to `bookofadam.org`, so `www` visits are not counted. The
      proper fix is a CloudFront Function on viewer-request answering 301 for the `www`
      host (an AWS change — describe it for review before applying). Stopgap if that waits:
      add `www.bookofadam.org` to `data-domains` in `src/analytics.ts`.

- [ ] **Ship People, Events and Timeline publicly** once each is refined — add it to the
      public list in `SUB_APPS` (`src/apps.ts`) and drop its line from
      `UNSHIPPED_APP_MARKERS` in `scripts/check-public-build.mjs`.

- [ ] **Content-address the published data files.** Everything under `dist/api/` keeps a
      stable name, so it ships `no-cache` and every read revalidates with the edge, and every
      deploy re-uploads all 42 MB. Naming each file by a hash of its contents (a small
      manifest maps `contentUrl(edition, unit)` → hashed path, itself the one `no-cache` file)
      would make the data immutable like `assets/`, let deploys upload only what changed, and
      let readers cache texts across visits. Touches `server/data-source.ts` `emitStatic`,
      `src/records/api-paths.ts`, `store.ts` and `scripts/deploy.sh` (docs/deploy.md).

- [ ] **A way for readers to reach the site's author** — bug reports and issues (a wrong
      verse, a broken page, a text error) and general comments. Nothing on bookofadam.org says
      how today. Options to weigh: a plain contact email (simplest; spam exposure), a form
      posting to a small endpoint or a form service (keeps the address private; needs a
      backend or a third party), or a public issue tracker (only once the repo is public —
      see the licence item). A "Report a problem with this passage" link in the Library could
      pre-fill the edition/chapter so reports arrive with their location. Likely lives on, or
      beside, the About page.

- [x] **A Library URL naming a passage that doesn't exist sits on "Loading…" forever.**
      `/library/jod-mrm/volume-01/d40` (discourse ids follow the printed page, so most
      numbers are not ids) loads the volume, finds no such unit, and never says so. It should
      show "That passage doesn't exist" with the menu at the nearest real level. Found
      2026-10-23 while testing the drill-down menu.

- [ ] **Design a favicon for bookofadam.org.** The site has none (`index.html` links no
      icon, `public/` holds only the Deseret dictionaries), so browser tabs and bookmarks show
      a blank default. Design together first — a mark that reads at 16px; then ship an SVG
      favicon plus PNG fallbacks and an apple-touch-icon, served `no-cache` like other
      stable-named files (`scripts/deploy.sh` covers everything outside `assets/`).

- [ ] **About / landing page for bookofadam.org.** The first deploy lands straight in the
      Library (decided 2026-10-23), so nothing on the site says what Book of Adam is or
      where its texts come from. Leaning toward a short About page in the nav rather than a
      landing page in front of the Library: what the site is (the user's own words — not
      drafted by Claude), the provenance and licence of each edition (generated from
      `data/texts/editions.json` — since 2026-10-23 the only place it appears: the per-page
      provenance line above each Library text was removed as repetitive), that more tools are
      coming, and a privacy line —
      analytics are self-hosted Umami, cookieless, no personal data (`src/analytics.ts`). Ship it in the public
      `SUB_APPS` list (`src/apps.ts`).

- [ ] **Choose licences for the site's own work.** `package.json` says `UNLICENSED` (all
      rights reserved). Not a blocker for the first deploy — nothing it would cover ships yet
      (People/Events are held back) — but needed before the repo goes public or data is
      meant to be reused. Three separate things: the texts (already public domain — nothing
      to decide); the code (MIT is the usual permissive choice and fits the no-copyleft
      rule); the research data — facts, curated Deseret lexicon, later reviews (CC0, or
      CC BY 4.0 so reuse credits the site). Suggested 2026-10-23: MIT + CC BY 4.0. Record
      the choice in `package.json`, a `LICENSE` file, and the About page.

- [ ] **Add the Joseph Smith Translation as a text source.** `data/texts/sources/`
      carries `kjv`, `kjv-apocrypha`, `bofm-lds`, `dc-lds`, `pgp-lds`, `jod-mrm`
      and `ers-lexicon` — no JST. So any JST reading has to be checked against
      churchofjesuschrist.org or a printed Bible appendix, which is the one gap
      that still forces a trip to the web for scripture text.

      **Partially present already, which is easy to miss.** The two canonized
      JST excerpts are in the Pearl of Great Price and so are already in the
      corpus: `pgp-lds/joseph-smith-matthew.json` is JST Matthew 24, and
      `pgp-lds/moses.json` is the JST of the opening chapters of Genesis. What is
      missing is everything else.

      **Decide which text before importing — they are not the same thing:**
      - *Bible appendix* (LDS edition) — only the selected excerpts the Church
        publishes, a few hundred verses. Would slot in as a source beside `kjv`
        and could be keyed by the KJV reference it revises, so a lookup can
        return both readings together.
      - *Inspired Version* (Community of Christ) — the complete manuscript
        revision of the whole Bible. A parallel edition of every book, much
        larger, and with its own versification differences from the KJV.

      The appendix form is the one that answers "what did Joseph change here?",
      which is the question that actually comes up.

      *Worked example of the need:* 1 Corinthians 14:34. KJV reads "it is not
      permitted unto them to speak"; the JST reads "to rule". Identical in every
      other word, and the whole meaning turns on that one. Logged 2026-10-02.

## Carried over from kitsune TODO.md (2026-10-23)

- JoD text data (see README.md, "JoD text data")
  - [x] **Bake page numbers into the edition output** — `build-jod-edition.mjs` discards the
        `<div id="NN">` / `<span class="pagebreak">` markers that `download-jod.mjs` keeps, so
        exact pages survive only in the gitignored 138 MB `.cache/`. Tag each paragraph unit with
        its printed page (chunks align 1:1 with parsed paragraphs across all 1,426 discourses) so
        page data lands in version control and a fresh clone doesn't have to re-scrape.
  - [x] **Page and column break markers in the reading text.** The printed JoD sets each page
        in two columns; a reader following along in the book and one reading online need
        common reference points. Show a marker where each page break falls (e.g. a "p. 61"
        rule in the text) and where each column break falls (e.g. "61b"). Page breaks are
        recoverable from the raw cache's `<div id="NN">` / `<span class="pagebreak">` markers
        (item above). Column breaks: first check whether jod.mrm.org marks them at all — if
        not, they need another source (a page-image scan or a printed-facsimile edition).
        Decide the marker format with the user before building (also how a citation like
        "JD 1:61b" maps onto it).
  - [x] **Address JoD by page in Library URLs** — any page inside a discourse's printed range
        lands on that discourse (`/library/jod-mrm/volume-01/p62` → the discourse on pp. 60-65).
        Discourse ids already are the opening page (`d1`, `d6`, `d16`, …), so this is resolving
        a page within `meta.pages`, plus choosing the URL form. Requested 2026-10-23; next up
        after the drill-down menu deploy.
  - [x] **Jump to the page within a discourse** — a page that falls partway through a discourse
        scrolls the reading pane to where that page begins. Needs the page-break positions from
        the "bake page numbers" item above.
  - [ ] **Discuss: switchable progression markers for JoD reading** — let a reader toggle what the
        margin numbers count: paragraphs (today's ¶ markers), sentences, or another scheme
        (pages and columns, once the break markers exist). Talk through what readers cite and
        follow along by before designing.
  - [ ] Rejoin words the printing hyphenated across a page or column break — only 5 in the
        whole corpus (counted 2026-10-23; e.g. "peo-" / "ple"). Belongs with rejoining the
        paragraph pieces a break splits (the progression-markers discussion above).
  - [ ] Fix `dateISO` — real dates, garbage time components; some discourses have `date: null`
        despite a date in the byline.
  - [ ] Search index over the corpus — phrase lookup currently scans ~35 MB of JSON. Now part
        of "Search, second pass" at the top.

- Eliza R. Snow poems (`scripts/build-ers-poems.mjs`; see README.md,
  "Eliza R. Snow poems")
  - [x] **Organise the poems by year in the Library menu** (first draft built 2026-10-23,
        `server/arrange.ts`; research view only while the edition is held back), replacing the
        2009 edition's numbering: Eliza R. Snow › <decade, with its poem count> › poems, each
        year a divider in its decade's list (revised from one level per year — a year averages
        six poems). A poem's year is its
        composition date, else its first printing in a periodical (counted: 288 + 132 = 420
        poems). Two final groups, each alphabetical (ignoring a leading The/A/An and opening
        quotes): **Year Uncertain** — dated only by a reprint in her own _Poems_ (1856/1877),
        so known to exist by then but not when written (21), showing that note; **Year Unknown**
        — no date anywhere (66). Within a year: month/day where the note gives it, then title.
        The 25 poems without text (#351–375) stay out of the public menu; the research view
        lists them marked "text missing". Independent of which text source is used (the
        publishing decision below).
  - [x] **Ornament lines in the poem text** (done 2026-10-23 with the full formatting review: README, "Eliza R. Snow poems") — rows like `* * * * *` (e.g.
        `/library/ers-lexicon/poems-451-475/464`) render as literal asterisks. Counted
        2026-10-23: 14 lines in 11 poems — `* * * * *` ×12, `* * * * * *` ×1, `≈≈≈≈≈` ×1 (any
        stanza line with no letters or digits). In 19th-century verse such a row usually marks a
        section break or omitted lines in the printing itself, so render it as a centred
        divider rather than deleting it; check a few against the source page first to confirm
        it is the text's, not the site's, formatting.
  - [x] Reader: render stanza units line by line (done 2026-10-23).
  - [x] **A poem's notes as a byline under its title** (done 2026-10-23, with the batch heading removed) — its `subtitle`, `composed`/`dated`
        and `published` notes ("composed 13 July 1826 · Western Courier, 5 August 1826"); today
        `bylineOf` knows only the JoD keys, so poems show nothing (or a bare "n.d."). Shows why
        a poem sits in its year, and a Year Uncertain poem's reprint note. Measured 2026-10-23:
        450 poems have notes, median 36 characters; 18 run past 120 and 4 past 200 (max 262,
        all long dedicatory subtitles) — show those as a one-line preview with an "Expand"
        control. The "Poems 76–100" batch heading above each poem is removed (2026-10-23).
  - [x] **Decide: poem 145** — marked missing (2026-10-23; `corrections.json` `missing`) — the source site's text for #145 ("Lines Addressed to") is a copy
        of #144 ("To Elder John Taylor"); its real text and full title are missing. Mark it
        missing like 351–375, or keep showing the duplicate?
  - [x] **Decide: two titles that look like source typos** — corrected (2026-10-23; `corrections.json` `title` + `reason`) — #215 "Thou dost no weep" (the
        poem's first line reads "not weep") and #227 "Juvenile Hymnn". Keep as the source has
        them, or correct?
  - [ ] Poems 351–375 are placeholder text on the source site; transcribe from the printed
        Derr & Davidson edition (or find another source) so the catalogue is complete.
  - [ ] Normalize `meta.published` / `meta.composed` into the events `When` model (venue +
        structured date) so poems can join the timeline; the printed strings are kept as-is.
  - [x] Published as `public-domain` (2026-10-23), with the remaining 2009 apparatus accepted
        (README, "Eliza R. Snow poems").
- Deseret Alphabet converter (design settled; see
  docs/design/deseret-converter.md)
  - Phase 1 (MVP) — standalone sub-app, modern Standard American register
    - [ ] Remaining OOV is archaic KJV vocabulary (saith 187, insomuch 181, verily 76, knoweth,
          bringeth) and Restoration terms in the JoD (exaltation 739, nauvoo 451, tabernacles
          390). A different source hunt — the guide covers only scriptural proper nouns. Do NOT
          generate these from memory; the app's unknown-word list is the worklist.
    - [ ] Homographs — CMUdict lists variants without part-of-speech and the build script keeps
          only the first. Flag such words in the UI as ambiguous rather than silently choosing.
  - Phase 1b — reverse direction (Deseret -> English), a decoding aid for learners
    - [ ] Homophone alternates are hover-only (`title`). A click-to-cycle or inline picker would
          serve a learner better.
    - [ ] The sound-it-out fallback is a flat phoneme->letters table; it makes no attempt at
          English spelling conventions ("neefy", not "nephi"). Fine for reading aloud.
  - Phase 2
    - [ ] Library integration — a toggle rendering any edition in Deseret.
  - Later (rough value order)
    - [ ] Morphological stem+suffix rules — deferred, not rejected; worth more on arbitrary
          text than on this corpus, and composes with the curated lexicon.
    - [ ] Homograph disambiguation via part-of-speech tagging.
    - [ ] **Write to the Illinois Deseret Consortium for permission** — a prerequisite for the
          historical 1869 register, since this site is intended for publication and their
          transcriptions are licensed for personal/educational use only.
    - [ ] Historical 1869 convention profile (blocked on the above). It is a lexicon product,
          not an algorithm one: modern pronunciation reproduces only 64–70% of the 1869 text.
    - [ ] Additional accents (British English) by swapping the stage-2 dictionary.
    - [ ] Promote the pronunciation lexicon to its own reviewable sub-app once it outgrows a
          hand-maintained JSON file.
