/**
 * The build mode of the published site: `vite build --mode public` (`yarn build:public`, what
 * deploys) or `vite --mode public` (`yarn start:public`, previewing it). The first public
 * version is read-only — no review controls, no review state, no research-only hints — and
 * ships only the sub-apps marked ready in src/apps.ts. Any other mode is the research view,
 * which has every sub-app and reads and writes data/ through the dev server.
 *
 * Node-safe on purpose (no `import.meta.env`) so server/ and vite.config.ts can import it;
 * vite.config.ts turns it into the client's compile-time `import.meta.env.PUBLIC_BUILD`
 * (aliased READ_ONLY in records/store.ts).
 */
export const PUBLIC_MODE = "public";
