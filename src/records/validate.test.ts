import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { EventRecord } from "./events";
import type { ReviewMap } from "./reviews";
import type { Edition, TextUnit, Work } from "./texts";
import type { PersonRecord } from "./types";
import {
  validateEvents,
  validateRecords,
  validateReviews,
  validateTexts,
  validateUnitTree,
} from "./validate";

const DATA_DIR = path.resolve(__dirname, "../../data");
const readData = (file: string) => JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"));

const wellFormed: PersonRecord = {
  id: "test-person",
  name: "Test Person",
  role: "Test role",
  groups: ["lds"],
  born: { date: "1800", place: "Somewhere" },
  died: { date: "1850-06-01" },
  sources: [{ label: "Wikipedia", url: "https://example.org" }],
};

describe("validateRecords", () => {
  it("accepts a well-formed record (including a partial born date)", () => {
    expect(validateRecords([wellFormed])).toEqual([]);
  });

  it("flags structural problems", () => {
    const broken: PersonRecord[] = [
      { ...wellFormed, id: "Bad_Slug" },
      { ...wellFormed, id: "dup" },
      { ...wellFormed, id: "dup" },
      { ...wellFormed, id: "backwards", born: { date: "1850" }, died: { date: "1800" } },
      { ...wellFormed, id: "no-sources", sources: [] },
      {
        ...wellFormed,
        id: "http-source",
        sources: [{ label: "W", url: "http://example.org" }],
      },
    ];
    const problems = validateRecords(broken);
    expect(problems.some((p) => p.includes("kebab-case"))).toBe(true);
    expect(problems.some((p) => p.includes("duplicate id"))).toBe(true);
    expect(problems.some((p) => p.includes("died before born"))).toBe(true);
    expect(problems.some((p) => p.includes("at least one source"))).toBe(true);
    expect(problems.some((p) => p.includes("must be https"))).toBe(true);
  });

  it("does not flag a same-year partial date as died-before-born", () => {
    const record = { ...wellFormed, born: { date: "1800-06-01" }, died: { date: "1800" } };
    expect(validateRecords([record])).toEqual([]);
  });

  it("accepts a BC/antiquity person with CalDate born/died", () => {
    const ancient: PersonRecord = {
      ...wellFormed,
      id: "ancient-person",
      groups: ["biblical", "ancient"],
      born: { date: { year: 1996, era: "bce", circa: true }, place: "Ur" },
      died: { date: { year: 1821, era: "bce", circa: true }, place: "Canaan" },
    };
    expect(validateRecords([ancient])).toEqual([]);
  });

  it("orders BC CalDates correctly and flags a bad year", () => {
    const broken: PersonRecord[] = [
      {
        ...wellFormed,
        id: "bc-backwards",
        born: { date: { year: 1821, era: "bce" } },
        died: { date: { year: 1996, era: "bce" } },
      },
      {
        ...wellFormed,
        id: "bad-year",
        born: { date: { year: 0, era: "bce" } },
        died: { date: { year: 100 } },
      },
    ];
    const problems = validateRecords(broken);
    expect(problems.some((p) => p.includes("died before born"))).toBe(true);
    expect(problems.some((p) => p.includes("positive integer year"))).toBe(true);
  });
});

describe("validateReviews", () => {
  const records = [wellFormed];

  it("accepts reviews that resolve to real facts", () => {
    const reviews: ReviewMap = {
      "test-person.born.date": { status: "verified", reviewedAt: "2026-07-10T00:00:00.000Z" },
      "test-person.born.place": {
        status: "disputed",
        reviewedAt: "2026-07-10T00:00:00.000Z",
        note: "conflicting sources",
      },
    };
    expect(validateReviews(records, reviews)).toEqual([]);
  });

  it("flags dangling paths, bad statuses, and missing stamps", () => {
    const reviews = {
      "nobody.born.date": { status: "verified", reviewedAt: "2026-07-10T00:00:00.000Z" },
      "test-person.marriage.date": { status: "verified", reviewedAt: "2026-07-10T00:00:00.000Z" },
      "test-person.born.date": { status: "confirmed", reviewedAt: "" },
    } as unknown as ReviewMap;
    const problems = validateReviews(records, reviews);
    expect(problems.some((p) => p.startsWith("nobody.born.date"))).toBe(true);
    expect(problems.some((p) => p.startsWith("test-person.marriage.date"))).toBe(true);
    expect(problems.some((p) => p.includes("invalid review status"))).toBe(true);
    expect(problems.some((p) => p.includes("missing reviewedAt"))).toBe(true);
  });
});

const wellFormedEvent: EventRecord = {
  id: "test-event",
  title: "Test Event",
  summary: "A test event.",
  groups: ["restoration"],
  when: { type: "instant", date: { year: 1830, month: 4, day: 6 } },
  sources: [{ label: "Wikipedia", url: "https://example.org" }],
};

