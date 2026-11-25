import {
  DESERET_CAPITAL_FIRST,
  DESERET_LETTERS,
  DESERET_SMALL_FIRST,
  capital,
  small,
  type DeseretLetterName,
} from "./alphabet";
import type { Phoneme } from "./convert";

/**
 * Deseret → English. A DECODING AID for people still learning the alphabet, not a translator.
 *
 * The goal is phonetic fidelity, not word identity. Deseret is phonetic, so homophones are
 * genuinely indistinguishable in it — "there" and "their" are the same string, and no amount of
 * cleverness recovers which was meant. Any word from the right pronunciation bucket lets the
 * reader sound it out and settle the ambiguity themselves, which is how a 19th-century reader
 * did it. Every alternate is carried on the segment so the UI can offer them.
 *
 * Parsing is deliberately LIBERAL and ignores the forward conventions: it accepts 𐐱 and 𐐪 alike
 * for /ɑ/, and always honours the one-letter shorthands, because text pasted from the 1869
 * printing uses them regardless of how this app is currently set to write.
 */

/** Every letter's own sound, for reading Deseret back. */
const PHONEME_OF: Partial<Record<DeseretLetterName, Phoneme>> = {
  LONG_I: "IY",
  LONG_E: "EY",
  LONG_A: "AA",
  LONG_AH: "AO",
  LONG_O: "OW",
  LONG_OO: "UW",
  SHORT_I: "IH",
  SHORT_E: "EH",
  SHORT_A: "AE",
  // 1869 wrote LOT with 𐐱; modern American merges it onto /ɑ/. Accept both spellings.
  SHORT_AH: "AA",
  SHORT_O: "AH",
  SHORT_OO: "UH",
  AY: "AY",
  OW: "AW",
  WU: "W",
  YEE: "Y",
  H: "HH",
  PEE: "P",
  BEE: "B",
  TEE: "T",
  DEE: "D",
  CHEE: "CH",
  JEE: "JH",
  KAY: "K",
  GAY: "G",
  EF: "F",
  VEE: "V",
  ETH: "TH",
  THEE: "DH",
  ES: "S",
  ZEE: "Z",
  ESH: "SH",
  ZHEE: "ZH",
  ER: "R",
  EL: "L",
  EM: "M",
  EN: "N",
  ENG: "NG",
  OI: "OY",
};

/**
 * Letter pairs spelling one sound. Longest match wins, so these are tried before single
 * letters. 𐐲𐑉 reads as ER rather than AH + R — they sound alike aloud, which is all this needs.
 */
const DIGRAPHS: { pair: [DeseretLetterName, DeseretLetterName]; phonemes: Phoneme[] }[] = [
  { pair: ["SHORT_O", "ER"], phonemes: ["ER"] },
  { pair: ["SHORT_E", "ER"], phonemes: ["ER"] },
  { pair: ["LONG_AH", "SHORT_I"], phonemes: ["OY"] },
  { pair: ["SHORT_AH", "SHORT_I"], phonemes: ["OY"] },
];

const LETTER_AT = new Map<string, DeseretLetterName>(
  DESERET_LETTERS.flatMap((letter) => [
    [small(letter.name), letter.name] as const,
    [capital(letter.name), letter.name] as const,
  ]),
);

/**
 * Extra readings for a letter standing alone as a whole word. Order matters — the first that
 * hits the dictionary wins, and the rest become alternates.
 *
 * 𐑄 is the interesting one: with both forward toggles on, *the* (one-letter function word) and
 * *thee* (letter-name shorthand) BOTH write as 𐑄, so it genuinely has two readings. *the* is
 * offered first, being some 17× more common in the corpus.
 */
const WORD_READINGS: Partial<Record<DeseretLetterName, Phoneme[][]>> = (() => {
  const readings: Partial<Record<DeseretLetterName, Phoneme[][]>> = {};
  for (const letter of DESERET_LETTERS) {
    if (letter.namePhonemes) readings[letter.name] = [[...letter.namePhonemes]];
  }
  // One-letter function words take precedence over the letter-name reading.
  readings.THEE = [["DH", "AH0"], ...(readings.THEE ?? [])];
  readings.LONG_A = [["AH0"], ...(readings.LONG_A ?? [])];
  return readings;
})();

const isUpper = (char: string): boolean => {
  const code = char.codePointAt(0)!;
  return code >= DESERET_CAPITAL_FIRST && code < DESERET_SMALL_FIRST;
};

/**
 * A letter pair is only *maybe* a digraph, so parsing BRANCHES rather than committing. 𐐯𐑉 is
 * ER in the 1869 convention but EH + R in the modern one — reading it only one way loses
 * "there" and "zarahemla". Both parses are produced and the dictionary settles which is a word.
 *
 * Capped, because a long word with several branch points would otherwise blow up; real words
 * have at most one or two.
 */
const MAX_PARSES = 16;

