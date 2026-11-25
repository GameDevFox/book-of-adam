# Discrepancies

Source conflicts found while gathering data — the working log for facts where reputable sources
disagree. Each entry names the fact path (the same path the review table uses), the competing
claims, and where things stand. The short version of each conflict also lives on the record
itself (the `note` on the affected `born`/`died` event), so it's visible in the review UI.

Workflow: when research (or your own review) turns up a source conflict, log it here, keep the
record's `note` in sync, and mark the fact **disputed** in the app until it's resolved. When an
entry is resolved, record the resolution and the winning source, update the data, and clear the
dispute.

Status legend: **open** — unresolved; **resolved** — data reflects the resolution noted.

---

## william-w-phelps.died.date — open

- **Mar 7, 1872** — Wikipedia's article lead, the Joseph Smith Papers, and the Deseret News
  obituary (published Mar 13, 1872).
- **Mar 17, 1872** — Wikipedia's infobox (internally inconsistent with its own lead).

Data currently records **1872-03-07** with `circa: true`. Likely resolution: the infobox is
simply wrong; could be settled by checking the obituary text or a headstone record.

## james-j-strang.died.date — open

- **Jul 9, 1856** — Wikipedia.
- **c. Jun 26, 1856** — Joseph Smith Papers biography (shot at Beaver Island Jun 16, died at
  Voree, Wisconsin).

Data currently records **1856-07-09** with `circa: true`. The JSP "ca." suggests their date is
the less certain one, but the ~2-week gap is odd; worth checking a Strangite or scholarly
biography (e.g. Speek, _God Has Made Us a Kingdom_).

## wilford-woodruff.born.place — open

- **Avon, Connecticut** — Wikipedia (born in the part of Farmington that later became Avon).
- **Farmington, Connecticut** — Joseph Smith Papers.

Not a true conflict — the same spot under two names (Avon split from Farmington in 1830, after
his 1807 birth). Data records **Avon** with a note. Resolution is a style choice: place-name as
of the event date (Farmington) vs. modern name (Avon).

## parley-p-pratt.died.place — open

- **Near Alma, Arkansas** — Wikipedia.
- **Near Van Buren, Arkansas** — Joseph Smith Papers.

Both in Crawford County; the murder site is between the two. Data records **near Alma** with a
note.

## granville-hedrick.born.place — open

- Wikipedia gives the birth date but **no birthplace**.
- **Clark County, Indiana** — Addams & Baugh, _The Historical and Geographical Beginnings of
  the Church of Christ (Temple Lot)_.

Data records Clark County, Indiana with a note. The birth date (1814-09-02) matches his grave
marker.

## granville-hedrick.died.place — open

- **Independence, Missouri** — Wikipedia.
- Resided in **Johnson County, Kansas** until his death — Addams & Baugh.

He's buried at Hedrick Cemetery, Independence, which may explain the Wikipedia claim. Data
records Independence with a note.
