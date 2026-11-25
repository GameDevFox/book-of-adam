import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MAX_SUGGESTIONS, isReference, referenceUrl, suggestions } from "./reference";
import { BOOKS } from "./reference-books";

describe("referenceUrl", () => {
  it("opens book, chapter and verse in the Library", () => {
    expect(referenceUrl("Rom 1 23")).toBe("/library/kjv/romans/1?verse=23");
    expect(referenceUrl("1 Ne 3:7")).toBe("/library/bofm-lds/1-nephi/3?verse=7");
    expect(referenceUrl("1ne 3 7")).toBe("/library/bofm-lds/1-nephi/3?verse=7");
  });

  it("opens a verse range", () => {
    expect(referenceUrl("Alma 32:21-23")).toBe("/library/bofm-lds/alma/32?verse=21-23");
    expect(referenceUrl("Alma 32:21–23")).toBe("/library/bofm-lds/alma/32?verse=21-23");
  });

  it("forgives a misspelt book (nearest name by edit distance)", () => {
    expect(referenceUrl("Moser 2:11-12")).toBe("/library/pgp-lds/moses/2?verse=11-12");
  });

  it("opens a chapter, or a book at its first chapter", () => {
    expect(referenceUrl("Matt 23")).toBe("/library/kjv/matthew/23");
    expect(referenceUrl("Matt")).toBe("/library/kjv/matthew/1");
  });

  it("tells John from 1 John", () => {
    expect(referenceUrl("John 3:16")).toBe("/library/kjv/john/3?verse=16");
    expect(referenceUrl("1 John 4")).toBe("/library/kjv/1-john/4");
  });

  it("reads the D&C by section, and punctuated abbreviations", () => {
    expect(referenceUrl("D&C 76:22")).toBe("/library/dc-lds/doctrine-and-covenants/76?verse=22");
    expect(referenceUrl("JS-H 1:17")).toBe("/library/pgp-lds/joseph-smith-history/1?verse=17");
  });

  it("reads a single number in a one-chapter book as the verse", () => {
    expect(referenceUrl("AoF 13")).toBe("/library/pgp-lds/articles-of-faith/1?verse=13");
    expect(referenceUrl("Jude 1:3")).toBe("/library/kjv/jude/1?verse=3");
    expect(referenceUrl("Enos")).toBe("/library/bofm-lds/enos/1");
  });

  it("opens the Apocrypha", () => {
    expect(referenceUrl("Sir 2:1")).toBe("/library/kjv-apocrypha/sirach/2?verse=1");
    expect(referenceUrl("1 Macc 3")).toBe("/library/kjv-apocrypha/i-maccabees/3");
    expect(referenceUrl("Tobit 4")).toBe("/library/kjv-apocrypha/tobit/4");
  });

  it("opens the Journal of Discourses by volume and page", () => {
    expect(referenceUrl("JD 1:62")).toBe("/library/jod/1/62");
    expect(referenceUrl("JoD 12 3")).toBe("/library/jod/12/3");
    expect(referenceUrl("Journal of Discourses 4")).toBe("/library/jod/4/1");
  });

  it("finds nothing without a book", () => {
    expect(referenceUrl("")).toBeNull();
    expect(referenceUrl("   ")).toBeNull();
    expect(referenceUrl("3:7")).toBeNull();
  });
});

describe("isReference", () => {
  it("takes anything ending in a chapter number as a reference, misspelt or not", () => {
    expect(isReference("1 Ne 3:7")).toBe(true);
    expect(isReference("Moser 2")).toBe(true);
    expect(isReference("JD 1:62")).toBe(true);
    expect(isReference("Journal of Discourses 4")).toBe(true);
  });

  it("takes a bare book name or alias, typed exactly, as a reference", () => {
    expect(isReference("Moroni")).toBe(true);
    expect(isReference("genesis")).toBe(true);
    expect(isReference("Matt")).toBe(true);
    expect(isReference("D&C")).toBe(true);
  });

  it("leaves words for the text search", () => {
    expect(isReference("new and everlasting covenant")).toBe(false);
    expect(isReference("faith")).toBe(false);
    expect(isReference("Moser")).toBe(false);
    expect(isReference("the 12 apostles")).toBe(false);
    expect(isReference("")).toBe(false);
  });
});

describe("referenceUrl, text that is not a reference", () => {
  it("opens nothing rather than the nearest-spelt book", () => {
    expect(referenceUrl("new and everlasting covenant")).toBeNull();
    expect(referenceUrl("faith")).toBeNull();
  });
});

describe("suggestions", () => {
  const labels = (input: string) => suggestions(input).map((s) => s.label);

  it("lists each book the letters begin, with the chapter typed", () => {
    expect(labels("e 3")).toEqual([
      "Exodus 3",
      "Ezra 3",
      "Esther 3",
      "Ecclesiastes 3",
      "Ezekiel 3",
      "Ephesians 3",
      "Enos 1:3",
      "Ether 3",
      "Sirach 3",
    ]);
    expect(labels("1 c 3")).toEqual(["1 Chronicles 3", "1 Corinthians 3"]);
  });

  it("carries a verse or range into each row", () => {
    expect(labels("1 c 3:16-18")).toEqual(["1 Chronicles 3:16–18", "1 Corinthians 3:16–18"]);
  });

  it("links each row where referenceUrl would", () => {
    expect(suggestions("1 Ne 3:7")).toEqual([
      { label: "1 Nephi 3:7", url: referenceUrl("1 Ne 3:7") },
    ]);
  });

  it("lists nothing until a chapter is typed — never a book's chapters", () => {
    expect(labels("Gen")).toEqual([]);
    expect(labels("e")).toEqual([]);
    expect(labels("3")).toEqual([]);
    expect(labels("1 3")).toEqual([]);
  });

  it(`lists nothing when more than ${MAX_SUGGESTIONS} books would fit`, () => {
    // "fi" begins 11 books' "first …" aliases; "e 3" (9, above) is listed.
    expect(labels("fi 3")).toEqual([]);
  });

  it("drops a book too short for the chapter", () => {
    // Exodus (40), Ecclesiastes (12), Ether (15)… drop; Enos's lone number is a verse (unchecked).
    expect(labels("e 45")).toEqual(["Ezekiel 45", "Enos 1:45", "Sirach 45"]);
    expect(labels("obad 2:3")).toEqual([]);
  });

  it("puts a book the letters name exactly first", () => {
    expect(labels("Mos 3")).toEqual(["Moses 3", "Mosiah 3"]);
  });

  it("includes the Journal of Discourses by volume, up to its last", () => {
    expect(labels("jo 3")).toContain("JD 3");
    // "jd" also begins Judith's "jdt"; the JoD, which it names exactly, leads.
    expect(suggestions("JD 3:62")[0]).toEqual({ label: "JD 3:62", url: "/library/jod/3/62" });
    expect(labels("JD 27")).toEqual([]);
  });

  it("lists nothing for letters no book begins", () => {
    expect(labels("Moser 2")).toEqual([]);
  });
});

describe("the book table", () => {
  const editions: { id: string; contents: string[] }[] = JSON.parse(
    readFileSync("data/texts/editions.json", "utf8"),
  );
  const chapterCount = (edition: string, file: string) =>
    JSON.parse(readFileSync(`data/texts/content/${edition}/${file}.json`, "utf8")).units.length;

  it("names only files the Library has, with each book's chapter count", () => {
    for (const book of BOOKS) {
      const edition = editions.find((e) => e.id === book.edition);
      expect(edition?.contents, book.title).toContain(book.file);
      expect(book.chapters, book.title).toBe(chapterCount(book.edition, book.file));
    }
  });
});
