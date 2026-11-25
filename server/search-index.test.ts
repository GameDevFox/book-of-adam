import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DataSource } from "./data-source";
import { pageHtml, SearchCorpus, searchPages, wordCounts, type SearchPage } from "./search-index";

/** Pushes a rewritten file's mtime clearly past the original, whatever the clock resolution. */
const MTIME_STEP_MS = 5000;

const writeJson = (file: string, body: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
};

const PAGE: SearchPage = {
  url: "/library/jod/1/62",
  title: "Salvation—The Gathering",
  titleIndexed: true,
  reference: "Brigham Young, JD 1:62-63",
  passages: [
    {
      id: "p1",
      text: "The Spirit of God—the Spirit of truth.",
      reference: "Brigham Young, JD 1:62",
    },
    { id: "p2", text: "Latter-day <Saints> & friends", reference: "Brigham Young, JD 1:63" },
  ],
};

describe("pageHtml", () => {
  const html = pageHtml(PAGE);

  it("gives each passage a heading with its id and its number, so it comes back as a sub-result", () => {
    expect(html).toContain('<h2 id="p1">¶1</h2>');
    expect(html).toContain('<h2 id="p2">¶2</h2>');
  });

  it("spaces every em-dash in the indexed text, title included", () => {
    expect(html).toContain("The Spirit of God — the Spirit of truth.");
    expect(html).toContain("<h1>Salvation — The Gathering</h1>");
  });

  it("escapes the text", () => {
    expect(html).toContain("Latter-day &lt;Saints&gt; &amp; friends");
  });

  it("keeps the references out of the indexed body, as metadata", () => {
    const body = html.slice(html.indexOf("<main"));
    expect(body).not.toContain("Brigham Young");
    expect(html).toContain('data-pagefind-meta="reference">Brigham Young, JD 1:62-63<');
    expect(html).toContain("&quot;p2&quot;:&quot;Brigham Young, JD 1:63&quot;");
  });

  it("indexes a title only when it is the text's own, not a label like Chapter 3", () => {
    expect(pageHtml({ ...PAGE, titleIndexed: false })).not.toContain("<h1>");
  });
});

describe("wordCounts", () => {
  it("counts the passages holding each word, joined the way the index joins them", () => {
    const words = wordCounts([PAGE]);
    expect(words.spirit).toBe(1);
    expect(words.latterday).toBe(1);
    expect(words.the).toBe(2); // once in p1's text, once in the indexed title
    expect(words.latter).toBeUndefined();
  });

  it("leaves out the words of a title that is not indexed", () => {
    expect(wordCounts([{ ...PAGE, titleIndexed: false }]).salvation).toBeUndefined();
  });
});

describe("searchPages", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "search-index-"));
    const texts = path.join(dataDir, "texts");
    writeJson(path.join(texts, "works.json"), [
      { id: "bible", title: "The Bible" },
      { id: "jod", title: "Journal of Discourses" },
      { id: "draft", title: "Draft" },
    ]);
    writeJson(path.join(texts, "editions.json"), [
      { id: "kjv", workId: "bible", title: "KJV", licence: "public-domain", contents: ["ruth"] },
      {
        id: "jod-mrm",
        workId: "jod",
        title: "JoD",
        licence: "public-domain",
        contents: ["volume-01"],
      },
      {
        id: "held",
        workId: "draft",
        title: "Held",
        licence: "public-domain",
        heldBack: "draft",
        contents: ["a"],
      },
    ]);
    writeJson(path.join(texts, "content", "kjv", "ruth.json"), {
      id: "ruth",
      title: "The Book of Ruth",
      units: [
        {
          id: "1",
          title: "Chapter 1",
          units: [
            { id: "1", text: "In the days" },
            { id: "2", text: "And the name" },
          ],
        },
      ],
    });
    writeJson(path.join(texts, "content", "jod-mrm", "volume-01.json"), {
      id: "volume-01",
      title: "Volume 1",
      units: [
        {
          id: "d1",
          title: "Salvation",
          meta: { speaker: "Brigham Young", date: "January 16, 1853", pages: "1-6" },
          units: [
            { id: "p1", text: "The plan of salvation" },
            { id: "orn1", text: "* * *" },
          ],
        },
      ],
    });
    writeJson(path.join(texts, "content", "held", "a.json"), {
      id: "a",
      units: [{ id: "1", units: [{ id: "1", text: "unpublished" }] }],
    });
  });
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  const pages = () => searchPages(DataSource({ dataDir, published: true }));

  it("makes one page per reading, at the URL the menu links it by", () => {
    expect(pages().map((p) => p.url)).toEqual(["/library/kjv/ruth/1", "/library/jod/1/1"]);
  });

  it("carries the published editions only", () => {
    expect(JSON.stringify(pages())).not.toContain("unpublished");
  });

  it("labels each passage the way Copy cites it", () => {
    const [ruth, jod] = pages();
    expect(ruth.passages.map((p) => p.reference)).toEqual(["Ruth 1:1", "Ruth 1:2"]);
    expect(jod.passages[0].reference).toBe("Brigham Young, JD 1:1 (January 16, 1853)");
  });

  it("indexes a discourse's title but not a chapter's label", () => {
    const [ruth, jod] = pages();
    expect([ruth.titleIndexed, jod.titleIndexed]).toEqual([false, true]);
  });

  it("rebuilds the word list when a text changes, so dev never searches a stale corpus", () => {
    const corpus = SearchCorpus(DataSource({ dataDir, published: true }));
    expect(corpus.words().gleaned).toBeUndefined();
    const ruth = path.join(dataDir, "texts", "content", "kjv", "ruth.json");
    writeJson(ruth, {
      id: "ruth",
      title: "The Book of Ruth",
      units: [{ id: "1", title: "Chapter 1", units: [{ id: "1", text: "She gleaned" }] }],
    });
    utimesSync(ruth, new Date(), new Date(Date.now() + MTIME_STEP_MS));
    expect(corpus.words().gleaned).toBe(1);
  });

  it("leaves out an ornament, which is no passage", () => {
    expect(pages()[1].passages.map((p) => p.id)).toEqual(["p1"]);
  });
});
