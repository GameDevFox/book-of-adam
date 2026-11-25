import { describe, expect, it } from "vitest";

import {
  applyCorrection,
  EDITORIAL_STANZAS,
  fixLine,
  fixPoem,
  isOrnament,
  regroupPsalm,
  splitOrnaments,
  titleContinues,
} from "./ers-fixes.mjs";

const poem = (stanzas, extra = {}) => ({ number: 1, title: "T", meta: {}, stanzas, ...extra });

describe("fixLine", () => {
  it("fixes the site's character glitches", () => {
    expect(fixLine("the wild‑deer")).toBe("the wild-deer");
    expect(fixLine("[. . .]")).toBe("[. . .]");
    expect(fixLine("and ‘twill not be strange, ‘Tis a forge")).toBe(
      "and ’twill not be strange, ’Tis a forge",
    );
    expect(fixLine("M=ay the spirit")).toBe("May the spirit");
  });

  it("closes the stray space beside 'death', and only there", () => {
    expect(fixLine("Then death , the porter")).toBe("Then death, the porter");
    expect(fixLine("the seeds of death .")).toBe("the seeds of death.");
    expect(fixLine("Death ’s purple hand")).toBe("Death’s purple hand");
    expect(fixLine("Death’ s arrow")).toBe("Death’s arrow");
    expect(fixLine("CHORUS —")).toBe("CHORUS —");
    expect(fixLine("death is near")).toBe("death is near");
  });

  it("keeps a line's leading indentation", () => {
    expect(fixLine("\t\tO=nward")).toBe("\t\tOnward");
  });
});

describe("ornaments", () => {
  it("knows a divider row from verse", () => {
    expect(isOrnament("* * * * *")).toBe(true);
    expect(isOrnament("≈≈≈≈≈")).toBe(true);
    expect(isOrnament("CHORUS—")).toBe(false);
    expect(isOrnament("")).toBe(false);
  });

  it("gives a divider a stanza of its own, splitting the verse around it", () => {
    expect(splitOrnaments([["a", "b", "\t\t* * * * *", "c"], ["d"]])).toEqual([
      ["a", "b"],
      ["* * * * *"],
      ["c"],
      ["d"],
    ]);
  });
});

describe("regroupPsalm", () => {
  it("joins each numbered verse's wrapped lines, one paragraph per verse", () => {
    expect(
      regroupPsalm([
        [
          "1 Praise the Lord O my soul: Praise him all ye",
          "of Zion.",
          "2 Thy decrees are",
          "eternal.",
          "PART SECOND.",
          "3 Sing.",
        ],
      ]),
    ).toEqual([
      ["1 Praise the Lord O my soul: Praise him all ye of Zion."],
      ["2 Thy decrees are eternal."],
      ["PART SECOND."],
      ["3 Sing."],
    ]);
  });

  it("leaves verse alone, even with a line or two that starts with a number", () => {
    const verse = [["The year was dark,", "1844 brought grief,", "2 friends remain", "3 still"]];
    expect(regroupPsalm(verse)).toBe(verse);
  });
});

describe("titleContinues", () => {
  it("spots a title broken mid-phrase", () => {
    expect(titleContinues("Lines Addressed to")).toBe(true);
    expect(titleContinues("The Fathers—")).toBe(true);
    expect(titleContinues("“Earth shall adore Thee")).toBe(true);
    expect(titleContinues("The Farmer’s Wife")).toBe(false);
    expect(titleContinues("“Belov’d Eliza, do not weep”")).toBe(false);
  });
});

