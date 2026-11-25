import { small, type DeseretLetterName } from "./alphabet";

/**
 * A convention profile fixes the three places where a modern pronouncing dictionary
 * underdetermines the Deseret spelling. See docs/design/deseret-converter.md for the evidence
 * behind each default; in every case the default is the modern-register choice and the
 * alternate is what the 1869 printing did, so the same knobs serve the historical profile
 * when it is built.
 */
export type ConventionProfile = {
  /**
   * CMUdict's `AA` covers both LOT (*God*) and PALM/START (*father*, *are*). Deseret split
   * them into 𐐪 /ɑː/ and 𐐱 /ɒ/. Modern American has the father–bother merger, so both are /ɑ/
   * and 𐐪 is right throughout; 𐐱 (rounded) is not a sound modern American has.
   */
  aa: Extract<DeseretLetterName, "LONG_A" | "SHORT_AH">;
  /**
   * Deseret has no schwa letter at all — the alphabet's biggest phonological flaw. 𐐲 is the
   * nearest phonetic match. (The historically faithful option is to reconstruct the vowel from
   * the English spelling, as 1869 did; that needs orthographic alignment and belongs to the
   * deferred 1869 profile, not here.)
   */
  schwa: Extract<DeseretLetterName, "SHORT_O" | "SHORT_I">;
  /**
   * The vowel written before 𐑉 in an unstressed syllable. Modern American merges stressed and
   * unstressed NURSE, so 𐐲𐑉 throughout; 1869 wrote `-er` as 𐐯𐑉 following the English spelling
   * (`fADEr`, `pitEr`) while agreeing on stressed 𐐲𐑉 (`wVrd`, `fVrst`).
   */
  unstressedEr: Extract<DeseretLetterName, "SHORT_O" | "SHORT_E">;
  /**
   * Write a word as a single letter when it sounds exactly like that letter's name — "be ye
   * gay" → 𐐒 𐐏 𐐘. Attested and heavily used: in the 1869 Book of Mormon 𐐒 stands alone as a
   * word 2,515 times and 𐐏 2,005 times. On by default.
   */
  letterNames: boolean;
  /**
   * Write the three function words the 1869 printing gives a one-letter form: *the* → 𐑄 (its
   * schwa dropped), *a* → 𐐪, *O* → 𐐬. Keyed on the English word rather than derived, because
   * that is what the evidence supports — these are attested spellings, not a rule.
   *
   * Note *a* → 𐐪 is a 19th-century vowel choice rather than a modern one (modern American
   * reduces the article to a schwa, 𐐲). It rides along with the genuinely register-neutral
   * *the* → 𐑄, so turn this off for a strictly modern reading.
   */
  shortForms: boolean;
};

export const MODERN_AMERICAN: ConventionProfile = {
  aa: "LONG_A",
  schwa: "SHORT_O",
  unstressedEr: "SHORT_O",
  letterNames: true,
  shortForms: true,
};

/** Menu metadata, so the UI's convention picker is data-driven rather than hand-built. */
export type ProfileOption<K extends keyof ConventionProfile> = {
  value: ConventionProfile[K];
  label: string;
  note: string;
};

export type ProfileKnob<K extends keyof ConventionProfile> = {
  key: K;
  label: string;
  options: readonly ProfileOption<K>[];
};

export const AA_KNOB: ProfileKnob<"aa"> = {
  key: "aa",
  label: "The vowel in father / God",
  options: [
    {
      value: "LONG_A",
      label: `${small("LONG_A")} Long A`,
      note: "Modern American — father and God rhyme",
    },
    {
      value: "SHORT_AH",
      label: `${small("SHORT_AH")} Short Ah`,
      note: "1869 and British — God takes a rounded vowel",
    },
  ],
};

export const SCHWA_KNOB: ProfileKnob<"schwa"> = {
  key: "schwa",
  label: "The reduced vowel in about",
  options: [
    {
      value: "SHORT_O",
      label: `${small("SHORT_O")} Short O`,
      note: "Nearest phonetic match to schwa",
    },
    {
      value: "SHORT_I",
      label: `${small("SHORT_I")} Short I`,
      note: "Also attested for reduced vowels in 1869",
    },
  ],
};

export const UNSTRESSED_ER_KNOB: ProfileKnob<"unstressedEr"> = {
  key: "unstressedEr",
  label: "The ending in father",
  options: [
    {
      value: "SHORT_O",
      label: `${small("SHORT_O")}${small("ER")}`,
      note: "Modern American — same vowel as in word",
    },
    {
      value: "SHORT_E",
      label: `${small("SHORT_E")}${small("ER")}`,
      note: "1869 — follows the English spelling",
    },
  ],
};

export const PROFILE_KNOBS = [AA_KNOB, SCHWA_KNOB, UNSTRESSED_ER_KNOB] as const;
