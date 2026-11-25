---
name: quote
description: >-
  Pull verbatim quotes from the memorial text corpus (Journal of Discourses, Book of Mormon
  editions) and format them as citations for research or sharing. Use this whenever the user
  gives a reference and wants the text — "Vol 19, pg 64, starting with X ending with Y",
  "JD 13:261", "that Brigham Young quote about novels", "grab me the passage where he says…",
  "add this to quotes.md", or asks for a citation, page number, or source for a Latter-day
  Saint / Restoration-era quotation. Also use when the user wants a quote checked for accuracy,
  wants to know what page something is on, or is preparing a quotation to share with other
  people. Reach for it even when they don't name a file or say the word "citation" — if the
  task involves quoting a historical religious text accurately, this is the skill.
---

# Quote lookup

The user is assembling quotations for research and for sharing with people who will check
them. Two things matter more than anything else here:

1. **The quote is verbatim.** Not paraphrased, not silently corrected, not remembered.
2. **The citation lets someone else find it** — the right volume, the right page, a link.

Everything below serves those two goals.

## The one rule that matters

**Never type quote text yourself.** Extract it with the bundled script and let the script
write it, or copy it mechanically from script output. A model retyping a nineteenth-century
paragraph will eventually normalise a spelling, straighten a curly quote, or drop a clause —
and the result still *looks* like a quote, which is what makes it dangerous. The user is
sharing these with people who will look them up.

This also means: **never quote from memory.** If a passage isn't in the corpus and you can't
fetch it, say so. A plausible-sounding invented quotation is the worst possible output here.

## The corpus

Everything lives under `data/texts/`:

- `sources/jod-mrm/raw/vol-NN.json` — Journal of Discourses, 26 volumes, 1,426 discourses, with
  speaker, date, reporter, byline, and URL per discourse. **Prefer this over `content/`** for
  JoD; it has the citation metadata. The `raw/` dir is gitignored (regenerate with
  `scripts/download-jod.mjs`); the committed `sources/jod-mrm/volume-NN.json` files are
  metadata only, so a search that reads them finds nothing.
- `sources/jod-mrm/.cache/p-V-P.html` — the scraped HTML, which still carries the
  `<div id="NN">` page anchors the parser dropped. **This is what makes exact page citation
  possible.** The parsed JSON has no page data below the discourse level.
- `content/<edition>/*.json` — parsed editions in a uniform `{id, title, units[]}` shape
  (Book of Mormon 1830 and PG#17, plus a duplicate copy of JoD).

## Workflow

Run everything through `scripts/quote_lookup.py`. Use `--help` on any subcommand.

**1. Resolve the reference.** The user will give you some combination of volume, page, opening
words, closing words, speaker, or a half-remembered phrase.

```bash
# they gave a page and the passage boundaries — the common case
python3 scripts/quote_lookup.py extract --volume 19 --page 64 \
  --start "Study the bible" --end "without profit"

# they only remember a phrase
python3 scripts/quote_lookup.py search "novels allure the mind"

# you want to read a discourse and see where the pages fall
python3 scripts/quote_lookup.py pages 19 64 --full
```

`extract` matches loosely and returns exactly. If the user types "Study the bible" and the page
says "Study the Bible", it matches and returns the page's wording. It reports `exact_start` /
`exact_end` so you can tell them when what they remembered differs from what was printed —
which happens constantly and is worth mentioning every time, because they may be working from
a secondary source that misquoted it.

`search` is exact-only by default because fuzzy matching across 26 volumes is slow. Add
`--fuzzy` once you've narrowed it with `--volume`.

Each JoD search hit reports both `pages` (the discourse's whole span) and `page` (the printed
page the hit actually sits on). **Cite `page`, never a number picked out of `pages`.** A
discourse running pp. 306–313 tells you nothing about where in it the phrase falls, and
choosing an endpoint produces a citation that looks precise and is wrong. If `page` is null the
HTML cache was missing; say the page is unverified rather than guessing.

**2. Check the page.** `extract` derives the printed page range from the HTML cache and reports
`page_breaks` when a passage crosses one. Trust that over the page number the user gave you —
but if it disagrees with them, say so rather than silently overriding. If `page_source` comes
back `"json"` the cache was missing and the page could not be verified; tell them.

**3. Write the entry.** `entry` renders the full formatted entry and appends it, so the quote
never passes through your hands:

```bash
python3 scripts/quote_lookup.py entry --volume 19 --page 64 \
  --start "Little girls" --end "the way of life and salvation" \
  --slug "dress and study" \
  --note "Delivered to Sunday School children, New Tabernacle." \
  --append
```

It auto-numbers, builds the citation, and adds notes for fuzzy starts, page-break crossings,
and unverifiable pages on its own. Drop `--append` to preview.

The collection lives at `quotes.md`. The format template is
`assets/entry-template.txt` — edit that rather than hand-formatting, so entries stay uniform.

**4. Show the user the quote and citation in chat too.** They asked for something to paste;
make them scroll through a file for it and you've failed the actual task.

## Citation format

```
"<verbatim quote>"

— <Speaker>, "<Discourse title>," Journal of Discourses <vol>:<pages> (<date>), reported by <reporter>. <url>
```

Plain text, no Markdown — no `>` blockquotes, no `*italics*`, no leading `-`. These get pasted
into forums, email, and chat where Markdown either doesn't render or renders wrong (a leading
hyphen turns the attribution into a bullet). Real em dashes and en dashes are fine; they're
Unicode, not Markdown. Don't hard-wrap — it reflows badly in chat boxes.

