import { describe, expect, it } from "vitest";

import {
  collectionUrl,
  contentUrl,
  outlineUrl,
  parseApiPath,
  registryUrl,
  reviewsUrl,
  wordsUrl,
} from "./api-paths";

describe("api paths", () => {
  it("round-trips every URL the client builds", () => {
    expect(parseApiPath(collectionUrl("people"))).toEqual({
      kind: "collection",
      collection: "people",
    });
    expect(parseApiPath(reviewsUrl("people"))).toEqual({ kind: "reviews", collection: "people" });
    expect(parseApiPath(registryUrl)).toEqual({ kind: "registry" });
    expect(parseApiPath(outlineUrl)).toEqual({ kind: "outline" });
    expect(parseApiPath(wordsUrl)).toEqual({ kind: "words" });
    expect(parseApiPath(contentUrl("bofm-lds", "1-nephi"))).toEqual({
      kind: "content",
      edition: "bofm-lds",
      unit: "1-nephi",
    });
  });

  it("gives every static resource a .json file name", () => {
    for (const url of [
      collectionUrl("people"),
      registryUrl,
      outlineUrl,
      contentUrl("kjv", "genesis"),
    ]) {
      expect(url).toMatch(/\.json$/);
    }
  });

  it("rejects paths outside the grammar", () => {
    expect(parseApiPath("/api/data/people")).toBeNull();
    expect(parseApiPath("/api/data/../secrets.json")).toBeNull();
    expect(parseApiPath("/api/texts/content/kjv/../../local/x.json")).toBeNull();
    expect(parseApiPath("/api/texts/content/kjv.json")).toBeNull();
    expect(parseApiPath("/api/texts")).toBeNull();
    expect(parseApiPath("/elsewhere/data/people.json")).toBeNull();
  });
});
