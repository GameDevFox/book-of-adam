/**
 * Word-frequency list for the Deseret converter's REVERSE direction.
 *
 * Deseret is phonetic, so decoding it back to English hits homophones constantly — "there" and
 * "their" are the same string and always will be. Ranking the candidates by how often each word
 * actually occurs in this project's corpora picks the reading a person most likely meant.
 *
 * Ranking off our own texts rather than a generic list is deliberate: it biases toward
 * scriptural English, which is the register this tool reads.
 *
 * Only words whose pronunciation is SHARED with another word are emitted — ranking is useless
 * for a word with no rival, and dropping the rest keeps the asset small.
 *
 * Run from packages/memorial:
 *   node scripts/build-frequency.mjs
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const CONTENT = path.join(PKG, "data/texts/content");
const DICT = path.join(PKG, "public/deseret/cmudict.txt");
const OUT = path.join(PKG, "public/deseret/frequency.txt");

/** Public-domain editions only — the shipped list must be as publishable as the app. */
const EDITIONS = ["bofm-lds", "bofm-1830", "jod-mrm", "kjv", "dc-lds", "pgp-lds"];

const walk = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".json") ? [full] : [];
  });
};

const strings = (node) => {
  if (Array.isArray(node)) return node.flatMap(strings);
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      key === "text" && typeof value === "string" ? [value] : strings(value),
    );
  }
  return [];
};

const main = () => {
  if (!existsSync(DICT)) throw new Error(`${DICT} is missing — run build-cmudict.mjs first`);

  // Pronunciation → words, so we know which words have a rival at all.
  //
  // Grouping must be STRESS-INSENSITIVE, exactly as the runtime reverse index is. Grouping by
  // the raw code string instead silently drops rivals that differ only in stress: "in" is
  // IH0 N and "inn" is IH1 N, so they look unrelated on codes alone — and "in", never marked
  // contested, would be missing from this list and lose the ranking to "inn".
  const dictText = readFileSync(DICT, "utf8");
  const lines = dictText.split("\n");
  const header = new Map();
  let cursor = 0;
  while (cursor < lines.length && lines[cursor].startsWith("#")) {
    const line = lines[cursor];
    const space = line.indexOf(" ");
    header.set(space === -1 ? line.slice(1) : line.slice(1, space), line.slice(space + 1));
    cursor += 1;
  }
  const alphabet = [...(header.get("alphabet") ?? "")];
  const symbols = (header.get("symbols") ?? "").split(" ");
  if (alphabet.length === 0 || alphabet.length !== symbols.length) {
    throw new Error("dictionary header is missing a usable alphabet/symbols pair");
  }
  const baseOf = new Map(alphabet.map((char, i) => [char, symbols[i].replace(/[0-2]$/, "")]));

  const rivals = new Map();
  for (const line of lines.slice(cursor)) {
    const space = line.indexOf(" ");
    if (space < 1) continue;
    const word = line.slice(0, space);
    const key = [...line.slice(space + 1)].map((char) => baseOf.get(char) ?? "").join(" ");
    rivals.set(key, [...(rivals.get(key) ?? []), word]);
  }
  const contested = new Set([...rivals.values()].filter((words) => words.length > 1).flat());

  const counts = new Map();
  let tokens = 0;
  for (const edition of EDITIONS) {
    for (const file of walk(path.join(CONTENT, edition))) {
      for (const text of strings(JSON.parse(readFileSync(file, "utf8")))) {
        for (const raw of text.toLowerCase().match(/[a-z']+/g) ?? []) {
          tokens += 1;
          if (contested.has(raw)) counts.set(raw, (counts.get(raw) ?? 0) + 1);
        }
      }
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const output = `#deseret-frequency v1\n#words ${ranked.length}\n${ranked
    .map(([word, count]) => `${word} ${count}`)
    .join("\n")}\n`;
  writeFileSync(OUT, output);

  process.stdout.write(
    `wrote ${path.relative(PKG, OUT)}\n` +
      `  ${ranked.length.toLocaleString()} contested words ranked, ` +
      `from ${tokens.toLocaleString()} tokens across ${EDITIONS.length} editions\n` +
      `  ${(output.length / 1e3).toFixed(0)} kB raw, ` +
      `${(gzipSync(output, { level: 9 }).length / 1e3).toFixed(0)} kB gzipped\n`,
  );
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
}
