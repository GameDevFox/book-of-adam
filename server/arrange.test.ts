import { describe, expect, it } from "vitest";

import type { OutlineNode } from "../src/records/texts";
import { arrangeByYear, poemDating, titleSortKey, YEAR_UNCERTAIN, YEAR_UNKNOWN } from "./arrange";

const poem = (id: string, title: string, meta?: Record<string, string>) => ({
  node: { id, title, kind: "reading", edition: "ers", file: "f", path: [id] } as OutlineNode,
  meta,
});

describe("poemDating", () => {
  it("dates a poem by its composition date, to the day where given", () => {
    expect(poemDating({ composed: "13 July 1826" })).toEqual({
      kind: "dated",
      year: 1826,
      month: 7,
      day: 13,
    });
    expect(poemDating({ composed: "1828" })).toEqual({ kind: "dated", year: 1828 });
    expect(poemDating({ dated: "11 March 1879" })).toMatchObject({ year: 1879, month: 3 });
  });

  it("falls back to the first printing in a periodical", () => {
    expect(poemDating({ published: "Western Courier, 13 August 1825" })).toEqual({
      kind: "dated",
      year: 1825,
      month: 8,
      day: 13,
    });
  });

  it("prefers the composition date to a printing", () => {
    expect(
      poemDating({ composed: "1840", published: "Times and Seasons, 1 March 1842" }),
    ).toMatchObject({ year: 1840 });
  });

  it("calls a poem known only from a reprint in her Poems collection uncertain", () => {
    expect(poemDating({ published: "Poems 1, 1856" })).toEqual({
      kind: "uncertain",
      note: "Poems 1, 1856",
    });
  });

  it("calls a poem with no year anywhere unknown", () => {
    expect(poemDating({ date: "n.d." })).toEqual({ kind: "unknown" });
    expect(poemDating(undefined)).toEqual({ kind: "unknown" });
  });
});

describe("titleSortKey", () => {
  it("ignores a leading article and opening quotes, and case", () => {
    expect(titleSortKey("The Bride's Farewell")).toBe(titleSortKey("bride's farewell"));
    expect(titleSortKey("“A Song”")).toBe(titleSortKey("song”"));
    expect(titleSortKey("Another Day") < titleSortKey("The Bride")).toBe(true);
  });
});

describe("arrangeByYear", () => {
  const groups = arrangeByYear([
    poem("3", "Late Summer", { composed: "20 August 1826" }),
    poem("1", "Pity &c", { published: "Western Courier, 13 August 1825" }),
    poem("4", "Undated Spring", { composed: "1826" }),
    poem("2", "Early Summer", { composed: "13 July 1826" }),
    poem("5", "Nauvoo", { composed: "1842" }),
    poem("9", "The Zeal", { date: "n.d." }),
    poem("7", "A Hymn", { published: "Poems 1, 1856" }),
    poem("8", "Anthem", {}),
    poem("6", "“Beloved”", { published: "Poems 2, 1877" }),
  ]);
  const titles = (node: OutlineNode) => node.children?.map((n) => `${n.kind}:${n.title}`);

  it("makes one group per decade in order, then Year Uncertain, then Year Unknown", () => {
    expect(groups.map((g) => g.title)).toEqual(["1820s", "1840s", YEAR_UNCERTAIN, YEAR_UNKNOWN]);
    expect(groups.every((g) => g.kind === "group")).toBe(true);
  });

  it("counts each group's poems, not its dividers", () => {
    expect(groups.map((g) => g.count)).toEqual([4, 1, 2, 2]);
  });

  it("separates a decade's years with dividers, a year in month-and-day order", () => {
    expect(titles(groups[0])).toEqual([
      "divider:1825",
      "reading:Pity &c",
      "divider:1826",
      "reading:Early Summer",
      "reading:Late Summer",
      "reading:Undated Spring",
    ]);
    expect(titles(groups[1])).toEqual(["divider:1842", "reading:Nauvoo"]);
  });

  it("lists the two final groups alphabetically, with no dividers", () => {
    expect(titles(groups[2])).toEqual(["reading:“Beloved”", "reading:A Hymn"]);
    expect(titles(groups[3])).toEqual(["reading:Anthem", "reading:The Zeal"]);
  });

  it("keeps each poem's own coordinates, so its link does not change", () => {
    expect(groups[0].children?.[1]).toMatchObject({ file: "f", path: ["1"] });
  });

  it("leaves out a final group that would be empty", () => {
    const only = arrangeByYear([poem("1", "Pity &c", { composed: "1825" })]);
    expect(only.map((g) => g.title)).toEqual(["1820s"]);
  });
});
