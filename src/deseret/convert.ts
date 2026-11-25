import { DESERET_LETTERS, small, toDeseretUpper, type DeseretLetterName } from "./alphabet";
import { MODERN_AMERICAN, type ConventionProfile } from "./profiles";

/**
 * Phonemes → Deseret. The pure core: no DOM, no dictionary, no fetch. A profile's knobs are
 * ordinary parameters, so every convention is exercised from a test table.
 *
 * The intermediate representation is deliberately PHONEMES rather than pre-baked Deseret —
 * swapping the dictionary gives another accent, swapping the profile gives another
 * orthography. Pre-baking would be smaller and faster and would foreclose both.
 */

/** An ARPAbet phoneme, optionally carrying CMUdict's stress digit: `"AH0"`, `"EY1"`, `"T"`. */
export type Phoneme = string;

/**
 * The 36 phonemes whose Deseret letter is unambiguous. `AA`, `AH` and `ER` are missing on
 * purpose — those are the profile's three knobs, resolved in `letterFor`.
 *
 * `OY` is the one digraph: Unicode has 𐐦 OI, but it was never cast in metal type, so the
 * printing used two letters. `Y UW` needs no special case — it is already two phonemes and
 * falls out as 𐐷𐐭, which is why 𐐧 EW is likewise unnecessary.
 */
const UNAMBIGUOUS: Record<string, DeseretLetterName | readonly DeseretLetterName[]> = {
  AE: "SHORT_A",
  AO: "LONG_AH",
  AW: "OW",
  AY: "AY",
  B: "BEE",
  CH: "CHEE",
  D: "DEE",
  DH: "THEE",
  EH: "SHORT_E",
  EY: "LONG_E",
  F: "EF",
  G: "GAY",
  HH: "H",
  IH: "SHORT_I",
  IY: "LONG_I",
  JH: "JEE",
  K: "KAY",
  L: "EL",
  M: "EM",
  N: "EN",
  NG: "ENG",
  OW: "LONG_O",
  OY: ["LONG_AH", "SHORT_I"],
  P: "PEE",
  R: "ER",
  S: "ES",
  SH: "ESH",
  T: "TEE",
  TH: "ETH",
  UH: "SHORT_OO",
  UW: "LONG_OO",
  V: "VEE",
  W: "WU",
  Y: "YEE",
  Z: "ZEE",
  ZH: "ZHEE",
};

/** CMUdict marks unstressed syllables with a trailing 0; 1 and 2 are primary and secondary. */
const UNSTRESSED = "0";

const splitStress = (phoneme: Phoneme): { base: string; stress: string | null } => {
  const last = phoneme.slice(-1);
  return /[0-2]/.test(last)
    ? { base: phoneme.slice(0, -1), stress: last }
    : { base: phoneme, stress: null };
};

/** The letters one phoneme writes as, under a profile. Unknown phonemes yield nothing. */
const lettersFor = (phoneme: Phoneme, profile: ConventionProfile): DeseretLetterName[] => {
  const { base, stress } = splitStress(phoneme);
  switch (base) {
    case "AA":
      return [profile.aa];
    case "AH":
      // CMUdict encodes the schwa/wedge distinction as stress: AH0 is [ə], AH1/AH2 are /ʌ/.
      return [stress === UNSTRESSED ? profile.schwa : "SHORT_O"];
    case "ER":
      return [stress === UNSTRESSED ? profile.unstressedEr : "SHORT_O", "ER"];
    default: {
      const mapped = UNAMBIGUOUS[base];
      if (!mapped) return [];
      return Array.isArray(mapped) ? [...mapped] : [mapped as DeseretLetterName];
    }
  }
};

/** Stress-free key for comparing a word's pronunciation with a letter's name. */
const phonemeKey = (phonemes: readonly Phoneme[]): string =>
  phonemes.map((phoneme) => splitStress(phoneme).base).join(" ");

/**
 * Words that sound exactly like the name of a letter, which may then be written as that single
 * letter — "be ye gay" → 𐐒 𐐏 𐐘. The 1869 Book of Mormon leans on this hard: 𐐒 stands alone
 * 2,515 times and 𐐏 2,005 times in its 273k tokens.
 */
