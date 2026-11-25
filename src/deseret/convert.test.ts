import { describe, expect, it } from "vitest";

import { capital, small, type DeseretLetterName } from "./alphabet";
import { convertPhonemes, convertText, matchCase, segmentsToString } from "./convert";
import { MODERN_AMERICAN, type ConventionProfile } from "./profiles";

/** Build an expected string from letter NAMES, so no test hand-types a 4-byte glyph. */
const spell = (...names: DeseretLetterName[]): string => names.map(small).join("");

/** Every ARPAbet phoneme CMUdict can emit, bare of stress. */
const ARPABET = [
  "AA",
  "AE",
  "AH",
  "AO",
  "AW",
  "AY",
  "B",
  "CH",
  "D",
  "DH",
  "EH",
  "ER",
  "EY",
  "F",
  "G",
  "HH",
  "IH",
  "IY",
  "JH",
  "K",
  "L",
  "M",
  "N",
  "NG",
  "OW",
  "OY",
  "P",
  "R",
  "S",
  "SH",
  "T",
  "TH",
  "UH",
  "UW",
  "V",
  "W",
  "Y",
  "Z",
  "ZH",
];

describe("phonemes to Deseret", () => {
  it("covers the whole ARPAbet inventory", () => {
    expect(ARPABET).toHaveLength(39);
    for (const phoneme of ARPABET) {
      expect(convertPhonemes([phoneme]), `${phoneme} produced nothing`).not.toBe("");
    }
  });

  it("converts words, anchored to real codepoints", () => {
    // nephi = N IY1 F AY1 -> SMALL EN, LONG I, EF, AY
    expect(convertPhonemes(["N", "IY1", "F", "AY1"])).toBe("\u{1044C}\u{10428}\u{10441}\u{10434}");
    // book = B UH1 K
    expect(convertPhonemes(["B", "UH1", "K"])).toBe(spell("BEE", "SHORT_OO", "KAY"));
    // the = DH AH0 (schwa)
    expect(convertPhonemes(["DH", "AH0"])).toBe(spell("THEE", "SHORT_O"));
  });

  it("writes the two never-cast letters as digraphs", () => {
    // OY has a Unicode letter (OI) that was never cut in metal type.
    expect(convertPhonemes(["B", "OY1"])).toBe(spell("BEE", "LONG_AH", "SHORT_I"));
    // "EW" likewise: Y UW is already two phonemes and needs no special case.
    expect(convertPhonemes(["Y", "UW1"])).toBe(spell("YEE", "LONG_OO"));
  });

  it("distinguishes schwa from the wedge by CMUdict's stress digit", () => {
    const schwaLast: ConventionProfile = { ...MODERN_AMERICAN, schwa: "SHORT_I" };
    // AH1 is /ʌ/ and is unaffected by the schwa knob; AH0 is [ə] and follows it.
    expect(convertPhonemes(["AH1"], schwaLast)).toBe(spell("SHORT_O"));
    expect(convertPhonemes(["AH0"], schwaLast)).toBe(spell("SHORT_I"));
  });

  it("ignores phonemes it does not recognize rather than emitting garbage", () => {
    expect(convertPhonemes(["B", "ZZZ", "K"])).toBe(spell("BEE", "KAY"));
  });
});

describe("convention profile knobs", () => {
  it("AA selects between the merged and unmerged low vowels", () => {
    expect(convertPhonemes(["G", "AA1", "D"])).toBe(spell("GAY", "LONG_A", "DEE"));
    expect(convertPhonemes(["G", "AA1", "D"], { ...MODERN_AMERICAN, aa: "SHORT_AH" })).toBe(
      spell("GAY", "SHORT_AH", "DEE"),
    );
  });

  it("unstressed ER follows its knob while stressed ER does not", () => {
    const historical: ConventionProfile = { ...MODERN_AMERICAN, unstressedEr: "SHORT_E" };
    // father = F AA1 DH ER0 -> the unstressed ending moves; the AA does not.
    expect(convertPhonemes(["F", "AA1", "DH", "ER0"], historical)).toBe(
      spell("EF", "LONG_A", "THEE", "SHORT_E", "ER"),
    );
    // word = W ER1 D -> stressed, so it stays 𐐲𐑉 under both profiles.
    expect(convertPhonemes(["W", "ER1", "D"], historical)).toBe(
      spell("WU", "SHORT_O", "ER", "DEE"),
    );
    expect(convertPhonemes(["W", "ER1", "D"])).toBe(spell("WU", "SHORT_O", "ER", "DEE"));
  });
});

