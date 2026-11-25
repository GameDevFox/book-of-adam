import type { OutlineNode } from "../records/texts";

/**
 * The Library menu drills down: each open group is a level covering the one before it. The
 * open path (one group id per depth, kept by LibraryApp) IS the level stack, so this only
 * walks it — the menu never holds navigation state of its own.
 */
export type Level = {
  /** Ids from the top of the outline to this level's group ([] for the top level). */
  idPath: string[];
  title: string;
  nodes: OutlineNode[];
};

/** What the top level is called on the back button of the level above it. */
export const ROOT_TITLE = "Library";

/**
 * The levels `openPath` walks through, top level first. Stops at the first id that is not an
 * openable group at its depth, so a stale or hand-edited path shows as much as is real.
 */
export const levelsFor = (nodes: OutlineNode[], openPath: string[]): Level[] => {
  const levels: Level[] = [{ idPath: [], title: ROOT_TITLE, nodes }];
  for (const id of openPath) {
    const top = levels[levels.length - 1];
    const group = top.nodes.find((node) => node.id === id && node.kind === "group");
    if (!group) break;
    levels.push({ idPath: [...top.idPath, id], title: group.title, nodes: group.children ?? [] });
  }
  return levels;
};
