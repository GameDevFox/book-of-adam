import "@fontsource/noto-sans-deseret/deseret.css";

import { useEffect, useMemo, useState } from "react";

import { capital, small, type DeseretLetterName } from "./alphabet";
import lexiconData from "../../data/deseret-lexicon.json";
import { convertText, segmentsToString } from "./convert";
import { createLookup, loadDictionary, type Dictionary, type LexiconEntry } from "./dictionary";
import { READ_ONLY } from "../records/store";
import { DeseretPrimer } from "./DeseretPrimer";
import { MODERN_AMERICAN, PROFILE_KNOBS, type ConventionProfile } from "./profiles";
import { reverseSegmentsToString, reverseText } from "./reverse";

const LEXICON = lexiconData as LexiconEntry[];

/** "Be ye gay" — three words, three letters, the canonical demonstration of the rule. */
const LETTER_NAME_EXAMPLE: DeseretLetterName[] = ["BEE", "YEE", "GAY"];

const SAMPLE =
  "And it came to pass that I, Nephi, having been born of goodly parents, " +
  "therefore I was taught somewhat in all the learning of my father.";

/** An empty dictionary, so the UI renders (with everything unknown) before the fetch lands. */
const EMPTY: Dictionary = createLookup(
  { get: () => undefined, size: 0, invert: () => new Map() },
  LEXICON,
);

type Direction = "toDeseret" | "toEnglish";

/** A rendered piece of output, flattened from either direction's segment type. */
type Piece = { text: string; flagged: boolean; title?: string };

