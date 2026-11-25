import type { Dispatch, SetStateAction } from "react";

import {
  statusOf,
  type Identified,
  type Review,
  type ReviewInput,
  type ReviewMap,
} from "../records/reviews";
import { postReviews, type CollectionData } from "../records/store";

export type ReviewHandler = (inputs: ReviewInput[]) => void;

/** The write side of a review surface: persist verdicts, or prompt for a dispute note first. */
export type ReviewActions = { review: ReviewHandler; dispute: (path: string) => void };

/**
 * Builds the write handlers for one collection. Callers construct it only when `!READ_ONLY`,
 * so in the public build nothing references it and postReviews drops out of the bundle.
 */
export const ReviewActions = <T extends Identified>(
  collection: string,
  setData: Dispatch<SetStateAction<CollectionData<T> | null>>,
  setSaving: (saving: boolean) => void,
): ReviewActions => {
  const review: ReviewHandler = (inputs) => {
    setSaving(true);
    postReviews<T>(collection, inputs)
      .then(setData)
      .catch((error) => window.alert(`Save failed: ${String(error)}`))
      .finally(() => setSaving(false));
  };
  const dispute = (path: string) => {
    const note = window.prompt("Dispute note — what looks wrong?");
    if (note === null) return;
    review([{ path, status: "disputed", ...(note.trim() ? { note: note.trim() } : {}) }]);
  };
  return { review, dispute };
};

/**
 * The per-fact review widget: ✓/✗ while unverified, a status dot + reset once reviewed.
 * `path` is the fact path the verdict attaches to (see records/reviews.ts).
 */
export const ReviewControls = ({
  path,
  reviews,
  saving,
  actions,
}: {
  path: string;
  reviews: ReviewMap;
  saving: boolean;
  actions: ReviewActions;
}) => {
  const review: Review | undefined = reviews[path];
  const status = statusOf(reviews, path);
  return (
    <span className={`review review-${status}`} title={review?.note}>
      {status === "unverified" ? (
        <>
          <button
            className="icon-btn"
            disabled={saving}
            title="Mark verified"
            onClick={() => actions.review([{ path, status: "verified" }])}
          >
            ✓
          </button>
          <button
            className="icon-btn"
            disabled={saving}
            title="Mark disputed"
            onClick={() => actions.dispute(path)}
          >
            ✗
          </button>
        </>
      ) : (
        <>
          <span className="dot" />
          <button
            className="icon-btn subtle"
            disabled={saving}
            title="Reset review"
            onClick={() => actions.review([{ path, status: "unverified" }])}
          >
            ↺
          </button>
        </>
      )}
    </span>
  );
};
