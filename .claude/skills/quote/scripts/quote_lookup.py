#!/usr/bin/env python3
"""Resolve references into byte-exact quotes from the memorial text corpus.

The whole point of this script is that the quote text never passes through a
language model's fingers. It is sliced out of the source file and written
straight to the output, so "verbatim" means verbatim.

Three subcommands:

  search    find a phrase across a corpus, report where it lives
  pages     show a JoD discourse's paragraphs mapped to printed page numbers
  extract   pull the exact span between a start and end phrase, with citation
            metadata and (for JoD) the printed page range

Run with --help on any subcommand for arguments.
"""

import argparse
import difflib
import glob
import json
import os
import re
import sys
import unicodedata

# Repo layout. The skill lives at <repo>/.claude/skills/quote/, so the
# corpus sits four levels up. Resolved from __file__ rather than cwd so the
# script works no matter where it is invoked from.
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SKILL_DIR)))
TEXTS = os.path.join(REPO_ROOT, "data", "texts")
JOD_META = os.path.join(TEXTS, "sources", "jod-mrm")
# The full per-volume scrape (paragraph text included) lives in the gitignored raw/ subdir since
# the source/content split; sources/jod-mrm/volume-NN.json is metadata only.
JOD_SOURCES = os.path.join(JOD_META, "raw")
JOD_CACHE = os.path.join(JOD_META, ".cache")
CONTENT = os.path.join(TEXTS, "content")

# A fuzzy match this good or better is accepted as "the user meant this".
# People misremember a word ("has" for "had") or capitalise differently, and
# refusing to match on that would make the tool useless. Below this, we would
# rather report no match than silently quote the wrong passage.
MATCH_THRESHOLD = 0.82

# When scanning for the best window, allow the matched span to run this much
# longer or shorter than the phrase the user typed.
WINDOW_SLACK = 0.5

# Sentence-closing characters absorbed into a match so a quote ending on
# "...found against him" picks up its full stop.
TRAILING_PUNCT = '.!?"”’\''


# --------------------------------------------------------------------------
# normalisation: compare loosely, return exactly
# --------------------------------------------------------------------------

# Typographic variants that should not defeat a match. The source text uses
# curly quotes and em dashes; people type straight quotes and hyphens.
CHAR_FOLD = {
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "―": "-", "−": "-",
    " ": " ",
}


def fold(ch):
    return CHAR_FOLD.get(ch, ch)


def normalize_with_map(text):
    """Lowercase/fold text, collapsing whitespace.

    Returns (normalized, offsets) where offsets[i] is the index in the original
    string that produced normalized[i]. That mapping is what lets us search in
    forgiving normalized space but slice from the pristine original.
    """
    out = []
    offsets = []
    prev_space = True  # leading whitespace is dropped
    for i, ch in enumerate(text):
        c = fold(unicodedata.normalize("NFC", ch)).lower()
        if c.isspace():
            if prev_space:
                continue
            out.append(" ")
            offsets.append(i)
            prev_space = True
        else:
            out.append(c)
            offsets.append(i)
            prev_space = False
    return "".join(out), offsets


def word_spans(norm):
    """[(start, end)] of each whitespace-delimited word in normalized text."""
    return [(m.start(), m.end()) for m in re.finditer(r"\S+", norm)]


