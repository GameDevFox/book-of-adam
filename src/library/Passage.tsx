import type { MouseEvent } from "react";

import type { TextUnit } from "../records/texts";
import { isOrnamentUnit, lineIndent, textLines, unitLabel } from "./labels";

/** Each indent level is this much: the source's tab, as one step in from the line's edge. */
const INDENT_EM_PER_LEVEL = 1.5;

type Props = {
  unit: TextUnit;
  /** Its number in a selection (`?verse=`, selection.ts); null when it has none (not selectable). */
  number: number | null;
  selected: boolean;
  /** A click or tap selects it, or deselects it; Shift+click a range (useVerseSelection). */
  onToggle: (n: number, event: MouseEvent) => void;
};

/**
 * One unit of text with its label. Text set in lines (a stanza, a list of signatures) shows
 * line by line, each wrapped line hanging under its first and indented as the source indents
 * it; prose shows as one paragraph; a divider shows its ornament, centred and unnumbered.
 * A numbered passage is selectable: a click or tap toggles it.
 */
export const Passage = ({ unit, number, selected, onToggle }: Props) => {
  const text = unit.text ?? "";
  // A divider between sections of a poem: the ornament itself, centred, unnumbered.
  if (isOrnamentUnit(unit.id)) {
    return (
      <p className="passage ornament" role="separator">
        {text}
      </p>
    );
  }
  const lines = textLines(text);
  const label = <span className="unit-id">{unitLabel(unit.id)}</span>;
  const lined = lines.length > 1 || lineIndent(text).level > 0;
  const selectable = number !== null;
  const props = {
    className: ["passage", selectable && "selectable", lined && "lined", selected && "highlighted"]
      .filter(Boolean)
      .join(" "),
    "data-unit": unit.id,
    ...(selectable && {
      "data-verse": number,
      "aria-pressed": selected,
      onClick: (event: MouseEvent) => onToggle(number, event),
      // Shift+click extends a selection of passages, not the browser's text selection.
      onMouseDown: (event: MouseEvent) => {
        if (event.shiftKey) event.preventDefault();
      },
    }),
  };
  if (!lined) {
    return (
      <p {...props}>
        {label}
        {text}
      </p>
    );
  }
  return (
    <p {...props}>
      {lines.map((line, i) => {
        const { text: lineText, level } = lineIndent(line);
        return (
          <span
            key={i}
            className="text-line"
            style={level ? { marginLeft: `${level * INDENT_EM_PER_LEVEL}em` } : undefined}
          >
            {i === 0 && label}
            {lineText}
          </span>
        );
      })}
    </p>
  );
};
