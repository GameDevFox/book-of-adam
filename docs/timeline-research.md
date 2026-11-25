# Canvas-Based Interactive Timeline Libraries — Comparison Report

Research date: 2026-07-10. Claims below were verified against live GitHub repos/docs, plus two
local Node experiments (d3 and ECharts run against actual BC dates) rather than memory.

## 1. TL;DR

**Recommended: build it — d3-scale + d3-zoom + a custom Canvas-2D renderer**, hosted as a
reactive scene-lib-style component in the existing Vite/React 19 stack. Empirically verified:
`d3.scaleTime` handles a 740 BC → 1830 AD domain correctly (clean ticks at −500/0/500/1000/1500,
working `invert` for hit-testing), and d3-zoom is explicitly renderer-agnostic — the only work
d3 doesn't do (BC/AD tick labeling, LOD, lane layout, uncertainty-range drawing) is exactly the
work no off-the-shelf library does either.

**Fallback: same d3 time core, but Konva (react-konva) as the render layer.** Konva is MIT,
actively maintained (v10.3.0, Apr 2026; react-konva v19.2.4, May 2026, React 19), and trades
some redraw performance for free retained-mode hit-testing and events — a reasonable de-risk if
hand-rolled picking/interaction proves annoying. (If item counts ever reach tens of thousands,
swap the render layer for PixiJS v8 + pixi-viewport instead.)

No off-the-shelf _timeline_ library survives the BC-dates requirement with a permissive
license: the only purpose-built candidate that plausibly does (HistropediaJS) is
proprietary/non-commercial-only.

## 2. Comparison table