def find_phrase(haystack, phrase, fuzzy=True):
    """Locate `phrase` in `haystack`, tolerantly.

    Returns (start, end, ratio) as offsets into the ORIGINAL haystack, or None.
    Exact (normalized) matches are preferred; otherwise the best-scoring word
    window above MATCH_THRESHOLD wins. Reporting the ratio lets the caller tell
    the user when what they typed differed from what the page actually says.

    The fuzzy fallback scans every word window and is far too slow to run
    against the whole corpus, so `search` disables it by default. It earns its
    cost in `extract`, where we are looking at one discourse and the user's
    half-remembered wording is exactly what needs forgiving.
    """
    norm, offs = normalize_with_map(haystack)
    pnorm, _ = normalize_with_map(phrase)
    if not pnorm:
        return None

    idx = norm.find(pnorm)
    if idx >= 0:
        return offs[idx], offs[idx + len(pnorm) - 1] + 1, 1.0
    if not fuzzy:
        return None

    words = word_spans(norm)
    pwords = len(pnorm.split())
    if not words or not pwords:
        return None

    lo = max(1, int(pwords * (1 - WINDOW_SLACK)))
    hi = max(lo, int(pwords * (1 + WINDOW_SLACK)) + 1)

    best = None
    matcher = difflib.SequenceMatcher()
    matcher.set_seq2(pnorm)
    for i in range(len(words)):
        for n in range(lo, hi + 1):
            j = i + n
            if j > len(words):
                break
            s, e = words[i][0], words[j - 1][1]
            cand = norm[s:e]
            # Cheap length gate before the expensive ratio computation.
            if abs(len(cand) - len(pnorm)) > max(12, len(pnorm) * WINDOW_SLACK):
                continue
            matcher.set_seq1(cand)
            if matcher.real_quick_ratio() < MATCH_THRESHOLD:
                continue
            if matcher.quick_ratio() < MATCH_THRESHOLD:
                continue
            r = matcher.ratio()
            if best is None or r > best[2]:
                best = (s, e, r)

    if best is None or best[2] < MATCH_THRESHOLD:
        return None
    s, e, r = best
    return offs[s], offs[e - 1] + 1, r


# --------------------------------------------------------------------------
# Journal of Discourses: page-aware loading
# --------------------------------------------------------------------------

def jod_volume(vol):
    path = os.path.join(JOD_SOURCES, "vol-%02d.json" % int(vol))
    if not os.path.exists(path):
        raise SystemExit("no such JoD volume file: %s" % path)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def jod_discourses(vol):
    return jod_volume(vol)["discourses"]


def page_range(d):
    lo, _, hi = str(d["pages"]).partition("-")
    lo = int(lo)
    return lo, int(hi) if hi else lo


def jod_find_discourse(vol, page):
    """Discourses of `vol` whose printed range covers `page`.

    Often more than one: a page can hold the end of one discourse and the start
    of the next, which is exactly the ambiguity a bare volume:page cite has.
    """
    hits = []
    for d in jod_discourses(vol):
        lo, hi = page_range(d)
        if lo <= int(page) <= hi:
            hits.append(d)
    return hits


def cache_path(d):
    return os.path.join(JOD_CACHE, "p-%d-%d.html" % (int(d["volume"]), int(d["page"])))


def strip_tags(html):
    html = re.sub(r"<[^>]+>", "", html)
    html = html.replace("&nbsp;", " ").replace("&amp;", "&")
    html = html.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    html = html.replace("&#39;", "'").replace("&rsquo;", "’").replace("&lsquo;", "‘")
    html = html.replace("&ldquo;", "“").replace("&rdquo;", "”")
    html = html.replace("&mdash;", "—").replace("&ndash;", "–")
    return re.sub(r"[ \t]*\n[ \t]*", " ", html).strip()


def jod_paragraphs(d):
    """Paragraph chunks for a discourse, page-tagged where possible.

    Returns (chunks, source) where chunks is [{"page": int|None, "text": str}].

    The cached HTML carries <div id="NN"> page anchors that the JSON parser
    discarded, so the cache is the better source: it is what makes exact page
    citation possible. The JSON is the fallback when a cache file is missing,
    and callers should surface that downgrade rather than quietly cite a page
    they cannot actually verify.
    """
    path = cache_path(d)
    if os.path.exists(path):
        with open(path, encoding="utf-8", errors="replace") as fh:
            html = fh.read()
        parts = re.split(r'<div id="(\d+)"', html)
        chunks = []
        for j in range(1, len(parts), 2):
            page = int(parts[j])
            for raw in re.findall(r"<p[^>]*>(.*?)</p>", parts[j + 1], re.S):
                t = strip_tags(raw)
                if t:
                    chunks.append({"page": page, "text": t})
        if chunks:
            return chunks, "cache"
    return [{"page": None, "text": p} for p in d["paragraphs"]], "json"


