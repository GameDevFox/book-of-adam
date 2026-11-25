import { describe, expect, it } from "vitest";

import type { OutlineNode } from "../records/texts";
import { citationUrl, isCitationPath, resolveCitation } from "./citations";

const discourse = (volume: string, pages: string): OutlineNode => ({
  id: `d${pages.split("-")[0]}`,
  title: `Discourse ${pages}`,
  kind: "reading",
  edition: "jod-mrm",
  file: volume,
  path: [`d${pages.split("-")[0]}`],
  pages,
});

// Volume 1: pp. 1-6, 6-15 (sharing p. 6), 16-27. Volume 26: pp. 1-9.
const outline: OutlineNode[] = [
  {
    id: "journal-of-discourses",
    title: "Journal of Discourses",
    kind: "group",
    children: [
      {
        id: "volume-01",
        title: "Volume 1",
        kind: "group",
        children: [
          discourse("volume-01", "1-6"),
          discourse("volume-01", "6-15"),
          discourse("volume-01", "16-27"),
        ],
      },
      {
        id: "volume-26",
        title: "Volume 26",
        kind: "group",
        children: [discourse("volume-26", "1-9")],
      },
    ],
  },
  {
    id: "eliza-r-snow-poems",
    title: "Poems of Eliza R. Snow",
    kind: "group",
    children: [
      {
        id: "decade-1840",
        title: "1840s",
        kind: "group",
        children: [
          { id: "year-1843", title: "1843", kind: "divider" },
          {
            id: "130",
            title: "Queen Victoria",
            kind: "reading",
            edition: "ers-lexicon",
            file: "poems-126-150",
            path: ["130"],
          },
        ],
      },
    ],
  },
  {
    id: "bible",
    title: "Bible",
    kind: "group",
    children: [
      { id: "genesis", title: "Genesis", kind: "reading", edition: "kjv", file: "genesis" },
    ],
  },
];

describe("resolveCitation", () => {
  it("lands a page inside a discourse on that discourse, keeping the page", () => {
    expect(resolveCitation(["jod", "1", "20"], outline)).toEqual({
      edition: "jod-mrm",
      file: "volume-01",
      path: ["d16"],
      page: 20,
    });
  });

  it("lands a discourse's opening page on it", () => {
    expect(resolveCitation(["jod", "1", "1"], outline)?.path).toEqual(["d1"]);
    expect(resolveCitation(["jod", "26", "1"], outline)).toMatchObject({ file: "volume-26" });
  });

  it("gives a page two discourses share to the one that begins there", () => {
    expect(resolveCitation(["jod", "1", "6"], outline)?.path).toEqual(["d6"]);
    expect(resolveCitation(["jod", "1", "15"], outline)?.path).toEqual(["d6"]);
  });

  it("finds nothing past the volume, in a missing volume, or for a non-number", () => {
    expect(resolveCitation(["jod", "1", "28"], outline)).toBeNull();
    expect(resolveCitation(["jod", "1", "0"], outline)).toBeNull();
    expect(resolveCitation(["jod", "27", "1"], outline)).toBeNull();
    expect(resolveCitation(["jod", "1", "6b"], outline)).toBeNull();
    expect(resolveCitation(["jod", "one", "6"], outline)).toBeNull();
  });

  it("is not a citation unless it is jod/<volume>/<page>", () => {
    expect(resolveCitation(["jod", "1"], outline)).toBeNull();
    expect(resolveCitation(["jod-mrm", "volume-01", "d1"], outline)).toBeNull();
  });
});

describe("citationUrl", () => {
  it("addresses a discourse by volume and opening page", () => {
    const [vol1, vol26] = outline[0].children ?? [];
    expect(citationUrl(vol1.children![1])).toBe("/library/jod/1/6");
    expect(citationUrl(vol26.children![0])).toBe("/library/jod/26/1");
  });

  it("has no citation form for other texts", () => {
    expect(citationUrl(outline[2].children![0])).toBeNull();
  });
});

describe("Eliza R. Snow poem URLs", () => {
  it("finds a poem by its number, whatever file holds it", () => {
    expect(resolveCitation(["eliza-r-snow-poems", "130"], outline)).toEqual({
      edition: "ers-lexicon",
      file: "poems-126-150",
      path: ["130"],
    });
  });

  it("finds nothing for a number with no poem, or a malformed one", () => {
    expect(resolveCitation(["eliza-r-snow-poems", "145"], outline)).toBeNull();
    expect(resolveCitation(["eliza-r-snow-poems", "x"], outline)).toBeNull();
    expect(resolveCitation(["eliza-r-snow-poems", "130", "extra"], outline)).toBeNull();
  });

  it("addresses a poem by its number", () => {
    const decade = outline[1].children![0];
    expect(citationUrl(decade.children![1])).toBe("/library/eliza-r-snow-poems/130");
  });

  it("counts the poems' path as a citation path", () => {
    expect(isCitationPath(["eliza-r-snow-poems", "130"])).toBe(true);
    expect(isCitationPath(["ers-lexicon", "poems-126-150", "130"])).toBe(false);
  });
});
