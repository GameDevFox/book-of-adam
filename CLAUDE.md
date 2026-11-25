# CLAUDE.md

Guidance for Claude Code in this repository. Project overview, data model, sub-apps, scripts and
commands: [README.md](README.md). Planned work and known gaps: [TODO.md](TODO.md); the queue of
what is being worked on next, moved out of it: [NEXT.md](NEXT.md). Hosting and the deploy
layout: [docs/deploy.md](docs/deploy.md). Design docs: `docs/design/`.

Standalone Vite + React app, Yarn 4 (`nodeLinker: node-modules`), no monorepo. Was
`packages/memorial` in the kitsune repo until 2026-10-23 — "memorial" in older docs means this.

## Rules

- **The data is the product.** Facts live in `data/<collection>.json`, verdicts in
  `<collection>.reviews.json` keyed by fact path. Research agents FETCH sources; never
  transcribe text or dates from model memory. Source conflicts go in `DISCREPANCIES.md`.
- **Everything here is publishable.** No copyleft dependencies; no text whose licence is
  unclear (`data/texts/local/` is the gitignored home for personal copies). See README,
  "Publishing constraints".
- **Quote from the corpus with the `quote` skill** (`.claude/skills/quote/`), never by
  retyping — it extracts byte-exact text and records the entry in `quotes.md`.
- Code style (arrow functions, factories over classes, named constants) is in the global
  `~/.claude/CLAUDE.md`. ESLint + Prettier run from the root: `yarn lint`, `yarn format`.

## Running

`yarn start` serves on port 3006 (bound to all interfaces). In tmux the dev server gets its
own window named `server` in this project's session. Tests: `yarn test`. Typecheck:
`yarn typecheck` — run it too: `yarn build` does not typecheck, and a missing import has
built clean into a page that would crash at runtime. `yarn build` also emits the data API as
static files under `dist/api/` (README, `server/`). The deployed site is `yarn build:public` — read-only, review surface
compiled out — checked by `yarn check:public`; `yarn start:public` previews it live
(README, "Research vs public build").