def exact_page(d, para_index):
    """Printed page holding paragraph `para_index` of discourse `d`.

    Reporting only the discourse's page span invites the reader to pick a page
    out of it and cite that, which is a guess dressed as a citation. The HTML
    cache knows the real answer, and its chunks line up 1:1 with the parsed
    paragraphs because both split at page breaks. Returns None when the cache
    is missing, so callers can say "unverified" instead of inventing a number.
    """
    chunks, source = jod_paragraphs(d)
    if source != "cache" or para_index >= len(chunks):
        return None
    return chunks[para_index]["page"]


def jod_meta(d, source):
    return {
        "corpus": "journal-of-discourses",
        "edition": "jod-mrm",
        "volume": d["volume"],
        "pages": d["pages"],
        "title": d["title"],
        "speaker": d["speaker"],
        "date": d.get("date"),
        "reporter": d.get("reporter"),
        "byline": d.get("byline"),
        "url": d.get("url"),
        "page_source": source,
    }


# --------------------------------------------------------------------------
# generic content editions (Book of Mormon, and anything else in content/)
# --------------------------------------------------------------------------

def walk_units(node, trail=None):
    """Yield (trail, leaf) for every leaf unit with text.

    trail is the list of ancestor titles, which becomes the locator shown to
    the user (e.g. ["The First Book of Nephi", "Chapter I"]).
    """
    trail = trail or []
    if isinstance(node, dict):
        if "text" in node and "units" not in node:
            yield trail, node
            return
        here = trail + ([node["title"]] if node.get("title") else [])
        for child in node.get("units", []):
            yield from walk_units(child, here)


# content/ holds a parsed copy of the JoD volumes alongside the other
# editions, but sources/ is the better JoD path: it carries speaker, date,
# reporter and URL, and pairs with the page-bearing HTML cache. Scanning both
# would report every JoD hit twice, so the content sweep skips this edition
# unless it is asked for by name.
CONTENT_DUPLICATE_OF_SOURCES = {"jod-mrm"}


def content_files(edition=None):
    if edition:
        return sorted(glob.glob(os.path.join(CONTENT, edition, "*.json")))
    out = []
    for path in sorted(glob.glob(os.path.join(CONTENT, "*", "*.json"))):
        if os.path.basename(os.path.dirname(path)) in CONTENT_DUPLICATE_OF_SOURCES:
            continue
        out.append(path)
    return out


# --------------------------------------------------------------------------
# subcommands
# --------------------------------------------------------------------------

def cmd_search(args):
    results = []
    if args.corpus in ("jod", "all"):
        vols = [args.volume] if args.volume else range(1, 27)
        for v in vols:
            try:
                ds = jod_discourses(v)
            except SystemExit:
                continue
            for d in ds:
                for i, para in enumerate(d["paragraphs"]):
                    hit = find_phrase(para, args.phrase, fuzzy=args.fuzzy)
                    if hit:
                        s, e, r = hit
                        results.append({
                            "corpus": "jod", "volume": d["volume"],
                            # discourse span; `page` below is where the hit
                            # actually sits, which is what you cite
                            "pages": d["pages"],
                            "page": exact_page(d, i),
                            "speaker": d["speaker"],
                            "date": d.get("date"), "title": d["title"],
                            "paragraph": i, "ratio": round(r, 3),
                            "url": d.get("url"),
                            "excerpt": para[max(0, s - 60):e + 60].strip(),
                        })
    if args.corpus in ("content", "all"):
        for path in content_files(args.edition):
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
            for trail, leaf in walk_units(doc):
                hit = find_phrase(leaf["text"], args.phrase, fuzzy=args.fuzzy)
                if hit:
                    s, e, r = hit
                    results.append({
                        "corpus": "content",
                        "edition": os.path.basename(os.path.dirname(path)),
                        "file": os.path.basename(path),
                        "locator": " > ".join(trail + [str(leaf.get("id", ""))]),
                        "ratio": round(r, 3),
                        "excerpt": leaf["text"][max(0, s - 60):e + 60].strip(),
                    })
    results.sort(key=lambda x: -x["ratio"])
    emit({"query": args.phrase, "count": len(results), "results": results[:args.limit]})


