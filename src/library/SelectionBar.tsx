import { useEffect, useState } from "react";

/** How long the button says "Copied ✓" before it reads "Copy" again. */
const COPIED_MS = 1500;

/**
 * Copy text to the clipboard. The Clipboard API needs a secure context (https or localhost);
 * on a plain-http LAN address it is missing, so fall back to a hidden textarea and execCommand.
 */
const copyText = async (text: string): Promise<boolean> => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the textarea
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
};

/**
 * The bar pinned to the bottom of the screen while passages are selected: the live reference,
 * Copy (the quotation, quotation.ts) and ✕ to clear the selection.
 */
export const SelectionBar = ({
  reference,
  quotation,
  onClear,
}: {
  reference: string;
  /** The text Copy puts on the clipboard. */
  quotation: string;
  onClear: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  // A different selection is a different quotation: the button reads "Copy" again.
  useEffect(() => setCopied(false), [quotation]);

  return (
    <div className="selection-bar" role="region" aria-label="Selected passages">
      <span className="selection-reference">{reference}</span>
      <button
        type="button"
        className="selection-copy"
        onClick={() => copyText(quotation).then(setCopied)}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
      <button
        type="button"
        className="selection-clear"
        aria-label="Clear selection"
        onClick={onClear}
      >
        ✕
      </button>
    </div>
  );
};
