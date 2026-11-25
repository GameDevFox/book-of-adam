import { astronomicalYear, type CalDate, type When } from "../records/events";
import { MONTHS } from "../records/format";

/**
 * The timeline's time coordinate is a FRACTIONAL ASTRONOMICAL YEAR (1 BC = 0, 2 BC = -1, …):
 * one number, totally ordered across the BC/AD boundary, no JS Date anywhere. Calendar
 * subtleties (leap years, month lengths) are deliberately approximated — at day resolution the
 * drift is invisible at any zoom this tool renders.
 */
export const MONTHS_PER_YEAR = 12;
const DAYS_PER_YEAR = 365.25;

/** Start of a CalDate's precision window ("1829-05" starts at May 1st, "1829" at Jan 1st). */
export const timeStart = (date: CalDate): number =>
  astronomicalYear(date) +
  (date.month ? (date.month - 1) / MONTHS_PER_YEAR : 0) +
  (date.day ? (date.day - 1) / DAYS_PER_YEAR : 0);

/** End of the precision window ("1829" ends at 1830-01-01, "1829-05" at June 1st). */
export const timeEnd = (date: CalDate): number => {
  if (!date.month) return astronomicalYear(date) + 1;
  if (!date.day) return astronomicalYear(date) + date.month / MONTHS_PER_YEAR;
  return timeStart(date) + 1 / DAYS_PER_YEAR;
};

/**
 * The time window a When occupies. For a span the window is the true duration (end date's
 * precision window included); for between it is the uncertainty bounds; for an instant it is
 * the date's own precision window.
 */
export const whenWindow = (when: When): { start: number; end: number } => {
  switch (when.type) {
    case "instant":
      return { start: timeStart(when.date), end: timeEnd(when.date) };
    case "span":
      return { start: timeStart(when.start), end: timeEnd(when.end) };
    case "between":
      return { start: timeStart(when.earliest), end: timeEnd(when.latest) };
  }
};

// --- Axis ticks -------------------------------------------------------------------------

export type TickUnit =
  | { kind: "years"; step: number }
  | { kind: "months"; step: number }
  | { kind: "days"; step: number };

/** Aim for roughly one labeled tick per this many pixels. */
const TARGET_TICK_PX = 90;
const YEAR_STEPS = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const MONTH_STEPS = [6, 3, 1];
const DAY_STEPS = [14, 7, 3, 1];
/** Day ticks stop at 28 so no month ever shows a tick for a day it doesn't have. */
const MAX_TICK_DAY = 28;

/** Choose the tick unit for a zoom level (px per year). */
export const pickTickUnit = (pxPerYear: number): TickUnit => {
  const targetYears = TARGET_TICK_PX / pxPerYear;
  if (targetYears > MONTH_STEPS[0] / MONTHS_PER_YEAR) {
    for (let i = YEAR_STEPS.length - 1; i >= 0; i--) {
      if (YEAR_STEPS[i] >= targetYears) return { kind: "years", step: YEAR_STEPS[i] };
    }
    return { kind: "years", step: YEAR_STEPS[0] };
  }
  const targetMonths = targetYears * MONTHS_PER_YEAR;
  if (targetMonths >= 1) {
    for (let i = MONTH_STEPS.length - 1; i >= 0; i--) {
      if (MONTH_STEPS[i] >= targetMonths) return { kind: "months", step: MONTH_STEPS[i] };
    }
  }
  const targetDays = targetYears * DAYS_PER_YEAR;
  for (let i = DAY_STEPS.length - 1; i >= 0; i--) {
    if (DAY_STEPS[i] >= targetDays) return { kind: "days", step: DAY_STEPS[i] };
  }
  // Between 14 days and a month — a single-month step covers it.
  return { kind: "months", step: 1 };
};

/** Axis label for an astronomical year: 0 → "1 BC", 500 → "AD 500", 1500 → "1500". */
export const formatAxisYear = (astro: number): string => {
  const year = Math.round(astro);
  if (year <= 0) return `${1 - year} BC`;
  return year < 1000 ? `AD ${year}` : `${year}`;
};

export type Tick = { time: number; label: string };

/** Ticks covering [viewStart, viewEnd] at the given unit — labels never show a year zero. */
export const genTicks = (viewStart: number, viewEnd: number, unit: TickUnit): Tick[] => {
  const ticks: Tick[] = [];
  if (unit.kind === "years") {
    const first = Math.ceil(viewStart / unit.step) * unit.step;
    for (let time = first; time <= viewEnd; time += unit.step) {
      ticks.push({ time, label: formatAxisYear(time) });
    }
    return ticks;
  }
  if (unit.kind === "months") {
    const firstYear = Math.floor(viewStart);
    for (let year = firstYear; year <= viewEnd; year++) {
      for (let month = 0; month < MONTHS_PER_YEAR; month += unit.step) {
        const time = year + month / MONTHS_PER_YEAR;
        if (time < viewStart || time > viewEnd) continue;
        ticks.push({
          time,
          label: month === 0 ? formatAxisYear(year) : `${MONTHS[month]} ${formatAxisYear(year)}`,
        });
      }
    }
    return ticks;
  }
  // Day ticks — same (month-fraction + day-fraction) mapping as timeStart, so ticks land
  // exactly where dated items do.
  const firstYear = Math.floor(viewStart);
  for (let year = firstYear; year <= viewEnd; year++) {
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      for (let day = 1; day <= MAX_TICK_DAY; day += unit.step) {
        const time = year + month / MONTHS_PER_YEAR + (day - 1) / DAYS_PER_YEAR;
        if (time < viewStart || time > viewEnd) continue;
        const label =
          day === 1
            ? month === 0
              ? formatAxisYear(year)
              : `${MONTHS[month]} ${formatAxisYear(year)}`
            : `${MONTHS[month]} ${day}`;
        ticks.push({ time, label });
      }
    }
  }
  return ticks;
};
