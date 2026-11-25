import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  loadHits,
  QUERY_PARAM,
  searchText,
  type PagefindPage,
  type PassageHit,
  type TextSearch,
} from "./text-search";

/** Readings whose passages are fetched at a time: the first view, then each "Show more". */
const READINGS_PER_STEP = 20;

type State =
  { kind: "searching" } | { kind: "failed"; error: string } | { kind: "ready"; search: TextSearch };

/** "everlating → everlasting", "nwe → we, new or owe". */
const describeCorrections = (search: TextSearch) =>
  search.plan.corrections
    .map(({ typed, usedAs }) => {
      const choices =
        usedAs.length > 1 ? `${usedAs.slice(0, -1).join(", ")} or ${usedAs.at(-1)}` : usedAs[0];
      return `${typed} → ${choices}`;
    })
    .join("; ");

const Hit = ({ hit }: { hit: PassageHit }) => (
  <li className="search-hit">
    <Link to={hit.url} className="search-hit-reference">
      {hit.reference}
      {hit.inTitle && <span className="search-hit-where"> — in the title</span>}
    </Link>
    <p className="search-hit-excerpt">
      {hit.excerpt.map((part, i) => (part.marked ? <mark key={i}>{part.text}</mark> : part.text))}
    </p>
  </li>
);

/**
 * /library/search?q=… — every passage holding the phrase, best match first, each linking to the
 * passage selected (docs/design/full-text-search.md).
 */
export const SearchResults = () => {
  const [params] = useSearchParams();
  const text = params.get(QUERY_PARAM) ?? "";
  const [state, setState] = useState<State>({ kind: "searching" });
  const [shown, setShown] = useState(READINGS_PER_STEP);
  /** Hits by reading (Pagefind page id), fetched as readings come into view. */
  const [hits, setHits] = useState<Map<string, PassageHit[]>>(new Map());
  const [hitsError, setHitsError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setState({ kind: "searching" });
    setShown(READINGS_PER_STEP);
    setHits(new Map());
    setHitsError(null);
    if (!text.trim()) return;
    searchText(text)
      .then((search) => live && setState({ kind: "ready", search }))
      .catch((error) => live && setState({ kind: "failed", error: String(error) }));
    return () => {
      live = false;
    };
  }, [text]);

  const pages: PagefindPage[] = state.kind === "ready" ? state.search.pages : [];
  const plan = state.kind === "ready" ? state.search.plan : null;
  const inView = pages.slice(0, shown);
  const missing = inView.filter((page) => !hits.has(page.id));

  useEffect(() => {
    if (!plan || missing.length === 0) return;
    let live = true;
    Promise.all(
      missing.map(
        async (page) =>
          [page.id, await loadHits([page], plan ?? { phrases: [], corrections: [] })] as const,
      ),
    )
      .then((loaded) => live && setHits((prev) => new Map([...prev, ...loaded])))
      .catch((error) => live && setHitsError(String(error)));
    return () => {
      live = false;
    };
  }, [missing.map((page) => page.id).join(" ")]);

  if (!text.trim()) {
    return <p className="status-line">Type words in the search field above.</p>;
  }
  if (state.kind === "searching") return <p className="status-line">Searching…</p>;
  if (state.kind === "failed") {
    return (
      <p className="status-line error">
        The search could not load ({state.error}). Check your connection and try again.
      </p>
    );
  }

  const { search } = state;
  const corrected = describeCorrections(search);
  return (
    <div className="search-results">
      <h2>&ldquo;{text.trim()}&rdquo;</h2>
      {corrected && <p className="search-corrected">Spelling corrected: {corrected}</p>}
      {pages.length === 0 ? (
        <p className="status-line">No passage contains &ldquo;{text.trim()}&rdquo;.</p>
      ) : (
        <>
          <p className="search-count">
            Found in {pages.length} {pages.length === 1 ? "reading" : "readings"} (chapters,
            discourses and poems)
          </p>
          <ol className="search-hits">
            {inView.flatMap((page) =>
              (hits.get(page.id) ?? []).map((hit) => <Hit key={hit.key} hit={hit} />),
            )}
          </ol>
          {hitsError && (
            <p className="status-line error">Some results could not load ({hitsError}).</p>
          )}
          {missing.length > 0 && !hitsError && <p className="status-line">Loading…</p>}
          {shown < pages.length && missing.length === 0 && (
            <button
              type="button"
              className="search-more"
              onClick={() => setShown((n) => n + READINGS_PER_STEP)}
            >
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
};