describe("capitalization", () => {
  const bee = spell("BEE");
  const cap = "\u{10412}"; // DESERET CAPITAL LETTER BEE

  it("mirrors the English word's case onto bicameral Deseret", () => {
    expect(matchCase(bee + bee, "book")).toBe(bee + bee);
    expect(matchCase(bee + bee, "Book")).toBe(cap + bee);
    expect(matchCase(bee + bee, "BOOK")).toBe(cap + cap);
  });

  it("treats a single capital letter as initial-caps, not all-caps", () => {
    // "I" and "A" are one letter; upcasing the whole word is the same thing here, but the
    // all-caps branch must not fire on every capitalized word.
    expect(matchCase(bee + bee, "A")).toBe(cap + bee);
  });
});

describe("converting running text", () => {
  const DICT: Record<string, string[]> = {
    the: ["DH", "AH0"],
    book: ["B", "UH1", "K"],
    // Deliberately NOT "the" for the case and profile tests below — it has a one-letter short
    // form, which would mask what those two are actually checking.
    about: ["AH0", "B", "AW1", "T"],
  };
  const lookup = (word: string) => DICT[word] ?? null;

  it("keeps punctuation and spacing, and flags unknown words in Latin", () => {
    const segments = convertText("The book, Nephi!", lookup);
    expect(segments.map((s) => s.kind)).toEqual([
      "word",
      "other",
      "word",
      "other",
      "unknown",
      "other",
    ]);
    expect(segments[4]).toEqual({ kind: "unknown", text: "Nephi" });
    expect(segmentsToString(segments)).toContain("Nephi");
    expect(segmentsToString(segments)).toContain(", ");
  });

  it("looks words up case-insensitively but preserves their case in output", () => {
    const [first] = convertText("Book", lookup);
    expect(first.kind).toBe("word");
    expect(first.text).toBe(capital("BEE") + spell("SHORT_OO", "KAY"));
  });

  it("threads the profile through to the conversion", () => {
    const schwaAsShortI: ConventionProfile = { ...MODERN_AMERICAN, schwa: "SHORT_I" };
    const [unaffected] = convertText("book", lookup, schwaAsShortI);
    expect(unaffected.text).toBe(spell("BEE", "SHORT_OO", "KAY"));
    // "about" opens on a schwa, so the knob moves its first letter.
    const [affected] = convertText("about", lookup, schwaAsShortI);
    expect(affected.text).toBe(spell("SHORT_I", "BEE", "OW", "TEE"));
  });

  it("handles internal apostrophes as part of the word", () => {
    const segments = convertText("Lord's", lookup);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ kind: "unknown", text: "Lord's" });
  });

  it("returns an empty list for empty input", () => {
    expect(convertText("", lookup)).toEqual([]);
  });
});

/**
 * A word pronounced exactly like a letter's NAME may be written as that single letter —
 * "be ye gay" → 𐐒 𐐏 𐐘. Attested and heavily used: 𐐒 stands alone as a word 2,515 times in the
 * 1869 Book of Mormon, 𐐏 2,005 times.
 */
