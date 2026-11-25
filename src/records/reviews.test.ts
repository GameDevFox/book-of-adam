import { describe, expect, it } from "vitest";

import { applyReviews, parseReviewInputs, resolveFactPath, type ReviewMap } from "./reviews";
import type { PersonRecord } from "./types";

const REVIEWED_AT = "2026-07-10T00:00:00.000Z";

const person = (id: string): PersonRecord => ({
  id,
  name: "Test Person",
  role: "Test role",
  groups: ["lds"],
  born: { date: "1800-01-01", place: "Somewhere" },
  died: { date: "1850-01-01" },
  sources: [{ label: "Wikipedia", url: "https://example.org" }],
});

describe("resolveFactPath", () => {
  const records = [person("a"), person("b")];

  it("resolves leaf facts and intermediate objects", () => {
    expect(resolveFactPath(records, "b.born.date")).toBe("1800-01-01");
    expect(resolveFactPath(records, "b.born.place")).toBe("Somewhere");
    expect(resolveFactPath(records, "b.born")).toEqual({ date: "1800-01-01", place: "Somewhere" });
  });

  it("returns undefined for unknown records or fields", () => {
    expect(resolveFactPath(records, "missing.born.date")).toBeUndefined();
    expect(resolveFactPath(records, "a.marriage.date")).toBeUndefined();
    expect(resolveFactPath(records, "a.died.place")).toBeUndefined();
    expect(resolveFactPath(records, "a.born.date.year")).toBeUndefined();
  });
});

describe("applyReviews", () => {
  it("sets reviews with the stamp and note, one entry per fact", () => {
    const reviews = applyReviews(
      {},
      [
        { path: "a.born.date", status: "verified" },
        { path: "a.died.date", status: "disputed", note: "off by a year" },
      ],
      REVIEWED_AT,
    );
    expect(reviews).toEqual({
      "a.born.date": { status: "verified", reviewedAt: REVIEWED_AT },
      "a.died.date": { status: "disputed", reviewedAt: REVIEWED_AT, note: "off by a year" },
    });
  });

  it("clearing to unverified deletes the entry and leaves others alone", () => {
    const existing: ReviewMap = {
      "a.born.date": { status: "verified", reviewedAt: REVIEWED_AT },
      "a.died.date": { status: "disputed", reviewedAt: REVIEWED_AT, note: "bad" },
    };
    const reviews = applyReviews(
      existing,
      [{ path: "a.died.date", status: "unverified" }],
      REVIEWED_AT,
    );
    expect(reviews).toEqual({ "a.born.date": { status: "verified", reviewedAt: REVIEWED_AT } });
    expect(existing["a.died.date"]).toBeDefined();
  });
});

describe("parseReviewInputs", () => {
  it("accepts a single input or a batch", () => {
    expect(parseReviewInputs({ path: "a.born.date", status: "verified" })).toHaveLength(1);
    expect(
      parseReviewInputs([
        { path: "a.born.date", status: "verified" },
        { path: "a.born.place", status: "unverified" },
      ]),
    ).toHaveLength(2);
  });

  it("rejects bad statuses, empty paths, empty batches, and garbage", () => {
    expect(parseReviewInputs({ path: "a.born.date", status: "confirmed" })).toBeNull();
    expect(parseReviewInputs({ path: "", status: "verified" })).toBeNull();
    expect(parseReviewInputs({ path: "a.born.date", status: "verified", note: 5 })).toBeNull();
    expect(parseReviewInputs([])).toBeNull();
    expect(parseReviewInputs("verified")).toBeNull();
    expect(parseReviewInputs(null)).toBeNull();
  });
});
