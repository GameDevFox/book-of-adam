import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FocusEvent, MouseEvent, TouchEvent } from "react";
import { createPortal } from "react-dom";

/**
 * The full text of a truncated menu title, laid exactly over the truncated one and running on
 * past the row (wrapping at PEEK_MAX_WIDTH_PX — some JoD titles are 800 characters). Shown at
 * once on hover or keyboard focus; on touch, after pressing and holding a row for
 * LONG_PRESS_MS, and releasing a hold does not open the row.
 *
 * Drawn in a fixed layer on <body>, positioned from the label's measured box, because the
 * sidebar is a scroll container and would clip anything that overflows it. It copies the
 * label's typography so its first line lands on the label's text pixel for pixel.
 */

const LONG_PRESS_MS = 450;
/** Breathing room around the text; the box is offset by the same amount to keep it aligned. */
const PEEK_PAD_PX = 4;
const PEEK_MAX_WIDTH_PX = 640;
/** Kept clear between the peek and the viewport edge. */
const EDGE_PX = 8;
const COPIED_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "color",
] as const;

type PeekState = {
  /** The label's own markup (React-rendered, so already escaped), so styled parts carry over. */
  html: string;
  left: number;
  top: number;
  minWidth: number;
  maxWidth: number;
  typography: Partial<Record<(typeof COPIED_STYLES)[number], string>>;
};

const LABEL_SELECTOR = ".tree-label";

const isTruncated = (label: Element) =>
  label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1;

const canHover = () => window.matchMedia("(hover: hover)").matches;

const measure = (row: HTMLElement): PeekState | null => {
  const label = row.querySelector<HTMLElement>(LABEL_SELECTOR);
  if (!label || !isTruncated(label)) return null;
  const rect = label.getBoundingClientRect();
  const style = getComputedStyle(label);
  const left = rect.left - PEEK_PAD_PX;
  return {
    html: label.innerHTML,
    left,
    top: rect.top - PEEK_PAD_PX,
    minWidth: rect.width + 2 * PEEK_PAD_PX,
    maxWidth: Math.min(PEEK_MAX_WIDTH_PX, window.innerWidth - left - EDGE_PX),
    typography: Object.fromEntries(COPIED_STYLES.map((key) => [key, style[key]])),
  };
};

/**
 * Event handlers a menu row spreads onto its button or link; `activate` is the row's own action.
 * On a link, a modified click (Ctrl/Cmd/Shift/Alt) is left to the browser — a new tab or window.
 */
export type PeekRowProps = (activate: () => void) => {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
  onTouchMove: () => void;
  onTouchEnd: (event: TouchEvent<HTMLElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
};

/** A click the browser should handle itself: a link opened in a new tab or window. */
const opensElsewhere = (event: MouseEvent<HTMLElement>) =>
  event.currentTarget instanceof HTMLAnchorElement &&
  (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0);

export const useTitlePeek = () => {
  const [peek, setPeek] = useState<PeekState | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  /** A long press completed: its release and the click that follows must not activate. */
  const held = useRef(false);
  /** A finger is on a row: a context menu now is Android's long press, not a right-click. */
  const touching = useRef(false);

  const hide = useCallback(() => setPeek(null), []);
  const cancelHold = () => window.clearTimeout(holdTimer.current);

  // Scrolling moves the row out from under a fixed overlay; drop it rather than chase it.
  useEffect(() => {
    if (!peek) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [peek, hide]);

  useEffect(() => cancelHold, []);

  const rowProps: PeekRowProps = (activate) => ({
    onMouseEnter: (event) => {
      if (canHover()) setPeek(measure(event.currentTarget));
    },
    onMouseLeave: hide,
    onFocus: (event) => {
      if (event.currentTarget.matches(":focus-visible")) setPeek(measure(event.currentTarget));
    },
    onBlur: hide,
    onTouchStart: (event) => {
      const row = event.currentTarget;
      held.current = false;
      touching.current = true;
      cancelHold();
      holdTimer.current = window.setTimeout(() => {
        held.current = true;
        setPeek(measure(row));
      }, LONG_PRESS_MS);
    },
    onTouchMove: () => {
      touching.current = false;
      cancelHold();
      hide();
    },
    onTouchEnd: (event) => {
      touching.current = false;
      cancelHold();
      if (!held.current) return;
      event.preventDefault(); // suppresses the click a release would otherwise produce
      hide();
    },
    // Android raises the context menu on a long press; the hold is ours. A mouse right-click
    // keeps the browser's menu ("Open link in new tab").
    onContextMenu: (event) => {
      if (touching.current) event.preventDefault();
    },
    onClick: (event) => {
      if (held.current) {
        held.current = false;
        event.preventDefault();
        return;
      }
      if (opensElsewhere(event)) return;
      event.preventDefault(); // a link navigates in place, through `activate`
      hide();
      activate();
    },
  });

  return { peek, rowProps };
};

/** The overlay itself. Grows downward; nudged up if a very long title would leave the screen. */
export const TitlePeek = ({ peek }: { peek: PeekState | null }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !peek) return;
    const overflow = peek.top + el.offsetHeight - (window.innerHeight - EDGE_PX);
    el.style.top = `${overflow > 0 ? Math.max(EDGE_PX, peek.top - overflow) : peek.top}px`;
  }, [peek]);

  if (!peek) return null;
  return createPortal(
    <div
      ref={ref}
      className="tree-peek"
      role="tooltip"
      style={{
        left: peek.left,
        top: peek.top,
        minWidth: peek.minWidth,
        maxWidth: peek.maxWidth,
        padding: PEEK_PAD_PX,
        ...peek.typography,
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: peek.html }} />
    </div>,
    document.body,
  );
};
