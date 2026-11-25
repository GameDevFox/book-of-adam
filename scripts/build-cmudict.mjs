/**
 * Build the Deseret converter's pronunciation dictionary from CMUdict.
 *
 * CMUdict is public domain, ~126k entries, ARPAbet with stress digits. The raw file is 3.6 MB;
 * the encoding here writes one character per phoneme and lands around 2.0 MB raw / 750 KB
 * gzipped — roughly the weight of two web fonts, so the whole dictionary ships as one cached
 * asset with no chunking (see docs/design/deseret-converter.md).
 *
 * The format is SELF-DESCRIBING: the header carries the code alphabet and the symbol it maps
 * to, so the loader builds its decode table from the file itself and the two can never drift.
 *
 * Only vowels take a stress digit in CMUdict, so only vowels need a second code band. Primary
 * and secondary stress are collapsed into one "full" band — the converter and every planned
 * profile care whether a vowel is REDUCED, not whether it is primary or secondary.
 *
 * Run from packages/memorial:
 *   node scripts/build-cmudict.mjs             # download (cached) and build
 *   node scripts/build-cmudict.mjs --refresh   # re-download first
 */
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
/**
 * The built dictionary is a static asset the browser fetches, so it lives in `public/` rather
 * than `data/` — `data/` holds reviewable facts, and CMUdict is neither reviewed nor ours.
 * The raw download is regenerable and gitignored, matching the JoD scraper's `raw/` cache.
 */
const OUT_DIR = path.join(PKG, "public/deseret");
const CACHE_DIR = path.join(PKG, "data/deseret/sources/raw");
const CACHE = path.join(CACHE_DIR, "cmudict.dict");
const OUT = path.join(OUT_DIR, "cmudict.txt");

const REPO = "cmusphinx/cmudict";
const SOURCE_URL = `https://raw.githubusercontent.com/${REPO}/master/cmudict.dict`;

/** The 15 ARPAbet vowels — the only phonemes CMUdict marks for stress. */
const VOWELS = "AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split(" ");
/** The 24 consonants. */
const CONSONANTS = "B CH D DH F G HH JH K L M N NG P R S SH T TH V W Y Z ZH".split(" ");

/** Code bands, sized to their inventories: 15 + 24 + 15 = 54 single-byte codes. */
const FULL_VOWEL_CHARS = "ABCDEFGHIJKLMNO";
const CONSONANT_CHARS = "PQRSTUVWXYZ0123456789#$%";
const REDUCED_VOWEL_CHARS = "abcdefghijklmno";

const REDUCED = "0";

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

assert(FULL_VOWEL_CHARS.length === VOWELS.length, "vowel band is the wrong size");
assert(CONSONANT_CHARS.length === CONSONANTS.length, "consonant band is the wrong size");
assert(REDUCED_VOWEL_CHARS.length === VOWELS.length, "reduced band is the wrong size");

const ALPHABET = FULL_VOWEL_CHARS + CONSONANT_CHARS + REDUCED_VOWEL_CHARS;
/** What each code character decodes to. Reduced vowels keep their `0` so the loader sees it. */
const SYMBOLS = [...VOWELS, ...CONSONANTS, ...VOWELS.map((v) => `${v}${REDUCED}`)];
assert(new Set(ALPHABET).size === ALPHABET.length, "code alphabet has a duplicate character");
assert(ALPHABET.length === SYMBOLS.length, "alphabet and symbol list disagree");
assert(!ALPHABET.includes(" "), "code alphabet must not contain a space");

const encodeOf = new Map();
[...ALPHABET].forEach((char, i) => encodeOf.set(SYMBOLS[i], char));

const fetchText = async (url) => {
  const response = await fetch(url);
  assert(response.ok, `${url} -> HTTP ${response.status}`);
  return response.text();
};

const sourceRef = async () => {
  try {
    const commits = await fetch(`https://api.github.com/repos/${REPO}/commits/master`);
    if (!commits.ok) return "unknown";
    return (await commits.json()).sha ?? "unknown";
  } catch {
    return "unknown";
  }
};

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true });
  const refresh = process.argv.includes("--refresh");
  if (refresh || !existsSync(CACHE)) {
    process.stdout.write(`downloading ${SOURCE_URL}\n`);
    writeFileSync(CACHE, await fetchText(SOURCE_URL));
  }
  const raw = readFileSync(CACHE, "utf8");

  const lines = [];
  let skippedVariants = 0;
  let skippedUnknown = 0;
  for (const line of raw.split("\n")) {
    // CMUdict puts comments after `#`, and lists extra pronunciations as `word(2)`.
    const entry = line.split("#")[0].trim();
    if (!entry) continue;
    const [word, ...phonemes] = entry.split(/\s+/);
    if (word.endsWith(")")) {
      skippedVariants += 1;
      continue;
    }
    const codes = phonemes.map((phoneme) => {
      // Secondary stress collapses onto the full band; only `0` selects the reduced band.
      const normalized = /[12]$/.test(phoneme) ? phoneme.slice(0, -1) : phoneme;
      return encodeOf.get(normalized);
    });
    if (codes.some((code) => code === undefined)) {
      skippedUnknown += 1;
      continue;
    }
    lines.push(`${word} ${codes.join("")}`);
  }

  const header = [
    "#deseret-cmudict v1",
    `#source ${SOURCE_URL} @ ${await sourceRef()}`,
    `#entries ${lines.length}`,
    `#alphabet ${ALPHABET}`,
    `#symbols ${SYMBOLS.join(" ")}`,
  ];
  const output = `${[...header, ...lines].join("\n")}\n`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, output);

  const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
  process.stdout.write(
    `wrote ${path.relative(PKG, OUT)}\n` +
      `  ${lines.length.toLocaleString()} entries, ${mb(output.length)} raw, ` +
      `${mb(gzipSync(output, { level: 9 }).length)} gzipped\n` +
      `  skipped ${skippedVariants.toLocaleString()} alternate pronunciations` +
      (skippedUnknown ? `, ${skippedUnknown} with unmappable phonemes` : "") +
      "\n",
  );
};

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
});
