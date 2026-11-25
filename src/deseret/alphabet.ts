/**
 * The Deseret Alphabet in Unicode.
 *
 * Verified against the Unicode Character Database 16.0: 40 letters, uppercase at
 * U+10400–U+10427 and lowercase at U+10428–U+1044F, so case is a fixed offset. Glyphs are
 * DERIVED from codepoints rather than typed as literals — a hand-typed 4-byte character is a
 * transcription error waiting to happen, and secondary sources get this table wrong (the
 * Wikipedia inventory silently omits Short I and misorders the sibilants).
 *
 * Letter names are the Unicode ones. Note the footgun: Deseret ETH is /θ/ (voiceless, as in
 * "thigh") and Deseret THEE is /ð/ (voiced, as in "thy") — inverted relative to the IPA symbol
 * ⟨ð⟩, which is voiced.
 */

export const DESERET_CAPITAL_FIRST = 0x10400;
export const DESERET_SMALL_FIRST = 0x10428;
/** Lowercase is uppercase plus this. Holds for every letter in the block. */
export const DESERET_CASE_OFFSET = DESERET_SMALL_FIRST - DESERET_CAPITAL_FIRST;
export const DESERET_LAST = 0x1044f;

export type DeseretLetterName =
  | "LONG_I"
  | "LONG_E"
  | "LONG_A"
  | "LONG_AH"
  | "LONG_O"
  | "LONG_OO"
  | "SHORT_I"
  | "SHORT_E"
  | "SHORT_A"
  | "SHORT_AH"
  | "SHORT_O"
  | "SHORT_OO"
  | "AY"
  | "OW"
  | "WU"
  | "YEE"
  | "H"
  | "PEE"
  | "BEE"
  | "TEE"
  | "DEE"
  | "CHEE"
  | "JEE"
  | "KAY"
  | "GAY"
  | "EF"
  | "VEE"
  | "ETH"
  | "THEE"
  | "ES"
  | "ZEE"
  | "ESH"
  | "ZHEE"
  | "ER"
  | "EL"
  | "EM"
  | "EN"
  | "ENG"
  | "OI"
  | "EW";

export type DeseretLetter = {
  name: DeseretLetterName;
  ipa: string;
  /**
   * The Illinois Deseret Consortium's SAMPA transcription value, for cross-referencing their
   * 1869 corpus. `null` for the two letters that were never cast in metal type — their key
   * marks both N/A.
   */
  sampa: string | null;
  /**
   * How the letter's NAME is pronounced, in ARPAbet — the basis for writing a whole word as a
   * single letter when the two sound alike ("be ye gay" → 𐐒 𐐏 𐐘). The 1869 Book of Mormon
   * does this constantly: 𐐒 stands alone 2,515 times and 𐐏 2,005 times.
   *
   * `null` where the rule cannot apply or the name is uncertain:
   *   - the twelve long/short vowels, whose names are two words ("Long I", "Short E");
   *   - H and ER, whose spoken names this project has not sourced;
   *   - OI and EW, which were never cast in type.
   */
  namePhonemes: string[] | null;
  /**
   * The letter's spoken name. Mostly the Unicode name, but not always: 𐐎 is "Woo" and 𐐡 is
   * "Ur". Original publications rarely state names outright, so some are standardized or
   * inferred — the Illinois Deseret Consortium's character chart says as much of its own.
   */
  label: string;
  /**
   * An English word containing the sound, for the primer table. Vowels use the standard Wells
   * lexical sets (FLEECE, TRAP, STRUT…), which is how phoneticians name these vowels.
   */
  example: string;
};

/**
 * In codepoint order. The index IS the offset from U+10400, so this array defines both the
 * inventory and the glyphs.
 */
