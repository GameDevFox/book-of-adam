import {
  isRouteErrorResponse,
  Link,
  Navigate,
  useRouteError,
  type RouteObject,
} from "react-router";

import { SUB_APPS } from "./apps";
import { Shell } from "./Shell";

/** Where `/` and every way out of a dead end lead: the first sub-app (the Library). */
const HOME = SUB_APPS[0];

/**
 * The catch-all, for a path no route matches. The published site needs it more than most:
 * CloudFront answers every unknown path with index.html as a 200 (docs/deploy.md), so the
 * app itself is the only thing that can tell a reader a page does not exist. Without it an
 * unknown path rendered the shell around an empty page.
 *
 * Deliberately plain — research-only paths (/people, /events, /timeline) get this too in the
 * public build rather than a "coming soon" that would advertise apps not yet ready.
 */
export const NotFound = () => (
  <section className="page-message">
    <h2>That page doesn&rsquo;t exist</h2>
    <p>
      <Link to={`/${HOME.id}`}>Go to the {HOME.title}</Link>
    </p>
  </section>
);

/**
 * A thrown render error. Mounted on the ROOT route, so it replaces the Shell rather than
 * rendering inside it — the Shell can throw too, and a boundary nested in a broken layout never
 * appears. A full-page link rather than a router Link: after a crash, a fresh load is the
 * reliable way back.
 */
export const SiteError = () => {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;
  return (
    <section className="page-message site-error">
      <h1>Book of Adam</h1>
      <h2>Something on this page broke</h2>
      <p>
        <a href={`/${HOME.id}`}>Go to the {HOME.title}</a>
      </p>
      {/* For a bug report, not for reading — hence muted. */}
      {detail && <p className="page-message-detail">{detail}</p>}
    </section>
  );
};

/**
 * Both the ErrorBoundary and the `*` catch-all are load-bearing (nekoagent.org measured it,
 * 2026-09-10): with neither, React Router shows its own developer-facing error page; with the
 * boundary only, a 404 arrives as a route error and reads as "something broke". Sub-apps own
 * everything under their segment (`library/*` parses its own path).
 */
export const ROUTES: RouteObject[] = [
  {
    path: "/",
    Component: Shell,
    ErrorBoundary: SiteError,
    children: [
      { index: true, element: <Navigate to={`/${HOME.id}`} replace /> },
      ...SUB_APPS.map((app) => ({ path: `${app.id}/*`, Component: app.component })),
      { path: "*", Component: NotFound },
    ],
  },
];
