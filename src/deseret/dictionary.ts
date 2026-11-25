import type { Lookup, Phoneme } from "./convert";
import type { ReverseLookup } from "./reverse";

/**
 * Loading and lookup — the impure edge of the converter. Parsing is a pure function so the
 * format is testable without a network.
 *
 * Entries are kept as their encoded code string and decoded per lookup rather than expanded
 * into 126k arrays up front: same answers, a fraction of the heap.
 */

/** The build script's format version. A mismatch means the asset and the loader have drifted. */
export const DICTIONARY_FORMAT = "deseret-cmudict v1";

/**
 * One curated pronunciation — a word CMUdict does not know. Sourced and reviewable like every
 * other fact in memorial: the fact path is `<id>.phonemes`.
 */
export type LexiconEntry = {
  /** The word, lowercased. Doubles as the record id. */
  id: string;
  phonemes: Phoneme[];
  /** Why this pronunciation, when a source needs explaining. */
  note?: string;
  sources: string[];
};

export type Dictionary = {
  lookup: Lookup;
  /**
   * Deseret → English. Candidate words sharing a pronunciation, best first. Empty when nothing
   * matches. Built lazily, since the forward direction never needs it.
   */
  reverse: ReverseLookup;
  /** Entry counts, for the UI to show what it loaded. */
  size: number;
  curated: number;
};

/**
 * Reverse lookup is STRESS-INSENSITIVE. Deseret writes 𐐲 for both the schwa of "about" and the
 * wedge of "up", so reading it back cannot recover which was meant — and for a decoding aid it
 * does not matter, since they sound alike. Keying without stress is what makes 𐐲𐐺𐐵𐐻 find
 * "about" at all, whose stored pronunciation is AH0 B AW T.
 */
const stressFreeKey = (phonemes: readonly Phoneme[]): string =>
  phonemes.map((phoneme) => phoneme.replace(/[0-2]$/, "")).join(" ");

const HEADER_PREFIX = "#";

/** Word → phonemes, decoded on demand from the packed code string. */
export type DecodeTable = {
  get: (word: string) => Phoneme[] | undefined;
  size: number;
  /** Pronunciation (stress-free, space-joined) → the words sharing it. */
  invert: () => Map<string, string[]>;
};

/**
 * Parse the self-describing dictionary asset. The header carries the code alphabet and the
 * symbol each character stands for, so the decode table comes from the file rather than being
 * duplicated here — the two cannot drift.
 */
export const parseDictionary = (text: string): DecodeTable => {
  const lines = text.split("\n");
  if (lines[0] !== `${HEADER_PREFIX}${DICTIONARY_FORMAT}`) {
    throw new Error(`unexpected dictionary format: ${lines[0] ?? "(empty)"}`);
  }

  const header = new Map<string, string>();
  let cursor = 0;
  while (cursor < lines.length && lines[cursor].startsWith(HEADER_PREFIX)) {
    const line = lines[cursor];
    const space = line.indexOf(" ");
    header.set(space === -1 ? line.slice(1) : line.slice(1, space), line.slice(space + 1));
    cursor += 1;
  }

  const alphabet = header.get("alphabet");
  const symbols = header.get("symbols")?.split(" ");
  if (!alphabet || !symbols || [...alphabet].length !== symbols.length) {
    throw new Error("dictionary header is missing a usable alphabet/symbols pair");
  }
  const phonemeOf = new Map([...alphabet].map((char, i) => [char, symbols[i]]));

  const entries = new Map<string, string>();
  for (const line of lines.slice(cursor)) {
    const space = line.indexOf(" ");
    if (space === -1) continue;
    entries.set(line.slice(0, space), line.slice(space + 1));
  }

  return {
    size: entries.size,
    get: (word) => {
      const codes = entries.get(word);
      if (codes === undefined) return undefined;
      return [...codes].flatMap((char) => phonemeOf.get(char) ?? []);
    },
    // The inverse index is built from the packed code strings directly — no need to decode
    // 126k entries into arrays just to re-join them.
    invert: () => {
      const baseOf = new Map(
        [...phonemeOf].map(([char, phoneme]) => [char, phoneme.replace(/[0-2]$/, "")]),
      );
      const index = new Map<string, string[]>();
      for (const [word, codes] of entries) {
        const key = [...codes].map((char) => baseOf.get(char) ?? "").join(" ");
        const bucket = index.get(key);
        if (bucket) bucket.push(word);
        else index.set(key, [word]);
      }
      return index;
    },
  };
};

