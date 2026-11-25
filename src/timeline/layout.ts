import { genTicks, pickTickUnit } from "./time";

/**
 * The renderer-agnostic core: (lanes, view) → a draw list with CONCRETE x/y positions. Pure —
 * no canvas, no DOM — so the whole timeline geometry is unit-testable, and the render layer
 * (Canvas 2D today; Konva, Pixi, or Three.js someday) is a swappable consumer.
 */

export type ItemStatus = "unverified" | "verified" | "disputed";

/** One plottable thing, in time coordinates (fractional astronomical years). */
export type TimelineItem = {
  id: string;
  label: string;
  /** Semantic kind — between is UNCERTAINTY and must render distinctly from span. */
  kind: "instant" | "span" | "between";
  start: number;
  end: number;
  status: ItemStatus;
  /** Tooltip lead line: the formatted date/range — shown first, in bold. */
  dateText: string;
  /** Tooltip supporting line: dating note, role, etc. */
  note?: string;
};

export type LaneDef = { id: string; label: string; items: TimelineItem[] };

/** The visible time window mapped onto a plot area width (px). */
export type View = { start: number; end: number; width: number };

export const timeToX = (view: View, time: number): number =>
  ((time - view.start) / (view.end - view.start)) * view.width;

export const xToTime = (view: View, x: number): number =>
  view.start + (x / view.width) * (view.end - view.start);

export const AXIS_HEIGHT_PX = 28;

/** Narrower than this and a span/between collapses to a point. */
const MIN_BAR_PX = 8;

/**
 * Labels are drawn at 45° and deliberately ALLOWED to overlap — a pile-up of translucent
 * angled labels reads as a "cloud" that signals density and invites zooming in. Only length
 * is capped, so one long title can't climb across the whole chart.
 */
const MAX_LABEL_CHARS = 26;
const ELLIPSIS = "…";
/** Estimated glyph width for label-geometry math (headroom, left-edge reach). */
const CHAR_WIDTH_PX = 6.5;
/** cos(45°) — converts a label's text length into its horizontal/vertical rise. */
const DIAG = Math.SQRT1_2;

/**
 * Vertical anatomy of a lane: dots (instants) sit in their own slot at the top so long bars
 * can never cover them; bars/betweens stack below in overlap-free rows.
 */
const DOT_ROW_Y_PX = 14;
const BAR_ROWS_TOP_PX = 26;
const BAR_ROW_STEP_PX = 16;
const BAR_ROW_CENTER_PX = 6;
const LANE_BOTTOM_PAD_PX = 12;
const MIN_LANE_HEIGHT_PX = 44;

export const truncateLabel = (label: string): string =>
  label.length <= MAX_LABEL_CHARS
    ? label
    : `${label.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}${ELLIPSIS}`;

const labelPx = (label: string): number => truncateLabel(label).length * CHAR_WIDTH_PX;

export type PlacedItem = {
  item: TimelineItem;
  /** Visual kind: a span/between too narrow to read renders as a point. */
  draw: "point" | "bar" | "between";
  x0: number;
  x1: number;
  /** Vertical center, in canvas px. */
  y: number;
  /**
   * Horizontal anchor of the rising label. Dots anchor at their true midpoint (even
   * off-screen — the label's tail stays visible); bars pin to the view edge while any of the
   * bar is on screen, then follow their right end out. Labels slide, never pop.
   */
  labelX: number;
  /** Truncated display label — the full title lives in the tooltip. */
  labelText: string;
};

export type PlacedLane = { id: string; label: string; y: number; height: number };

export type Layout = {
  ticks: { x: number; label: string }[];
  lanes: PlacedLane[];
  items: PlacedItem[];
  /** Total canvas height: axis + label headroom + lanes. */
  height: number;
};

/**
 * Merges lanes into one, deduplicating items that appear in several lanes (an item tagged
 * with multiple groups shows once). First occurrence wins; row stacking handles the rest.
 */
export const combineLanes = (lanes: LaneDef[], label = "combined"): LaneDef[] => {
  const seen = new Set<string>();
  const items: TimelineItem[] = [];
  for (const lane of lanes) {
    for (const item of lane.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items.length ? [{ id: "combined", label, items }] : [];
};

/**
 * Greedy interval-row assignment for span/between items, in TIME coordinates — overlap in
 * time equals overlap on screen at every zoom (the map is linear), so rows never reshuffle
 * while zooming.
 */
const assignBarRows = (items: TimelineItem[]): { rows: Map<string, number>; count: number } => {
  const rows = new Map<string, number>();
  const rowEnds: number[] = [];
  const bars = items.filter((item) => item.kind !== "instant").sort((a, b) => a.start - b.start);
  for (const bar of bars) {
    let row = rowEnds.findIndex((end) => bar.start >= end);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(bar.end);
    } else {
      rowEnds[row] = bar.end;
    }
    rows.set(bar.id, row);
  }
  return { rows, count: rowEnds.length };
};

export const layoutTimeline = (lanes: LaneDef[], view: View): Layout => {
  const pxPerYear = view.width / (view.end - view.start);
  const ticks = genTicks(view.start, view.end, pickTickUnit(pxPerYear)).map((tick) => ({
    x: timeToX(view, tick.time),
    label: tick.label,
  }));

  // Headroom above the top lane sized to the longest label's diagonal rise, so no rising
  // label ever clips at the canvas top.
  const maxLabelPx = Math.max(
    0,
    ...lanes.flatMap((lane) => lane.items.map((item) => labelPx(item.label))),
  );
  const headroom = Math.ceil(maxLabelPx * DIAG);

  // Keep items alive while their rising label can still reach into the view from the left.
  const labelReachTime = (maxLabelPx * DIAG) / pxPerYear;

  const placedLanes: PlacedLane[] = [];
  const items: PlacedItem[] = [];
  let laneY = AXIS_HEIGHT_PX + headroom;

  for (const lane of lanes) {
    const { rows, count } = assignBarRows(lane.items);
    const height = Math.max(
      MIN_LANE_HEIGHT_PX,
      BAR_ROWS_TOP_PX + count * BAR_ROW_STEP_PX + LANE_BOTTOM_PAD_PX,
    );

    const visible = lane.items
      .filter((item) => item.end >= view.start - labelReachTime && item.start <= view.end)
      .sort((a, b) => a.start - b.start);

    for (const item of visible) {
      const x0 = timeToX(view, item.start);
      const x1 = timeToX(view, item.end);
      const wide = x1 - x0 >= MIN_BAR_PX;
      const draw =
        item.kind === "instant" || !wide ? "point" : item.kind === "span" ? "bar" : "between";
      const y =
        item.kind === "instant"
          ? laneY + DOT_ROW_Y_PX
          : laneY +
            BAR_ROWS_TOP_PX +
            (rows.get(item.id) ?? 0) * BAR_ROW_STEP_PX +
            BAR_ROW_CENTER_PX;
      const labelX = item.kind === "instant" ? (x0 + x1) / 2 : Math.min(Math.max(x0, 0), x1);
      items.push({ item, draw, x0, x1, y, labelX, labelText: truncateLabel(item.label) });
    }

    placedLanes.push({ id: lane.id, label: lane.label, y: laneY, height });
    laneY += height;
  }

  return { ticks, lanes: placedLanes, items, height: laneY };
};
