import { describe, expect, it } from "vitest";

import { bylineOf, isOrnamentUnit, lineIndent, textLines, unitLabel } from "./labels";

describe("unitLabel", () => {
  it("shows a poem's stanza as a plain number", () => {
    expect(unitLabel("s1")).toBe("1");
    expect(unitLabel("s12")).toBe("12");
  });

  it("keeps the paragraph sign for prose paragraphs, and verse numbers as they are", () => {
    expect(unitLabel("p3")).toBe("¶3");
    expect(unitLabel("16")).toBe("16");
  });
});

describe("textLines", () => {
  it("splits a stanza into its lines", () => {
    expect(textLines("If there’s a smile\nIt is the farmer’s")).toEqual([
      "If there’s a smile",
      "It is the farmer’s",
    ]);
  });

  it("leaves text without line breaks whole", () => {
    expect(textLines("A paragraph of prose.")).toEqual(["A paragraph of prose."]);
  });
});

describe("bylineOf", () => {
  it("keeps a JoD discourse's byline as it was", () => {
    expect(
      bylineOf({
        speaker: "Brigham Young",
        date: "January 16, 1853",
        reporter: "G. D. Watt",
        pages: "1-6",
      }),
    ).toBe("Brigham Young  ·  January 16, 1853  ·  reported by G. D. Watt  ·  pp. 1-6");
  });

  it("gives a poem its subtitle, composition date and printing", () => {
    expect(
      bylineOf({
        number: "444",
        subtitle: "Written in London",
        composed: "24 November 1872",
        published: "Woman’s Exponent, 1 February 1873",
      }),
    ).toBe(
      "Written in London  ·  Composed 24 November 1872  ·  Published in Woman’s Exponent, 1 February 1873",
    );
    expect(bylineOf({ dated: "11 March 1879" })).toBe("Dated 11 March 1879");
  });

  it("does not print an n.d. ('no date') note, nor the edition's poem number", () => {
    expect(bylineOf({ number: "12", date: "n.d." })).toBe("");
  });
});

describe("lineIndent", () => {
  it("turns the source's leading tabs into an indent level", () => {
    expect(lineIndent("\tThat nature’s law")).toEqual({ text: "That nature’s law", level: 1 });
    expect(lineIndent("Plain line")).toEqual({ text: "Plain line", level: 0 });
  });

  it("caps a deeply stepped line so it cannot run off a phone screen", () => {
    expect(lineIndent("\t".repeat(12) + "Here are men").level).toBe(8);
  });
});

describe("isOrnamentUnit", () => {
  it("knows a divider stanza by its id", () => {
    expect(isOrnamentUnit("orn1")).toBe(true);
    expect(isOrnamentUnit("s1")).toBe(false);
  });
});
