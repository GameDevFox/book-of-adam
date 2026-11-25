import { editDistance } from "./edit-distance";
import { searchWords } from "./search-words";

/**
 * What the reader typed → the exact-phrase searches to run (docs/design/full-text-search.md).
 * Pure: no index, no network — runPlan is the one caller of Pagefind.
 *
 * Neither engine forgives a typo inside a phrase, so each word not in the corpus is replaced by
 * the nearest words that are, and the phrase match itself discards the wrong guesses ("nwe" →
 * we / new / owe: only "new" makes the phrase). Two neighbouring words that, joined, are a corpus
 * word are also tried joined, because the index holds "Latter-day" as "latterday".
 */

/** The corpus word list: word → how many passages contain it (ties between corrections). */
export type WordCounts = ReadonlyMap<string, number>;
export type Correction = { typed: string; usedAs: string[] };
export type QueryPlan = { phrases: string[]; corrections: Correction[] };

/** Most searches one query may run (every combination of corrections, every join). */
export const MAX_PHRASES = 8;
/** Equally near spellings kept for one misspelt word, most common first. */
const MAX_VARIANTS = 3;
/** Words this long may be two typos off; shorter ones (down to SHORT_WORD) one; shorter none. */
const LONG_WORD = 5;
const LONG_WORD_TYPOS = 2;
const SHORT_WORD = 3;
const SHORT_WORD_TYPOS = 1;
const DIGIT_RE = /\d/;
/** A corpus word this rare may be the corpus's own typo ("covnant", once in the JoD)… */
const RARE_WORD_COUNT = 2;
/** …and a neighbour this many times commoner is then tried too ("covenant"). */
const COMMONER_FACTOR = 100;

const typosAllowed = (word: string): number =>
  DIGIT_RE.test(word)
    ? 0
    : word.length >= LONG_WORD
      ? LONG_WORD_TYPOS
      : word.length >= SHORT_WORD
        ? SHORT_WORD_TYPOS
        : 0;

/** Corpus words nearest this one (the word itself excluded), most common first. */
const nearestWords = (word: string, words: WordCounts, cap: number): [string, number][] => {
  let best = cap + 1;
  let near: [string, number][] = [];
  for (const [candidate, count] of words) {
    if (candidate === word) continue;
    const distance = editDistance(word, candidate, cap);
    if (distance < best) {
      best = distance;
      near = [[candidate, count]];
    } else if (distance === best && distance <= cap) near.push([candidate, count]);
  }
  return near.sort((a, b) => b[1] - a[1]);
};

/**
 * The spellings to search for one typed word: itself if the corpus has it (plus a far commoner
 * neighbour when the corpus has it only rarely); else its nearest corpus words; else itself.
 */
const variantsOf = (word: string, words: WordCounts): string[] => {
  const count = words.get(word);
  const cap = typosAllowed(word);
  if (cap === 0 || (count !== undefined && count > RARE_WORD_COUNT)) return [word];
  const near = nearestWords(word, words, cap);
  if (count !== undefined) {
    const commoner = near.filter(([, n]) => n >= count * COMMONER_FACTOR);
    return [word, ...commoner.slice(0, MAX_VARIANTS - 1).map(([w]) => w)];
  }
  return near.length > 0 ? near.slice(0, MAX_VARIANTS).map(([w]) => w) : [word];
};

/**
 * Every way to read the words with neighbours optionally joined, as typed first. Built left to
 * right (ways[i] covers the first i words), capped at each step so a long query stays small.
 */
const joinings = (keys: string[], words: WordCounts): string[][] => {
  const ways: string[][][] = [[[]]];
  keys.forEach((key, i) => {
    const alone = ways[i].map((way) => [...way, key]);
    const joined = i > 0 && words.has(keys[i - 1] + key) ? keys[i - 1] + key : null;
    const viaJoin = joined ? ways[i - 1].map((way) => [...way, joined]) : [];
    ways.push([...alone, ...viaJoin].slice(0, MAX_PHRASES));
  });
  return ways[keys.length];
};

/** Every combination of each word's variants, in order, capped. */
const combinations = (slots: string[][]): string[][] =>
  slots.reduce<string[][]>(
    (acc, variants) =>
      acc.flatMap((prefix) => variants.map((v) => [...prefix, v])).slice(0, MAX_PHRASES),
    [[]],
  );

/** Always quoted: an unquoted word lets Pagefind fall back to prefix guesses ("zzyzx" → "Z."). */
const asPhrase = (seq: string[]) => `"${seq.join(" ")}"`;

export const planQuery = (text: string, words: WordCounts): QueryPlan => {
  const keys = searchWords(text);
  if (keys.length === 0) return { phrases: [], corrections: [] };
  const variants = new Map(keys.map((key) => [key, variantsOf(key, words)]));
  const corrections = [...variants]
    .map(([typed, used]) => ({ typed, usedAs: used.filter((w) => w !== typed) }))
    .filter(({ usedAs }) => usedAs.length > 0);
  const phrases = joinings(keys, words)
    .flatMap((way) => combinations(way.map((w) => variants.get(w) ?? [w])))
    .map(asPhrase);
  return { phrases: [...new Set(phrases)].slice(0, MAX_PHRASES), corrections };
};
