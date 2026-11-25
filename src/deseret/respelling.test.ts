import { describe, expect, it } from "vitest";

// @ts-expect-error — plain-JS build script; only its pure converters are imported here.
import { pluralize, respellingToArpabet } from "../../scripts/build-name-lexicon.mjs";

/**
 * The Book of Mormon Pronunciation Guide's respelling system → ARPAbet. This is the step that
 * turns 340 sourced respellings into 340 pronunciations, so a silent regression here is a
 * silent regression across the whole name lexicon. Cases below are the guide's own key
 * examples plus real entries.
 */
const arpabet = (respelling: string): string[] | null =>
  respellingToArpabet(respelling) as string[] | null;

describe("pronunciation-guide respellings", () => {
  it("reads the stress mark as closing the stressed syllable", () => {
    // nēʹfī — stress on the first syllable, which the mark closes.
    expect(arpabet("nēʹfī")).toEqual(["N", "IY1", "F", "AY0"]);
    // a-bĭnʹa-dī — stress on the second of four.
    expect(arpabet("a-bĭnʹa-dī")).toEqual(["AH0", "B", "IH1", "N", "AH0", "D", "AY0"]);
  });

  it("treats the stress mark as a syllable break even without a hyphen", () => {
    // ămʹyū-lĕk is ăm-yū-lĕk; without splitting on the mark, "ămyū" would read as one syllable.
    expect(arpabet("ămʹyū-lĕk")).toEqual(["AE1", "M", "Y", "UW0", "L", "EH0", "K"]);
  });

  it("prefers the vowel digraphs over their first character", () => {
    // "er" is a single symbol in the key (permit), not ĕ + r.
    expect(arpabet("kōr-ē-ănʹta-mer")).toEqual([
      "K",
      "OW0",
      "R",
      "IY0",
      "AE1",
      "N",
      "T",
      "AH0",
      "M",
      "ER0",
    ]);
    // ĕ + r is NOT the "er" symbol — Zarahemla opens zĕr, not zer.
    expect(arpabet("zĕr-a-hĕmʹla")).toEqual(["Z", "EH0", "R", "AH0", "HH", "EH1", "M", "L", "AH0"]);
  });

  it("always reduces the key's plain `a`, which is the schwa of about", () => {
    // ălʹma — the stressed syllable takes ă, and the final plain `a` stays reduced.
    expect(arpabet("ălʹma")).toEqual(["AE1", "L", "M", "AH0"]);
    // Synthetic: no real entry stresses a plain `a`, because the key defines it as the vowel
    // of "about" — a schwa cannot carry stress. Pinned so the rule survives a guide revision.
    expect(arpabet("baʹta")).toEqual(["B", "AH0", "T", "AH0"]);
  });

  it("reads consonant digraphs as one phoneme", () => {
    // Anathoth ănʹa-tōth — "th" is TH, not T + H.
    expect(arpabet("ănʹa-tōth")).toEqual(["AE1", "N", "AH0", "T", "OW0", "TH"]);
    // Abish āʹbĭsh, Cherubim chĕrʹa-bĭm.
    expect(arpabet("āʹbĭsh")).toEqual(["EY1", "B", "IH0", "SH"]);
    expect(arpabet("chĕrʹa-bĭm")).toEqual(["CH", "EH1", "R", "AH0", "B", "IH0", "M"]);
  });

  it("handles compound names joined by a dash, each with its own stress", () => {
    expect(arpabet("ănʹtī–nēʹfī")).toEqual(["AE1", "N", "T", "AY0", "N", "IY1", "F", "AY0"]);
  });

  it("refuses a respelling containing anything outside the key", () => {
    // Dropping an unknown character would present a wrong pronunciation as a right one.
    expect(arpabet("nēʹfx§")).toBeNull();
    expect(arpabet("")).toBeNull();
  });
});

/**
 * The guide lists singulars; the corpus is full of plurals — *Lamanites* is the single most
 * frequent word CMUdict misses. The allomorph is determined by the final phoneme, so this is a
 * rule rather than a guess, and each branch is pinned here.
 */
const plural = (name: string, phonemes: string[]): { id: string; phonemes: string[] } =>
  pluralize(name, phonemes) as { id: string; phonemes: string[] };

describe("regular plurals of guide names", () => {
  it("takes S after a voiceless consonant", () => {
    expect(plural("lamanite", ["L", "EY1", "M", "AH0", "N", "AY0", "T"])).toEqual({
      id: "lamanites",
      phonemes: ["L", "EY1", "M", "AH0", "N", "AY0", "T", "S"],
    });
  });

  it("takes IH0 Z after a sibilant, and spells the plural with -es", () => {
    expect(plural("abish", ["EY1", "B", "IH0", "SH"])).toEqual({
      id: "abishes",
      phonemes: ["EY1", "B", "IH0", "SH", "IH0", "Z"],
    });
  });

  it("takes Z after anything voiced, including a final vowel", () => {
    expect(plural("nephi", ["N", "IY1", "F", "AY0"]).phonemes).toEqual([
      "N",
      "IY1",
      "F",
      "AY0",
      "Z",
    ]);
    expect(plural("zoram", ["Z", "OW1", "R", "AH0", "M"]).phonemes).toEqual([
      "Z",
      "OW1",
      "R",
      "AH0",
      "M",
      "Z",
    ]);
  });
});
