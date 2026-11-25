import { describe, expect, it } from "vitest";

import { paragraphsWithMarks } from "./jod-marks.mjs";

const clean = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Shaped like jod.mrm.org: one <div id="<page>"> per printed page, a paragraph split by a
// break resumes as <p class="continued">, and the column break usually sits inside the
// paragraph that ends the column (sometimes between paragraphs).
const article = `<article>
  <div id="6" class="css-x"><div><p>First, on page six.</p>
    <p>Ends the column <span class="columnbreak"></span></p>
    <p class="continued">resumes in column b.</p>
    <p>   </p>
    <span class="pagebreak"></span></div></div>
  <div id="7" class="css-x"><div><p class="continued">carries onto page seven.</p>
    <p>Second paragraph of the page.</p>
    <span class="columnbreak"></span>
    <p>Starts column b.</p></div></div>
</article>`;

describe("paragraphsWithMarks", () => {
  const paragraphs = paragraphsWithMarks(article, clean);

  it("keeps the scraper's paragraphs exactly, dropping empty ones", () => {
    expect(paragraphs.map((p) => p.text)).toEqual([
      "First, on page six.",
      "Ends the column",
      "resumes in column b.",
      "carries onto page seven.",
      "Second paragraph of the page.",
      "Starts column b.",
    ]);
  });

  it("tags each paragraph with the printed page it sits on", () => {
    expect(paragraphs.map((p) => p.page)).toEqual([6, 6, 6, 7, 7, 7]);
  });

  it("switches to column b after a column break, inside or between paragraphs", () => {
    expect(paragraphs.map((p) => p.column)).toEqual(["a", "a", "b", "a", "a", "b"]);
  });

  it("marks the pieces that continue a paragraph a break split", () => {
    expect(paragraphs.map((p) => p.continued)).toEqual([false, false, true, true, false, false]);
  });
});
