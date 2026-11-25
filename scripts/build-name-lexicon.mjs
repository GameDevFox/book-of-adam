/**
 * Add Book of Mormon name pronunciations to the Deseret converter's curated lexicon.
 *
 * Source: the official Book of Mormon Pronunciation Guide, which uses a closed respelling
 * system with a published key — so the conversion to ARPAbet is mechanical, not a judgement
 * call. Each generated entry carries the guide as its source and is reviewable like any other
 * fact in memorial (fact path `<id>.phonemes`).
 *
 * The respelling key, verbatim from the guide:
 *   a  about        ă  ask, pat, map      ā  able, bake, way    ä  alms, father, call
 *   ĕ  ebb, met     ē  eat, mete, me      er permit            ĭ  it, him, mirror
 *   ī  idle, fine   ō  over, bone, know   ou about             u  jump
 *   ū  rule, boot, two
 * `ʹ` closes the stressed syllable; `-` separates syllables; `–` joins compound names.
 *
 * IDEMPOTENT AND NON-DESTRUCTIVE: entries sourced to the guide are regenerated; every other
 * entry in the lexicon is preserved untouched. Hand-corrected pronunciations survive a re-run
 * as long as their `sources` no longer point only at the guide.
 *
 * Run from packages/memorial:
 *   node scripts/build-name-lexicon.mjs             # use the cached page
 *   node scripts/build-name-lexicon.mjs --refresh   # re-download the guide first
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const CACHE_DIR = path.join(PKG, "data/deseret/sources/raw");
const CACHE = path.join(CACHE_DIR, "pronunciation-guide.html");
const LEXICON = path.join(PKG, "data/deseret-lexicon.json");

const SOURCE_URL =
  "https://www.churchofjesuschrist.org/study/scriptures/bofm/pronunciation?lang=eng";

/** Vowel symbols, longest first so digraphs win over their first character. */
const VOWELS = [
  ["ou", "AW"],
  ["er", "ER"],
  ["ă", "AE"],
  ["ā", "EY"],
  ["ä", "AA"],
  ["ĕ", "EH"],
  ["ē", "IY"],
  ["ĭ", "IH"],
  ["ī", "AY"],
  ["ō", "OW"],
  ["ū", "UW"],
  ["a", "AH"], // the key's plain `a` is schwa; always unstressed
  ["u", "AH"], // "jump" — the wedge
];

/** Consonants, digraphs first. */
const CONSONANTS = [
  ["ch", "CH"],
  ["sh", "SH"],
  ["th", "TH"],
  ["ng", "NG"],
  ["zh", "ZH"],
  ["b", "B"],
  ["d", "D"],
  ["f", "F"],
  ["g", "G"],
  ["h", "HH"],
  ["j", "JH"],
  ["k", "K"],
  ["l", "L"],
  ["m", "M"],
  ["n", "N"],
  ["p", "P"],
  ["r", "R"],
  ["s", "S"],
  ["t", "T"],
  ["v", "V"],
  ["w", "W"],
  ["y", "Y"],
  ["z", "Z"],
];

