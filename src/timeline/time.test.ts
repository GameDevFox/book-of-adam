import { describe, expect, it } from "vitest";

import {
  AXIS_HEIGHT_PX,
  combineLanes,
  layoutTimeline,
  timeToX,
  truncateLabel,
  xToTime,
  type LaneDef,
  type Layout,
  type View,
} from "./layout";
import { isoToCalDate } from "../records/events";
import {
  formatAxisYear,
  genTicks,
  pickTickUnit,
  timeEnd,
  timeStart,
  whenWindow,
} from "./time";

describe("time coordinates", () => {
  it("maps CalDates to fractional astronomical years by precision window", () => {
    expect(timeStart({ year: 1829 })).toBe(1829);
    expect(timeEnd({ year: 1829 })).toBe(1830);
    expect(timeStart({ year: 1829, month: 5 })).toBeCloseTo(1829 + 4 / 12);
    expect(timeEnd({ year: 1829, month: 5 })).toBeCloseTo(1829 + 5 / 12);
    expect(timeStart({ year: 587, era: "bce" })).toBe(-586);
  });

  it("whenWindow covers a span through its end date's precision", () => {
    const window = whenWindow({
      type: "span",
      start: { year: 1829, month: 4 },
      end: { year: 1829, month: 6 },
    });
    expect(window.start).toBeCloseTo(1829 + 3 / 12);
    expect(window.end).toBeCloseTo(1829 + 6 / 12);
  });

  it("parses partial ISO people dates", () => {
    expect(isoToCalDate("1805-12-23")).toEqual({ year: 1805, month: 12, day: 23 });
    expect(isoToCalDate("1775")).toEqual({ year: 1775 });
  });
});

describe("tick ladder", () => {
  it("picks coarser year steps as the view zooms out", () => {
    expect(pickTickUnit(0.02)).toEqual({ kind: "years", step: 5000 });
    expect(pickTickUnit(1)).toEqual({ kind: "years", step: 100 });
    expect(pickTickUnit(90)).toEqual({ kind: "years", step: 1 });
    expect(pickTickUnit(400)).toEqual({ kind: "months", step: 3 });
  });

  it("descends to day steps at deep zoom", () => {
    expect(pickTickUnit(15000)).toEqual({ kind: "days", step: 3 });
    expect(pickTickUnit(50000)).toEqual({ kind: "days", step: 1 });
    // Between 14 days and a month per label, a single-month step covers it.
    expect(pickTickUnit(1600)).toEqual({ kind: "months", step: 1 });
  });

  it("labels eras and never shows a year zero", () => {
    expect(formatAxisYear(-499)).toBe("500 BC");
    expect(formatAxisYear(0)).toBe("1 BC");
    expect(formatAxisYear(500)).toBe("AD 500");
    expect(formatAxisYear(1500)).toBe("1500");
    const labels = genTicks(-1000, 1000, { kind: "years", step: 500 }).map((t) => t.label);
    expect(labels).toEqual(["1001 BC", "501 BC", "1 BC", "AD 500", "1000"]);
  });

  it("generates month ticks with year labels at year boundaries", () => {
    const ticks = genTicks(1829, 1830.01, { kind: "months", step: 3 });
    expect(ticks.map((t) => t.label)).toEqual(["1829", "Apr 1829", "Jul 1829", "Oct 1829", "1830"]);
  });

  it("generates day ticks aligned with the item date mapping", () => {
    const JUNE = 5 / 12;
    const ticks = genTicks(1844 + JUNE, 1844.5, { kind: "days", step: 7 });
    expect(ticks.map((t) => t.label)).toEqual([
      "Jun 1844",
      "Jun 8",
      "Jun 15",
      "Jun 22",
      "Jul 1844",
    ]);
    // The Jun 8 tick sits exactly where timeStart places June 8.
    expect(ticks[1].time).toBeCloseTo(timeStart({ year: 1844, month: 6, day: 8 }), 10);
  });
});

