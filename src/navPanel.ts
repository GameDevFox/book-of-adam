import { createContext, useContext, useEffect, useState } from "react";

/**
 * The phone ☰ panel, as offered by the Shell to the page inside it. The panel always lists the
 * app links; `slot` is an element beneath them where a page can portal its own navigation —
 * the Library puts its Contents menu there, so a phone has one menu rather than two.
 */
export type NavPanel = {
  slot: HTMLElement | null;
  open: boolean;
  close: () => void;
};

export const NavPanelContext = createContext<NavPanel>({
  slot: null,
  open: false,
  close: () => {},
});

export const useNavPanel = () => useContext(NavPanelContext);

/** The phone layout's breakpoint — keep in step with `@media (max-width: 700px)` in index.css. */
const NARROW_QUERY = "(max-width: 700px)";

/** True while the phone layout applies (the ☰ panel replaces the header tabs). */
export const useNarrow = (): boolean => {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
};
