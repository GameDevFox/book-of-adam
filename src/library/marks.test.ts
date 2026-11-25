import { describe, expect, it } from "vitest";

import type { TextUnit } from "../records/texts";
import { breakBefore } from "./marks";

const unit = (page?: number, column?: "a" | "b"): TextUnit => ({
  id: "p",
  text: "…",
  page,
  column,
});

describe("breakBefore", () => {
  it("marks a new page with a page rule", () => {
    expect(breakBefore(unit(6, "b"), unit(7, "a"))).toEqual({ kind: "page", page: 7 });
  });

  it("marks a new column on the same page with a column rule", () => {
    expect(breakBefore(unit(6, "a"), unit(6, "b"))).toEqual({
      kind: "column",
      page: 6,
      column: "b",
    });
  });

  it("marks nothing within a column", () => {
    expect(breakBefore(unit(6, "a"), unit(6, "a"))).toBeNull();
  });

  it("marks nothing before the first paragraph, or in texts without page data", () => {
    expect(breakBefore(null, unit(6, "a"))).toBeNull();
    expect(breakBefore(unit(), unit())).toBeNull();
  });
});
