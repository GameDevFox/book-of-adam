import { describe, expect, it } from "vitest";

import { MAX_PHRASES, planQuery, type WordCounts } from "./text-query";

/** A miniature corpus word list: word → how many passages contain it. */
const WORDS: WordCounts = new Map([
  ["new", 5000],
  ["we", 9000],
  ["owe", 40],
  ["and", 90000],
  ["an", 20000],
  ["everlasting", 1676],
  ["everliving", 3],
  ["covenant", 2100],
  ["the", 100000],
  ["spirit", 9000],
  ["of", 95000],
  ["god", 30000],
  ["latter", 300],
  ["day", 6000],
  ["latterday", 5000],
  ["saints", 8000],
  ["faith", 4000],
  ["ye", 20000],
]);

describe("planQuery", () => {
  it("quotes several words as one exact phrase", () => {
    expect(planQuery("new and everlasting covenant", WORDS)).toEqual({
      phrases: ['"new and everlasting covenant"'],
      corrections: [],
    });
  });

  it("quotes a single word too, so the engine never falls back to prefix guesses", () => {
    expect(planQuery("faith", WORDS).phrases).toEqual(['"faith"']);
  });

  it("ignores case and stray punctuation", () => {
    expect(planQuery("New And Everlasting, Covenant!", WORDS).phrases).toEqual([
      '"new and everlasting covenant"',
    ]);
  });

  it("corrects a misspelt word to the nearest word in the corpus, and says so", () => {
    expect(planQuery("New And Everlating Covenant", WORDS)).toEqual({
      phrases: ['"new and everlasting covenant"'],
      corrections: [{ typed: "everlating", usedAs: ["everlasting"] }],
    });
  });

  it("allows two typos in a long word, one in a short one", () => {
    expect(planQuery("everlastin covnant", WORDS).phrases).toEqual(['"everlasting covenant"']);
    expect(planQuery("evrlastin", WORDS).phrases).toEqual(['"everlasting"']);
    expect(planQuery("gdo", WORDS).phrases).toEqual(['"god"']);
  });

  it("keeps every equally near word, most common first, and lets the phrase decide", () => {
    expect(planQuery("nwe and everlasting covenant", WORDS)).toEqual({
      phrases: [
        '"we and everlasting covenant"',
        '"new and everlasting covenant"',
        '"owe and everlasting covenant"',
      ],
      corrections: [{ typed: "nwe", usedAs: ["we", "new", "owe"] }],
    });
  });

  it("never corrects a word of one or two letters", () => {
    expect(planQuery("xq faith", WORDS).phrases).toEqual(['"xq faith"']);
    // "fo" is one swap from "of", but two letters are too few to guess from.
    expect(planQuery("fo faith", WORDS).phrases).toEqual(['"fo faith"']);
  });

  it("leaves a word with nothing near it as typed — it will simply find nothing", () => {
    expect(planQuery("zzyzx", WORDS)).toEqual({ phrases: ['"zzyzx"'], corrections: [] });
  });

  it("leaves a word that is in the corpus alone, even when another is near it", () => {
    expect(planQuery("ye", WORDS).phrases).toEqual(['"ye"']);
  });

  it("tries a far commoner neighbour for a word the corpus holds only as a rare typo", () => {
    const typo: WordCounts = new Map([...WORDS, ["covnant", 1]]);
    expect(planQuery("everlasting covnant", typo)).toEqual({
      phrases: ['"everlasting covnant"', '"everlasting covenant"'],
      corrections: [{ typed: "covnant", usedAs: ["covenant"] }],
    });
  });

  it("leaves a rare word alone when no neighbour is far commoner", () => {
    const rare: WordCounts = new Map([...WORDS, ["owen", 1]]);
    expect(planQuery("owen", rare).phrases).toEqual(['"owen"']);
  });

  it("also tries two neighbouring words joined, as a hyphenated word is indexed", () => {
    expect(planQuery("latter day saints", WORDS).phrases).toEqual([
      '"latter day saints"',
      '"latterday saints"',
    ]);
  });

  it("treats a typed hyphen like the index does", () => {
    expect(planQuery("Latter-day Saints", WORDS).phrases).toEqual(['"latterday saints"']);
  });

  it("caps how many phrases one query runs", () => {
    const many: WordCounts = new Map([...WORDS, ["cat", 1], ["bat", 1], ["hat", 1], ["mat", 1]]);
    const { phrases } = planQuery("zat zat zat", many);
    expect(phrases.length).toBe(MAX_PHRASES);
    // Two readings ("latter day", "latterday") of eight combinations each: still capped.
    expect(planQuery("latter day zat zat zat", many).phrases.length).toBe(MAX_PHRASES);
  });

  it("plans nothing for nothing", () => {
    expect(planQuery("  — ", WORDS)).toEqual({ phrases: [], corrections: [] });
  });
});