def cmd_pages(args):
    hits = jod_find_discourse(args.volume, args.page) if args.page else jod_discourses(args.volume)
    out = []
    for d in hits:
        chunks, source = jod_paragraphs(d)
        out.append({
            "meta": jod_meta(d, source),
            "chunks": [
                {"index": i, "page": c["page"],
                 "text": c["text"] if args.full else c["text"][:args.preview]}
                for i, c in enumerate(chunks)
            ],
        })
    emit({"matches": len(out), "discourses": out})


def cmd_extract(args):
    """Pull the exact span between two phrases, with citation metadata."""
    if args.corpus == "jod":
        candidates = (jod_find_discourse(args.volume, args.page) if args.page
                      else jod_discourses(args.volume))
        if not candidates:
            raise SystemExit("no JoD discourse covers volume %s page %s" % (args.volume, args.page))
        best = None
        for d in candidates:
            chunks, source = jod_paragraphs(d)
            got = extract_span(chunks, args.start, args.end)
            if got and (best is None or got["match"]["combined_ratio"] > best[0]["match"]["combined_ratio"]):
                best = (got, d, source)
        if best is None:
            raise SystemExit(
                "could not locate that span. Try `search` to find the phrase, "
                "or `pages` to read the discourse and check the wording."
            )
        got, d, source = best
        meta = jod_meta(d, source)
        meta["cited_pages"] = format_pages(got["pages"])
        emit({"meta": meta, **got})
        return

    # content editions
    found = []
    for path in content_files(args.edition):
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        chunks = [{"page": None, "text": leaf["text"], "locator": " > ".join(trail + [str(leaf.get("id", ""))])}
                  for trail, leaf in walk_units(doc)]
        got = extract_span(chunks, args.start, args.end)
        if got:
            found.append({
                "meta": {"corpus": "content",
                         "edition": os.path.basename(os.path.dirname(path)),
                         "file": os.path.basename(path),
                         "locator": chunks[got["chunk_range"][0]].get("locator")},
                **got,
            })
    if not found:
        raise SystemExit("could not locate that span in the content editions.")
    found.sort(key=lambda x: -x["match"]["combined_ratio"])
    emit(found[0])