describe("letter-name shorthand", () => {
  const spelledOut: ConventionProfile = { ...MODERN_AMERICAN, letterNames: false };

  it("writes be / ye / gay as one letter each, and is on by default", () => {
    expect(convertPhonemes(["B", "IY1"])).toBe(spell("BEE"));
    expect(convertPhonemes(["Y", "IY1"])).toBe(spell("YEE"));
    expect(convertPhonemes(["G", "EY1"])).toBe(spell("GAY"));
  });

  it("spells the same words out when the toggle is off", () => {
    expect(convertPhonemes(["B", "IY1"], spelledOut)).toBe(spell("BEE", "LONG_I"));
    expect(convertPhonemes(["Y", "IY1"], spelledOut)).toBe(spell("YEE", "LONG_I"));
    expect(convertPhonemes(["G", "EY1"], spelledOut)).toBe(spell("GAY", "LONG_E"));
  });

  it("matches on sound alone, ignoring stress", () => {
    expect(convertPhonemes(["B", "IY0"])).toBe(spell("BEE"));
    expect(convertPhonemes(["B", "IY"])).toBe(spell("BEE"));
  });

  it("leaves words that merely start like a letter name alone", () => {
    // "beat" is B IY T — longer than the name, so no collapse.
    expect(convertPhonemes(["B", "IY1", "T"])).toBe(spell("BEE", "LONG_I", "TEE"));
  });

  it("does not use letters that were never cast, or whose name is unsourced", () => {
    // EW /juː/ and OI /ɔɪ/ have Unicode letters but were never cut in metal type, so "you"
    // stays 𐐷𐐭 rather than collapsing to 𐑏.
    expect(convertPhonemes(["Y", "UW1"])).toBe(spell("YEE", "LONG_OO"));
    // 𐐐's spoken name is given as bare "H", which does not say whether it is "aitch" or "hee",
    // so it stays out. Only the three words below are pronounced ER alone, none of them common.
    expect(convertPhonemes(["HH", "EY1"])).toBe(spell("H", "LONG_E"));
  });

  it("uses 𐐡 now that its name is sourced as 'Ur'", () => {
    // The Illinois Deseret Consortium's character chart names 𐐡 "Ur" — /ɝ/ — so a word that is
    // just that sound writes as the bare letter. Only "er", "ur" and "eure" qualify.
    expect(convertPhonemes(["ER1"])).toBe(spell("ER"));
    // Anything longer is unaffected: "word" keeps its vowel.
    expect(convertPhonemes(["W", "ER1", "D"])).toBe(spell("WU", "SHORT_O", "ER", "DEE"));
  });

  it("applies through running text, with capitalization preserved", () => {
    const dict: Record<string, string[]> = {
      be: ["B", "IY1"],
      ye: ["Y", "IY1"],
      gay: ["G", "EY1"],
    };
    const segments = convertText("Be ye gay", (word) => dict[word] ?? null);
    expect(segmentsToString(segments)).toBe([capital("BEE"), small("YEE"), small("GAY")].join(" "));
  });
});

/**
 * Three function words the 1869 printing writes as a single letter. Keyed on the English word
 * because they are attested spellings, not a derivable rule: "the" drops its schwa, while "a"
 * and "O" are 19th-century vowel choices.
 */
describe("one-letter function words", () => {
  const dict: Record<string, string[]> = {
    the: ["DH", "AH0"],
    a: ["AH0"],
    o: ["OW1"],
    ox: ["AA1", "K", "S"],
  };
  const lookup = (word: string) => dict[word] ?? null;
  const plain: ConventionProfile = { ...MODERN_AMERICAN, shortForms: false };

  it("writes the / a / O as one letter, and is on by default", () => {
    expect(segmentsToString(convertText("the", lookup))).toBe(small("THEE"));
    expect(segmentsToString(convertText("a", lookup))).toBe(small("LONG_A"));
    expect(segmentsToString(convertText("O", lookup))).toBe(capital("LONG_O"));
  });

  it("falls back to the spelled-out pronunciation when the toggle is off", () => {
    // "the" is DH AH0, so without the short form it keeps its schwa.
    expect(segmentsToString(convertText("the", lookup, plain))).toBe(spell("THEE", "SHORT_O"));
    // "a" is a schwa, which the modern profile writes 𐐲 rather than the 1869 𐐪.
    expect(segmentsToString(convertText("a", lookup, plain))).toBe(spell("SHORT_O"));
  });

  it("matches whole words only", () => {
    // "ox" starts with the same letter as the article but is not it.
    expect(segmentsToString(convertText("ox", lookup))).toBe(spell("LONG_A", "KAY", "ES"));
  });

  it("still mirrors capitalization", () => {
    expect(segmentsToString(convertText("The", lookup))).toBe(capital("THEE"));
  });

  it("applies even to a word the dictionary does not know", () => {
    const segments = convertText("the", () => null);
    expect(segments[0]).toEqual({ kind: "word", text: small("THEE"), source: "the" });
  });
});
