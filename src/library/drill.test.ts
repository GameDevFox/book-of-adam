import { describe, expect, it } from "vitest";

import type { OutlineNode } from "../records/texts";
import { levelsFor, ROOT_TITLE } from "./drill";

const reading = (id: string): OutlineNode => ({ id, title: id, kind: "reading" });
const group = (id: string, children: OutlineNode[]): OutlineNode => ({
  id,
  title: id.toUpperCase(),
  kind: "group",
  children,
});

const tree = [group("bible", [group("ot", [reading("genesis")])]), reading("lone")];

describe("levelsFor", () => {
  it("is just the top level when nothing is open", () => {
    expect(levelsFor(tree, [])).toEqual([{ idPath: [], title: ROOT_TITLE, nodes: tree }]);
  });

  it("stacks one level per open group, each titled by its group", () => {
    const levels = levelsFor(tree, ["bible", "ot"]);
    expect(levels.map((l) => l.title)).toEqual([ROOT_TITLE, "BIBLE", "OT"]);
    expect(levels[2]).toMatchObject({ idPath: ["bible", "ot"], nodes: [reading("genesis")] });
  });

  it("stops at an id that is not an openable group", () => {
    expect(levelsFor(tree, ["bible", "nope", "ot"]).map((l) => l.title)).toEqual([
      ROOT_TITLE,
      "BIBLE",
    ]);
    expect(levelsFor(tree, ["lone"])).toHaveLength(1);
  });
});