const LETTER_BY_NAME = new Map<string, DeseretLetterName>(
  DESERET_LETTERS.filter((letter) => letter.namePhonemes).map((letter) => [
    phonemeKey(letter.namePhonemes!),
    letter.name,
  ]),
);

/** The letter a whole word may collapse to, if any. */
export const letterNamedBy = (phonemes: readonly Phoneme[]): DeseretLetterName | undefined =>
  LETTER_BY_NAME.get(phonemeKey(phonemes));

/** One word's pronunciation as lowercase Deseret. */
export const convertPhonemes = (
  phonemes: readonly Phoneme[],
  profile: ConventionProfile = MODERN_AMERICAN,
): string => {
  if (profile.letterNames) {
    const letter = letterNamedBy(phonemes);
    if (letter) return small(letter);
  }
  return phonemes
    .flatMap((phoneme) => lettersFor(phoneme, profile))
    .map(small)
    .join("");
};

/**
 * Mirror an English word's capitalization onto Deseret, which is bicameral. ALL CAPS maps to
 * all caps; an initial capital maps to an initial capital; anything else stays lowercase.
 */
export const matchCase = (deseret: string, english: string): string => {
  const letters = [...english].filter((c) => /[A-Za-z]/.test(c));
  if (letters.length === 0) return deseret;
  const allCaps = letters.length > 1 && letters.every((c) => c === c.toUpperCase());
  if (allCaps) return toDeseretUpper(deseret);
  if (letters[0] !== letters[0].toUpperCase()) return deseret;
  const chars = [...deseret];
  return chars.length === 0 ? deseret : toDeseretUpper(chars[0]) + chars.slice(1).join("");
};

/**
 * A converted run of text. `unknown` segments are words the dictionary could not pronounce —
 * they keep their Latin spelling and the UI flags them. For a research corpus an honest gap
 * beats a confident invention, so nothing here guesses.
 */
export type Segment =
  | { kind: "word"; text: string; source: string }
  | { kind: "unknown"; text: string }
  | { kind: "other"; text: string };

/**
 * Function words the 1869 printing writes as a single letter. Keyed on the ENGLISH word, not
 * on phonemes, because these are attested spellings rather than a derivable rule — *the* drops
 * its schwa, while *a* and *O* are vowel choices.
 *
 * Counts in the 1869 Book of Mormon's 273k tokens: 𐑄 19,681 · 𐐪 2,167 · 𐐬 275. That list is
 * exhaustive — every other single-letter word in the printing turned out to be the possessive
 * clitic (*nifAI z abrIjmEnt*), a roman numeral, or a middle initial.
 */
const SHORT_FORMS: Record<string, DeseretLetterName> = {
  the: "THEE",
  a: "LONG_A",
  o: "LONG_O",
};

/** Looks a lowercased word up; returns null when it is not in the dictionary. */
export type Lookup = (word: string) => readonly Phoneme[] | null;

/** Words may carry internal apostrophes ("Lord's", "can't") but not leading or trailing ones. */
const WORD = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

export const convertText = (
  text: string,
  lookup: Lookup,
  profile: ConventionProfile = MODERN_AMERICAN,
): Segment[] => {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(WORD)) {
    if (match.index > cursor) {
      segments.push({ kind: "other", text: text.slice(cursor, match.index) });
    }
    const word = match[0];
    const lower = word.toLowerCase();
    const shortForm = profile.shortForms ? SHORT_FORMS[lower] : undefined;
    if (shortForm) {
      segments.push({ kind: "word", text: matchCase(small(shortForm), word), source: word });
    } else {
      const phonemes = lookup(lower);
      segments.push(
        phonemes
          ? {
              kind: "word",
              text: matchCase(convertPhonemes(phonemes, profile), word),
              source: word,
            }
          : { kind: "unknown", text: word },
      );
    }
    cursor = match.index + word.length;
  }
  if (cursor < text.length) segments.push({ kind: "other", text: text.slice(cursor) });
  return segments;
};

/** Flatten converted segments back to a plain string, unknown words included as Latin. */
export const segmentsToString = (segments: readonly Segment[]): string =>
  segments.map((s) => s.text).join("");
