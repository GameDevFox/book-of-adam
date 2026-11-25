# Texts library — foundation design

The third leg of memorial: read, annotate, and link texts — sacred texts, apocrypha, journals,
the Joseph Smith Papers, historical documents — and eventually compare editions (KJV vs. JST,
Book of Mormon 1830 vs. 2013, Mormon Doctrine 1st vs. 2nd edition entries). This doc fixes the
data model so those features are additive, not rewrites.

## The three-layer model (FRBR-lite)

Digital-scholarship projects converge on separating:

1. **Work** — the abstract thing: "the Book of Mormon", "the Bible", "Mormon Doctrine".
2. **Edition** — a concrete published text of a work: `bofm-1830`, `bofm-2013`, `kjv-1769`,
   `jst-inspired-version-1867`, `mormon-doctrine-1958`, `mormon-doctrine-1966`. An edition has
   its own structure, its own dating (`when` — the existing timeline model!), provenance, and
   licensing. **The edition, not the work, owns text.**
3. **Annotation** — standoff notes/links/tags that POINT AT text but never live inside it.

Rule that falls out: there is no such thing as "the text of the Book of Mormon" — only the
text of a specific edition. Comparison is then a relationship BETWEEN editions, not a diff
against an imaginary canonical original.

## Addressing: edition-local unit paths