Short form when space is tight: `— Brigham Young, JD 19:64 (July 24, 1877)`

Conventions worth holding to:
- `JD`, not `JoD`. That's the abbreviation the literature uses.
- `19:64` volume:page, not "Vol 19, pp. 64". And `p.` is singular — `pp.` is for ranges.
- Ellipses only for material actually omitted. A passage cut from mid-paragraph but starting
  and ending on sentence boundaries needs none; say so in the notes instead.

## Notes worth recording

The notes section is where you protect the user from being embarrassed later. Add a note when:

- **The wording differs from what they asked for** — the script flags this; always pass it on.
- **The passage crosses a page break** — cite the range, and mention where the break falls so
  they can insert a bracketed `[65]` if their style wants it.
- **Audience or occasion changes how it reads** — the byline often says something like
  "delivered to the Sunday School Children". If a quote sounds harsher or stranger without that
  context, a reader who looks it up will find the context and use it against them.
- **The claim is historically contested.** This matters most and is easy to skip. A speaker's
  recollection decades after the fact, a partisan characterisation of a legal proceeding, a
  statement later repudiated — flag it, state briefly what the counter-account is, and say the
  user should verify against a dedicated source. Be even-handed: the job is to keep them from
  being blindsided, not to argue a side.
- **The transcription is single-source.** The JoD text comes from jod.mrm.org, a countercult
  ministry's transcription. It appears accurate, but a hostile reader will attack the host. For
  contested quotes, suggest pairing it with a scan of the Liverpool printing.

## Sources outside the corpus

If the reference isn't in `data/texts/`, you may fetch it — but the verbatim
guarantee weakens, so be explicit about that:

- Fetch the actual text (WebFetch or the browser skill). Never reconstruct from memory.
- Quote from what you fetched, and record the URL and retrieval date in the entry's source line.
- Prefer a scan or a scholarly transcription over a blog quoting a blog. If the only thing you
  can find is a secondary source quoting the passage, say that plainly — a quote whose chain of
  custody ends at someone's website is worth much less than one traced to a printing.
- If you can't find a trustworthy copy, report that instead of producing something. "I couldn't
  verify this" is a useful answer.

## When the reference is ambiguous

A bare volume:page often covers two discourses, because a page holds the end of one and the
start of the next. `extract` handles this by picking the discourse where the phrases actually
match. But if the user gives only a page and no phrases, `pages <vol> <page>` will show every
discourse touching it — show them the options rather than guessing.