describe("layoutTimeline", () => {
  const item = (id: string, start: number, end: number, kind: "instant" | "span" | "between") => ({
    id,
    label: id,
    kind,
    start,
    end,
    status: "unverified" as const,
    dateText: "",
  });
  const view: View = { start: 1800, end: 1900, width: 1000 };
  const lane = (items: ReturnType<typeof item>[]): LaneDef[] => [{ id: "a", label: "A", items }];
  const byId = (layout: Layout) => Object.fromEntries(layout.items.map((d) => [d.item.id, d]));

  it("timeToX and xToTime are inverses", () => {
    expect(timeToX(view, 1850)).toBe(500);
    expect(xToTime(view, timeToX(view, 1823.7))).toBeCloseTo(1823.7);
  });

  it("collapses narrow spans to points and renders between distinctly", () => {
    const layout = layoutTimeline(
      lane([
        item("wide-span", 1810, 1840, "span"),
        item("narrow-span", 1850, 1850.2, "span"),
        item("uncertain", 1860, 1880, "between"),
      ]),
      view,
    );
    const placed = byId(layout);
    expect(placed["wide-span"].draw).toBe("bar");
    expect(placed["narrow-span"].draw).toBe("point");
    expect(placed["uncertain"].draw).toBe("between");
  });

  it("culls far-offscreen items but keeps those whose label still reaches the view", () => {
    const layout = layoutTimeline(
      lane([
        item("far", 1700, 1750, "span"),
        item("near-instant-just-off-screen", 1799, 1799.1, "instant"),
      ]),
      view,
    );
    const placed = byId(layout);
    expect(placed["far"]).toBeUndefined();
    const near = placed["near-instant-just-off-screen"];
    expect(near).toBeDefined();
    // Dots anchor at their true (here off-screen) midpoint — the label tail stays visible.
    expect(near.labelX).toBeLessThan(0);
  });

  it("pins bar labels to the view edge while on screen, then follows them out", () => {
    const layout = layoutTimeline(
      lane([
        item("gone-but-label-still-showing", 1780, 1795, "span"),
        item("crossing", 1795, 1850, "span"),
      ]),
      view,
    );
    const placed = byId(layout);
    expect(placed["crossing"].labelX).toBe(0);
    expect(placed["gone-but-label-still-showing"].labelX).toBeCloseTo(timeToX(view, 1795));
  });

  it("stacks overlapping bars into rows; dots sit above the bar rows", () => {
    const layout = layoutTimeline(
      lane([
        item("a-span", 1810, 1840, "span"),
        item("b-span", 1820, 1850, "span"),
        item("c-span", 1855, 1870, "span"),
        item("dot", 1830, 1830.1, "instant"),
      ]),
      view,
    );
    const placed = byId(layout);
    expect(placed["a-span"].y).not.toBe(placed["b-span"].y);
    expect(placed["c-span"].y).toBe(placed["a-span"].y);
    expect(placed["dot"].y).toBeLessThan(Math.min(placed["a-span"].y, placed["b-span"].y));
    // Two bar rows grow the lane beyond its minimum height.
    expect(layout.lanes[0].height).toBeGreaterThan(44);
    expect(layout.height).toBe(layout.lanes[0].y + layout.lanes[0].height);
  });

  it("reserves headroom for the longest label above the top lane", () => {
    const short = layoutTimeline(lane([item("ab", 1850, 1850.1, "instant")]), view);
    const long = layoutTimeline(
      lane([item("a-very-long-event-title-here", 1850, 1850.1, "instant")]),
      view,
    );
    expect(short.lanes[0].y).toBeGreaterThan(AXIS_HEIGHT_PX);
    expect(long.lanes[0].y).toBeGreaterThan(short.lanes[0].y);
  });

  it("combineLanes merges everything into one lane and deduplicates shared items", () => {
    const lanes: LaneDef[] = [
      {
        id: "x",
        label: "X",
        items: [item("shared", 1810, 1840, "span"), item("only-x", 1850, 1850.1, "instant")],
      },
      {
        id: "y",
        label: "Y",
        items: [item("shared", 1810, 1840, "span"), item("only-y", 1860, 1880, "between")],
      },
    ];
    const combined = combineLanes(lanes);
    expect(combined).toHaveLength(1);
    expect(combined[0].items.map((i) => i.id).sort()).toEqual(["only-x", "only-y", "shared"]);
    expect(combineLanes([])).toEqual([]);
  });

  it("truncates long labels with an ellipsis", () => {
    expect(truncateLabel("short title")).toBe("short title");
    const long = truncateLabel(
      "Visions of Christ, Moses, Elias, and Elijah in the Kirtland Temple",
    );
    expect(long.length).toBeLessThanOrEqual(26);
    expect(long.endsWith("…")).toBe(true);
  });
});
