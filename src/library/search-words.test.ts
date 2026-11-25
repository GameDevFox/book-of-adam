import { describe, expect, it } from "vitest";

import { searchWords } from "./search-words";

describe("searchWords — the index's view of a passage's words", () => {
  it("lowercases and splits on spaces and punctuation", () => {
    expect(searchWords("The Spirit of God, saith he.")).toEqual([
      "the",
      "spirit",
      "of",
      "god",
      "saith",
      "he",
    ]);
  });

  it("joins a hyphenated word, as Pagefind indexes it", () => {
    expect(searchWords("Latter-day Saints, long-suffering")).toEqual([
      "latterday",
      "saints",
      "longsuffering",
    ]);
  });

  it("breaks at an em-dash, even with no spaces around it", () => {
    expect(searchWords("the Spirit of God—the Spirit")).toEqual([
      "the",
      "spirit",
      "of",
      "god",
      "the",
      "spirit",
    ]);
  });

  it("keeps an apostrophe's word whole", () => {
    expect(searchWords("don’t and don't")).toEqual(["dont", "and", "dont"]);
  });

  it("finds nothing in punctuation alone", () => {
    expect(searchWords(" — , . ")).toEqual([]);
  });
});
