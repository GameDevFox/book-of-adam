import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { convertPhonemes } from "./convert";
import { createLookup, parseDictionary, type LexiconEntry } from "./dictionary";

/** A miniature asset in the real format — the header defines its own decode table. */
const FIXTURE = [
  "#deseret-cmudict v1",
  "#entries 2",
  "#alphabet ACPX",
  "#symbols AA AH0 B K",
  "book PXX",
  "aha ACA",
  "",
].join("\n");

describe("dictionary format", () => {
  it("decodes using the alphabet declared in the file, not a hardcoded table", () => {
    const decode = parseDictionary(FIXTURE);
    expect(decode.get("book")).toEqual(["B", "K", "K"]);
    expect(decode.get("aha")).toEqual(["AA", "AH0", "AA"]);
    expect(decode.size).toBe(2);
  });

  it("returns undefined for a word it does not have", () => {
    expect(parseDictionary(FIXTURE).get("nephi")).toBeUndefined();
  });

  it("refuses an asset whose format version it does not recognize", () => {
    expect(() => parseDictionary("#deseret-cmudict v2\nbook PXX\n")).toThrow(/format/);
    expect(() => parseDictionary("")).toThrow(/format/);
  });

  it("refuses a header missing its alphabet/symbols pair", () => {
    expect(() => parseDictionary("#deseret-cmudict v1\n#alphabet AC\nbook PXX\n")).toThrow(
      /alphabet/,
    );
    expect(() => parseDictionary("#deseret-cmudict v1\n#symbols AA AH0\nbook PXX\n")).toThrow(
      /alphabet/,
    );
  });

  it("refuses a header whose alphabet and symbols are different lengths", () => {
    // Silently zipping the shorter of the two would mis-decode every entry using the tail of
    // the alphabet, rather than failing loudly at load.
    expect(() =>
      parseDictionary("#deseret-cmudict v1\n#alphabet AC\n#symbols AA AH0 B\nbook AC\n"),
    ).toThrow(/alphabet/);
  });
});

describe("lookup layering", () => {
  const decode = parseDictionary(FIXTURE);
  const lexicon: LexiconEntry[] = [
    { id: "nephi", phonemes: ["N", "IY1", "F", "AY1"], sources: ["https://example.test/guide"] },
    { id: "book", phonemes: ["B", "UH1", "K"], sources: ["https://example.test/guide"] },
  ];

  it("lets the curated lexicon win over CMUdict", () => {
    const { lookup } = createLookup(decode, lexicon);
    // CMUdict's fixture entry for "book" is deliberately wrong; the lexicon corrects it.
    expect(lookup("book")).toEqual(["B", "UH1", "K"]);
  });

  it("falls through to CMUdict, then to null", () => {
    const { lookup } = createLookup(decode, lexicon);
    expect(lookup("aha")).toEqual(["AA", "AH0", "AA"]);
    expect(lookup("nephi")).toEqual(["N", "IY1", "F", "AY1"]);
    expect(lookup("zarahemla")).toBeNull();
  });

  it("reports both counts so the UI can say what it loaded", () => {
    const dictionary = createLookup(decode, lexicon);
    expect(dictionary.size).toBe(2);
    expect(dictionary.curated).toBe(2);
  });
});

describe("the built asset", () => {
  const asset = path.resolve(__dirname, "../../public/deseret/cmudict.txt");
  const text = readFileSync(asset, "utf8");

  it("round-trips the build script's encoding", () => {
    const decode = parseDictionary(text);
    // Hand-verified against the code bands in scripts/build-cmudict.mjs: B->P, AW->E, T->6;
    // K->X, AH0->c (reduced band), Z->$.
    expect(decode.get("'bout")).toEqual(["B", "AW", "T"]);
    expect(decode.get("'cause")).toEqual(["K", "AH0", "Z"]);
  });

  it("agrees with the entry count in its own header", () => {
    const declared = Number(/^#entries (\d+)$/m.exec(text)![1]);
    expect(parseDictionary(text).size).toBe(declared);
  });

  it("converts real dictionary words end to end", () => {
    const { lookup } = createLookup(parseDictionary(text));
    const the = lookup("the");
    expect(the).not.toBeNull();
    // "the" is DH + a reduced vowel; it must survive as Deseret, not vanish.
    expect(convertPhonemes(the!)).toMatch(/^[\u{10428}-\u{1044F}]+$/u);
  });
});