describe("applyCorrection", () => {
  const block = [
    [
      "on the Death of Her Son",
      "Cease, ye fond parents,",
      "cease to weep—",
      "Your child,",
      "is blest.",
    ],
  ];

  it("moves heading lines to the subtitle and splits stanzas at the named lines", () => {
    const fixed = applyCorrection(poem(block, { title: "To Mrs. S." }), {
      headingLines: ["on the Death of Her Son"],
      stanzaStarts: ["Your child,"],
      editorial: true,
    });
    expect(fixed.subtitle).toBe("on the Death of Her Son");
    expect(fixed.stanzas).toEqual([
      ["Cease, ye fond parents,", "cease to weep—"],
      ["Your child,", "is blest."],
    ]);
    expect(fixed.meta.editorial).toBe(EDITORIAL_STANZAS);
  });

  it("puts a heading on the title instead when the title breaks mid-phrase", () => {
    const fixed = applyCorrection(
      poem([["of July, 1862", "Hail!"]], { title: "Song for the Twenty-Fourth" }),
      {
        headingLines: ["of July, 1862"],
      },
    );
    expect(fixed.title).toBe("Song for the Twenty-Fourth of July, 1862");
    expect(fixed.stanzas).toEqual([["Hail!"]]);
  });

  it("matches lines whatever their indentation, and keeps the source's stanzas otherwise", () => {
    const fixed = applyCorrection(
      poem([["\t*Members of the Council", "You’ve proved"], ["Next"]]),
      {
        noteLines: ["*Members of the Council"],
      },
    );
    expect(fixed.meta.note).toBe("*Members of the Council");
    expect(fixed.stanzas).toEqual([["You’ve proved"], ["Next"]]);
  });

  it("joins a prose wrap and sets an epigraph apart", () => {
    const fixed = applyCorrection(
      poem([["“Many are the afflictions:", "but the Lord delivereth.”", "Verse one"]]),
      {
        joinLines: ["“Many are the afflictions:"],
        epigraphLines: ["“Many are the afflictions: but the Lord delivereth.”"],
      },
    );
    expect(fixed.stanzas).toEqual([
      ["“Many are the afflictions: but the Lord delivereth.”"],
      ["Verse one"],
    ]);
  });

  it("splits at a repeated refrain line each time it is named, in order", () => {
    const refrain = [["Think not,", "a", "No, no,", "b", "Think not,", "c", "Think not,", "d"]];
    const fixed = applyCorrection(poem(refrain), {
      stanzaStarts: ["No, no,", "Think not,", "Think not,"],
    });
    expect(fixed.stanzas).toEqual([
      ["Think not,", "a"],
      ["No, no,", "b"],
      ["Think not,", "c"],
      ["Think not,", "d"],
    ]);
  });

  it("keeps a joined line, and the source's stanzas, when no stanza starts are given", () => {
    const fixed = applyCorrection(
      poem([
        ["“—Who but wishes to invert the laws of Order,", "sins against the Eternal Cause.”"],
        ["Verse one", "Verse two"],
      ]),
      {
        joinLines: ["“—Who but wishes to invert the laws of Order,"],
      },
    );
    expect(fixed.stanzas).toEqual([
      ["“—Who but wishes to invert the laws of Order, sins against the Eternal Cause.”"],
      ["Verse one", "Verse two"],
    ]);
  });

  it("fails loudly when a named line is not in the poem", () => {
    expect(() => applyCorrection(poem(block), { stanzaStarts: ["No such line"] })).toThrow(
      /not found/,
    );
  });
});

describe("fixPoem", () => {
  it("joins onto a title ending in a dash without a space", () => {
    const fixed = applyCorrection(
      poem([["Wouldn’t They Be Astonished?", "x"]], { title: "The Fathers—" }),
      {
        headingLines: ["Wouldn’t They Be Astonished?"],
      },
    );
    expect(fixed.title).toBe("The Fathers—Wouldn’t They Be Astonished?");
  });

  it("rejoins a title broken onto a subtitle line", () => {
    const fixed = fixPoem(
      poem([["x"]], { title: "Lines Addressed to", subtitle: "a Young Female Friend" }),
    );
    expect(fixed.title).toBe("Lines Addressed to a Young Female Friend");
    expect(fixed.subtitle).toBeUndefined();
  });
});
