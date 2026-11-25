import { AXIS_HEIGHT_PX, type Layout, type PlacedItem } from "./layout";

/**
 * Canvas 2D consumer of the pure layout. All geometry decisions (including every y) live in
 * layout.ts — this file only puts ink on pixels, so a different renderer can replace it
 * without touching the core.
 */

/** Left gutter holding lane labels; the plot area starts after it. */
export const GUTTER_PX = 120;

const BAR_HEIGHT_PX = 12;
const POINT_RADIUS_PX = 4;
const BRACKET_HEIGHT_PX = 14;
const LABEL_FONT = "11px -apple-system, 'Segoe UI', Roboto, sans-serif";
const AXIS_FONT = "11px -apple-system, 'Segoe UI', Roboto, sans-serif";
const LANE_FONT = "12px Georgia, 'Times New Roman', serif";
const LANE_LABEL_BASELINE_PX = 18;

/** 45° rising labels; translucent ink so overlapping labels stack visibly darker. */
const LABEL_ANGLE_RAD = -Math.PI / 4;
const LABEL_INK = "rgba(43, 38, 32, 0.72)";
const LABEL_LIFT_PX = 4;

const COLORS = {
  axisText: "#6d6459",
  gridLine: "#eae4d9",
  laneLine: "#e3dcd0",
  laneText: "#2b2620",
  unverified: "#8a7a63",
  verified: "#2e7d32",
  disputed: "#b3261e",
};

const statusColor = (item: PlacedItem) => COLORS[item.item.status] ?? COLORS.unverified;

const drawPoint = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, POINT_RADIUS_PX, 0, Math.PI * 2);
  ctx.fill();
};

const drawBar = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x0, y - BAR_HEIGHT_PX / 2, x1 - x0, BAR_HEIGHT_PX, BAR_HEIGHT_PX / 2);
  ctx.fill();
};

/** Uncertainty range: dashed line with end brackets — visually distinct from a solid span. */
const drawBetween = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  color: string,
) => {
  const half = BRACKET_HEIGHT_PX / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x0 + 4, y - half);
  ctx.lineTo(x0, y - half);
  ctx.lineTo(x0, y + half);
  ctx.lineTo(x0 + 4, y + half);
  ctx.moveTo(x1 - 4, y - half);
  ctx.lineTo(x1, y - half);
  ctx.lineTo(x1, y + half);
  ctx.lineTo(x1 - 4, y + half);
  ctx.stroke();
};

export const renderTimeline = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  plotWidth: number,
) => {
  const height = layout.height;
  ctx.clearRect(0, 0, GUTTER_PX + plotWidth, height);

  // Axis ticks + full-height grid lines.
  ctx.font = AXIS_FONT;
  ctx.textBaseline = "middle";
  for (const tick of layout.ticks) {
    const x = GUTTER_PX + tick.x;
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, AXIS_HEIGHT_PX - 6);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillStyle = COLORS.axisText;
    ctx.textAlign = "center";
    ctx.fillText(tick.label, x, AXIS_HEIGHT_PX / 2);
  }

  // Lane separators + labels.
  for (const lane of layout.lanes) {
    ctx.strokeStyle = COLORS.laneLine;
    ctx.beginPath();
    ctx.moveTo(0, lane.y);
    ctx.lineTo(GUTTER_PX + plotWidth, lane.y);
    ctx.stroke();
    ctx.font = LANE_FONT;
    ctx.fillStyle = COLORS.laneText;
    ctx.textAlign = "left";
    ctx.fillText(lane.label, 8, lane.y + LANE_LABEL_BASELINE_PX, GUTTER_PX - 16);
  }

  // Items — clip to the plot area so bars don't invade the gutter.
  ctx.save();
  ctx.beginPath();
  ctx.rect(GUTTER_PX, 0, plotWidth, height);
  ctx.clip();
  ctx.translate(GUTTER_PX, 0);

  for (const drawItem of layout.items) {
    const color = statusColor(drawItem);
    if (drawItem.draw === "bar") drawBar(ctx, drawItem.x0, drawItem.x1, drawItem.y, color);
    else if (drawItem.draw === "between")
      drawBetween(ctx, drawItem.x0, drawItem.x1, drawItem.y, color);
    else drawPoint(ctx, (drawItem.x0 + drawItem.x1) / 2, drawItem.y, color);
  }

  ctx.font = LABEL_FONT;
  ctx.fillStyle = LABEL_INK;
  ctx.textAlign = "left";
  for (const drawItem of layout.items) {
    const x = drawItem.labelX + (drawItem.draw === "point" ? POINT_RADIUS_PX : 2);
    ctx.save();
    ctx.translate(x, drawItem.y - BAR_HEIGHT_PX / 2 - LABEL_LIFT_PX);
    ctx.rotate(LABEL_ANGLE_RAD);
    ctx.fillText(drawItem.labelText, 0, 0);
    ctx.restore();
  }

  ctx.restore();
};