/** Parse the frequency asset (see scripts/build-frequency.mjs) into word → rank. */
export const parseFrequency = (text: string): Map<string, number> => {
  const rank = new Map<string, number>();
  let position = 0;
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const space = line.indexOf(" ");
    rank.set(space === -1 ? line : line.slice(0, space), position);
    position += 1;
  }
  return rank;
};

/**
 * Build a lookup over the parsed dictionary and the curated lexicon. **The lexicon wins** —
 * it exists precisely to correct and extend CMUdict.
 */
export const createLookup = (
  decode: DecodeTable,
  lexicon: readonly LexiconEntry[] = [],
  frequency: Map<string, number> = new Map(),
): Dictionary => {
  const curated = new Map(lexicon.map((entry) => [entry.id.toLowerCase(), entry.phonemes]));

  let index: Map<string, string[]> | null = null;
  const buildIndex = () => {
    const built = decode.invert();
    // Curated names belong in the reverse direction too, or 𐐤𐐨𐑁𐐴 would not find "Nephi".
    for (const [word, phonemes] of curated) {
      const key = stressFreeKey(phonemes);
      const bucket = built.get(key);
      if (bucket) {
        if (!bucket.includes(word)) bucket.push(word);
      } else built.set(key, [word]);
    }
    return built;
  };

  /**
   * Rank homophones by how often they occur in this project's corpora, so 𐑄𐐩𐑉 offers "there"
   * before "their". Unranked words sort after ranked ones; shortest-then-alphabetical breaks
   * the remaining ties so the result is deterministic.
   */
  const rank = (word: string) => frequency.get(word) ?? Number.MAX_SAFE_INTEGER;
  const better = (a: string, b: string) =>
    rank(a) - rank(b) || a.length - b.length || a.localeCompare(b);

  return {
    lookup: (word) => curated.get(word) ?? decode.get(word) ?? null,
    reverse: (readings) => {
      index ??= buildIndex();
      const merged = new Set<string>();
      for (const reading of readings) {
        for (const word of index.get(stressFreeKey(reading)) ?? []) merged.add(word);
      }
      return [...merged].sort(better);
    },
    size: decode.size,
    curated: curated.size,
  };
};

/**
 * Where the built asset is served from — see scripts/build-cmudict.mjs. It lives in `public/`
 * so one plain fetch with a long cache lifetime covers "offline after the first load"; no
 * service worker, which is a whole-app decision rather than this feature's.
 *
 * The curated lexicon is NOT fetched: it is imported so it survives a production build, where
 * the dev-only data API does not exist. `data/deseret-lexicon.json` stays the reviewable
 * source of truth either way.
 */
export const DICTIONARY_URL = "/deseret/cmudict.txt";
export const FREQUENCY_URL = "/deseret/frequency.txt";

export const loadDictionary = async (
  dictionaryUrl = DICTIONARY_URL,
  lexicon: readonly LexiconEntry[] = [],
  frequencyUrl = FREQUENCY_URL,
): Promise<Dictionary> => {
  const [dictionary, frequency] = await Promise.all([
    fetch(dictionaryUrl),
    // Ranking only improves which homophone is offered first, so a missing frequency asset
    // degrades the reverse direction rather than breaking the app.
    fetch(frequencyUrl).catch(() => null),
  ]);
  if (!dictionary.ok) throw new Error(`${dictionaryUrl} -> HTTP ${dictionary.status}`);
  const ranks = frequency?.ok ? parseFrequency(await frequency.text()) : new Map<string, number>();
  return createLookup(parseDictionary(await dictionary.text()), lexicon, ranks);
};
