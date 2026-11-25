import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseApiPath } from "../src/records/api-paths";
import { DataSource, emitStatic } from "./data-source";

/**
 * Fixture corpus: one public-domain edition whose registered contents include a unit that
 * exists only in local/, plus a local-only edition. The published build must carry neither.
 */
const unitTree = (title: string) => ({
  title,
  units: [
    {
      id: "1",
      title: "Chapter 1",
      meta: { pages: "60-65", speaker: "Brigham Young" },
      units: [{ id: "1", text: `${title} verse` }],
    },
  ],
});

const writeJson = (file: string, body: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
};

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });

let root: string;
let dataDir: string;
let outDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "boa-data-"));
  dataDir = path.join(root, "data");
  outDir = path.join(root, "dist");
  const texts = path.join(dataDir, "texts");
  writeJson(path.join(dataDir, "people.json"), [{ id: "joseph-smith" }]);
  writeJson(path.join(dataDir, "people.reviews.json"), {
    "joseph-smith.born.date": { status: "verified", reviewedAt: "2026-10-23T00:00:00.000Z" },
  });
  writeJson(path.join(texts, "works.json"), [
    { id: "open-work", title: "Open Work", groups: [] },
    { id: "closed-work", title: "Closed Work", groups: [] },
  ]);
  writeJson(path.join(texts, "editions.json"), [
    {
      id: "open-ed",
      workId: "open-work",
      title: "Open",
      licence: "public-domain",
      contents: ["book", "private"],
    },
    {
      id: "closed-ed",
      workId: "closed-work",
      title: "Closed",
      licence: "local-only",
      contents: ["secret"],
    },
    {
      id: "draft-ed",
      workId: "open-work",
      title: "Draft",
      licence: "public-domain",
      heldBack: "Only one chapter imported so far.",
      contents: ["draft-book"],
    },
  ]);
  writeJson(path.join(texts, "content", "open-ed", "book.json"), unitTree("Book"));
  writeJson(path.join(texts, "local", "open-ed", "private.json"), unitTree("Private"));
  writeJson(path.join(texts, "local", "closed-ed", "secret.json"), unitTree("Secret"));
  writeJson(path.join(texts, "content", "draft-ed", "draft-book.json"), unitTree("Unfinished"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("DataSource (research)", () => {
  it("serves committed and local content alike", () => {
    const source = DataSource({ dataDir, published: false });
    expect(source.content("open-ed", "book")?.title).toBe("Book");
    expect(source.content("open-ed", "private")?.title).toBe("Private");
    expect(source.content("closed-ed", "secret")?.title).toBe("Secret");
    expect(source.content("draft-ed", "draft-book")?.title).toBe("Unfinished");
    expect(source.registry().editions.map((e) => e.id)).toEqual([
      "open-ed",
      "closed-ed",
      "draft-ed",
    ]);
  });

  it("serves a collection with its review sidecar", () => {
    const source = DataSource({ dataDir, published: false });
    const data = source.collection("people");
    expect(data?.records).toEqual([{ id: "joseph-smith" }]);
    expect(Object.keys(data?.reviews ?? {})).toEqual(["joseph-smith.born.date"]);
    expect(source.collection("nope")).toBeNull();
  });
});

describe("outline", () => {
  it("carries a reading unit's printed page range to its menu entry", () => {
    const [work] = DataSource({ dataDir, published: true }).outline();
    expect(work.children?.[0]).toMatchObject({
      kind: "reading",
      title: "Chapter 1",
      pages: "60-65",
    });
  });

  it("names a unit by its short title in the menu, where it has one", () => {
    writeJson(path.join(dataDir, "texts", "content", "open-ed", "book.json"), {
      ...unitTree("The First Book of Moses Called Genesis"),
      shortTitle: "Genesis",
      units: [unitTree("x").units[0], { ...unitTree("x").units[0], id: "2", title: "Chapter 2" }],
    });
    // Unpublished, so the local second book keeps a book level (a lone book is flattened away).
    const [work] = DataSource({ dataDir, published: false }).outline();
    const edition = work.children?.find((n) => n.title === "Open");
    expect(edition?.children?.map((n) => n.title)).toEqual(["Genesis", "Private"]);
  });

  it("carries a reading unit's speaker to its menu entry", () => {
    const [work] = DataSource({ dataDir, published: true }).outline();
    expect(work.children?.[0]).toMatchObject({ speaker: "Brigham Young" });
  });
});

describe("emitStatic (published build)", () => {
  const emit = () => {
    emitStatic(DataSource({ dataDir, published: true }), outDir);
    return listFiles(outDir).map(
      (file) => `/${path.relative(outDir, file).split(path.sep).join("/")}`,
    );
  };
  const readEmitted = (url: string) => JSON.parse(readFileSync(path.join(outDir, url), "utf8"));

  it("writes the public collections, registry, outline and content", () => {
    const urls = emit();
    expect(urls).toContain("/api/data/people.json");
    expect(urls).toContain("/api/texts/registry.json");
    expect(urls).toContain("/api/texts/outline.json");
    expect(urls).toContain("/api/texts/content/open-ed/book.json");
    expect(readEmitted("/api/texts/content/open-ed/book.json")).toEqual(unitTree("Book"));
    expect(readEmitted("/api/data/people.json").records).toEqual([{ id: "joseph-smith" }]);
  });

  it("publishes records without their review sidecar", () => {
    emit();
    expect(readEmitted("/api/data/people.json").reviews).toEqual({});
  });

  it("never emits local text, nor names local-only editions", () => {
    const urls = emit();
    expect(urls.filter((url) => /private|secret|closed/.test(url))).toEqual([]);
    for (const url of urls)
      expect(readFileSync(path.join(outDir, url), "utf8")).not.toMatch(/private|secret|closed/i);
  });

  it("leaves out held-back editions but keeps their work's other editions", () => {
    const urls = emit();
    expect(urls.filter((url) => url.includes("draft"))).toEqual([]);
    for (const url of urls) {
      expect(readFileSync(path.join(outDir, url), "utf8")).not.toMatch(/draft|unfinished/i);
    }
    const registry = readEmitted("/api/texts/registry.json");
    expect(registry.editions.map((e: { id: string }) => e.id)).toEqual(["open-ed"]);
    expect(registry.works.map((w: { id: string }) => w.id)).toEqual(["open-work"]);
  });

  it("writes only paths the client can address", () => {
    for (const url of emit()) expect(parseApiPath(url), url).not.toBeNull();
  });

  it("does not emit review sidecars as collections of their own", () => {
    expect(emit()).not.toContain("/api/data/people.reviews.json");
  });
});