const parseFrom = (letters: readonly DeseretLetterName[], at: number): Phoneme[][] => {
  if (at >= letters.length) return [[]];
  const parses: Phoneme[][] = [];
  const digraph = DIGRAPHS.find(
    ({ pair }) => letters[at] === pair[0] && letters[at + 1] === pair[1],
  );
  // Digraph first, so the commoner reading leads.
  if (digraph) {
    for (const tail of parseFrom(letters, at + 2)) {
      parses.push([...digraph.phonemes, ...tail]);
      if (parses.length >= MAX_PARSES) return parses;
    }
  }
  const single = PHONEME_OF[letters[at]];
  if (single) {
    for (const tail of parseFrom(letters, at + 1)) {
      parses.push([single, ...tail]);
      if (parses.length >= MAX_PARSES) return parses;
    }
  }
  return parses;
};

/**
 * Every way a Deseret word might be read, best first. A lone letter has its whole-word readings
 * tried before its bare sound; longer words branch wherever a letter pair might be a digraph.
 */
export const deseretReadings = (word: string): Phoneme[][] => {
  const chars = [...word];
  const letters: DeseretLetterName[] = [];
  for (const char of chars) {
    const name = LETTER_AT.get(char);
    if (!name) return [];
    letters.push(name);
  }

  const readings: Phoneme[][] = [];
  if (letters.length === 1) readings.push(...(WORD_READINGS[letters[0]] ?? []));
  readings.push(...parseFrom(letters, 0));
  return readings;
};

/**
 * A readable English-ish spelling for a pronunciation with no dictionary match. The point is
 * that a learner can still sound it out — not that the result is a real word.
 */
const SPELLING_OF: Record<string, string> = {
  AA: "ah",
  AE: "a",
  AH: "u",
  AO: "aw",
  AW: "ow",
  AY: "y",
  EH: "e",
  ER: "er",
  EY: "ay",
  IH: "i",
  IY: "ee",
  OW: "oh",
  OY: "oy",
  UH: "uu",
  UW: "oo",
  B: "b",
  CH: "ch",
  D: "d",
  DH: "th",
  F: "f",
  G: "g",
  HH: "h",
  JH: "j",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ng",
  P: "p",
  R: "r",
  S: "s",
  SH: "sh",
  T: "t",
  TH: "th",
  V: "v",
  W: "w",
  Y: "y",
  Z: "z",
  ZH: "zh",
};

export const phonemesToSpelling = (phonemes: readonly Phoneme[]): string =>
  phonemes.map((p) => SPELLING_OF[p.replace(/[0-2]$/, "")] ?? "").join("");

/**
 * Candidate English words for a set of possible readings, best first; empty when none matches.
 *
 * Takes ALL readings at once rather than one at a time, because ranking has to be global: 𐑄𐐯𐑉
 * parses as both "thur" (𐐯𐑉 = ER) and "there" (EH + R), and trying readings in order would let
 * the first *valid* answer beat the far likelier one.
 */
export type ReverseLookup = (readings: readonly (readonly Phoneme[])[]) => readonly string[];

export type ReverseSegment =
  /** A real English word. `alternates` are the other homophones, for the reader to pick from. */
  | { kind: "word"; text: string; source: string; alternates: string[] }
  /** No dictionary match — a sound-it-out spelling, flagged as an approximation. */
  | { kind: "approx"; text: string; source: string }
  | { kind: "other"; text: string };

/** A run of Deseret letters, either case. */
const DESERET_WORD = /[\u{10400}-\u{1044F}]+/gu;

/** Mirror a Deseret word's capitalization onto its English rendering. */
const matchDeseretCase = (english: string, deseret: string): string => {
  const chars = [...deseret];
  if (chars.length > 1 && chars.every(isUpper)) return english.toUpperCase();
  if (isUpper(chars[0])) return english.charAt(0).toUpperCase() + english.slice(1);
  return english;
};

export const reverseText = (text: string, lookup: ReverseLookup): ReverseSegment[] => {
  const segments: ReverseSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(DESERET_WORD)) {
    if (match.index > cursor) {
      segments.push({ kind: "other", text: text.slice(cursor, match.index) });
    }
    const word = match[0];
    const readings = deseretReadings(word);
    const candidates = lookup(readings);

    if (candidates.length > 0) {
      segments.push({
        kind: "word",
        text: matchDeseretCase(candidates[0], word),
        source: word,
        alternates: candidates.slice(1),
      });
    } else {
      const spelled = readings[0] ? phonemesToSpelling(readings[0]) : word;
      segments.push({ kind: "approx", text: matchDeseretCase(spelled, word), source: word });
    }
    cursor = match.index + word.length;
  }
  if (cursor < text.length) segments.push({ kind: "other", text: text.slice(cursor) });
  return segments;
};

/** Flatten reversed segments to plain text. */
export const reverseSegmentsToString = (segments: readonly ReverseSegment[]): string =>
  segments.map((s) => s.text).join("");
