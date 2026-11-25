import { select } from "d3-selection";
import {
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatLifeDate, formatWhen, toCalDate, type EventRecord } from "../records/events";
import { statusOf, type ReviewMap } from "../records/reviews";
import { fetchCollection, READ_ONLY, type CollectionData } from "../records/store";
import type { PersonRecord } from "../records/types";
import {
  combineLanes,
  layoutTimeline,
  type ItemStatus,
  type LaneDef,
  type Layout,
  type TimelineItem,
  type View,
} from "./layout";
import { GUTTER_PX, renderTimeline } from "./render";
import { timeEnd, timeStart, whenWindow } from "./time";

const EVENT_LANE_ORDER = [
  "ancient",
  "biblical",
  "book-of-mormon",
  "early-christian",
  "reformation",
  "restoration",
  "lds",
  "rlds",
  "fundamentalist",
  "modern",
];
const PEOPLE_LANE_ORDER = [
  "biblical",
  "book-of-mormon",
  "founding",
  "witness",
  "lds",
  "rlds",
  "strangite",
  "temple-lot",
  "bickertonite",
  "cutlerite",
  "wightite",
  "fundamentalist",
];
const DEFAULT_LANES = [
  "events:biblical",
  "events:book-of-mormon",
  "events:restoration",
  "people:founding",
];

/** Fraction of the data span padded on each side of the fitted view. */
const VIEW_PADDING = 0.03;
/** Deepest zoom — px per year (~40 px per DAY, so events days apart separate cleanly). */
const MAX_PX_PER_YEAR = 15000;
const HIT_SLOP_PX = 5;
const HIT_SLOP_Y_PX = 9;
const MIN_PLOT_WIDTH_PX = 100;
const FALLBACK_WIDTH_PX = 960;

type Tooltip = { x: number; y: number; item: TimelineItem };

/** Timeline plots people by their dates, so the rollup covers just the two date facts. */
const personStatus = (reviews: ReviewMap, id: string): ItemStatus => {
  const statuses = [statusOf(reviews, `${id}.born.date`), statusOf(reviews, `${id}.died.date`)];
  if (statuses.includes("disputed")) return "disputed";
  if (statuses.every((status) => status === "verified")) return "verified";
  return "unverified";
};

