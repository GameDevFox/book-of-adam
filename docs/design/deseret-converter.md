# English → Deseret Alphabet converter — design

A converter that takes English text, looks up each word's pronunciation, and maps that
pronunciation onto the Deseret Alphabet — the phonetic orthography developed under Brigham
Young and the Board of Regents of the University of Deseret in the 1850s. Offline-friendly
after one cached download.

The default output register is modern Standard American English. Other registers (1869
attested spelling, British English, other accents) are designed for but deliberately not
built first; see [Register](#register-why-the-mvp-is-modern-not-1869).

## Prior art

Four transliterators exist and none is reusable here:

- **[Lingua::EN::Alphabet::Deseret](https://metacpan.org/dist/Lingua-EN-Alphabet-Deseret)** —
  Perl, CMUdict-driven. Closest structural match; its documented caveat (one Deseret vowel
  cannot be produced because CMUdict does not distinguish it) is the same one we hit below.
- **[deseret.in](https://github.com/sam1am/deseret.in)** — PHP over the Moby pronunciation list.
- **[2deseret.com](https://www.2deseret.com/api)** — closed REST API, transliteration rules
  undocumented.
- **[Illinois Deseret Consortium](http://faculty.las.illinois.edu/rshosted/deseret.html)** —
  not a converter but a research archive: the complete 1869 Deseret Alphabet Book of Mormon
  transcribed (June 2026) in Unicode and in a SAMPA parallel, plus a comparative lexicon of
  attested spellings with occurrence counts and citations.

All are server-side; none is an offline JS/TS library. **Borrow the data, build the converter.**

## The pipeline

```
text → tokens → PHONEMES → Deseret graphemes
                stage 2     stage 3
```

Phonemes are the intermediate representation and are never collapsed. Swapping stage 2 gives
another accent; swapping stage 3 gives another orthographic convention. Store `word → phonemes`,
never `word → Deseret` — pre-baking the Deseret form is smaller and faster and forecloses both
extensions.

## The letter inventory

Verified against the Unicode Character Database 16.0, not from secondary sources (the Wikipedia
table silently omits Short I and misorders the sibilants).

- 40 letters: **U+10400–U+10427** uppercase, **U+10428–U+1044F** lowercase.
- Case is a clean offset: `lower = upper + 0x28`.
- The last two — **𐐦 OI** (U+10426) and **𐐧 EW** (U+10427) — were never cast in metal type.
  The IDC transcription key marks both `N/A`. Write digraphs instead.

## Stage 2 — pronunciation

**CMUdict**: public domain, 126,052 entries after dropping alternate pronunciations, ARPAbet
with stress digits. Stress matters more than it looks: `AH0` is schwa and `AH1`/`AH2` are /ʌ/,
so CMUdict *can* locate the schwa — it just cannot say what to write there.

## Stage 3 — phonemes → Deseret

The mapping is unambiguous for 36 of the 39 ARPAbet phonemes. IDC SAMPA is given for
cross-reference against their transcriptions.

| ARPAbet | IPA | Deseret | letter name | SAMPA |
|---|---|---|---|---|
| AA | ɑ | 𐐪 | Long A | `A` / `Q` |
| AE | æ | 𐐰 | Short A | `a` |
| AH | ʌ, ə | 𐐲 | Short O | `V` |
| AO | ɔ | 𐐫 | Long Ah | `O` |
| AW | aʊ | 𐐵 | Ow | `AU` |
| AY | aɪ | 𐐴 | Ay | `AI` |
| B | b | 𐐺 | Bee | `b` |
| CH | tʃ | 𐐽 | Chee | `c` |
| D | d | 𐐼 | Dee | `d` |
| DH | ð | 𐑄 | Thee | `D` |
| EH | ɛ | 𐐯 | Short E | `E` |
| ER | ɝ | 𐐲𐑉 | Short O + Er | `Vr` |
| EY | eɪ | 𐐩 | Long E | `e` |
| F | f | 𐑁 | Ef | `f` |
| G | ɡ | 𐑀 | Gay | `g` |
| HH | h | 𐐸 | H | `h` |
| IH | ɪ | 𐐮 | Short I | `I` |
| IY | i | 𐐨 | Long I | `i` |
| JH | dʒ | 𐐾 | Jee | `j` |
| K | k | 𐐿 | Kay | `k` |
| L | l | 𐑊 | El | `l` |
| M | m | 𐑋 | Em | `m` |
| N | n | 𐑌 | En | `n` |
| NG | ŋ | 𐑍 | Eng | `N` |
| OW | oʊ | 𐐬 | Long O | `o` |
| OY | ɔɪ | 𐐫𐐮 | Long Ah + Short I | `QI` |
| P | p | 𐐹 | Pee | `p` |
| R | ɹ | 𐑉 | Er | `r` |
| S | s | 𐑅 | Es | `s` |
| SH | ʃ | 𐑇 | Esh | `S` |
| T | t | 𐐻 | Tee | `t` |
| TH | θ | 𐑃 | Eth | `T` |
| UH | ʊ | 𐐳 | Short Oo | `U` |
| UW | u | 𐐭 | Long Oo | `u` |
| V | v | 𐑂 | Vee | `v` |
| W | w | 𐐶 | Wu | `w` |
| Y | j | 𐐷 | Yee | `y` |
| Z | z | 𐑆 | Zee | `z` |
| ZH | ʒ | 𐑈 | Zhee | `Z` |

Note `Y UW` → 𐐷𐐭 and `OY` → 𐐫𐐮 as digraphs, because 𐐧 and 𐐦 were never cast. The 1869
printing uses 𐐱𐐮 for `OY` (`QI` in IDC SAMPA); 𐐫𐐮 is the modern-phonetic form.

### Letter-name shorthand

A word pronounced exactly like a letter's **name** may be written as that single letter:
*be ye gay* → 𐐒 𐐏 𐐘. This is not a shortcut we invented — the 1869 Book of Mormon leans on it
constantly, with 𐐒 standing alone as a word **2,515 times** and 𐐏 **2,005 times** in its 273k
tokens.

Across the Book of Mormon and Journal of Discourses together it applies to **39 word types and
143,119 tokens**, dominated by *be* (60,960), *ye* (4,231), *thee* (1,166) and *tea* (234).
(*I* and *eye* are already single letters without the rule, since /aɪ/ is one phoneme.)

Matching is on **sound, not spelling** — the word's phonemes are compared to the letter name's,
ignoring stress — so it generalizes to any homophone rather than a hardcoded word list. Three
letters are excluded: 𐐦 OI and 𐐧 EW were never cast in type, and 𐐐 H's spoken name is given as
bare "H", which does not say whether that is "aitch" or "hee" — guessing would put an invented
pronunciation into the output. (𐐡 was excluded for the same reason until its name was sourced
as "Ur"; see [the primer](#the-letter-primer).) The twelve long/short vowels are excluded
structurally — their names are two words ("Long I"), so no single word can sound like them.

On by default, with a toggle.

### One-letter function words

A second, related convention, on its own toggle. The 1869 printing gives three function words a
single-letter form: **𐑄** for *the* (19,681 occurrences — 7% of the whole text), **𐐪** for *a*
(2,167), **𐐬** for *O* (275).

Unlike the letter-name rule this is keyed on the **English word, not the phonemes**, because it
is not derivable: *the* drops its schwa, while *a* and *O* are vowel choices rather than
reductions. They are attested spellings, so they are stored as a three-entry table.

That list is exhaustive, and establishing it took reading the corpus rather than assuming.
Every *other* single-letter word in the 1869 printing turned out not to be a word at all: `z`
and `s` are the possessive clitic split off from its noun (*nifAI z abrIjmEnt* — "Nephi's
abridgment", with the voiced/voiceless allomorph written correctly), `I` and `V` are roman
numerals in chapter headings, and `h` is a middle initial.

Caveat worth keeping visible: *a* → 𐐪 is a 19th-century vowel choice, not a modern one — modern
American reduces the article to a schwa, 𐐲. It rides along with the register-neutral *the* → 𐑄,
so the toggle is the escape hatch for a strictly modern reading. *O* → 𐐬 is a no-op: /oʊ/ is one
phoneme, so it is already a single letter.

### The letter primer

A collapsible chart of all forty letters on the page — majuscule and minuscule, spoken name,
IPA value, and an example word — grouped as the block itself is ordered (long vowels, short
vowels, diphthongs and glides, consonants, then the two never cast in type).

It is generated from `DESERET_LETTERS`, the same table the converter runs on, so the chart
cannot drift from the behaviour it documents. The group boundaries live in `alphabet.ts` as
index ranges rather than a second hand-kept list, and a test asserts they tile 0–40 exactly.

Two letter names came from the Illinois Deseret Consortium's character chart and corrected what
Unicode implies: 𐐎 is **"Woo"**, and 𐐡 is **"Ur"** — not "Er". Their chart notes that original
publications rarely state names outright, so some are standardized or inferred; the same caveat
is shown to the reader. Vowel examples use the standard Wells lexical sets (FLEECE, TRAP,
STRUT…), which is how phoneticians name these vowels.

Sourcing "Ur" closed an open gap: 𐐡 had been excluded from the letter-name shorthand precisely
because its spoken name was unknown, and it now participates. Only *er*, *ur* and *eure* are
pronounced /ɝ/ alone, so the practical effect is small — but the rule is no longer arbitrary.
𐐐 H remains excluded: its name is given as bare "H", which does not say whether that is "aitch"
or "hee".

### The three ambiguous slots

Exposed in the UI as a small menu. Defaults are the modern-register choice; each alternate is
the historically attested one, so the same knobs serve the later 1869 profile.

| slot | default | why | alternate |
|---|---|---|---|
| `AA` | 𐐪 everywhere | Modern American has the father–bother merger — *God* and *father* share /ɑ/. 𐐱 (/ɒ/, rounded) is not a sound modern American has. | 𐐱 for LOT/CLOTH words (1869, and British-leaning) |
| `AH0` (schwa) | 𐐲 | Nearest phonetic match; Deseret has no schwa letter at all. | Spelling-driven — reconstruct the vowel from English orthography, as 1869 did |
| `ER` | 𐐲𐑉 stressed and unstressed | Modern American merges them; 1869 agrees on stressed (`wVrd`, `fVrst`, `wVrk`) | 𐐯𐑉 when unstressed, per 1869's spelling-driven `-er` |

## Register — why the MVP is modern, not 1869

Decided by measurement. Rendering the 2,000 most frequent Book of Mormon words through CMUdict
and the table above reproduces only **64–70% of the running text** of the 1869 Deseret Alphabet
Book of Mormon.

The disagreements are categorical, not variable — the modern form essentially never appears:

| word | modern-derived | 1869 attested | occurrences of ours in 273k tokens |
|---|---|---|---|
| the | `DV` | `D` (19,681) | **0** |
| of | `Vv` | `Qv` (12,352) | **0** |
| people | `pipVl` | `pipl` (1,773) | **0** |
| among | `VmVN` | `amVN` (580) | **0** |
| father | `fQDEr` | `fADEr` (560) | **0** |
| which | `wIc` | `hwIc` (2,221) | **1** |

Four systematic 19th-century differences account for most of the gap:

1. **Unstressed vowels follow English spelling**, not phonetic reduction — `amVN`, `akOrdIN`,
   `bifor`, `agEnst`. This is the documented historical practice: write the vowel the syllable
   would carry if stressed.
2. **Syllabic consonants take no vowel** — `pipl`, `spokn`, `ivn`, where CMUdict inserts `AH0`.
3. **Word-final unstressed *-y* is 𐐮, not 𐐨** — `holI`, `sItI`, `tEstImonI`.
4. **No wine/whine merger** — `hwIc` 2,221 vs `wIc` 1.

None of it is recoverable from a modern pronouncing dictionary; it is a different accent.
Closing the gap needs an attested-spelling lexicon (top-10 word overrides reach 86%, top-50
91%, top-200 96%), which makes the historical register a **lexicon product, not an algorithm
product** — a good thing to build, but a different build, and one that needs Consortium
permission first (see [Licensing](#licensing-posture)).

Modern register, by contrast, is definitionally accurate — CMUdict is its ground truth — and
works on arbitrary input rather than only 1869 vocabulary.

## Out-of-vocabulary words

Measured token coverage on two corpora already in `data/texts/content/`:

| layer | Book of Mormon | Journal of Discourses |
|---|---|---|
| CMUdict alone | 97.52% | 99.33% |
| + morphology (stem+suffix) | 98.23% (+0.70%) | 99.59% (+0.27%) |
| + 25 curated words | 99.34% (+1.11%) | 99.70% |
| + 100 curated words | 99.75% | 99.78% |
| + 500 curated words | 100.00% | 99.88% |

**25 hand-typed entries beat an entire morphological engine** on the Book of Mormon, and they
are trivially correct — no silent-e stem rules, no voicing assimilation on *-s*/*-ed*, no edge
cases. So the MVP is:

1. **CMUdict** — 97.5–99.3% of tokens.
2. **A curated lexicon**, sourced rather than invented (see below).
3. **Mark and pass through** — anything still unknown renders in Latin, visibly flagged, never
   silently guessed. For a research corpus an honest gap beats a confident invention.

General morphology is **deferred**, not rejected: its value rises on arbitrary modern text
rather than on this corpus.

### The name lexicon, from the Pronunciation Guide

The official **Book of Mormon Pronunciation Guide** (printed in the scriptures since 1981) is a
closed respelling system with a published key, so converting it to ARPAbet is mechanical rather
than a judgement call:

`a`→AH0 (schwa) · `ă`→AE · `ā`→EY · `ä`→AA · `ĕ`→EH · `ē`→IY · `er`→ER · `ĭ`→IH · `ī`→AY ·
`ō`→OW · `ou`→AW · `u`→AH · `ū`→UW, with `ʹ` closing the stressed syllable, `-` between
syllables, `–` joining compounds.

`scripts/build-name-lexicon.mjs` parses the guide into **340 entries** — *Nephi* nēʹfī →
`N IY1 F AY0`. Two details earn their keep: the stress mark is *also* a syllable boundary
(`ămʹyū-lĕk` is ăm-yū-lĕk, not ămyū-lĕk), and an unrecognized character fails the whole entry
rather than being skipped, because a silently dropped sound is a wrong pronunciation presented
as a right one. Nothing here is generated from memory.

**Plurals.** The guide lists singulars, but the corpus runs on plurals — *Lamanites* (896) and
*Nephites* (623) are the two most frequent words CMUdict misses. The English plural allomorph
is fully determined by the final phoneme (sibilant → `IH0 Z`, voiceless → `S`, else `Z`), so
the script derives **308 plurals**, skipping any word CMUdict already covers rather than
overriding a better source with a derived form.

Result: **650 entries**, taking Book of Mormon token coverage from **97.52% to 98.91%**. What
remains is archaic KJV vocabulary (*saith* 187, *insomuch* 181, *verily* 76) and, in the JoD,
Restoration terms (*exaltation* 739, *nauvoo* 451) — a separate source hunt.

**Licensing note.** The guide is modern study apparatus (© Intellectual Reserve), not
public-domain scripture text; the bcbooks dataset this project ingests deliberately excludes
that apparatus. The judgement taken here, deliberately, is that individual pronunciations are
facts, the stored form is a different notation, the selection is ours, and every entry cites
the guide. Recorded so the decision is visible rather than accidental.

Homographs (*read*, *lead*, *record*, *present*) are a known gap. CMUdict lists variants
without part-of-speech, so v1 takes the first pronunciation and flags the word as ambiguous
rather than pretending to disambiguate.

## The reverse direction — Deseret → English

A **decoding aid for people learning the alphabet**, not a translator. The bar is phonetic
fidelity, not word identity: as long as the English offered *sounds like* what is written, the
reader can say it aloud and settle the rest themselves — which is how a 19th-century reader did
it. `src/deseret/reverse.ts`, with a swap button that carries the current result across.

**Ambiguity is inherent, not a defect.** Deseret is phonetic, so homophones are the same string
and nothing recovers which was meant. Measured over CMUdict and the corpora: **11.4%** of
distinct pronunciations are shared by more than one word, covering **40.0%** of corpus tokens.
Every alternate is carried on the segment and shown on hover, so the reader chooses.

**Ranking decides which homophone leads**, using word frequency from this project's own
public-domain corpora (`scripts/build-frequency.mjs` → `public/deseret/frequency.txt`, 22 kB
gzipped). Only *contested* words need a rank, which is what keeps the asset small. The bias
toward scriptural English is deliberate — that is the register this tool reads. So 𐑄𐐯𐑉 offers
*their* first, because scripture uses it more than *there*; both are correct aloud.

Three things the implementation has to get right, each of which broke first:

- **Parsing branches.** A letter pair is only *maybe* a digraph: 𐐯𐑉 is `ER` in the 1869
  convention but `EH` + `R` in the modern one. Committing to either loses real words — reading
  it only as `ER` cost *there* and *zarahemla*. Every parse is produced and the dictionary
  settles which is a word.
- **Ranking is global, not per-parse.** 𐑄𐐯𐑉 also parses as *thur*, a real CMUdict word. Taking
  the first *valid* reading would let it beat all three of *their* / *there* / *they're*, so all
  readings are merged and ranked together.
- **Grouping is stress-insensitive, in the app and the build script alike.** 𐐲 is written for
  both the schwa of *about* and the wedge of *up*. *in* is `IH0 N` and *inn* is `IH1 N` —
  different packed codes, identical sound. The frequency script originally grouped by raw codes,
  so *in* never looked contested, went unranked, and lost to a word used six times in 7M tokens.

Parsing is deliberately **liberal** and ignores the forward conventions — it accepts 𐐱 and 𐐪
alike, and always honours the one-letter shorthands — because pasted 1869 text uses them
regardless of how the app is set to write.

Unmatched pronunciations fall back to a sound-it-out spelling (𐐤𐐨𐑁𐐴 → *neefy*), flagged as an
approximation. It fires rarely, since the 650-entry name lexicon is in the reverse index too.

**Round-tripping is the strongest test in the suite.** Real text goes forward to Deseret and
back, and every returned word must re-encode to exactly the Deseret it came from. That checks
the whole pipeline end to end, and it caught two of the three bugs above.

## Delivery

Compact encoding: one character per phoneme plus a stress-0 flag (the bit schwa handling
needs). **2.00 MB raw, ~750 KB gzipped** for all 126,052 entries — roughly the weight of two
web fonts. Raw `cmudict.dict` gzips to 0.92 MB and a naive JSON map to 0.94 MB, so the
encoding earns its keep but is not decisive.

Because the whole dictionary is that small, there is no frequency-ranked core chunk and no
long-tail split. Ship it whole, as a plain static asset with a long `Cache-Control`, parsed
eagerly into a `Map` on first use. That satisfies "offline after an initial cached download"
with no service worker and no new dependency.

A service worker would make memorial installable and truly network-free, but that is a
decision about the whole app — manifest, registration lifecycle, update strategy,
stale-worker handling — and should not ride in on this feature. Revisit deliberately.

Eager parse costs ~20–30 MB of heap and a few hundred milliseconds. A binary format with a
searchable index avoids materializing it, and is worth reaching for only if this proves
measurably slow on a real device.

## Fonts

Almost no operating system ships Deseret glyph coverage, so without a bundled font the app
renders tofu and nothing else matters. **[Noto Sans Deseret](https://www.npmjs.com/package/@fontsource/noto-sans-deseret)**,
SIL OFL 1.1, is publishable and available via Fontsource. Deseret is 80 glyphs, so a woff2
subset is a few tens of KB. This is a v1 requirement, not polish.

## Licensing posture

**memorial is intended for publication — treat everything written into the repo as immediately
public.** Consequences for this feature:

- Runtime data is **CMUdict only** (public domain, no attribution burden).
- **espeak-ng is ruled out.** It is GPLv3, and linking it into a published web app would put
  memorial under GPL. Same for any other copyleft G2P engine. Flite's letter-to-sound trees
  are BSD and remain an option if morphology is ever insufficient.
- The IDC transcriptions are licensed "for educational and personal use but not for
  publication." **Nothing IDC-derived enters the repo or the bundle.** The evaluation script is
  ours and is committed; the corpus is not, and the comparison test skips when the file is
  absent, with a documented fetch step.
- Statistics and short illustrative forms (the table above) are facts *about* the work rather
  than the work — publishable as scholarly commentary, using IDC's requested citation:

  > Illinois Deseret Consortium. 2022–2026. Deseret (Unicode) transcription of 𐐜 𐐒𐐳𐐿 𐐱𐑂
  > 𐐣𐐫𐑉𐑋𐐲𐑌 [Dh Bük ôv Mormun] (1869), translated by Joseph Smith, Jr. Accessed \<DATE\>, from
  > http://faculty.las.illinois.edu/rshosted/deseret.html.

- The historical-register profile needs Consortium permission **before** it is built, not
  after. Writing to them is a prerequisite for that phase, not an optional courtesy.

## Layout

Mirrors the timeline's layering — a pure, DOM-free, unit-tested core with a swappable consumer.

```
src/deseret/
  alphabet.ts       40 letters, codepoints, case mapping (+0x28)   pure, tested
  profiles.ts       convention profiles — modern default, the three knobs
  convert.ts        phonemes → Deseret under a profile              pure, tested
  dictionary.ts     parse + lookup + fetch (the impure edge)        parse is pure, tested
  DeseretApp.tsx    the sub-app
scripts/
  build-cmudict.mjs      download CMUdict, emit the packed encoding
public/deseret/
  cmudict.txt            generated, committed (public domain)
data/
  deseret-lexicon.json           curated entries
  deseret-lexicon.reviews.json   review sidecar
  deseret/sources/raw/           the CMUdict download — regenerable, gitignored
```

`convert.ts` takes phonemes plus a profile and returns a string, so profile knobs are ordinary
parameters in a test table.

Two placement notes. The built dictionary lives in **`public/`, not `data/`**: `data/` holds
reviewable facts, and CMUdict is neither reviewed nor ours — it is a static asset the browser
fetches. The curated lexicon is the opposite and sits in `data/` as an ordinary collection
(`deseret-lexicon`), which the generic data API already serves with no plugin change. It is
**imported** rather than fetched, because the data API is dev-only and the lexicon has to
survive a production build.

### The dictionary file format

Self-describing, so the loader and the build script cannot drift: the header carries the code
alphabet and the symbol each character stands for, and `parseDictionary` builds its decode
table from the file itself.

```
#deseret-cmudict v1
#source https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict @ <sha>
#entries 126052
#alphabet ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%abcdefghijklmno
#symbols AA AE AH … ZH AA0 AE0 AH0 … UW0
'bout PE6
```

One character per phoneme. Only vowels take a stress digit in CMUdict, so only vowels need a
second code band: 15 full vowels, 24 consonants, 15 reduced vowels — 54 single-byte codes.
Primary and secondary stress collapse into the full band, since the converter and every planned
profile care whether a vowel is REDUCED, not whether it is primary or secondary. Entries are
kept as their packed code string and decoded per lookup rather than expanded into 126k arrays.

## Phases

**Phase 1 (MVP).** Standalone sub-app registered in `src/apps.ts`: paste English, get Deseret,
with the three convention knobs exposed as a small menu. Bundled font. Curated lexicon.
Unknown words flagged. This is the smallest genuinely useful version and it does not touch the
Library reader's internals.

**Phase 2.** Library integration — a toggle rendering any edition in Deseret. The more
compelling product, but it couples to the reader's rendering path and unit-tree traversal, and
it should not ship until conversion has proven itself on pasted text.

**Phase 3 and beyond, in rough order of value.**

- Morphological stem+suffix rules, for arbitrary text beyond this corpus.
- Homograph disambiguation via part-of-speech tagging.
- The historical 1869 register as a second convention profile — pending IDC permission.
- Additional accents (British English) by swapping the stage-2 dictionary.
- The curated lexicon promoted to its own reviewable sub-app, each pronunciation carrying a
  source and a verdict like every other fact in memorial. Worth building when the lexicon
  grows; for ~100 entries a hand-maintained JSON file and the integrity test are plenty.
