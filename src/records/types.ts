import type { CalDate } from "./events";

/**
 * A dated life event (birth, death). `date` is EITHER an ISO string — full "YYYY-MM-DD", or a
 * partial "YYYY-MM" / "YYYY" (the ergonomic CE form used by modern people) — OR a CalDate object
 * (`{ year, era: "bce", … }`) for antiquity/BC figures, matching the events collection's date model.
 * For a CalDate, `circa` lives on the date object; for an ISO string, use the `circa` flag below.
 *
 * Records hold FACTS ONLY — verification state lives in the sidecar review table keyed by
 * fact path (see reviews.ts), so each fact is reviewable independently.
 */
export type LifeEvent = {
  date: string | CalDate;
  place?: string;
  /** True when sources give an ISO date as approximate (CalDate dates carry their own `circa`). */
  circa?: boolean;
  /** What's uncertain or disputed about this event among the sources, if anything. */
  note?: string;
};

export type Source = {
  label: string;
  url: string;
};

export type PersonRecord = {
  /** Kebab-case slug, unique within the collection. No dots — ids lead fact paths. */
  id: string;
  name: string;
  /** One factual line describing their place in the Restoration. */
  role: string;
  /** Tradition tags, e.g. "founding", "witness", "lds", "rlds", "fundamentalist". */
  groups: string[];
  born: LifeEvent;
  died: LifeEvent;
  sources: Source[];
};
