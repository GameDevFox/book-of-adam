import { describe, expect, it } from "vitest";

import {
  formatSelection,
  parseSelection,
  passageNumber,
  runsOf,
  toggle,
  toggleRange,
} from "./selection";

describe("parseSelection", () => {
  it("reads single verses, ranges and lists", () => {
    expect(parseSelection("7")).toEqual([7]);
    expect(parseSelection("7-9")).toEqual([7, 8, 9]);
    expect(parseSelection("4,7-8")).toEqual([4, 7, 8]);
  });

  it("sorts, drops repeats and turns a backwards range around", () => {
    expect(parseSelection("8,4,7,4")).toEqual([4, 7, 8]);
    expect(parseSelection("9-7")).toEqual([7, 8, 9]);
  });

  it("ignores what is not a verse", () => {
    expect(parseSelection(null)).toEqual([]);
    expect(parseSelection("")).toEqual([]);
    expect(parseSelection("x,3,,0,-2")).toEqual([3]);
  });
});

describe("formatSelection", () => {
  it("writes verses in order with neighbours merged", () => {
    expect(formatSelection([8, 4, 7])).toBe("4,7-8");
    expect(formatSelection([1, 2, 3, 5])).toBe("1-3,5");
    expect(formatSelection([6])).toBe("6");
    expect(formatSelection([])).toBe("");
  });

  it("gives one selection one address, whatever order it was made in", () => {
    expect(formatSelection(parseSelection("8,7,4"))).toBe(formatSelection(parseSelection("4,7-8")));
  });
});

describe("runsOf", () => {
  it("splits a selection into runs of consecutive verses", () => {
    expect(runsOf([4, 7, 8])).toEqual([
      [4, 4],
      [7, 8],
    ]);
    expect(runsOf([])).toEqual([]);
  });
});

describe("toggle", () => {
  it("adds a verse that is not selected, removes one that is", () => {
    expect(toggle([4, 8], 7)).toEqual([4, 7, 8]);
    expect(toggle([4, 7, 8], 7)).toEqual([4, 8]);
  });
});

describe("toggleRange", () => {
  it("selects from the last-clicked verse when the clicked one was unselected", () => {
    expect(toggleRange([4], 4, 7)).toEqual([4, 5, 6, 7]);
    expect(toggleRange([9], 9, 6)).toEqual([6, 7, 8, 9]);
  });

  it("deselects the range when the clicked one was selected", () => {
    expect(toggleRange([3, 4, 5, 6, 7], 3, 5)).toEqual([6, 7]);
  });

  it("without a last-clicked verse, toggles just the one", () => {
    expect(toggleRange([2], null, 5)).toEqual([2, 5]);
  });
});

describe("passageNumber", () => {
  it("numbers verses, JoD paragraphs and poem stanzas alike", () => {
    expect(passageNumber("7")).toBe(7);
    expect(passageNumber("p7")).toBe(7);
    expect(passageNumber("s3")).toBe(3);
  });

  it("gives an ornament divider no number", () => {
    expect(passageNumber("orn1")).toBeNull();
  });
});