Each edition is a tree of **units** (book → chapter → verse; or entry, paragraph, page —
whatever that edition's real structure is). Units get stable ids, and a unit's **path** is the
edition id + the id chain:

```
bofm-2013.alma.36.22          (verse)
bofm-1830.p212                (1830 has no verses — paragraphs are its real units)
kjv-1769.genesis.1.1
mormon-doctrine-1958.entries.negroes   (an entry — the unit type for encyclopedic works)
jst-1867.genesis.1.1
```

This is the SAME path grammar as the review system's fact paths — deliberately. Reviews,
annotations, and links all address text the same way, and `resolveFactPath` thinking carries
over.

**No universal canonical addressing.** The 1830 Book of Mormon has different chapters and no
verses; the JST renumbers; Mormon Doctrine editions drop entries. Forcing every edition into
one numbering scheme is how projects corrupt their data. Instead: every edition keeps its own
true structure, and **alignment tables** map between them.

## Alignment tables — comparison as data

An alignment is a first-class, reviewable artifact: a list of correspondences between unit
(ranges) of two editions.

```json
{
  "a": "bofm-1830",
  "b": "bofm-2013",
  "pairs": [
    { "a": ["p212"], "b": ["alma.36.20", "alma.36.21", "alma.36.22"] },
    { "a": [], "b": ["alma.36.23"], "note": "no 1830 counterpart …" }
  ]
}
```

- Many-to-many by design (one 1830 paragraph = several 2013 verses).
- Empty side = added/removed material — for Mormon Doctrine, entry-set comparison IS this
  (entries aligned by id; missing on one side = removed/added; aligned pairs word-diffed).
- Alignments are exactly the kind of claim the review system exists for: each pair is a fact
  path (`align.bofm-1830.bofm-2013.<n>`) you can verify or dispute.
- The compare view = pick two aligned editions → walk the pairs → word-level diff within each
  pair (diffing ALIGNED SEGMENTS is cheap and reliable; diffing whole books is not).

## Annotations: standoff, quote-anchored

Annotations never modify text files. An annotation carries one or more **anchors** and a body:

```json
{
  "id": "a-2026-0001",
  "type": "note | tag | link",
  "anchors": [
    {
      "path": "bofm-2013.alma.36.22",
      "quote": {
        "exact": "the same that my father saw",
        "prefix": "methought I saw, even as ",
        "suffix": ","
      },
      "chars": { "start": 118, "end": 145 }
    }
  ],
  "targets": [{ "kind": "event | person | unit", "ref": "kirtland-temple-visions-dc110" }],
  "body": "…",
  "created": "2026-07-11T…"
}
```

- **Quote + offsets together** (the W3C Web Annotation selector pattern): offsets make anchors
  fast; the quote (with context) makes them SELF-HEALING — if a transcription typo is fixed
  and offsets shift, the quote re-resolves the anchor, and a quote that no longer matches
  flags the annotation for review instead of silently pointing at the wrong words.
- A **link** is just an annotation with a second anchor or a `targets` entry — text↔text,
  text↔event, text↔person. This is what ties the library to the existing collections (D&C 110
  text ↔ the `kirtland-temple-visions-dc110` event; a Joseph Smith journal entry ↔ his person
  record). Links are the seed of the future graph — kept as flat data now, importable into
  the kitsune graph system later if it earns it.

## Storage

```
data/texts/
  works.json                      — work registry
  editions.json                   — edition registry (when, provenance, licence, sources)
  content/<edition>/<top-unit>.json — text, one file per book/section (git-diffable, PR-sized)
  alignments/<a>__<b>.json
  annotations/<layer>.json        — e.g. annotations/research.json; layers keep files mergeable
```

Unit content files are simple recursive JSON: `{ id, title?, units: [...] | text }`. Same
philosophy as people/events: the data IS the product, every change is a reviewable diff, the
dev-server API grows `GET /api/texts/...` + annotation POST endpoints alongside the existing
collection routes.

### Source/content split — no duplicated text

A raw download carries both text and provenance metadata. We commit them **split**, never
doubled up:

- **`content/<edition>/<book>.json`** owns the text (the product).
- **`sources/<edition>/<book>.json`** owns everything else — one file per book, mirroring the
  content layout and file names, with unit ids matching content so the two rejoin losslessly.
  Only the text *body* is removed; every other source field is kept as-is (JoD keeps `url`,
  `dateISO`, `byline`, + a `paragraphCount` integrity stub; scripture keeps `reference`,
  `lds_slug`, headings). Volume/edition-level metadata that isn't tied to a book goes in a
  sidecar (`sources/<edition>/_edition.json`, or JoD's `manifest.json`).
- **`sources/<edition>/raw/`** and **`.cache/`** hold the full raw download and are
  **gitignored** — regenerable (bcbooks re-fetches from the pinned `SOURCE_REF`; JoD rebuilds
  from the HTML `.cache`). Committing them would just duplicate the text a third time.

This kept the JoD source metadata at ~0.9 MB instead of ~32 MB (the sermon prose lived in
both source and content before). Build scripts (`build-jod-edition.mjs`, `build-scriptures.mjs`)
emit content + source-meta together from the raw download in one idempotent pass.

**Licensing is a schema field, not an afterthought.** Editions carry
`licence: "public-domain" | "quoted-excerpts" | "local-only"`. KJV (1769), the 1830 Book of
Mormon, the RLDS Inspired Version (1867), and JSP-transcribed manuscripts are public domain —
full text in-repo. Current LDS editions (copyrighted study apparatus) and Mormon Doctrine are
NOT redistributable: `local-only` editions live in a gitignored `data/texts/local/` (the
ai-quarantine pattern) so the tooling works identically but the repo stays clean; or
`quoted-excerpts` keeps only unit STRUCTURE + short quoted excerpts in-repo (entry titles +
change summaries often suffice for the Mormon Doctrine use case).

## Review integration

Everything above is claims, and the review sidecar generalizes to all of it:

- Transcription fidelity: review `bofm-1830.p212` = "this matches the source scan".
- Alignment correctness: review an alignment pair.
- Annotation link quality: review a link annotation.

One verification loop, three new kinds of facts.

## Phasing

1. **Walking skeleton** — works/editions registries, one public-domain text ingested
   (small but real), reader UI (edition picker → unit navigation → clean reading pane).
2. **Annotate + link** — selection → quote-anchored note; links to events/people; annotations
   panel; links surface on the People/Events/Timeline views too (the payoff).
3. **Compare** — one hand-built alignment showcase (e.g. Alma 36: 1830 vs. 2013, or Genesis 1
   KJV vs. JST) + side-by-side aligned view with word-level diffs.
4. **Entry-set comparison** — Mormon Doctrine-style works (units = entries), set-diff view.

## Open questions

- **First corpus** for the walking skeleton: KJV (clean public-domain source, everyone knows
  it) vs. 1830 Book of Mormon (more distinctive value, JSP provides scans) vs. a small D&C
  section set?
- **Annotation layers**: one shared research layer committed to the repo, or per-topic files?
  (Schema supports both; affects file organization only.)
- **Copyrighted texts**: is the `local-only` gitignored directory acceptable for personal
  study copies (e.g. Mormon Doctrine you own), with only structure/excerpts committed?
