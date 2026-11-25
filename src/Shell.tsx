import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router";

import { SUB_APPS } from "./apps";
import { ReferenceSearch } from "./library/ReferenceSearch";
import { NavPanelContext } from "./navPanel";
import { ThemeToggle } from "./ThemeToggle";
import { useEscape } from "./useEscape";

/** The sub-app tabs — rendered twice: the header strip (wide) and the side panel (narrow). */
const AppLinks = ({ onPick }: { onPick?: () => void }) => (
  <>
    {SUB_APPS.map((app) => (
      <NavLink key={app.id} to={`/${app.id}`} title={app.blurb} onClick={onPick}>
        {app.title}
      </NavLink>
    ))}
  </>
);

/** The site chrome — header, tab strip, phone side panel — around whichever page routes.tsx picks. */
export const Shell = () => {
  // Narrow layout only: the tab strip collapses into a left side panel behind the hamburger.
  // CSS hides the hamburger, scrim and panel on wide screens, so this flag is inert there.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const headerRef = useRef<HTMLElement>(null);
  // Beneath the app links in the ☰ panel: a page portals its own navigation here (navPanel.ts).
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const panel = useMemo(
    () => ({ slot, open: navOpen, close: closeNav }),
    [slot, navOpen, closeNav],
  );

  // Publish the pinned header's height (it wraps at some widths) as --shell-header-height, so a
  // sticky panel below it — the Library menu — can sit just under it at the remaining height.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--shell-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useEscape(navOpen, closeNav);

  return (
    <div className="shell">
      <header className="shell-header" ref={headerRef}>
        <button
          type="button"
          className="nav-toggle"
          aria-label="Open menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          ☰
        </button>
        <div className="masthead">
          <h1>Book of Adam</h1>
        </div>
        <ReferenceSearch />
        <div className="header-right">
          <nav>
            <AppLinks />
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <div className={navOpen ? "nav-scrim open" : "nav-scrim"} onClick={closeNav} />
      <aside className={navOpen ? "nav-panel open" : "nav-panel"} aria-label="Menu">
        <div className="nav-panel-head">
          <span>Book of Adam</span>
          <button
            type="button"
            className="nav-panel-close"
            aria-label="Close menu"
            onClick={closeNav}
          >
            ✕
          </button>
        </div>
        <nav className="nav-panel-apps">
          <AppLinks onPick={closeNav} />
        </nav>
        <div className="nav-panel-slot" ref={setSlot} />
      </aside>

      <main>
        <NavPanelContext.Provider value={panel}>
          <Outlet />
        </NavPanelContext.Provider>
      </main>
    </div>
  );
};
