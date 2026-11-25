/**
 * A passage's words as the full-text index sees them, shared by the index build (the word list
 * it emits) and the browser (spelling correction against that list). It must agree with
 * Pagefind's own tokenizer, or a word the reader types could be "corrected" away from one the
 * index holds (docs/design/full-text-search.md):
 *
 * - lowercased;
 * - a hyphen or apostrophe JOINS its parts ("Latter-day" → "latterday"), as Pagefind indexes
 *   hyphenated words;
 * - anything else that is not a letter or digit — spaces, punctuation, the em-dash — is a break.
 *   The index build also spaces em-dashes in the indexed copy (search-index), since Pagefind
 *   would otherwise read "God—the" as one word.
 */

/** Hyphens and apostrophes (straight, curly, and the Unicode hyphen): removed so parts join. */
const JOINERS_RE = /[-‐'’]/g;
const WORD_RE = /[\p{L}\p{N}]+/gu;

export const searchWords = (text: string): string[] =>
  text.toLowerCase().replace(JOINERS_RE, "").match(WORD_RE) ?? [];
