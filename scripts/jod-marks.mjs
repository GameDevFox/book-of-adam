/**
 * Where each Journal of Discourses paragraph sits in the printed book: its page and column.
 *
 * jod.mrm.org sets each printed page as a `<div id="<page>">` and marks the column break with
 * `<span class="columnbreak">` — usually inside the paragraph that ends the column, sometimes
 * between paragraphs. A paragraph a break splits resumes as `<p class="continued">`, so every
 * break falls BETWEEN the scraped paragraphs (checked across all 1,426 discourses: none falls
 * inside one), and a paragraph's page and column are simply where it starts.
 *
 * Columns are counted per discourse: where a discourse begins partway down a page, the printed
 * book closes the previous discourse in two columns at the top and starts this one in two
 * fresh columns below, so every page of a discourse starts in column a.
 */

const PAGE_OR_PARAGRAPH_RE =
  /<div id="(\d+)" class="|<span class="columnbreak">|<p\b([^>]*)>([\s\S]*?)<\/p>/g;
const COLUMN_BREAK = 'class="columnbreak"';
const CONTINUED_RE = /\bcontinued\b/;

/**
 * The paragraphs of a discourse's article HTML, in order, each with its page, column ("a"/"b")
 * and whether it continues a paragraph a break split. `clean` turns a paragraph's inner HTML
 * into its text; paragraphs it leaves empty are dropped, exactly as the scraper drops them.
 */
export const paragraphsWithMarks = (articleHtml, clean) => {
  const paragraphs = [];
  let page = null;
  let column = "a";
  for (const match of articleHtml.matchAll(PAGE_OR_PARAGRAPH_RE)) {
    const [, pageId, pAttrs, pInner] = match;
    if (pageId) {
      page = Number(pageId);
      column = "a";
      continue;
    }
    if (pInner === undefined) {
      column = "b"; // a column break standing between paragraphs
      continue;
    }
    const text = clean(pInner);
    if (text) {
      paragraphs.push({ text, page, column, continued: CONTINUED_RE.test(pAttrs ?? "") });
    }
    if (pInner.includes(COLUMN_BREAK)) column = "b";
  }
  return paragraphs;
};
