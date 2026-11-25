/**
 * Config for the structured-JSON scripture ingest (scripts/build-scriptures.mjs).
 *
 * Source: bcbooks/scriptures-json — one JSON file per standard-works volume, shape
 *   { books: [ { book, full_title, lds_slug, heading?, chapters: [
 *       { chapter, heading?, verses: [ { verse, text } ] } ] } ],
 *     title_page?, testimonies? }
 * The verse text is the public-domain scripture text in current LDS versification; the dataset
 * excludes the modern copyrighted study apparatus (footnotes, editorial chapter summaries). The
 * `heading` fields it does carry are the ORIGINAL abridgment synopses ("An account of Lehi…"),
 * which are part of the historical text and public domain.
 *
 * Pinned to a commit SHA so re-runs are byte-reproducible even if the dataset's master moves.
 */

/** bcbooks/scriptures-json @ this commit — bump deliberately, never silently. */
export const SOURCE_REF = "3bda76e40add4582165340ea6b1198dc6ad26ae1";

export const rawUrl = (file) =>
  `https://raw.githubusercontent.com/bcbooks/scriptures-json/${SOURCE_REF}/${file}`;

/**
 * Each entry drives one Edition (and registers its Work if absent). `sourceFile` is the
 * bcbooks filename (or an array of them, merged in order — the Bible is OT + NT); everything
 * else is edition metadata written verbatim into editions.json. Optional per-entry knobs:
 *   unitLabel   — label for the middle unit ("Chapter" default; D&C uses "Section")
 *   frontMatter — set false to skip title-page/testimonies front matter (the Bible)
 *   shortTitles — true to give each book the dataset's short name for the Library menu
 *                 ("Genesis"), keeping the full traditional title for the reading pane
 */
export const EDITIONS = [
  {
    editionId: "bofm-lds",
    sourceFile: "book-of-mormon.json",
    shortTitles: true,
    work: {
      id: "book-of-mormon",
      title: "The Book of Mormon",
      groups: ["book-of-mormon", "restoration"],
      summary:
        "Scripture of the Latter Day Saint movement, first published at Palmyra, New York, in 1830.",
    },
    edition: {
      title: "Book of Mormon (LDS, current text)",
      when: {
        type: "instant",
        date: { year: 1920 },
        note: "Current LDS versification (standardized 1920); the verse text itself is public domain.",
      },
      licence: "public-domain",
      provenance:
        "Full text from the bcbooks/scriptures-json dataset (current LDS versification). Public-domain verse text and original abridgment headnotes only — modern copyrighted footnotes and chapter summaries are excluded.",
      sources: [
        { label: "bcbooks/scriptures-json", url: "https://github.com/bcbooks/scriptures-json" },
      ],
    },
  },
  {
    editionId: "dc-lds",
    sourceFile: "doctrine-and-covenants.json",
    unitLabel: "Section",
    work: {
      id: "doctrine-and-covenants",
      title: "The Doctrine and Covenants",
      groups: ["lds", "restoration"],
      summary:
        "Revelations and inspired declarations of the Latter Day Saint movement, first published at Kirtland, Ohio, in 1835.",
    },
    edition: {
      title: "Doctrine and Covenants (LDS, current text)",
      when: {
        type: "span",
        start: { year: 1835 },
        end: { year: 1981 },
        note: "First published Kirtland, Ohio, 1835; current LDS section/verse arrangement (versified 1876, 1981 edition). The revelation text is public domain.",
      },
      licence: "public-domain",
      provenance:
        "Full text from the bcbooks/scriptures-json dataset (current LDS versification, 138 sections). Public-domain revelation text; the dataset carries no modern section summaries or footnotes.",
      sources: [
        { label: "bcbooks/scriptures-json", url: "https://github.com/bcbooks/scriptures-json" },
      ],
    },
  },
  {
    editionId: "pgp-lds",
    sourceFile: "pearl-of-great-price.json",
    shortTitles: true,
    work: {
      id: "pearl-of-great-price",
      title: "The Pearl of Great Price",
      groups: ["lds", "restoration"],
      summary:
        "A selection of revelations, translations, and writings of Joseph Smith, first compiled at Liverpool in 1851.",
    },
    edition: {
      title: "Pearl of Great Price (LDS, current text)",
      when: {
        type: "instant",
        date: { year: 1851 },
        note: "First compiled Liverpool, 1851; current LDS edition arrangement. Public-domain text.",
      },
      licence: "public-domain",
      provenance:
        "Full text from the bcbooks/scriptures-json dataset (current LDS versification). Public-domain text; no modern study apparatus.",
      sources: [
        { label: "bcbooks/scriptures-json", url: "https://github.com/bcbooks/scriptures-json" },
      ],
    },
  },
  {
    editionId: "kjv",
    sourceFile: ["old-testament.json", "new-testament.json"],
    frontMatter: false,
    shortTitles: true,
    work: {
      id: "bible",
      title: "The Holy Bible",
      groups: ["bible"],
      summary:
        "The Christian scriptures; the King James (Authorized) Version was first published in 1611 and standardized in Benjamin Blayney's 1769 edition.",
    },
    edition: {
      title: "King James Version (1769)",
      when: {
        type: "instant",
        date: { year: 1769 },
        note: "Benjamin Blayney's 1769 standardized text of the 1611 Authorized Version. Public domain.",
      },
      licence: "public-domain",
      provenance:
        "Old and New Testaments from the bcbooks/scriptures-json dataset (King James Version). Public domain.",
      sources: [
        { label: "bcbooks/scriptures-json", url: "https://github.com/bcbooks/scriptures-json" },
      ],
    },
  },
];