export const TimelineApp = () => {
  const [events, setEvents] = useState<CollectionData<EventRecord> | null>(null);
  const [people, setPeople] = useState<CollectionData<PersonRecord> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(DEFAULT_LANES);
  const [combined, setCombined] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(FALLBACK_WIDTH_PX);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const behaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);

  useEffect(() => {
    fetchCollection<EventRecord>("events")
      .then(setEvents)
      .catch((error) => setLoadError(String(error)));
    fetchCollection<PersonRecord>("people")
      .then(setPeople)
      .catch((error) => setLoadError(String(error)));
  }, []);

  const laneOptions = useMemo<LaneDef[]>(() => {
    if (!events || !people) return [];
    const lanes: LaneDef[] = [];
    for (const group of EVENT_LANE_ORDER) {
      const items = events.records
        .filter((event) => event.groups.includes(group))
        .map((event): TimelineItem => {
          const window = whenWindow(event.when);
          return {
            id: event.id,
            label: event.title,
            kind: event.when.type,
            ...window,
            status: statusOf(events.reviews, `${event.id}.when`),
            dateText: formatWhen(event.when),
            ...(event.when.note ? { note: event.when.note } : {}),
          };
        });
      if (items.length) lanes.push({ id: `events:${group}`, label: group, items });
    }
    for (const group of PEOPLE_LANE_ORDER) {
      const items = people.records
        .filter((person) => person.groups.includes(group))
        .map((person): TimelineItem => ({
          id: person.id,
          label: person.name,
          kind: "span",
          start: timeStart(toCalDate(person.born.date)),
          end: timeEnd(toCalDate(person.died.date)),
          status: personStatus(people.reviews, person.id),
          dateText: `${formatLifeDate(person.born.date)} – ${formatLifeDate(person.died.date)}`,
          note: person.role,
        }));
      if (items.length) lanes.push({ id: `people:${group}`, label: `${group} (lives)`, items });
    }
    return lanes;
  }, [events, people]);

  const lanes = useMemo(() => {
    const selectedLanes = laneOptions.filter((lane) => selected.includes(lane.id));
    return combined ? combineLanes(selectedLanes) : selectedLanes;
  }, [laneOptions, selected, combined]);
  // Refit the view when the selection OR the combined/split shape changes.
  const laneKey = `${combined}:${lanes.map((lane) => lane.id).join(",")}`;

  const plotWidth = Math.max(canvasWidth - GUTTER_PX, MIN_PLOT_WIDTH_PX);

  // The fitted (zoom = identity) time window for the selected lanes.
  const base = useMemo(() => {
    const items = lanes.flatMap((lane) => lane.items);
    if (!items.length) return { start: -4050, end: 2050 };
    const start = Math.min(...items.map((item) => item.start));
    const end = Math.max(...items.map((item) => item.end));
    const pad = (end - start) * VIEW_PADDING || 1;
    return { start: start - pad, end: end + pad };
  }, [lanes]);

  const baseK = plotWidth / (base.end - base.start);
  const maxK = Math.max(1, MAX_PX_PER_YEAR / baseK);

  // Apply the d3 zoom transform to the base window: screenX = t.x + k * baseX.
  const view = useMemo<View>(
    () => ({
      start: base.start + (0 - transform.x) / (transform.k * baseK),
      end: base.start + (plotWidth - transform.x) / (transform.k * baseK),
      width: plotWidth,
    }),
    [base, baseK, transform, plotWidth],
  );

  // The wrap div mounts only after data loads (and unmounts when no lanes are selected), so
  // the observer must re-attach whenever it (re)appears — a bare [] here would observe nothing
  // and leave canvasWidth at the fallback, desyncing d3's pointer space from the plot.
  const wrapMounted = Boolean(events && people) && lanes.length > 0;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCanvasWidth(el.clientWidth));
    observer.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [wrapMounted]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    // Clamp pan to the base domain on x only — an infinite y translateExtent keeps d3's
    // constrain step from perturbing the transform (this timeline has no y dimension).
    const behavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([1, maxK])
      .extent([
        [0, 0],
        [plotWidth, 1],
      ])
      .translateExtent([
        [0, -Infinity],
        [plotWidth, Infinity],
      ])
      .on("zoom", (event: D3ZoomEvent<HTMLDivElement, unknown>) => setTransform(event.transform));
    behaviorRef.current = behavior;
    select(overlay).call(behavior);
    return () => {
      select(overlay).on(".zoom", null);
    };
  }, [plotWidth, maxK]);

  // Changing the lane selection refits the view.
  useEffect(() => {
    const overlay = overlayRef.current;
    const behavior = behaviorRef.current;
    if (overlay && behavior) select(overlay).call(behavior.transform, zoomIdentity);
    setTransform(zoomIdentity);
    setTooltip(null);
  }, [laneKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lanes.length) return;
    const layout = layoutTimeline(lanes, view);
    layoutRef.current = layout;
    const height = layout.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderTimeline(ctx, layout, plotWidth);
    if (import.meta.env.DEV) {
      // Dev probe for e2e drives (the window.domus harness pattern) — stripped from prod.
      (window as unknown as Record<string, unknown>).__memorialTimeline = {
        base,
        view,
        plotWidth,
        canvasWidth,
        transform: { k: transform.k, x: transform.x },
        // Jump the view to an exact time window (mouse zoom can't aim sub-pixel).
        zoomTo: (start: number, end: number) => {
          const overlay = overlayRef.current;
          const behavior = behaviorRef.current;
          if (!overlay || !behavior) return;
          const k = Math.min(maxK, (base.end - base.start) / (end - start));
          const tx = -k * baseK * (start - base.start);
          select(overlay).call(behavior.transform, zoomIdentity.translate(tx, 0).scale(k));
        },
      };
    }
  }, [lanes, view, plotWidth, canvasWidth, base, baseK, maxK, transform]);

  const hitTest = (x: number, y: number): TimelineItem | null => {
    const layout = layoutRef.current;
    if (!layout) return null;
    let best: { item: TimelineItem; width: number } | null = null;
    for (const drawItem of layout.items) {
      if (Math.abs(y - drawItem.y) > HIT_SLOP_Y_PX) continue;
      const x0 = Math.min(drawItem.x0, drawItem.x1) - HIT_SLOP_PX;
      const x1 = Math.max(drawItem.x0, drawItem.x1) + HIT_SLOP_PX;
      if (x < x0 || x > x1) continue;
      const width = x1 - x0;
      if (!best || width < best.width) best = { item: drawItem.item, width };
    }
    return best?.item ?? null;
  };

  if (loadError) return <p className="status-line error">{loadError}</p>;
  if (!events || !people) return <p className="status-line">Loading…</p>;

  const laneChips = (prefix: "events" | "people") =>
    laneOptions
      .filter((lane) => lane.id.startsWith(`${prefix}:`))
      .map((lane) => (
        <button
          key={lane.id}
          className={selected.includes(lane.id) ? "chip active" : "chip"}
          onClick={() =>
            setSelected((current) =>
              current.includes(lane.id)
                ? current.filter((id) => id !== lane.id)
                : [...current, lane.id],
            )
          }
        >
          {lane.id.slice(prefix.length + 1)}
        </button>
      ));

  return (
    <section className="timeline">
      <div className="toolbar lane-picker">
        <span className="lane-picker-label">Events</span>
        <div className="filter-group">{laneChips("events")}</div>
        <span className="lane-picker-label">People</span>
        <div className="filter-group">{laneChips("people")}</div>
        <span className="lane-picker-label">View</span>
        <button
          className={combined ? "chip active" : "chip"}
          title="Merge all selected lanes into one, deduplicating shared items"
          onClick={() => setCombined((current) => !current)}
        >
          combined
        </button>
      </div>
      <p className="timeline-hint">
        Scroll to zoom (around the cursor), drag to pan. Solid bars are durations; dashed brackets
        are uncertainty ranges; dots are moments. A pile-up of labels means many items are close
        together — zoom in for detail.
      </p>
      {lanes.length === 0 ? (
        <p className="status-line">Select at least one lane.</p>
      ) : (
        <div className="timeline-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} className="timeline-canvas" />
          <div
            ref={overlayRef}
            className="timeline-overlay"
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - rect.left;
              const y = event.clientY - rect.top;
              const item = hitTest(x, y);
              setTooltip(item ? { x: x + GUTTER_PX, y, item } : null);
            }}
            onMouseLeave={() => setTooltip(null)}
          />
          {tooltip && (
            <div className="timeline-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 14 }}>
              <div className="tooltip-date">{tooltip.item.dateText}</div>
              <div className="tooltip-title">{tooltip.item.label}</div>
              {tooltip.item.note && <div className="tooltip-detail">{tooltip.item.note}</div>}
              {!READ_ONLY && (
                <span className={`badge badge-${tooltip.item.status}`}>{tooltip.item.status}</span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