def extract_span(chunks, start_phrase, end_phrase):
    """Slice from start_phrase to end_phrase across consecutive chunks.

    Chunks are joined with a single space, which is how a passage broken across
    a printed page break reads as continuous prose. The offsets of each join
    are reported so the caller can tell the user where the page turned.
    """
    texts = [c["text"] for c in chunks]

    # Join the chunks into continuous prose, recording where each one starts.
    #
    # Printed pages break words across the boundary with a hyphen ("cruelly
    # mas-" / "sacring them"). That hyphen is a typesetting artifact of the
    # break, not part of the word, so rejoining without it is what gives the
    # reading text — quoting "mas- sacring" would be wrong. Dehyphenations are
    # reported so they stay visible rather than being silently applied.
    joined = ""
    starts = []
    dehyphenated = []
    for i, t in enumerate(texts):
        if i == 0:
            starts.append(0)
            joined = t
            continue
        if joined.endswith("-") and t[:1].islower():
            joined = joined[:-1]
            starts.append(len(joined))
            # the rejoined word, for the caller to eyeball
            tail = joined.split()[-1] if joined.split() else ""
            dehyphenated.append((len(joined), (tail + t.split()[0]) if t.split() else tail))
            joined += t
        else:
            joined += " "
            starts.append(len(joined))
            joined += t

    s_hit = find_phrase(joined, start_phrase)
    if not s_hit:
        return None
    s0, _, s_ratio = s_hit

    tail = joined[s0:]
    e_hit = find_phrase(tail, end_phrase)
    if not e_hit:
        return None
    _, e_rel, e_ratio = e_hit
    e0 = s0 + e_rel

    # absorb the sentence-closing punctuation the user did not type
    while e0 < len(joined) and joined[e0] in TRAILING_PUNCT:
        e0 += 1
        break

    quote = joined[s0:e0]

    def chunk_of(off):
        k = 0
        for i, st in enumerate(starts):
            if st <= off:
                k = i
            else:
                break
        return k

    first, last = chunk_of(s0), chunk_of(e0 - 1)
    pages = [chunks[i].get("page") for i in range(first, last + 1)]
    breaks = []
    for i in range(first + 1, last + 1):
        b = starts[i] - s0
        if 0 < b < len(quote):
            breaks.append({
                "offset": b,
                "to_page": chunks[i].get("page"),
                "after_text": quote[max(0, b - 40):b].strip(),
            })

    return {
        "quote": quote,
        "pages": [p for p in pages if p is not None],
        "chunk_range": [first, last],
        "page_breaks": breaks,
        # only the rejoins that actually fall inside the quoted span
        "dehyphenated": [w for pos, w in dehyphenated if s0 <= pos < e0],
        "match": {
            "start_ratio": round(s_ratio, 3),
            "end_ratio": round(e_ratio, 3),
            "combined_ratio": round((s_ratio + e_ratio) / 2, 3),
            # Trimmed to a word boundary so the "you asked for X, the page says
            # Y" note reads as words rather than a severed fragment.
            "start_verbatim": trim_to_word(quote, len(start_phrase) + 10),
            "exact_start": s_ratio == 1.0,
            "exact_end": e_ratio == 1.0,
        },
    }


def cmd_entry(args):
    """Render a ready-to-paste quotes.md entry, optionally appending it.

    This exists so the quote text goes from the source file to the collection
    without a model retyping it in between. Retyping is exactly where a
    "verbatim" quote quietly stops being verbatim.
    """
    payload = capture(cmd_extract, args)
    meta, quote = payload["meta"], payload["quote"]

    if meta.get("corpus") == "journal-of-discourses":
        pages = meta.get("cited_pages") or meta.get("pages")
        date = meta.get("date")
        bits = ['— %s, "%s," Journal of Discourses %s:%s' % (
            meta["speaker"], meta["title"], meta["volume"], pages)]
        if date:
            bits.append(" (%s)" % date)
        if meta.get("reporter"):
            bits.append(", reported by %s" % meta["reporter"])
        bits.append(".")
        if meta.get("url"):
            bits.append(" " + meta["url"])
        citation = "".join(bits)
        short = "— %s, JD %s:%s%s" % (meta["speaker"], meta["volume"], pages,
                                      " (%s)" % date if date else "")
        source = "`data/texts/` — Journal of Discourses, jod.mrm.org transcription."
        heading = args.heading or "%s — %s (JD %s:%s)" % (
            meta["speaker"], (args.slug or meta["title"])[:60], meta["volume"], pages)
    else:
        citation = "— %s, %s (%s)." % (meta.get("edition"), meta.get("locator"), meta.get("file"))
        short = citation
        source = "`data/texts/content/%s/`" % meta.get("edition")
        heading = args.heading or "%s — %s" % (meta.get("edition"), meta.get("locator"))

    notes = list(args.note or [])
    if not payload["match"]["exact_start"]:
        notes.insert(0, 'Opens "%s" — differs from the wording requested.'
                     % payload["match"]["start_verbatim"].strip())
    for b in payload["page_breaks"]:
        notes.append('Crosses the page break to p. %s, mid-text after "%s".'
                     % (b["to_page"], b["after_text"]))
    if payload.get("dehyphenated"):
        notes.append("Rejoined across the page break, where the printing split "
                     "the word with a hyphen: %s."
                     % ", ".join('"%s"' % w for w in payload["dehyphenated"]))
    if meta.get("page_source") == "json":
        notes.append("No cached HTML for this discourse, so the printed page "
                     "could not be verified — the page range shown is the whole "
                     "discourse, not this passage.")
    if not notes:
        notes = ["Continuous passage — no ellipses, nothing omitted."]

    with open(os.path.join(SKILL_DIR, "assets", "entry-template.txt"), encoding="utf-8") as fh:
        template = fh.read()

    target = args.file or os.path.join(REPO_ROOT, "quotes.md")
    n = next_entry_number(target)
    rendered = template.format(
        n=n, heading=heading, source=source, quote=quote,
        citation=citation, short_cite=short,
        notes="\n".join("- %s" % x for x in notes),
    )

    if args.append:
        with open(target, "a", encoding="utf-8") as fh:
            fh.write(rendered)
        sys.stderr.write("appended entry %d to %s\n" % (n, target))
    sys.stdout.write(rendered)


