import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { capital, small, type DeseretLetterName } from "./alphabet";
import { convertText, segmentsToString } from "./convert";
import { createLookup, parseDictionary, parseFrequency, type LexiconEntry } from "./dictionary";
import {
  deseretReadings,
  phonemesToSpelling,
  reverseSegmentsToString,
  reverseText,
} from "./reverse";
import { MODERN_AMERICAN } from "./profiles";

const spell = (...names: DeseretLetterName[]): string => names.map(small).join("");

describe("reading Deseret back into phonemes", () => {
  it("sounds out a word letter by letter", () => {
    // 𐑌𐐨𐑁𐐴 — Nephi.
    expect(deseretReadings(spell("EN", "LONG_I", "EF", "AY"))[0]).toEqual(["N", "IY", "F", "AY"]);
  });

  it("reads letter pairs that spell one sound", () => {
    // 𐐲𐑉 is ER, not AH + R. They sound alike aloud, which is all a decoding aid needs.
    expect(deseretReadings(spell("WU", "SHORT_O", "ER", "DEE"))[0]).toEqual(["W", "ER", "D"]);
    expect(deseretReadings(spell("BEE", "LONG_AH", "SHORT_I"))[0]).toEqual(["B", "OY"]);
  });

  it("accepts both the modern and the 1869 spelling of the same sound", () => {
    // 𐐪 (modern, merged) and 𐐱 (1869, rounded) both read as AA — the parser is liberal on
    // purpose, since pasted 1869 text uses conventions this app would not have written.
    expect(deseretReadings(spell("GAY", "LONG_A", "DEE"))[0]).toEqual(["G", "AA", "D"]);
    expect(deseretReadings(spell("GAY", "SHORT_AH", "DEE"))[0]).toEqual(["G", "AA", "D"]);
  });

  it("offers both readings of a lone letter, whole-word first", () => {
    // 𐑄 is BOTH "the" (one-letter function word) and "thee" (letter-name shorthand) — the two
    // forward conventions collide on this glyph. "the" leads, being far more common.
    expect(deseretReadings(small("THEE"))).toEqual([["DH", "AH0"], ["DH", "IY"], ["DH"]]);
    // 𐐒 is "be"; its bare sound follows.
    expect(deseretReadings(small("BEE"))).toEqual([["B", "IY"], ["B"]]);
  });

  it("returns nothing for text that is not Deseret", () => {
    expect(deseretReadings("book")).toEqual([]);
  });
});

describe("sound-it-out spelling", () => {
  it("renders a pronunciation as readable English-ish letters", () => {
    expect(phonemesToSpelling(["N", "IY", "F", "AY"])).toBe("neefy");
    expect(phonemesToSpelling(["Z", "EH", "R", "AH0", "HH", "EH", "M", "L", "AH0"])).toBe(
      "zeruhemlu",
    );
  });
});

describe("reversing running text", () => {
  const WORDS: Record<string, string[]> = {
    "DH AH": ["the"],
    "B IY": ["be", "bee"],
    "Y IY": ["ye"],
    "N IY F AY": ["nephi"],
  };
  const lookup = (readings: readonly (readonly string[])[]) =>
    readings.flatMap(
      (reading) => WORDS[reading.map((p) => p.replace(/[0-2]$/, "")).join(" ")] ?? [],
    );

  it("keeps punctuation and spacing", () => {
    const segments = reverseText(`${small("THEE")}, ${spell("YEE", "LONG_I")}!`, lookup);
    expect(segments.map((s) => s.kind)).toEqual(["word", "other", "word", "other"]);
    expect(reverseSegmentsToString(segments)).toBe("the, ye!");
  });

  it("carries the other homophones as alternates for the reader to choose", () => {
    const [segment] = reverseText(small("BEE"), lookup);
    expect(segment).toEqual({
      kind: "word",
      text: "be",
      source: small("BEE"),
      alternates: ["bee"],
    });
  });

  it("mirrors capitalization back onto English", () => {
    expect(reverseSegmentsToString(reverseText(capital("THEE"), lookup))).toBe("The");
    expect(
      reverseSegmentsToString(
        reverseText(
          [capital("EN"), capital("LONG_I"), capital("EF"), capital("AY")].join(""),
          lookup,
        ),
      ),
    ).toBe("NEPHI");
  });

  it("falls back to a sound-it-out spelling, flagged, when nothing matches", () => {
    const unknown = spell("ZHEE", "LONG_OO", "KAY");
    const [segment] = reverseText(unknown, lookup);
    expect(segment).toEqual({ kind: "approx", text: "zhook", source: unknown });
  });

  it("leaves non-Deseret text alone", () => {
    expect(reverseSegmentsToString(reverseText("hello", lookup))).toBe("hello");
  });
});

