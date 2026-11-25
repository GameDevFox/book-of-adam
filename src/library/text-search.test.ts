import { describe, expect, it } from "vitest";

import { excerptParts, hitsOf, mergeRanked, searchUrl, type PagefindData } from "./text-search";

describe("searchUrl", () => {
  it("carries the text as typed, trimmed and encoded", () => {
    expect(searchUrl("  new & everlasting ")).toBe("/library/search?q=new%20%26%20everlasting");
  });
});

describe("excerptParts", () => {
  it("splits Pagefind's excerpt into plain and marked runs, as text", () => {
    expect(excerptParts("the new and <mark>everlasting</mark> <mark>covenant.</mark> of")).toEqual([
      { text: "the new and ", marked: false },
      { text: "everlasting", marked: true },
      { text: " ", marked: false },
      { text: "covenant.", marked: true },
      { text: " of", marked: false },
    ]);
  });

  it("decodes what Pagefind escapes, and leaves a bare ampersand alone", () => {
    expect(excerptParts("Latter-day &lt;Saints&gt; & friends")).toEqual([
      { text: "Latter-day <Saints> & friends", marked: false },
    ]);
  });
});

// Word positions as Pagefind counts them: the reading's text split on spaces, the title first
// (positions 0-3), then each passage's heading ("¶1.") followed by its words.
const DISCOURSE: PagefindData = {
  url: "/library/jod/1/62",
  content:
    "Salvation and the Covenant ¶1. The plan of the new covenant here. ¶2. Nothing. ¶3. A New Covenant again",
  anchors: [
    { element: "h2", id: "p1", location: 4 },
    { element: "h2", id: "p2", location: 12 },
    { element: "h2", id: "p3", location: 14 },
  ],
  meta: {
    title: "Salvation and the Covenant",
    reference: "Brigham Young, JD 1:62-65",
    refs: JSON.stringify({ p1: "Brigham Young, JD 1:62", p3: "Brigham Young, JD 1:64" }),
  },
  // Pagefind's exact-phrase mode reports only the first occurrence in a reading.
  sub_results: [
    { title: "¶1", url: "/library/jod/1/62#p1", excerpt: "¶1. The plan of the <mark>new</mark>" },
  ],
};

describe("hitsOf", () => {
  it("finds every passage holding the phrase, not only the first Pagefind reports", () => {
    expect(hitsOf(DISCOURSE, [["new", "covenant"]]).map((h) => h.url)).toEqual([
      "/library/jod/1/62?verse=1",
      "/library/jod/1/62?verse=3",
    ]);
  });

  it("cites each passage and marks the phrase in its excerpt", () => {
    const [first, third] = hitsOf(DISCOURSE, [["new", "covenant"]]);
    expect(first.reference).toBe("Brigham Young, JD 1:62");
    expect(first.excerpt).toEqual([
      { text: "The plan of the ", marked: false },
      { text: "new covenant", marked: true },
      { text: " here.", marked: false },
    ]);
    expect(third.excerpt).toEqual([
      { text: "A ", marked: false },
      { text: "New Covenant", marked: true },
      { text: " again", marked: false },
    ]);
  });

  it("lists a match in the title as the reading itself", () => {
    const [title] = hitsOf(DISCOURSE, [["covenant"]]);
    expect(title).toMatchObject({
      url: "/library/jod/1/62",
      reference: "Brigham Young, JD 1:62-65",
      inTitle: true,
    });
  });

  it("matches any of several spellings", () => {
    const hits = hitsOf(DISCOURSE, [
      ["old", "covenant"],
      ["plan", "of"],
    ]);
    expect(hits.map((h) => h.url)).toEqual(["/library/jod/1/62?verse=1"]);
  });

  it("reads a word run together with the next (God,and) as both words", () => {
    const typo = {
      ...DISCOURSE,
      content: "T ¶1. get the Spirit of God,and let",
      anchors: [{ element: "h2", id: "p1", location: 1 }],
    };
    const [hit] = hitsOf(typo, [["spirit", "of", "god"]]);
    expect(hit.url).toBe("/library/jod/1/62?verse=1");
    expect(hit.excerpt).toEqual([
      { text: "get the ", marked: false },
      { text: "Spirit of God,and", marked: true },
      { text: " let", marked: false },
    ]);
  });

  it("shortens a long passage around the match", () => {
    const long = {
      ...DISCOURSE,
      content: `T ¶1. ${"a ".repeat(30)}new covenant${" b".repeat(30)}`,
      anchors: [{ element: "h2", id: "p1", location: 1 }],
    };
    const [hit] = hitsOf(long, [["new", "covenant"]]);
    expect(hit.excerpt[0].text.startsWith("… ")).toBe(true);
    expect(hit.excerpt.at(-1)?.text.endsWith(" …")).toBe(true);
  });

  it("falls back to Pagefind's own hit when only a stem matched (covenants → covenant)", () => {
    const hits = hitsOf(DISCOURSE, [["new", "covenants"]]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      url: "/library/jod/1/62?verse=1",
      reference: "Brigham Young, JD 1:62",
    });
    expect(hits[0].excerpt).toEqual([
      { text: "The plan of the ", marked: false },
      { text: "new", marked: true },
    ]);
  });
});

describe("mergeRanked", () => {
  it("keeps each page once, at its best score, best first", () => {
    const merged = mergeRanked([
      [
        { id: "a", score: 1 },
        { id: "b", score: 5 },
      ],
      [
        { id: "a", score: 9 },
        { id: "c", score: 2 },
      ],
    ]);
    expect(merged.map((r) => [r.id, r.score])).toEqual([
      ["a", 9],
      ["b", 5],
      ["c", 2],
    ]);
  });
});