export const DESERET_LETTERS: readonly DeseretLetter[] = [
  { name: "LONG_I", ipa: "iː", sampa: "i", namePhonemes: null, label: "Long I", example: "fleece" },
  { name: "LONG_E", ipa: "eɪ", sampa: "e", namePhonemes: null, label: "Long E", example: "face" },
  { name: "LONG_A", ipa: "ɑː", sampa: "A", namePhonemes: null, label: "Long A", example: "palm" },
  {
    name: "LONG_AH",
    ipa: "ɔː",
    sampa: "O",
    namePhonemes: null,
    label: "Long Ah",
    example: "thought",
  },
  { name: "LONG_O", ipa: "oʊ", sampa: "o", namePhonemes: null, label: "Long O", example: "goat" },
  {
    name: "LONG_OO",
    ipa: "uː",
    sampa: "u",
    namePhonemes: null,
    label: "Long Oo",
    example: "goose",
  },
  { name: "SHORT_I", ipa: "ɪ", sampa: "I", namePhonemes: null, label: "Short I", example: "kit" },
  { name: "SHORT_E", ipa: "ɛ", sampa: "E", namePhonemes: null, label: "Short E", example: "dress" },
  { name: "SHORT_A", ipa: "æ", sampa: "a", namePhonemes: null, label: "Short A", example: "trap" },
  { name: "SHORT_AH", ipa: "ɒ", sampa: "Q", namePhonemes: null, label: "Short Ah", example: "lot" },
  { name: "SHORT_O", ipa: "ʌ", sampa: "V", namePhonemes: null, label: "Short O", example: "strut" },
  {
    name: "SHORT_OO",
    ipa: "ʊ",
    sampa: "U",
    namePhonemes: null,
    label: "Short Oo",
    example: "foot",
  },
  { name: "AY", ipa: "aɪ", sampa: "AI", namePhonemes: ["AY"], label: "Ay", example: "price" },
  { name: "OW", ipa: "aʊ", sampa: "AU", namePhonemes: ["AW"], label: "Ow", example: "mouth" },
  { name: "WU", ipa: "w", sampa: "w", namePhonemes: ["W", "UW"], label: "Woo", example: "woo" },
  { name: "YEE", ipa: "j", sampa: "y", namePhonemes: ["Y", "IY"], label: "Yee", example: "you" },
  { name: "H", ipa: "h", sampa: "h", namePhonemes: null, label: "H", example: "hay" },
  { name: "PEE", ipa: "p", sampa: "p", namePhonemes: ["P", "IY"], label: "Pee", example: "rope" },
  { name: "BEE", ipa: "b", sampa: "b", namePhonemes: ["B", "IY"], label: "Bee", example: "robe" },
  { name: "TEE", ipa: "t", sampa: "t", namePhonemes: ["T", "IY"], label: "Tee", example: "fate" },
  { name: "DEE", ipa: "d", sampa: "d", namePhonemes: ["D", "IY"], label: "Dee", example: "fade" },
  {
    name: "CHEE",
    ipa: "tʃ",
    sampa: "c",
    namePhonemes: ["CH", "IY"],
    label: "Chee",
    example: "catch",
  },
  { name: "JEE", ipa: "dʒ", sampa: "j", namePhonemes: ["JH", "IY"], label: "Jee", example: "edge" },
  { name: "KAY", ipa: "k", sampa: "k", namePhonemes: ["K", "EY"], label: "Kay", example: "leek" },
  { name: "GAY", ipa: "ɡ", sampa: "g", namePhonemes: ["G", "EY"], label: "Gay", example: "league" },
  { name: "EF", ipa: "f", sampa: "f", namePhonemes: ["EH", "F"], label: "Ef", example: "safe" },
  { name: "VEE", ipa: "v", sampa: "v", namePhonemes: ["V", "IY"], label: "Vee", example: "save" },
  { name: "ETH", ipa: "θ", sampa: "T", namePhonemes: ["EH", "TH"], label: "Eth", example: "thin" },
  {
    name: "THEE",
    ipa: "ð",
    sampa: "D",
    namePhonemes: ["DH", "IY"],
    label: "Thee",
    example: "thine",
  },
  { name: "ES", ipa: "s", sampa: "s", namePhonemes: ["EH", "S"], label: "Es", example: "hiss" },
  { name: "ZEE", ipa: "z", sampa: "z", namePhonemes: ["Z", "IY"], label: "Zee", example: "his" },
  { name: "ESH", ipa: "ʃ", sampa: "S", namePhonemes: ["EH", "SH"], label: "Esh", example: "cash" },
  {
    name: "ZHEE",
    ipa: "ʒ",
    sampa: "Z",
    namePhonemes: ["ZH", "IY"],
    label: "Zhee",
    example: "vision",
  },
  { name: "ER", ipa: "r", sampa: "r", namePhonemes: ["ER"], label: "Ur", example: "rue" },
  { name: "EL", ipa: "l", sampa: "l", namePhonemes: ["EH", "L"], label: "El", example: "leaf" },
  { name: "EM", ipa: "m", sampa: "m", namePhonemes: ["EH", "M"], label: "Em", example: "seem" },
  { name: "EN", ipa: "n", sampa: "n", namePhonemes: ["EH", "N"], label: "En", example: "seen" },
  { name: "ENG", ipa: "ŋ", sampa: "N", namePhonemes: ["EH", "NG"], label: "Eng", example: "sing" },
  { name: "OI", ipa: "ɔɪ", sampa: null, namePhonemes: null, label: "Oi", example: "choice" },
  { name: "EW", ipa: "juː", sampa: null, namePhonemes: null, label: "Ew", example: "mule" },
];

