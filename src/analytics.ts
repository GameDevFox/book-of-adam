/**
 * Web analytics for bookofadam.org: the self-hosted Umami at analytics.gamedevfox.org (shared
 * with domus and nekoagent.org — runbook: ~/projects/kitsune/packages/domus/docs/analytics.md).
 * One small cookieless script that counts pageviews, including client-side route changes, with
 * no per-route wiring, no cookies and no persistent ids — so no consent banner.
 *
 * Loaded only in a production public build (`yarn build:public`); the research view, `yarn
 * start:public` and tests never load it. `data-domains` stops it sending from any other host, so
 * a LAN preview of the public build does not count as a visit. The website id is public by
 * design — Umami puts it in every tracked page — so it lives here rather than in an env file.
 * `yarn check:public` asserts both strings are in the bundle.
 */
export const UMAMI_SCRIPT_URL = "https://analytics.gamedevfox.org/script.js";
export const UMAMI_WEBSITE_ID = "95336653-1c05-4b86-9cd4-d94ed82762ba";
const SITE_DOMAIN = "bookofadam.org";

export const initAnalytics = (): void => {
  if (!import.meta.env.PUBLIC_BUILD || !import.meta.env.PROD) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_SCRIPT_URL;
  script.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
  script.setAttribute("data-domains", SITE_DOMAIN);
  document.head.appendChild(script);
};
