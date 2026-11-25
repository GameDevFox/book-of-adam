import { describe, expect, it } from "vitest";

import { editDistance } from "./edit-distance";

describe("editDistance", () => {
  it("counts insertions, deletions and substitutions", () => {
    expect(editDistance("everlasting", "everlasting")).toBe(0);
    expect(editDistance("everlating", "everlasting")).toBe(1);
    expect(editDistance("covnant", "covenant")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
  });

  it("counts a swapped pair of letters as one typo", () => {
    expect(editDistance("nwe", "new")).toBe(1);
    expect(editDistance("teh", "the")).toBe(1);
  });

  it("stops early past the cap, reporting cap + 1", () => {
    expect(editDistance("faith", "salvation", 2)).toBe(3);
    expect(editDistance("a", "abcdef", 2)).toBe(3);
    expect(editDistance("faith", "grace", 2)).toBe(3); // same length, so no length shortcut
    expect(editDistance("everlating", "everlasting", 2)).toBe(1);
  });
});
