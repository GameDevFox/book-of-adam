import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { VERSE_PARAM } from "./reference";
import { formatSelection, parseSelection, toggle, toggleRange } from "./selection";

/** Marks a URL change made by selecting, so the reader does not scroll to the first verse. */
const SELECTING = "selecting";

/**
 * The selected passages of the chapter on screen, kept in the URL (`?verse=4,7-8`): a click
 * toggles one, Shift+click a range from the last-clicked one. Each change replaces the history
 * entry, so selecting never floods the Back button. `chapterKey` resets the Shift anchor when
 * the reader moves to another chapter.
 */
export const useVerseSelection = (chapterKey: string) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const param = searchParams.get(VERSE_PARAM);
  const selected = parseSelection(param);
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    anchor.current = null;
  }, [chapterKey]);

  const write = useCallback(
    (next: number[]) => {
      // Built by hand: URLSearchParams would write the comma as %2C.
      const search = next.length ? `?${VERSE_PARAM}=${formatSelection(next)}` : "";
      navigate({ search }, { replace: true, state: { [SELECTING]: true } });
    },
    [navigate],
  );

  const onToggle = (n: number, event: MouseEvent) => {
    // Dragging across the text to copy some words is not a click on a passage.
    if (window.getSelection()?.toString()) return;
    write(event.shiftKey ? toggleRange(selected, anchor.current, n) : toggle(selected, n));
    anchor.current = n;
  };

  const clear = useCallback(() => {
    anchor.current = null;
    write([]);
  }, [write]);

  /** Did the URL arrive from elsewhere (a link, the search) rather than from a click here? */
  const arrived = !(location.state as Record<string, boolean> | null)?.[SELECTING];

  return { selected, onToggle, clear, arrived };
};