| Candidate                                | Rendering                                                                                  | BC-date story                                                                                                                                                                                           | Zoom/pan                                                            | Lanes                                      | React fit                                                            | License                                                                                          | Maintenance (checked 2026-07)                                                | Verdict                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **d3-scale + d3-zoom + custom canvas**   | Canvas 2D (yours)                                                                          | **Verified working** (scaleTime across BC→AD; or scaleLinear on numeric years — no Date limits at all)                                                                                                  | d3-zoom, renderer-agnostic, `rescaleX`                              | Yours (trivial y-bands)                    | Excellent — d3 is just math; render loop plugs into your signals lib | ISC                                                                                              | d3-zoom v3.0.0 (2021) — stable/complete, ubiquitous                          | **Recommended**                                                                                   |
| **Konva / react-konva**                  | Canvas 2D scene graph                                                                      | N/A (no time axis — bring d3 scales)                                                                                                                                                                    | Roll with d3-zoom or Konva drag/scale                               | Yours                                      | react-konva v19.2.4, React 19                                        | MIT                                                                                              | Konva v10.3.0 (2026-04-30), active                                           | **Fallback render layer**                                                                         |
| **PixiJS + pixi-viewport + @pixi/react** | WebGL/WebGPU                                                                               | N/A (bring d3 scales)                                                                                                                                                                                   | pixi-viewport: wheel/pinch/drag/decelerate/clamp                    | Yours                                      | @pixi/react v8.0.5, React 19 + Pixi v8                               | MIT                                                                                              | Pixi v8.19.0 (2026-06-04) very active; pixi-viewport v6.0.3 (2024-11) slower | Overkill at 100s–1000s of items; the WebGL text problem isn't worth it                            |
| **vis-timeline**                         | **DOM** (docs: "regular HTML DOM to render the timeline and items")                        | **Broken** — open issues: BC dates "incorrect and inconsistent"; spurious year 0 (#581)                                                                                                                 | Good (drag/scroll zoom; default zoomMax ≈ 10k years)                | Yes (groups)                               | Wrapper needed; imperative API                                       | MIT / Apache-2.0 dual                                                                            | v8.5.1 (2026-05-07), community-maintained                                    | No — DOM + broken BC                                                                              |
| **TimelineJS3**                          | DOM (slideshow + nav band)                                                                 | **Yes** — negative years, "cosmological" scale to 271,821 BCE+                                                                                                                                          | Slide navigation, not free deep zoom                                | Groups in nav band only                    | Standalone embed, not a component                                    | **MPL-2.0**                                                                                      | Active repo (Knight Lab); slow cadence                                       | No — story-slider genre, not a zoomable multi-lane chart                                          |
| **react-calendar-timeline**              | DOM (absolute-positioned divs on a 3x scroll surface — "canvas" in its docs is a metaphor) | No — dayjs-based real calendar dates                                                                                                                                                                    | Scroll/zoom for scheduler ranges, not millennia                     | Yes (its core feature)                     | Native React 18/19                                                   | MIT                                                                                              | v0.30.0-beta.18 (2026-03-04); stable is 0.28                                 | No — scheduler tool, DOM, no BC                                                                   |
| **react-chrono**                         | DOM                                                                                        | Not applicable                                                                                                                                                                                          | **None** — scroll-through story timeline, no date-proportional axis | No                                         | Native React                                                         | MIT                                                                                              | v3.3.3 (2025-12-17)                                                          | No — wrong genre entirely                                                                         |
| **Apache ECharts (custom series)**       | Canvas (zrender)                                                                           | **Empirically fails**: BC timestamps on `type:'time'` axis → "Exceed safe limit in TimeScale" warnings, hung tick loop, garbage labels (−311, 117, 545…). Workaround = `value` axis + custom everything | dataZoom (inside) — decent                                          | Fake-able via y categories                 | echarts-for-react wrappers                                           | Apache-2.0                                                                                       | v6.1.0 (2026-05-19), very active                                             | No — you'd disable its brain and keep its weight                                                  |
| **Chart.js**                             | Canvas                                                                                     | No — time scale delegates to a Date adapter (luxon/date-fns); custom scale = writing the axis yourself inside a chart framework                                                                         | Only via chartjs-plugin-zoom                                        | Fake-able                                  | react-chartjs-2                                                      | MIT                                                                                              | v4.5.1 (2025-10-13), active                                                  | No — fighting the framework for zero gain                                                         |
| **@visx**                                | **SVG** (repo: d3 math + React DOM/SVG updates)                                            | Scales are d3, so fine — but rendering is SVG                                                                                                                                                           | @visx/zoom exists but SVG perf ceiling                              | Yours                                      | Excellent (it _is_ React) — v4 on React 18/19                        | MIT                                                                                              | v4.0.0 (2026-06-11), active                                                  | No — fails the canvas requirement; d3-direct is strictly better here                              |
| **Two.js**                               | Canvas/SVG/WebGL agnostic scene graph                                                      | N/A                                                                                                                                                                                                     | None built in                                                       | Yours                                      | No official bindings                                                 | MIT                                                                                              | v0.8.21 (2025-10-02), pre-1.0                                                | No — Konva does the same job with hit-testing and React bindings                                  |
| **HistropediaJS**                        | Canvas, purpose-built for historical timelines (10k+ events @ 60fps)                       | Presumably (built for Histropedia's Wikidata history timelines) — undocumented on site                                                                                                                  | Built-in touch/scroll/zoom/pan                                      | Unclear                                    | None (plain JS)                                                      | **Proprietary: free non-commercial only; IP retained by Histropedia; commercial = "contact us"** | Site live (© 2026); no public repo/versions                                  | No — license dealbreaker; great _design reference_                                                |
| **eclipse-cdt-cloud/timeline-chart**     | PixiJS (WebGL/canvas)                                                                      | Numeric trace-timestamp model (not JS Dates) — BC-agnostic in principle, but units/labels are trace-oriented and on you                                                                                 | Ctrl+wheel zoom, keyboard nav                                       | Yes — rows (Gantt-style, built for traces) | None (framework-agnostic, Theia-oriented)                            | MIT                                                                                              | v0.4.3 (2025-10-16), modest activity (350 commits)                           | Interesting near-miss — closest existing "numeric-time canvas lanes" lib, but trace-domain-shaped |
| **markwhen**                             | Vue-based views over a text format                                                         | Undocumented                                                                                                                                                                                            | View-dependent                                                      | Sections in the format                     | No — Vue view templates                                              | MIT (except closed-source web editor)                                                            | Alive; split across org repos                                                | No — an authoring format/app, not an embeddable React canvas lib                                  |
| **ChronoZoom**                           | HTML/canvas deep-zoom (2012-era)                                                           | Yes — its whole point (Big Bang → present)                                                                                                                                                              | Its whole point                                                     | Yes                                        | No                                                                   | Open source (Outercurve)                                                                         | **Retired** — "no longer supported" per Microsoft Research                   | Dead; conceptual reference for deep-zoom UX only                                                  |

## 3. Serious candidates

### d3-scale + d3-zoom + custom canvas (the "build" option)

d3 here is not a charting library but two small ISC-licensed math modules:
`scaleTime`/`scaleLinear` (domain↔pixel mapping, tick generation, `invert`) and `d3-zoom`
(wheel/pinch/drag gesture normalization producing a transform, explicitly usable "with SVG,
HTML or Canvas"). I verified BC behavior in Node: a Date constructed via `setFullYear(-739)` is
valid, `scaleTime` over [740 BC, 1830 AD] produces clean ticks (−500, 0, 500, 1000, 1500) and
correct inversion; the only broken piece is default formatting (`%Y` → "-0500"), which you
replace with a BC/AD formatter anyway. Alternatively `scaleLinear` over fractional astronomical
years sidesteps JS Date entirely (Date bottoms out at ~271,821 BCE — fine for 740 BC, fatal for
"age of the universe" ambitions). What you write yourself: the renderer, the tick ladder, LOD
labels, lane layout, hit-testing — detailed in §4. d3-zoom's last release is 2021, which
reflects completeness, not abandonment; it underpins half the interactive viz on the web.

### Konva / react-konva

Konva is the mature retained-mode Canvas-2D scene graph: shapes with event listeners, layering,
built-in hit-testing (via an offscreen hit canvas), drag, transforms. MIT, very active
(v10.3.0, Apr 2026), and react-konva (v19.2.4, May 2026) gives first-class declarative React 19
usage. It has zero notion of time — you'd still use d3 scales and drive positions from your
signals. Strengths: eliminates the two fiddliest hand-rolled parts (picking and per-shape
events); declarative fit with React. Costs: retained-mode overhead per item (fine at
hundreds–low-thousands; the hit canvas doubles draw work), and you're bending a scene graph to
what is essentially an immediate-mode redraw-on-zoom problem. A solid fallback, or a starting
point if you want interactivity working on day one.

### PixiJS + pixi-viewport + @pixi/react

PixiJS v8 (MIT, v8.19.0, Jun 2026, very active) is the performance ceiling: WebGL/WebGPU,
happily renders hundreds of thousands of sprites. pixi-viewport (MIT, v6.0.3, Nov 2024)
provides exactly the deep-zoom camera you'd otherwise write — wheel/pinch zoom, decelerated
drag, clamping, snap. @pixi/react v8.0.5 (Dec 2025) explicitly supports React 19 + Pixi v8.
Dealbreaker-ish: crisp, dense _text_ — the dominant visual element of a timeline — is genuinely
hard in WebGL (texture atlases/BitmapText/SDF, re-rasterization across a 10^6 zoom range), and
one-axis zoom needs pixi-viewport coercion. At your item counts Canvas 2D hits 60fps without
any of that. Keep in reserve for a true "10k+ events all visible" future.

### vis-timeline

The default answer to "JS timeline with lanes and zoom" — and it does have good zoom/pan,
groups, and recent releases (v8.5.1, May 2026, dual MIT/Apache-2.0). Two disqualifiers, both
confirmed: it renders items as **HTML DOM elements** (its own docs), so thousands of items
across deep zoom hits DOM layout costs; and BC dates are **broken** — longstanding issues
report pre-CE dates rendered "incorrect and inconsistent" and a nonexistent year 0 between 1
BCE and 1 CE (visjs/vis-timeline#581, visjs/vis#307), rooted in its moment.js plumbing.
Uncertainty-range rendering would also mean fighting its CSS item model. Fine for project
schedules; wrong tool for antiquity.

### Apache ECharts (canvas custom series)

On paper the best adopt-option: Apache-2.0, canvas-rendered (zrender), v6.1.0 (May 2026),
registerable custom series for arbitrary item drawing, dataZoom for wheel-zoom. In practice my
SSR experiment killed it: feeding BC timestamps to a `time` axis produced looping "Exceed safe
limit in TimeScale.getTicks" warnings, a stalled render, and label garbage (−311, 117, 545,
973…) — its tick generator assumes post-epoch-ish calendars. The escape hatch is a plain
`value` axis over numeric years with custom axisLabel, custom series renderers for all three
item types, and custom lane banding — at which point ECharts is contributing a zoom gesture and
a ~1MB dependency.

### TimelineJS3 (Knight Lab)

The one mainstream library with genuinely documented BC support: negative-year input and a
"cosmological" scale handling dates beyond JS Date's 271,821 BCE floor — proof this problem is
solvable and a useful reference for era formatting. But it's a DOM-based narrative _slideshow_
(one event at a time with a nav band), not a free-zooming multi-lane visualization; no
uncertainty ranges; embeds as a standalone iframe-ish widget rather than a React component;
MPL-2.0 rather than MIT. Wrong genre.

### HistropediaJS

A purpose-built canvas timeline engine for historical data (powers Histropedia's Wikidata
timelines): tuned canvas rendering claiming 10k+ events at 60fps, built-in touch/scroll/zoom/
pan, TypeScript-ready. It is the proof-of-concept that your exact product works as a canvas
engine. Disqualified by license: source-visible but **not open source** — free only for
non-commercial use, "all intellectual property rights… remain the exclusive property of
Histropedia," no redistribution/incorporation, commercial terms by inquiry. No React layer, no
public repo/release history. Study its UX; don't ship it.

### eclipse-cdt-cloud/timeline-chart (honorable mention)

Found during the search: an MIT, PixiJS-based timeline/Gantt library built for software-trace
visualization (Eclipse Theia trace viewer) — rows/lanes, lazy data fetching, zoom, selection,
and crucially a _numeric_ timestamp model rather than JS Dates, so BC is representable by
construction. It's the closest existing "canvas + lanes + numeric deep time" library. But it's
shaped for nanosecond traces (units, labels, interaction idioms), modestly staffed (v0.4.3, Oct
2025; 350 commits), and framework-agnostic rather than React-native. Adopting it means as much
adaptation work as building on d3 — with a smaller community.

### Dishonorable/quick mentions

**react-calendar-timeline** (MIT, beta releases through Mar 2026): real lanes and native React,
but DOM-rendered divs and dayjs calendar dates — a scheduler, not a history axis.
**react-chrono** (MIT, Dec 2025): scroll-through storytelling cards; no time-proportional axis
at all. **Chart.js** (MIT, v4.5.1): canvas, but its time scale delegates to Date-adapter
libraries and its zoom lives in a plugin; a "custom scale" here is just writing your axis
inside someone else's chart lifecycle. **@visx** (MIT, v4.0.0, Jun 2026): lovely React+d3 glue,
but SVG — fails the canvas/perf requirement; if you're using d3 scales anyway, use them
directly. **Two.js** (MIT, pre-1.0): renderer-agnostic scene graph with no interactivity
story — dominated by Konva. **markwhen** (MIT core): a text format + Vue-based viewers, not an
embeddable React lib. **ChronoZoom**: officially retired by Microsoft Research; browse it for
deep-zoom UX inspiration only.

## 4. Build vs adopt: build

Every off-the-shelf timeline fails at least one hard requirement — BC dates (vis-timeline,
react-calendar-timeline, ECharts _empirically_, Chart.js), canvas rendering (vis-timeline,
TimelineJS3, visx, react-\*), uncertainty-range visuals (all of them), or license
(HistropediaJS). That's not bad luck: the three requirements together define a niche no
maintained permissive library occupies. Meanwhile the "build" option is smaller than it sounds
because d3 supplies the two genuinely hard-to-get-right pieces (scales/ticks and zoom-gesture
math), and the team already writes reactive Three.js scene components — this is the same shape
of work, minus the third dimension.

Concretely, building it means:

- **Time model.** Represent time as a number: fractional astronomical years (740 BC = −739;
  year 0 = 1 BC) or epoch ms. `scaleLinear` (or `scaleTime` if you want calendar-aware
  month/day ticks — verified working for BC) maps time↔px. Never parse user-facing dates
  through `new Date(string)`; if Dates are used at all, construct via `setFullYear` (the
  constructor maps years 0–99 to 1900–1999 — the classic trap).
- **Zoom/pan.** `d3.zoom()` attached to the canvas element; on each zoom event,
  `transform.rescaleX(baseScale)` gives the current scale and you redraw. `scaleExtent` clamps
  millennia↔single-day (a ~10^6 zoom ratio — routine for d3-zoom); `translateExtent` clamps
  the navigable era. Wheel, pinch, drag, and double-click all come free and normalized.
- **Axis ticks across BC/AD.** One custom tick ladder: pick the unit (millennium → century →
  decade → year → month → day) from px-per-year, generate ticks from the scale domain, format
  with your own `formatEra` (render "500 BC", suppress the nonexistent year 0, switch to
  month/day names when zoomed in). This is the single most bespoke component — roughly 100–200
  lines — and it's precisely the part every library above gets wrong.
- **Level-of-detail labeling.** Per frame, measure label widths (`ctx.measureText`, cached),
  greedily drop/fade labels that would collide, and collapse dense point clusters into count
  badges. Immediate-mode canvas makes this a pure function of (visible range, items) — a
  natural fit for the signals lib (`scope.effect` on the zoom transform).
- **Lanes.** A y-band per dataset; items pre-sorted by start time per lane. Rendering
  hundreds–thousands of rects/dots per frame is trivial for Canvas 2D; cull to the visible
  x-range with a binary search first.
- **Hit-testing.** `scale.invert(mouseX)` (verified) + binary search within the lane's sorted
  items, or keep a per-frame array of drawn item boxes and scan it (at ~10^3 visible items,
  brute force is fine). This is the part Konva would give you for free — hence the fallback.
- **Uncertainty ranges.** The requirement that kills every chart library is ~15 lines here: a
  `createLinearGradient` fade-out bar, or bracket end-caps, drawn distinctly from solid span
  bars.
- **Housekeeping.** devicePixelRatio-scaled backing store, redraw-on-signal via rAF,
  `OffscreenCanvas` later if ever needed.

On the **Three.js orthographic** variant: entirely viable for this team (ortho camera as the
zoom transform, instanced quads for items), and the right move if item counts explode. But a
timeline is mostly _text_, and text is where WebGL costs you (atlas/SDF management across a
huge zoom range) while Canvas 2D's `fillText` just works. Start with Canvas 2D; the d3 time
core is renderer-agnostic, so the render layer stays swappable (Konva, Pixi, or Three) without
touching the time model.

## 5. Sources

- https://github.com/visjs/vis-timeline
- https://visjs.github.io/vis-timeline/docs/timeline/
- https://github.com/visjs/vis-timeline/issues/581
- https://github.com/visjs/vis/issues/307
- https://github.com/konvajs/konva and https://raw.githubusercontent.com/konvajs/konva/master/LICENSE
- https://github.com/konvajs/react-konva
- https://github.com/pixijs/pixijs
- https://github.com/pixi-viewport/pixi-viewport
- https://github.com/pixijs/pixi-react
- https://github.com/d3/d3-zoom
- https://github.com/NUKnightLab/TimelineJS3
- https://timeline.knightlab.com/docs/json-format.html
- https://knightlab.zendesk.com/hc/en-us/articles/211630106 (cosmological-scale / distant-past dates)
- https://github.com/prabhuignoto/react-chrono
- https://github.com/namespace-ee/react-calendar-timeline
- https://github.com/apache/echarts
- https://echarts.apache.org/handbook/en/how-to/custom-series/
- https://github.com/chartjs/Chart.js
- https://github.com/airbnb/visx
- https://github.com/jonobr1/two.js
- https://js.histropedia.com/ and https://js.histropedia.com/licence.html
- https://github.com/mark-when/markwhen
- https://github.com/eclipse-cdt-cloud/timeline-chart
- https://www.microsoft.com/en-us/research/project/chronozoom/ and https://github.com/alterm4nn/ChronoZoom
- Local Node experiments (2026-07-10): d3-scale/d3-time-format BC-domain test (ticks, invert,
  format, Date range limit); ECharts v6 SSR `time`-axis test with BC timestamps (TimeScale
  safe-limit failure).
