/** Any reviewable record — collections just need stable string ids (no dots). */
export type Identified = { id: string };

/**
 * Reviews live in a sidecar table (data/<collection>.reviews.json), separate from the facts:
 * a map from FACT PATH → review. A fact path is "<record-id>.<field>.<subfield>…", e.g.
 * "joseph-smith-sr.born.place". A path absent from the map is unverified — so the reviews
 * file only ever contains actual review actions, and each one is an independent, per-fact
 * verdict.
 */
export const REVIEW_STATUSES = ["verified", "disputed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type Review = {
  status: ReviewStatus;
  /** ISO timestamp of the review action. */
  reviewedAt: string;
  /** Reviewer's note — typically why a fact is disputed. */
  note?: string;
};

export type ReviewMap = Record<string, Review>;

/** What the UI shows per fact — a review status, or unverified when no review exists. */
export type FactStatus = ReviewStatus | "unverified";

export const statusOf = (reviews: ReviewMap, path: string): FactStatus =>
  reviews[path]?.status ?? "unverified";

/** A review action: set a fact path verified/disputed, or "unverified" to clear its review. */
export type ReviewInput = {
  path: string;
  status: ReviewStatus | "unverified";
  note?: string;
};

export const isReviewInput = (value: unknown): value is ReviewInput => {
  if (typeof value !== "object" || value === null) return false;
  const { path, status, note } = value as Record<string, unknown>;
  return (
    typeof path === "string" &&
    path.length > 0 &&
    (status === "unverified" || REVIEW_STATUSES.includes(status as ReviewStatus)) &&
    (note === undefined || typeof note === "string")
  );
};

/** Accepts a single ReviewInput or a non-empty array (a batch applied as one write). */
export const parseReviewInputs = (body: unknown): ReviewInput[] | null => {
  const list = Array.isArray(body) ? body : [body];
  return list.length > 0 && list.every(isReviewInput) ? list : null;
};

/**
 * Resolves a fact path against the records: first segment is the record id, the rest walk
 * object fields. Returns the value at the path, or undefined when the record or any
 * segment is missing — a review must point at a fact that actually exists.
 */
export const resolveFactPath = (records: Identified[], path: string): unknown => {
  const [id, ...fields] = path.split(".");
  let value: unknown = records.find((record) => record.id === id);
  for (const field of fields) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[field];
  }
  return value;
};

/** Returns a new review map with the inputs applied; clearing deletes the entry. */
export const applyReviews = (
  reviews: ReviewMap,
  inputs: ReviewInput[],
  reviewedAt: string,
): ReviewMap => {
  const next = { ...reviews };
  for (const { path, status, note } of inputs) {
    if (status === "unverified") {
      delete next[path];
    } else {
      next[path] = { status, reviewedAt, ...(note !== undefined ? { note } : {}) };
    }
  }
  return next;
};
