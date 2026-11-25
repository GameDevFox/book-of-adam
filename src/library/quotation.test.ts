import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { TextUnit } from "../records/texts";
import { quotationFor } from "./quotation";

/** A chapter of a real content file, and the source for a selection of its passages. */
const load = (edition: string, file: string, chapterId: string) => {
  const book: TextUnit = JSON.parse(
    readFileSync(`data/texts/content/${edition}/${file}.json`, "utf8"),
  );
  const chapter = book.units!.find((u) => u.id === chapterId)!;
  const unit = (id: string) => chapter.units!.find((u) => u.id === id)!;
  const source = (ids: string[]) => ({
    edition,
    file,
    book,
    chapter,
    passages: ids.map((id) => ({ n: Number(id.replace(/^[ps]/, "")), unit: unit(id) })),
  });
  return { unit, source };
};

describe("scripture (the default)", () => {
  const galatians = load("kjv", "galatians", "6");

  it("quotes one verse unnumbered, the reference beneath — the owner's example", () => {
    expect(quotationFor(galatians.source(["17"])).text).toBe(
      `"From henceforth let no man trouble me: for I bear in my body the marks of the Lord Jesus."
    - Galatians 6:17`,
    );
  });

  it("numbers several verses, a blank line between — the owner's example", () => {
    expect(quotationFor(galatians.source(["17", "18"])).text).toBe(
      `"17 From henceforth let no man trouble me: for I bear in my body the marks of the Lord Jesus.

18 Brethren, the grace of our Lord Jesus Christ be with your spirit. Amen."
    - Galatians 6:17-18`,
    );
  });

  it("marks each gap with a line of “…”, and lists the runs in the reference", () => {
    const rev = load("kjv", "revelation", "3");
    const v = (id: string) => rev.unit(id).text;
    const quote = quotationFor(rev.source(["4", "7", "8"]));
    expect(quote.text).toBe(
      `"4 ${v("4")}\n\n…\n\n7 ${v("7")}\n\n8 ${v("8")}"\n    - Revelation 3:4, 7-8`,
    );
    expect(quote.reference).toBe("Revelation 3:4, 7-8");
  });

  it("names each book as the reference search does", () => {
    const dc = load("dc-lds", "doctrine-and-covenants", "76");
    expect(quotationFor(dc.source(["22"])).reference).toBe("Doctrine and Covenants 76:22");
    const nephi = load("bofm-lds", "1-nephi", "3");
    expect(quotationFor(nephi.source(["7"])).reference).toBe("1 Nephi 3:7");
  });
});

describe("Journal of Discourses", () => {
  const salvation = load("jod-mrm", "volume-01", "d1");
  const p = (id: string) => salvation.unit(id).text;

  it("cites speaker, volume and printed page, with no paragraph numbers", () => {
    expect(quotationFor(salvation.source(["p3"])).text).toBe(
      `"${p("p3")}"\n    - Brigham Young, JD 1:1 (January 16, 1853)`,
    );
  });

  it("rejoins a paragraph a page or column break split, and cites the pages it spans", () => {
    // p2 continues p1 across a column break; p4 continues p3 onto page 2.
    const quote = quotationFor(salvation.source(["p1", "p2", "p3", "p4"]));
    expect(quote.text).toBe(
      `"${p("p1")} ${p("p2")}\n\n${p("p3")} ${p("p4")}"\n    - Brigham Young, JD 1:1-2 (January 16, 1853)`,
    );
  });

  it("marks a gap, and lists the pages apart when they are not consecutive", () => {
    // p11 begins on page 3.
    expect(quotationFor(salvation.source(["p1", "p11"])).text).toBe(
      `"${p("p1")}\n\n…\n\n${p("p11")}"\n    - Brigham Young, JD 1:1, 3 (January 16, 1853)`,
    );
  });
});

describe("Eliza R. Snow poems", () => {
  const newYear = load("ers-lexicon", "poems-201-225", "216");
  const lines = (id: string) =>
    (newYear.unit(id).text ?? "")
      .split("\n")
      .map((line) => line.replace(/^\t+/, ""))
      .join("\n");

  it("keeps a stanza's lines, drops the source's indentation, cites title and printing", () => {
    expect(quotationFor(newYear.source(["s8"])).text).toBe(
      `"${lines("s8")}"\n    - Eliza R. Snow, “The New Year 1852” (Deseret News, 10 January 1852)`,
    );
  });

  it("numbers no stanzas, and marks a gap", () => {
    expect(quotationFor(newYear.source(["s1", "s8"])).text).toBe(
      `"${lines("s1")}\n\n…\n\n${lines("s8")}"\n    - Eliza R. Snow, “The New Year 1852” (Deseret News, 10 January 1852)`,
    );
  });

  it("falls back to when it was composed", () => {
    const farmersWife = load("ers-lexicon", "poems-001-025", "9");
    expect(quotationFor(farmersWife.source(["s1"])).reference).toBe(
      "Eliza R. Snow, “The Farmer’s Wife” (composed 1828)",
    );
  });
});