/**
 * The strongest check available: push real text forward to Deseret and back, and require the
 * result to be PHONETICALLY faithful. Word identity is explicitly not the bar — Deseret cannot
 * distinguish "there" from "their" — so the assertion is that every returned word, said aloud,
 * produces the sounds that were written.
 */
describe("round trip through the real dictionary", () => {
  const asset = path.resolve(__dirname, "../../public/deseret/cmudict.txt");
  const lexicon: LexiconEntry[] = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../data/deseret-lexicon.json"), "utf8"),
  );
  const frequency = parseFrequency(
    readFileSync(path.resolve(__dirname, "../../public/deseret/frequency.txt"), "utf8"),
  );
  const dictionary = createLookup(parseDictionary(readFileSync(asset, "utf8")), lexicon, frequency);

  const SENTENCE =
    "And it came to pass that I Nephi having been born of goodly parents " +
    "therefore I was taught somewhat in all the learning of my father";

  it("returns words that sound like what was written", () => {
    const deseret = segmentsToString(convertText(SENTENCE, dictionary.lookup));
    const back = reverseText(deseret, dictionary.reverse);

    let checked = 0;
    for (const segment of back) {
      if (segment.kind !== "word") continue;
      // Re-writing the returned word must reproduce the Deseret we handed in. This goes back
      // through convertText, not convertPhonemes, because the one-letter shorthands are a
      // word-level rule: "the" is 𐑄 as a word but 𐑄𐐲 from its phonemes alone.
      const rewritten = segmentsToString(
        convertText(segment.text, dictionary.lookup, MODERN_AMERICAN),
      );
      expect(
        rewritten.toLowerCase(),
        `${segment.source} -> ${segment.text} is not phonetically faithful`,
      ).toBe(segment.source.toLowerCase());
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("recovers the proper nouns the curated lexicon supplies", () => {
    const deseret = segmentsToString(convertText("Nephi Zarahemla Moroni", dictionary.lookup));
    expect(reverseSegmentsToString(reverseText(deseret, dictionary.reverse)).toLowerCase()).toBe(
      "nephi zarahemla moroni",
    );
  });

  it("ranks rivals that differ only in stress", () => {
    // "in" is IH0 N and "inn" is IH1 N — different packed codes, identical sound. The frequency
    // asset has to group them the way the reverse index does (stress-insensitively) or "in" is
    // never marked contested, goes unranked, and loses to a word used six times in 7M tokens.
    const deseret = segmentsToString(convertText("in", dictionary.lookup));
    const [segment] = reverseText(deseret, dictionary.reverse);
    expect(segment.text).toBe("in");
  });

  it("ranks homophones by corpus frequency, not by parse order", () => {
    // 𐑄𐐯𐑉 is there / their / they're, and also parses as "thur" if 𐐯𐑉 is read as ER. Ranking
    // must be global across parses, or the merely-valid "thur" would beat all three.
    // "their" leads because scripture uses it far more than "there" — the corpus decides, and
    // for a decoding aid either is correct: they sound the same.
    const deseret = segmentsToString(convertText("there", dictionary.lookup));
    const [segment] = reverseText(deseret, dictionary.reverse);
    expect(segment.kind).toBe("word");
    expect(segment.text).toBe("their");
    const alternates = segment.kind === "word" ? segment.alternates : [];
    expect(alternates).toContain("there");
    // "thur" is a real CMUdict word and a legitimate parse, so it belongs in the list — it
    // just must not outrank words the corpus actually uses.
    expect(alternates.indexOf("there")).toBeLessThan(alternates.indexOf("thur"));
  });
});