/**
 * The letters fall into runs, in codepoint order: six long vowels, six short, four diphthongs
 * and glides, twenty-two consonants, then the two never cast in type. That ordering is a
 * property of the block itself, so the primer groups are index ranges rather than a second
 * hand-kept list that could drift.
 */
export type LetterGroup = { title: string; note?: string; from: number; to: number };

export const LETTER_GROUPS: readonly LetterGroup[] = [
  { title: "Long vowels", from: 0, to: 6 },
  { title: "Short vowels", from: 6, to: 12 },
  { title: "Diphthongs and glides", from: 12, to: 16 },
  { title: "Consonants", from: 16, to: 38 },
  {
    title: "Never cast in type",
    note: "Encoded in Unicode but absent from the printed alphabet; write two letters instead.",
    from: 38,
    to: 40,
  },
];

const indexOf = new Map<DeseretLetterName, number>(
  DESERET_LETTERS.map((letter, index) => [letter.name, index]),
);

/** The lowercase glyph for a letter. Conversion output is lowercase by default. */
export const small = (name: DeseretLetterName): string =>
  String.fromCodePoint(DESERET_SMALL_FIRST + indexOf.get(name)!);

/** The uppercase glyph for a letter. */
export const capital = (name: DeseretLetterName): string =>
  String.fromCodePoint(DESERET_CAPITAL_FIRST + indexOf.get(name)!);

const isCapital = (code: number): boolean =>
  code >= DESERET_CAPITAL_FIRST && code < DESERET_SMALL_FIRST;

const isSmall = (code: number): boolean => code >= DESERET_SMALL_FIRST && code <= DESERET_LAST;

/** True if every character is a Deseret letter (of either case). Empty string is false. */
export const isDeseret = (text: string): boolean => {
  const codes = [...text].map((c) => c.codePointAt(0)!);
  return codes.length > 0 && codes.every((c) => isCapital(c) || isSmall(c));
};

/** Uppercase Deseret text. Non-Deseret characters pass through untouched. */
export const toDeseretUpper = (text: string): string =>
  [...text]
    .map((c) => {
      const code = c.codePointAt(0)!;
      return isSmall(code) ? String.fromCodePoint(code - DESERET_CASE_OFFSET) : c;
    })
    .join("");

/** Lowercase Deseret text. Non-Deseret characters pass through untouched. */
export const toDeseretLower = (text: string): string =>
  [...text]
    .map((c) => {
      const code = c.codePointAt(0)!;
      return isCapital(code) ? String.fromCodePoint(code + DESERET_CASE_OFFSET) : c;
    })
    .join("");