describe("validateEvents", () => {
  it("accepts the three when kinds, including BC dates", () => {
    const events: EventRecord[] = [
      wellFormedEvent,
      {
        ...wellFormedEvent,
        id: "span-event",
        when: { type: "span", start: { year: 1838, month: 12 }, end: { year: 1839, month: 4 } },
      },
      {
        ...wellFormedEvent,
        id: "between-event",
        when: {
          type: "between",
          earliest: { year: 6, era: "bce" },
          latest: { year: 4, era: "bce" },
        },
      },
    ];
    expect(validateEvents(events)).toEqual([]);
  });

  it("flags bad dates and misordered bounds", () => {
    const broken: EventRecord[] = [
      {
        ...wellFormedEvent,
        id: "backwards-span",
        when: { type: "span", start: { year: 1840 }, end: { year: 1839 } },
      },
      {
        ...wellFormedEvent,
        id: "collapsed-between",
        when: { type: "between", earliest: { year: 1830 }, latest: { year: 1830 } },
      },
      {
        ...wellFormedEvent,
        id: "year-zero",
        when: { type: "instant", date: { year: 0 } },
      },
      {
        ...wellFormedEvent,
        id: "day-no-month",
        when: { type: "instant", date: { year: 1830, day: 6 } },
      },
      {
        ...wellFormedEvent,
        id: "bad-kind",
        when: { type: "sometime", date: { year: 1830 } } as unknown as EventRecord["when"],
      },
    ];
    const problems = validateEvents(broken);
    expect(problems.some((p) => p.includes("span ends before it starts"))).toBe(true);
    expect(problems.some((p) => p.includes("bounds must be ordered"))).toBe(true);
    expect(problems.some((p) => p.includes("positive integer year"))).toBe(true);
    expect(problems.some((p) => p.includes("day but no month"))).toBe(true);
    expect(problems.some((p) => p.includes("unknown when type"))).toBe(true);
  });
});

const wellFormedWork: Work = {
  id: "test-work",
  title: "Test Work",
  groups: ["restoration"],
};

const wellFormedEdition: Edition = {
  id: "test-edition",
  workId: "test-work",
  title: "Test Work (1830)",
  when: { type: "instant", date: { year: 1830 } },
  licence: "public-domain",
  provenance: "Test transcription.",
  contents: ["book-one"],
  sources: [{ label: "Wikisource", url: "https://example.org" }],
};

describe("validateTexts / validateUnitTree", () => {
  it("accepts well-formed registries and unit trees", () => {
    expect(validateTexts([wellFormedWork], [wellFormedEdition])).toEqual([]);
    const tree: TextUnit = {
      id: "book-one",
      title: "Book One",
      units: [{ id: "1", units: [{ id: "p1", text: "In the beginning…" }] }],
    };
    expect(validateUnitTree(tree, "test-edition")).toEqual([]);
  });

  it("flags dangling workIds, bad licences, and malformed units", () => {
    const problems = validateTexts(
      [wellFormedWork],
      [
        { ...wellFormedEdition, id: "orphan", workId: "nobody" },
        { ...wellFormedEdition, id: "bad-licence", licence: "copyleft" as Edition["licence"] },
        { ...wellFormedEdition, id: "no-contents", contents: [] },
      ],
    );
    expect(problems.some((p) => p.includes("not a registered work"))).toBe(true);
    expect(problems.some((p) => p.includes("invalid licence"))).toBe(true);
    expect(problems.some((p) => p.includes("at least one content unit"))).toBe(true);

    const treeProblems = [
      ...validateUnitTree({ id: "both", text: "x", units: [] }, "t"),
      ...validateUnitTree({ id: "neither" }, "t"),
      ...validateUnitTree(
        {
          id: "dup",
          units: [
            { id: "a", text: "x" },
            { id: "a", text: "y" },
          ],
        },
        "t",
      ),
      ...validateUnitTree({ id: "empty-leaf", text: "   " }, "t"),
    ];
    expect(treeProblems.some((p) => p.includes("exactly one of"))).toBe(true);
    expect(treeProblems.some((p) => p.includes("duplicate child unit id"))).toBe(true);
    expect(treeProblems.some((p) => p.includes("empty text"))).toBe(true);
  });
});

describe("data/ integrity", () => {
  it("people.json + people.reviews.json pass validation", () => {
    const records = readData("people.json") as PersonRecord[];
    const reviews = readData("people.reviews.json") as ReviewMap;
    expect(records.length).toBeGreaterThan(0);
    expect(validateRecords(records)).toEqual([]);
    expect(validateReviews(records, reviews)).toEqual([]);
  });

  it("events.json + events.reviews.json pass validation", () => {
    const events = readData("events.json") as EventRecord[];
    const reviews = readData("events.reviews.json") as ReviewMap;
    expect(events.length).toBeGreaterThan(0);
    expect(validateEvents(events)).toEqual([]);
    expect(validateReviews(events, reviews)).toEqual([]);
  });

  it("texts registries and every committed content tree pass validation", () => {
    const works = readData("texts/works.json") as Work[];
    const editions = readData("texts/editions.json") as Edition[];
    expect(editions.length).toBeGreaterThan(0);
    expect(validateTexts(works, editions)).toEqual([]);

    // A local-only edition's text normally lives in the gitignored local/ dir; one held back
    // from the public site with its text still committed (ers-lexicon) is validated like any.
    for (const edition of editions) {
      for (const contentId of edition.contents) {
        const committed = `texts/content/${edition.id}/${contentId}.json`;
        if (edition.licence === "local-only" && !existsSync(path.join(DATA_DIR, committed)))
          continue;
        const tree = readData(committed) as TextUnit;
        expect(tree.id).toBe(contentId);
        expect(validateUnitTree(tree, edition.id)).toEqual([]);
      }
    }
  });
});
