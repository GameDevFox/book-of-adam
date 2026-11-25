import { useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";

import { isReference, referenceUrl, suggestions } from "./reference";
import { searchUrl } from "./text-search";

const LIST_ID = "reference-suggestions";
const LETTER_RE = /\p{L}/u;
const optionId = (i: number) => `${LIST_ID}-${i}`;

/**
 * The header's search field: type a reference ("1 Ne 3:7", "JD 1:62"), Enter opens it; type
 * anything else and Enter searches the text for it (SearchResults). Once a
 * chapter is typed and only a few books fit, a dropdown lists them as full references
 * (reference.ts suggestions); ↑/↓ choose, Enter or a click opens, Esc closes.
 */
export const ReferenceSearch = () => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [missed, setMissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rows = open ? suggestions(text) : [];
  const shown = rows.length > 0;

  const go = (url: string) => {
    navigate(url);
    setText("");
    setOpen(false);
    // Off the field, so a phone's keyboard closes and the passage is in view.
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false);
    if (!shown || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    setActive((i) => (i + step + rows.length) % rows.length);
  };

  return (
    <form
      className="reference-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        // A reference opens; other words search the text; digits alone ("3:7") name no book.
        const url = shown
          ? rows[Math.min(active, rows.length - 1)].url
          : isReference(text)
            ? referenceUrl(text)
            : LETTER_RE.test(text)
              ? searchUrl(text)
              : null;
        setMissed(!url);
        if (url) go(url);
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-label="Search the Library, or go to a reference"
        aria-invalid={missed || undefined}
        aria-expanded={shown}
        aria-controls={LIST_ID}
        aria-autocomplete="list"
        aria-activedescendant={shown ? optionId(active) : undefined}
        placeholder="Search, or go to 1 Ne 3:7"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setMissed(false);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={LIST_ID} role="listbox" className="reference-suggestions" hidden={!shown}>
        {rows.map((row, i) => (
          <li
            key={row.url}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // mousedown would blur the field and close the list before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(row.url)}
          >
            {row.label}
          </li>
        ))}
      </ul>
    </form>
  );
};
