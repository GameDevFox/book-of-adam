import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router";

import { fetchOutline, fetchTextContent } from "../records/store";
import { resolveUnit, type OutlineNode, type TextUnit } from "../records/texts";
import { useNarrow, useNavPanel } from "../navPanel";
import { isCitationPath, readingUrl, resolveCitation } from "./citations";
import { bylineOf } from "./labels";
import { breakBefore, type Break } from "./marks";
import { Passage } from "./Passage";
import { quotationFor } from "./quotation";
import { SearchResults } from "./SearchResults";
import { SelectionBar } from "./SelectionBar";
import { passageNumber } from "./selection";
import { SEARCH_SEGMENT } from "./text-search";
import { TreeMenu } from "./TreeMenu";
import { useEscape } from "../useEscape";
import { useVerseSelection } from "./useVerseSelection";

/**
 * Reading-node coordinates. A Library URL names them in one of two forms: edition-style,
 * /library/<edition>/<file>/<path…>, for every text; or, for the Journal of Discourses,
 * citation-style /library/jod/<volume>/<page> (citations.ts), which resolves against the outline.
 */
type Coords = { edition: string; file: string; path: string[] };

const segmentsOf = (splat: string | undefined): string[] =>
  (splat ?? "").split("/").filter(Boolean).map(decodeURIComponent);

const editionCoords = (seg: string[]): Coords | null =>
  seg.length >= 2 ? { edition: seg[0], file: seg[1], path: seg.slice(2) } : null;

/**
 * Editions whose content files are storage batches, not divisions a reader knows: the poems sit
 * in files of 25 by the 2009 edition's numbering ("Poems 76–100"), so no file title is shown.
 */
const BATCH_FILE_EDITIONS = new Set(["ers-lexicon"]);

/** Bylines longer than this preview on one line, with an Expand control (18 poems' notes). */
const BYLINE_PREVIEW_CHARS = 120;

const Byline = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > BYLINE_PREVIEW_CHARS;
  return (
    <p className={long && !expanded ? "discourse-byline previewed" : "discourse-byline"}>
      <span className="byline-text">{text}</span>
      {long && (
        <button type="button" className="byline-toggle" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Less" : "Expand"}
        </button>
      )}
    </p>
  );
};

/** A printed-book break in the text: a solid rule for a new page, a dotted one for a column. */
const BreakRule = ({ mark }: { mark: Break }) =>
  mark.kind === "page" ? (
    <div
      className="page-rule"
      role="separator"
      aria-label={`Page ${mark.page}`}
      data-page={mark.page}
    >
      p. {mark.page}
    </div>
  ) : (
    <div
      className="column-rule"
      role="separator"
      aria-label={`Page ${mark.page}, column ${mark.column}`}
    >
      col. {mark.column}
    </div>
  );

/** Locate the reading node matching a URL's coordinates, to recover its ancestor groups. */
const findByCoords = (
  nodes: OutlineNode[],
  coords: Coords,
  ancestry: string[] = [],
): { node: OutlineNode; ancestry: string[] } | null => {
  for (const node of nodes) {
    const idPath = [...ancestry, node.id];
    if (
      node.kind === "reading" &&
      node.edition === coords.edition &&
      node.file === coords.file &&
      (node.path ?? []).join("/") === coords.path.join("/")
    ) {
      return { node, ancestry };
    }
    if (node.children) {
      const found = findByCoords(node.children, coords, idPath);
      if (found) return found;
    }
  }
  return null;
};