def capture(fn, args):
    """Run a subcommand that emits JSON and return the parsed object."""
    import io
    buf, real = io.StringIO(), sys.stdout
    sys.stdout = buf
    try:
        fn(args)
    finally:
        sys.stdout = real
    return json.loads(buf.getvalue())


def next_entry_number(path):
    if not os.path.exists(path):
        return 1
    with open(path, encoding="utf-8") as fh:
        nums = [int(m) for m in re.findall(r"^## (\d+)\.", fh.read(), re.M)]
    return max(nums) + 1 if nums else 1


def trim_to_word(text, limit):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    sp = cut.rfind(" ")
    return cut[:sp] if sp > 0 else cut


def format_pages(pages):
    if not pages:
        return None
    lo, hi = min(pages), max(pages)
    # En dash for the range, matching the citation style used in the collection.
    return str(lo) if lo == hi else "%d–%d" % (lo, hi)


def emit(obj):
    json.dump(obj, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", help="find a phrase across the corpus")
    s.add_argument("phrase")
    s.add_argument("--corpus", choices=["jod", "content", "all"], default="all")
    s.add_argument("--volume", type=int, help="restrict to one JoD volume")
    s.add_argument("--edition", help="restrict to one content edition dir")
    s.add_argument("--limit", type=int, default=10)
    s.add_argument("--fuzzy", action="store_true",
                   help="tolerate misremembered wording; much slower over the "
                        "whole corpus, so narrow it with --volume/--edition")
    s.set_defaults(func=cmd_search)

    p = sub.add_parser("pages", help="show a JoD discourse mapped to printed pages")
    p.add_argument("volume", type=int)
    p.add_argument("page", type=int, nargs="?")
    p.add_argument("--full", action="store_true", help="full paragraph text")
    p.add_argument("--preview", type=int, default=110)
    p.set_defaults(func=cmd_pages)

    e = sub.add_parser("extract", help="pull the exact span between two phrases")
    e.add_argument("--corpus", choices=["jod", "content"], default="jod")
    e.add_argument("--volume", type=int)
    e.add_argument("--page", type=int)
    e.add_argument("--edition")
    e.add_argument("--start", required=True, help="opening words of the passage")
    e.add_argument("--end", required=True, help="closing words of the passage")
    e.set_defaults(func=cmd_extract)

    n = sub.add_parser("entry", help="render (and optionally append) a quotes.md entry")
    n.add_argument("--corpus", choices=["jod", "content"], default="jod")
    n.add_argument("--volume", type=int)
    n.add_argument("--page", type=int)
    n.add_argument("--edition")
    n.add_argument("--start", required=True)
    n.add_argument("--end", required=True)
    n.add_argument("--heading", help="entry heading; defaults to speaker + title")
    n.add_argument("--slug", help="short subject phrase used in the default heading")
    n.add_argument("--note", action="append",
                   help="repeatable; context, cautions, anything worth recording")
    n.add_argument("--file", help="target collection (default quotes.md)")
    n.add_argument("--append", action="store_true", help="write it to the collection")
    n.set_defaults(func=cmd_entry)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
