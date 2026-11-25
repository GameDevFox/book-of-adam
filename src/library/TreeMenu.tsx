import { useEffect, useRef, useState } from "react";

import { firstPage, type OutlineNode } from "../records/texts";
import { levelsFor, type Level } from "./drill";
import { TitlePeek, useTitlePeek, type PeekRowProps } from "./TitlePeek";

/** Stable key for a reading node — its content coordinates (edition/file/path). */
export const readingKey = (n: OutlineNode): string =>
  `${n.edition}/${n.file}/${(n.path ?? []).join(".")}`;

type MenuProps = {
  nodes: OutlineNode[];
  /** Ids from the top of the outline to the open group — the stack of levels (drill.ts). */
  openPath: string[];
  selectedKey: string | null;
  /** Open a group: its level becomes the current one. */
  onOpen: (idPath: string[]) => void;
  /** Back to the previous level. */
  onBack: () => void;
  onSelect: (node: OutlineNode) => void;
  /** A passage's URL: its row is a link to it, so it can be opened in a new tab. */
  hrefFor: (node: OutlineNode) => string;
  /**
   * Whether the phone ☰ panel holding the menu is open. A hidden panel has no size to scroll,
   * so the passage is brought into view again when it opens. Always false on desktop.
   */
  sheetOpen: boolean;
};

const levelKey = (level: Level) => level.idPath.join("/");

const motionAllowed = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const Row = ({
  node,
  idPath,
  selectedKey,
  rowProps,
  onOpen,
  onSelect,
  hrefFor,
}: {
  node: OutlineNode;
  idPath: string[];
  selectedKey: string | null;
  rowProps: PeekRowProps;
  onOpen: (idPath: string[]) => void;
  onSelect: (node: OutlineNode) => void;
  hrefFor: (node: OutlineNode) => string;
}) => {
  // A label inside a level's list — a year among a decade's poems — not something to choose.
  if (node.kind === "divider") return <div className="tree-divider">{node.title}</div>;
  if (node.kind === "group") {
    return (
      <button className="tree-row group" {...rowProps(() => onOpen([...idPath, node.id]))}>
        <span className="tree-label">{node.title}</span>
        {node.count !== undefined && <span className="tree-count">{node.count}</span>}
        <span className="chevron" aria-hidden="true">
          ›
        </span>
      </button>
    );
  }
  const key = readingKey(node);
  // A link, not a button: right-click "Open link in new tab", Ctrl/Cmd+click. A plain click
  // still goes through onSelect (TitlePeek rowProps).
  return (
    <a
      href={hrefFor(node)}
      className={key === selectedKey ? "tree-row leaf active" : "tree-row leaf"}
      {...rowProps(() => onSelect(node))}
    >
      <span className="tree-label">
        {/* The page leads — JoD readers find a discourse by volume and page — then who spoke. */}
        {node.pages && (
          <>
            <span className="tree-page">p. {firstPage(node.pages)}</span>
            <span className="tree-sep"> – </span>
          </>
        )}
        {node.speaker && (
          <>
            <span className="tree-speaker">{node.speaker}</span>
            <span className="tree-sep"> – </span>
          </>
        )}
        {node.title}
      </span>
    </a>
  );
};

/**
 * One level: a pinned header (back button naming the level it returns to, and this level's
 * title) over its own scrolling list. Levels below the current one stay mounted, covered and
 * inert, so going back finds them at the scroll position they were left.
 */
const LevelView = ({
  level,
  parentTitle,
  className,
  current,
  selectedKey,
  sheetOpen,
  rowProps,
  onOpen,
  onBack,
  onSelect,
  hrefFor,
  onAnimationEnd,
}: {
  level: Level;
  parentTitle: string | null;
  className: string;
  current: boolean;
  selectedKey: string | null;
  sheetOpen: boolean;
  rowProps: PeekRowProps;
  onOpen: (idPath: string[]) => void;
  onBack: () => void;
  onSelect: (node: OutlineNode) => void;
  hrefFor: (node: OutlineNode) => string;
  onAnimationEnd?: () => void;
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // A deep link (or a choice made elsewhere) lands on a passage this level may have scrolled
  // past: bring it into the list's view, without scrolling the page — and again when the
  // phone ☰ panel opens, since a hidden list could not be scrolled.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(".tree-row.active");
    if (!current || !list || !row) return;
    const outOfView =
      row.offsetTop < list.scrollTop ||
      row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight;
    if (outOfView) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
  }, [current, selectedKey, sheetOpen]);

  return (
    <section className={className} inert={!current} onAnimationEnd={onAnimationEnd}>
      {parentTitle !== null && (
        <header className="drill-head">
          <button type="button" className="drill-back" onClick={onBack}>
            ‹ {parentTitle}
          </button>
          <h3 className="drill-title">{level.title}</h3>
        </header>
      )}
      <div className="drill-list" ref={listRef}>
        <ul className="tree-list">
          {level.nodes.map((node) => (
            <li key={node.kind === "reading" ? readingKey(node) : node.id}>
              <Row
                node={node}
                idPath={level.idPath}
                selectedKey={selectedKey}
                rowProps={rowProps}
                onOpen={onOpen}
                onSelect={onSelect}
                hrefFor={hrefFor}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

/**
 * The Library menu as a drill-down: opening a group slides its level in from the left over the
 * current one; back slides it away again. Every level of the open path is mounted, top level
 * first, so each keeps its scroll position. Under prefers-reduced-motion levels just swap.
 */
export const TreeMenu = ({
  nodes,
  openPath,
  selectedKey,
  onOpen,
  onBack,
  onSelect,
  hrefFor,
  sheetOpen,
}: MenuProps) => {
  const { peek, rowProps } = useTitlePeek();
  const levels = levelsFor(nodes, openPath);
  /** The level sliding in (by key), and a popped level still sliding out on top. */
  const [entering, setEntering] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<{ level: Level; parentTitle: string } | null>(null);

  const open = (idPath: string[]) => {
    setLeaving(null);
    if (motionAllowed()) setEntering(idPath.join("/"));
    onOpen(idPath);
  };

  const back = () => {
    const top = levels[levels.length - 1];
    if (levels.length > 1 && motionAllowed()) {
      setLeaving({ level: top, parentTitle: levels[levels.length - 2].title });
    }
    setEntering(null);
    onBack();
  };

  const shared = {
    selectedKey,
    sheetOpen,
    rowProps,
    onOpen: open,
    onBack: back,
    onSelect,
    hrefFor,
  };
  return (
    <nav className="tree drill">
      {levels.map((level, depth) => {
        const key = levelKey(level);
        const current = depth === levels.length - 1;
        return (
          <LevelView
            key={key}
            level={level}
            parentTitle={depth === 0 ? null : levels[depth - 1].title}
            className={`drill-level${current ? " current" : ""}${key === entering ? " entering" : ""}`}
            current={current && !leaving}
            onAnimationEnd={key === entering ? () => setEntering(null) : undefined}
            {...shared}
          />
        );
      })}
      {leaving && (
        <LevelView
          key={`leaving:${levelKey(leaving.level)}`}
          level={leaving.level}
          parentTitle={leaving.parentTitle}
          className="drill-level leaving"
          current={false}
          onAnimationEnd={() => setLeaving(null)}
          {...shared}
        />
      )}
      <TitlePeek peek={peek} />
    </nav>
  );
};
