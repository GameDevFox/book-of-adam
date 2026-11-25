import { describe, expect, it } from "vitest";

import {
  capital,
  DESERET_CAPITAL_FIRST,
  DESERET_CASE_OFFSET,
  DESERET_LAST,
  DESERET_LETTERS,
  isDeseret,
  LETTER_GROUPS,
  small,
  toDeseretLower,
  toDeseretUpper,
} from "./alphabet";

describe("Deseret alphabet inventory", () => {
  it("has the 40 letters of the Unicode block, in codepoint order", () => {
    expect(DESERET_LETTERS).toHaveLength(40);
    expect(DESERET_CASE_OFFSET).toBe(0x28);
    // The block is exactly the two cases back to back, no gaps.
    expect(DESERET_LAST - DESERET_CAPITAL_FIRST + 1).toBe(DESERET_LETTERS.length * 2);
  });

  it("derives glyphs at their real codepoints", () => {
    // Anchored to the UCD rather than to our own arithmetic: U+10400 LONG I, U+10428 its
    // lowercase, U+1044C SMALL EN (the 37th letter).
    expect(capital("LONG_I")).toBe("\u{10400}");
    expect(small("LONG_I")).toBe("\u{10428}");
    expect(small("EN")).toBe("\u{1044C}");
    expect(capital("EW")).toBe("\u{10427}");
  });

  it("keeps case a fixed offset for every letter", () => {
    for (const { name } of DESERET_LETTERS) {
      expect(small(name).codePointAt(0)! - capital(name).codePointAt(0)!).toBe(DESERET_CASE_OFFSET);
    }
  });

  it("names every letter uniquely", () => {
    expect(new Set(DESERET_LETTERS.map((l) => l.name)).size).toBe(DESERET_LETTERS.length);
  });

  it("marks only the two never-cast letters as having no SAMPA value", () => {
    const uncast = DESERET_LETTERS.filter((l) => l.sampa === null).map((l) => l.name);
    expect(uncast).toEqual(["OI", "EW"]);
  });
});

describe("Deseret case conversion", () => {
  it("round-trips through both cases", () => {
    const word = ["EN", "LONG_I", "EF", "AY"].map((n) => small(n as never)).join("");
    expect(toDeseretLower(toDeseretUpper(word))).toBe(word);
    expect(toDeseretUpper(word)).not.toBe(word);
  });

  it("leaves non-Deseret characters untouched", () => {
    expect(toDeseretUpper("abc 123")).toBe("abc 123");
    expect(toDeseretLower(`x${capital("BEE")}`)).toBe(`x${small("BEE")}`);
  });

  it("recognizes Deseret text but not Latin or empty strings", () => {
    expect(isDeseret(small("BEE") + capital("BEE"))).toBe(true);
    expect(isDeseret("b")).toBe(false);
    expect(isDeseret(small("BEE") + "b")).toBe(false);
    expect(isDeseret("")).toBe(false);
  });
});

describe("primer groups", () => {
  it("cover every letter exactly once, in order", () => {
    let expected = 0;
    for (const group of LETTER_GROUPS) {
      expect(group.from, `${group.title} leaves a gap`).toBe(expected);
      expect(group.to).toBeGreaterThan(group.from);
      expected = group.to;
    }
    expect(expected).toBe(DESERET_LETTERS.length);
  });

  it("give every letter a spoken name and an example word", () => {
    for (const letter of DESERET_LETTERS) {
      expect(letter.label, `${letter.name} has no name`).not.toBe("");
      expect(letter.example, `${letter.name} has no example`).not.toBe("");
    }
  });

  it("puts exactly the never-cast pair in the last group", () => {
    const last = LETTER_GROUPS[LETTER_GROUPS.length - 1];
    expect(DESERET_LETTERS.slice(last.from, last.to).map((l) => l.name)).toEqual(["OI", "EW"]);
  });
});
