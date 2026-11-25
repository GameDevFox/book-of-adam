import { useEffect } from "react";

/** Call `onEscape` on the Escape key while `active` — for dismissable sheets and side panels. */
export const useEscape = (active: boolean, onEscape: () => void): void => {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
};
