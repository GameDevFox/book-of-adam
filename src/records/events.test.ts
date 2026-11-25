import { describe, expect, it } from "vitest";

import {
  astronomicalYear,
  calSortKey,
  formatCalDate,
  formatWhen,
  whenSortKey,
  type When,
} from "./events";

describe("astronomicalYear", () => {
  it("maps BC years to astronomical numbering (1 BC → 0)", () => {
    expect(astronomicalYear({ year: 587, era: "bce" })).toBe(-586);
    expect(astronomicalYear({ year: 1, era: "bce" })).toBe(0);
    expect(astronomicalYear({ year: 1830 })).toBe(1830);
  });
});

describe("calSortKey", () => {
  it("orders across the BC/AD boundary and within years", () => {
    const dates = [
      { year: 587, era: "bce" as const },
      { year: 586, era: "bce" as const },
      { year: 30 },
      { year: 1829, month: 5, day: 15 },
      { year: 1829, month: 6 },
      { year: 1830, month: 4, day: 6 },
    ];
    const keys = dates.map(calSortKey);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });

  it("sorts a year-only date before dated events in the same year", () => {
    expect(calSortKey({ year: 1839 })).toBeLessThan(calSortKey({ year: 1839, month: 1, day: 1 }));
  });
});

describe("formatCalDate / formatWhen", () => {
  it("labels eras and applies circa", () => {
    expect(formatCalDate({ year: 587, era: "bce" })).toBe("587 BC");
    expect(formatCalDate({ year: 70 })).toBe("70 AD");
    expect(formatCalDate({ year: 1820, circa: true })).toBe("c. 1820");
    expect(formatCalDate({ year: 1830, month: 4, day: 6 })).toBe("Apr 6, 1830");
    expect(formatCalDate({ year: 1829, month: 5 })).toBe("May 1829");
  });

  it("renders the three when kinds distinctly", () => {
    const instant: When = { type: "instant", date: { year: 1830, month: 4, day: 6 } };
    const span: When = {
      type: "span",
      start: { year: 1838, month: 12, day: 1 },
      end: { year: 1839, month: 4, day: 15 },
    };
    const between: When = {
      type: "between",
      earliest: { year: 6, era: "bce" },
      latest: { year: 4, era: "bce" },
    };
    expect(formatWhen(instant)).toBe("Apr 6, 1830");
    expect(formatWhen(span)).toBe("Dec 1, 1838 – Apr 15, 1839");
    expect(formatWhen(between)).toBe("between 6 BC and 4 BC");
  });

  it("whenSortKey sorts by the earliest bound of any kind", () => {
    const span: When = { type: "span", start: { year: 1853 }, end: { year: 1893 } };
    const between: When = { type: "between", earliest: { year: 1854 }, latest: { year: 1855 } };
    expect(whenSortKey(span)).toBeLessThan(whenSortKey(between));
  });
});