export const LibraryApp = () => {
  const navigate = useNavigate();
  const splat = useParams()["*"];
  const segments = segmentsOf(splat);
  const citing = isCitationPath(segments);
  const landing = segments.length === 0;
  // /library/search?q=… — no edition is named "search", so the segment cannot shadow a text.
  const searching = segments.length === 1 && segments[0] === SEARCH_SEGMENT;

  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openPath, setOpenPath] = useState<string[]>([]);
  /** The loaded content file; `unit` null when the URL names a file that does not exist. */
  const [content, setContent] = useState<{ key: string; unit: TextUnit | null } | null>(null);
  // On a phone the menu lives in the Shell's ☰ panel, beneath the app links — one menu, not a
  // second Contents sheet; on wider screens it is the sidebar beside the text.
  const narrow = useNarrow();
  const panel = useNavPanel();

  useEffect(() => {
    fetchOutline()
      .then(setOutline)
      .catch((error) => setLoadError(String(error)));
  }, []);

  // A citation resolves only against the outline; edition-style coordinates are in the URL.
  // `page`: a citation's page, which may fall partway through the discourse it lands on.
  const coords: (Coords & { page?: number }) | null = citing
    ? outline && resolveCitation(segments, outline)
    : editionCoords(segments);

  // The menu shows the level holding the selected passage as the URL changes (deep link,
  // back/forward). A bare /library is the landing: the menu starts at its top level, every
  // work in view.
  const pathKey = coords?.path.join("/") ?? "";
  // The selected passages (?verse=4,7-8): click toggles, Shift+click a range, Esc clears.
  const selection = useVerseSelection(`${coords?.edition}/${coords?.file}/${pathKey}`);
  const firstVerse = selection.selected[0];
  useEscape(selection.selected.length > 0, selection.clear);
  useEffect(() => {
    if (landing) {
      setOpenPath([]);
      return;
    }
    if (!outline || !coords) return;
    const found = findByCoords(outline, coords);
    if (found) setOpenPath(found.ancestry);
  }, [outline, landing, coords?.edition, coords?.file, pathKey]);

  // Load the content file backing the current URL (only when the edition/file changes).
  useEffect(() => {
    if (!coords) return;
    const key = `${coords.edition}/${coords.file}`;
    if (content?.key === key) return;
    fetchTextContent(coords.edition, coords.file)
      .then((unit) => setContent({ key, unit }))
      // fetch's own TypeError is a network failure; anything else (404, the static site's
      // index.html fallback) means the URL names no such file.
      .catch((error) =>
        error instanceof TypeError ? setLoadError(String(error)) : setContent({ key, unit: null }),
      );
  }, [coords?.edition, coords?.file, content]);

  // A citation naming a page partway through a discourse scrolls to where that page begins (its
  // page rule); the discourse's opening page has no rule above it and opens at the top.
  const citedPage = coords?.page;
  const contentReady = Boolean(
    coords && content?.unit && content.key === `${coords.edition}/${coords.file}`,
  );
  useEffect(() => {
    if (!contentReady || citedPage === undefined) return;
    const rule = document.querySelector(`.reading .page-rule[data-page="${citedPage}"]`);
    if (rule) rule.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }, [contentReady, citedPage, coords?.edition, coords?.file, pathKey]);

  // A link or search naming verses scrolls to the first; selecting by clicking does not.
  const arrived = selection.arrived;
  useEffect(() => {
    if (!contentReady || firstVerse === undefined || !arrived) return;
    const verse = document.querySelector(`.reading [data-verse="${firstVerse}"]`);
    verse?.scrollIntoView({ block: "start" });
  }, [contentReady, firstVerse, arrived, coords?.edition, coords?.file, pathKey]);

  if (loadError) return <p className="status-line error">{loadError}</p>;
  if (!outline) return <p className="status-line">Loading…</p>;

  const loaded = Boolean(coords && content?.key === `${coords.edition}/${coords.file}`);
  const book = loaded ? (content?.unit ?? null) : null;
  const chapter = book && coords ? resolveUnit(book, coords.path) : null;
  // Not the landing, and either no such citation / malformed URL, or the file or unit is missing.
  const notFound = !landing && (!coords || (loaded && !chapter));
  const selectedKey = coords ? `${coords.edition}/${coords.file}/${coords.path.join(".")}` : null;
  const selectedPassages = (chapter?.units ?? []).flatMap((unit) => {
    const n = passageNumber(unit.id);
    return n !== null && selection.selected.includes(n) ? [{ n, unit }] : [];
  });
  const quotation =
    book && chapter && coords && selectedPassages.length > 0
      ? quotationFor({ ...coords, book, chapter, passages: selectedPassages })
      : null;

  const menu = (
    <TreeMenu
      nodes={outline}
      openPath={openPath}
      selectedKey={selectedKey}
      sheetOpen={narrow && panel.open}
      onOpen={setOpenPath}
      onBack={() => setOpenPath((prev) => prev.slice(0, -1))}
      onSelect={(node) => {
        panel.close();
        navigate(readingUrl(node));
      }}
      hrefFor={readingUrl}
    />
  );

  return (
    <section className={quotation ? "library has-selection" : "library"}>
      <div className="library-layout">
        {narrow ? (
          panel.slot &&
          createPortal(
            <section className="nav-panel-contents" aria-label="Contents">
              <h2 className="nav-panel-section">Contents</h2>
              {menu}
            </section>,
            panel.slot,
          )
        ) : (
          <aside className="library-sidebar">{menu}</aside>
        )}

        <article className="reading">
          {searching ? (
            <SearchResults />
          ) : book && chapter ? (
            <>
              {coords && !BATCH_FILE_EDITIONS.has(coords.edition) && (
                <h2>{book.title ?? book.id}</h2>
              )}
              {book.meta?.heading && <p className="unit-heading">{book.meta.heading}</p>}
              <header className="chapter-head">
                {chapter.title && (
                  <h3 className={chapter.meta ? undefined : "label"}>{chapter.title}</h3>
                )}
                {chapter.meta?.heading && <p className="unit-heading">{chapter.meta.heading}</p>}
                {chapter.meta && bylineOf(chapter.meta) && (
                  // Keyed by the reading, so an expanded byline does not carry over to the next.
                  <Byline key={selectedKey} text={bylineOf(chapter.meta)} />
                )}
              </header>
              {chapter.units?.map((unit, i) => {
                const mark = breakBefore(chapter.units?.[i - 1] ?? null, unit);
                return (
                  <Fragment key={unit.id}>
                    {mark && <BreakRule mark={mark} />}
                    <Passage
                      unit={unit}
                      number={passageNumber(unit.id)}
                      selected={selection.selected.includes(passageNumber(unit.id) ?? 0)}
                      onToggle={selection.onToggle}
                    />
                  </Fragment>
                );
              })}
            </>
          ) : notFound ? (
            <div className="library-not-found">
              <h3>That passage doesn&rsquo;t exist</h3>
              <p>
                Choose one from the menu, or <Link to="/library">start from the top</Link>.
              </p>
            </div>
          ) : !landing ? (
            <p className="status-line">Loading…</p>
          ) : (
            <p className="library-landing">
              {/* Points left at the sidebar; the phone layout turns it up-left toward ☰. */}
              <span className="library-landing-arrow" aria-hidden="true">
                ←
              </span>
              Select a book from the menu to get started
            </p>
          )}
        </article>
      </div>
      {quotation && (
        <SelectionBar
          reference={quotation.reference}
          quotation={quotation.text}
          onClear={selection.clear}
        />
      )}
    </section>
  );
};