/** The guide's plain `a` is the schwa of "about" and never carries stress. */
const ALWAYS_REDUCED = "a";
const STRESS_MARKS = /[ʹ′']/;
const COMPOUND = /[–—]/;

/**
 * One syllable → ARPAbet, or null if any character is outside the key. Returning null rather
 * than skipping the character matters: a silently dropped sound is a wrong pronunciation
 * presented as a right one.
 */
const readSyllable = (syllable, stressed) => {
  const phonemes = [];
  let rest = syllable;
  while (rest.length > 0) {
    const vowel = VOWELS.find(([symbol]) => rest.startsWith(symbol));
    if (vowel) {
      const [symbol, arpabet] = vowel;
      const reduced = symbol === ALWAYS_REDUCED || !stressed;
      phonemes.push(`${arpabet}${reduced ? "0" : "1"}`);
      rest = rest.slice(symbol.length);
      continue;
    }
    const consonant = CONSONANTS.find(([symbol]) => rest.startsWith(symbol));
    if (!consonant) return null;
    phonemes.push(consonant[1]);
    rest = rest.slice(consonant[0].length);
  }
  return phonemes;
};

/** A whole respelling → ARPAbet, or null if anything in it is unrecognized. */
export const respellingToArpabet = (respelling) => {
  const phonemes = [];
  for (const word of respelling.split(COMPOUND)) {
    // `ʹ` closes the stressed syllable, so it is a syllable boundary that also marks stress.
    const syllables = [];
    let stressedIndex = -1;
    for (const chunk of word.split("-")) {
      const parts = chunk.split(STRESS_MARKS);
      parts.forEach((part, i) => {
        if (part === "") return;
        syllables.push(part);
        // Every part except the last was closed by a stress mark.
        if (i < parts.length - 1) stressedIndex = syllables.length - 1;
      });
    }
    for (const [i, syllable] of syllables.entries()) {
      const read = readSyllable(syllable, i === stressedIndex);
      if (read === null) return null;
      phonemes.push(...read);
    }
  }
  return phonemes.length > 0 ? phonemes : null;
};

/**
 * Regular English plural, phonemes and spelling. The guide lists singulars, but the corpus is
 * full of the plurals — *Lamanites* alone is the single most frequent word CMUdict misses.
 * The allomorph is fully determined by the final phoneme, so this is a rule, not a guess.
 */
const SIBILANTS = new Set(["S", "Z", "SH", "ZH", "CH", "JH"]);
const VOICELESS = new Set(["P", "T", "K", "F", "TH"]);

export const pluralize = (name, phonemes) => {
  // Only vowels carry a stress digit, and every vowel is voiced, so a stressed final vowel
  // falls to the voiced default without any digit-stripping.
  const last = phonemes[phonemes.length - 1];
  const suffix = SIBILANTS.has(last) ? ["IH0", "Z"] : VOICELESS.has(last) ? ["S"] : ["Z"];
  return {
    id: /(s|z|x|ch|sh)$/.test(name) ? `${name}es` : `${name}s`,
    phonemes: [...phonemes, ...suffix],
  };
};

/** Words the shipped CMUdict asset already covers — never override those with a derived form. */
const knownWords = (dictPath) => {
  if (!existsSync(dictPath)) return new Set();
  const words = new Set();
  for (const line of readFileSync(dictPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const space = line.indexOf(" ");
    if (space > 0) words.add(line.slice(0, space));
  }
  return words;
};

/** Pull Name/respelling pairs out of the guide page. */
const parseGuide = (pageHtml) => {
  const text = pageHtml
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const isName = (line) => /^[A-Z][A-Za-z'–-]+$/.test(line);
  const hasDiacritic = (line) => /[ăāäĕēĭīōū]/.test(line);

  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (isName(lines[i]) && hasDiacritic(lines[i + 1]) && !isName(lines[i + 1])) {
      pairs.push({ name: lines[i], respelling: lines[i + 1] });
      i += 1;
    }
  }
  return pairs;
};

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (process.argv.includes("--refresh") || !existsSync(CACHE)) {
    process.stdout.write(`downloading ${SOURCE_URL}\n`);
    const response = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)" },
    });
    if (!response.ok) throw new Error(`${SOURCE_URL} -> HTTP ${response.status}`);
    writeFileSync(CACHE, await response.text());
  }

  const pairs = parseGuide(readFileSync(CACHE, "utf8"));
  if (pairs.length === 0) throw new Error("parsed no entries — the page layout probably changed");

  const generated = [];
  const failed = [];
  for (const { name, respelling } of pairs) {
    const phonemes = respellingToArpabet(respelling);
    if (!phonemes) {
      failed.push(`${name} (${respelling})`);
      continue;
    }
    generated.push({
      id: name.toLowerCase(),
      phonemes,
      note: `Book of Mormon Pronunciation Guide: ${respelling}`,
      sources: [SOURCE_URL],
    });
  }

  // Plurals of the guide's singulars, skipping any the guide or CMUdict already covers.
  const cmudict = knownWords(path.join(PKG, "public/deseret/cmudict.txt"));
  const guideIds = new Set(generated.map((entry) => entry.id));
  const plurals = [];
  for (const entry of generated) {
    const plural = pluralize(entry.id, entry.phonemes);
    if (guideIds.has(plural.id) || cmudict.has(plural.id)) continue;
    plurals.push({
      ...plural,
      note: `Regular plural of "${entry.id}" (${entry.note})`,
      sources: [SOURCE_URL],
    });
  }
  generated.push(...plurals);

  const existing = existsSync(LEXICON) ? JSON.parse(readFileSync(LEXICON, "utf8")) : [];
  const isGuideSourced = (entry) => entry.sources?.length === 1 && entry.sources[0] === SOURCE_URL;
  const kept = existing.filter((entry) => !isGuideSourced(entry));
  const keptIds = new Set(kept.map((entry) => entry.id));

  const merged = [...kept, ...generated.filter((entry) => !keptIds.has(entry.id))].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  writeFileSync(LEXICON, `${JSON.stringify(merged, null, 2)}\n`);

  process.stdout.write(
    `wrote ${path.relative(PKG, LEXICON)}\n` +
      `  ${merged.length} entries (${generated.length - plurals.length} from the guide, ` +
      `${plurals.length} derived plurals, ${kept.length} preserved)\n`,
  );
  if (failed.length > 0) {
    process.stdout.write(
      `  ${failed.length} respellings could not be parsed and were SKIPPED:\n` +
        failed.map((f) => `    ${f}\n`).join(""),
    );
  }
};

// Only build when run as a script — the respelling converter above is imported by its tests.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exit(1);
  });
}