/** Words the tool could not resolve, most frequent first — the worklist for the lexicon. */
const gaps = (pieces: readonly Piece[]): { word: string; count: number }[] => {
  const counts = new Map<string, { word: string; count: number }>();
  for (const piece of pieces) {
    if (!piece.flagged) continue;
    const key = piece.text.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { word: piece.text, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
};

export const DeseretApp = () => {
  const [direction, setDirection] = useState<Direction>("toDeseret");
  const [text, setText] = useState(SAMPLE);
  const [profile, setProfile] = useState<ConventionProfile>(MODERN_AMERICAN);
  const [dictionary, setDictionary] = useState<Dictionary>(EMPTY);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    loadDictionary(undefined, LEXICON)
      .then((loaded) => {
        if (!live) return;
        setDictionary(loaded);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setError(String(cause));
        setStatus("error");
      });
    return () => {
      live = false;
    };
  }, []);

  const toDeseret = direction === "toDeseret";

  const pieces = useMemo<Piece[]>(() => {
    if (toDeseret) {
      return convertText(text, dictionary.lookup, profile).map((segment) => ({
        text: segment.text,
        flagged: segment.kind === "unknown",
        title: segment.kind === "unknown" ? "Not in the dictionary" : undefined,
      }));
    }
    return reverseText(text, dictionary.reverse).map((segment) => ({
      text: segment.text,
      flagged: segment.kind === "approx",
      title:
        segment.kind === "approx"
          ? "No dictionary match — sound it out"
          : segment.kind === "word" && segment.alternates.length > 0
            ? `also: ${segment.alternates.slice(0, 8).join(", ")}`
            : undefined,
    }));
  }, [toDeseret, text, dictionary, profile]);

  const unresolved = useMemo(() => gaps(pieces), [pieces]);

  /** Swapping carries the current output across, so a round trip is one click each way. */
  const swap = () => {
    const output = toDeseret
      ? segmentsToString(convertText(text, dictionary.lookup, profile))
      : reverseSegmentsToString(reverseText(text, dictionary.reverse));
    setText(output);
    setDirection(toDeseret ? "toEnglish" : "toDeseret");
  };

  return (
    <section className="deseret">
      <header className="deseret-intro">
        <h2>Deseret Alphabet</h2>
        <p>
          {toDeseret ? (
            <>
              English is looked up in CMUdict for its Standard American pronunciation, then that
              pronunciation is written in the Deseret Alphabet — the phonetic orthography developed
              under Brigham Young in the 1850s. Words the dictionary does not know stay in Latin and
              are marked; nothing here guesses.
            </>
          ) : (
            <>
              A decoding aid for reading Deseret, not a translation. Because the alphabet is
              phonetic, homophones are indistinguishable in it — <em>there</em> and <em>their</em>{" "}
              are the same string. The word offered is the one this corpus uses most; hover to see
              the others. Read it aloud and the ambiguity resolves itself.
            </>
          )}
        </p>
      </header>

      <div className="deseret-panes">
        <label className="deseret-pane">
          <span className="deseret-label">{toDeseret ? "English" : "Deseret"}</span>
          <textarea
            className={`deseret-input${toDeseret ? "" : " deseret-script"}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            rows={10}
          />
        </label>

        <div className="deseret-pane">
          <span className="deseret-label">{toDeseret ? "Deseret" : "English"}</span>
          <output className={`deseret-output${toDeseret ? " deseret-script" : ""}`}>
            {status === "loading" && <em className="deseret-status">Loading dictionary…</em>}
            {status === "error" && (
              <em className="deseret-status deseret-error">
                Could not load the dictionary: {error}
              </em>
            )}
            {pieces.map((piece, i) => (
              <span
                key={i}
                className={piece.flagged ? "deseret-unknown" : piece.title ? "deseret-alts" : ""}
                title={piece.title}
              >
                {piece.text}
              </span>
            ))}
          </output>
        </div>
      </div>

      <div className="deseret-swap">
        <button type="button" onClick={swap} disabled={status !== "ready"}>
          ⇄ {toDeseret ? "Deseret → English" : "English → Deseret"}
        </button>
        <span className="deseret-hint">Carries the current result across.</span>
      </div>

      {toDeseret ? (
        <div className="deseret-conventions">
          <h3>Conventions</h3>
          <p className="deseret-hint">
            Three sounds a modern pronouncing dictionary cannot settle on its own. Defaults are the
            modern reading; the alternates are what the 1869 printing did.
          </p>
          {PROFILE_KNOBS.map((knob) => (
            <label key={knob.key} className="deseret-knob">
              <span>{knob.label}</span>
              <select
                value={profile[knob.key]}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, [knob.key]: event.target.value }))
                }
              >
                {knob.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.note}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="deseret-knob deseret-check">
            <input
              type="checkbox"
              checked={profile.letterNames}
              onChange={(event) =>
                setProfile((current) => ({ ...current, letterNames: event.target.checked }))
              }
            />
            <span>
              Write a word as one letter when it sounds like that letter&rsquo;s name —{" "}
              <span className="deseret-inline">be ye gay</span> becomes{" "}
              <span className="deseret-inline">
                {LETTER_NAME_EXAMPLE.map((letter) => capital(letter)).join(" ")}
              </span>
              . The 1869 printing does this constantly.
            </span>
          </label>

          <label className="deseret-knob deseret-check">
            <input
              type="checkbox"
              checked={profile.shortForms}
              onChange={(event) =>
                setProfile((current) => ({ ...current, shortForms: event.target.checked }))
              }
            />
            <span>
              Use the one-letter forms the 1869 printing gives three function words —{" "}
              <span className="deseret-inline">the</span> becomes{" "}
              <span className="deseret-inline">{small("THEE")}</span>,{" "}
              <span className="deseret-inline">a</span> becomes{" "}
              <span className="deseret-inline">{small("LONG_A")}</span>,{" "}
              <span className="deseret-inline">O</span> becomes{" "}
              <span className="deseret-inline">{small("LONG_O")}</span>. The last two are
              19th-century vowel choices rather than modern ones.
            </span>
          </label>
        </div>
      ) : (
        <p className="deseret-hint deseret-conventions">
          Reading is deliberately liberal and ignores the settings above: it accepts{" "}
          <span className="deseret-inline">{small("SHORT_AH")}</span> and{" "}
          <span className="deseret-inline">{small("LONG_A")}</span> alike, and always honours the
          one-letter shorthands — text from the 1869 printing uses them regardless of how this app
          is set to write.
        </p>
      )}

      <DeseretPrimer />

      <footer className="deseret-footer">
        <p>
          {dictionary.size.toLocaleString()} dictionary entries, {dictionary.curated} curated.
        </p>
        {unresolved.length > 0 && (
          <div className="deseret-worklist">
            <h3>
              {toDeseret
                ? `Not in the dictionary (${unresolved.length})`
                : `Sounded out, no dictionary match (${unresolved.length})`}
            </h3>
            <p className="deseret-hint">
              {toDeseret ? (
                READ_ONLY ? (
                  <>
                    These words have no pronunciation in the dictionary yet, so they stay in the
                    Latin alphabet.
                  </>
                ) : (
                  <>
                    Add these to <code>data/deseret-lexicon.json</code> with a source to convert
                    them.
                  </>
                )
              ) : (
                <>These are phonetic approximations, not words — read them aloud.</>
              )}
            </p>
            <ul>
              {unresolved.map(({ word, count }) => (
                <li key={word}>
                  {word}
                  {count > 1 && <span className="deseret-count"> ×{count}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </footer>
    </section>
  );
};
