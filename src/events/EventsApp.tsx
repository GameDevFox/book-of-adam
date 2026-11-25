import { useEffect, useMemo, useState } from "react";

import { ReviewActions, ReviewControls } from "../components/ReviewControls";
import { formatWhen, whenSortKey, type EventRecord } from "../records/events";
import { statusOf, type FactStatus } from "../records/reviews";
import { fetchCollection, READ_ONLY, type CollectionData } from "../records/store";

const COLLECTION = "events";

/** Each event has one reviewable fact for now: its dating. */
const whenPath = (event: EventRecord) => `${event.id}.when`;

type StatusFilter = "all" | FactStatus;
const STATUS_FILTERS: StatusFilter[] = ["all", "unverified", "verified", "disputed"];

export const EventsApp = () => {
  const [data, setData] = useState<CollectionData<EventRecord> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCollection<EventRecord>(COLLECTION)
      .then(setData)
      .catch((error) => setLoadError(String(error)));
  }, []);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return [...data.records]
      .sort((a, b) => whenSortKey(a.when) - whenSortKey(b.when))
      .filter(
        (event) =>
          (filter === "all" || statusOf(data.reviews, whenPath(event)) === filter) &&
          (!q ||
            event.title.toLowerCase().includes(q) ||
            event.summary.toLowerCase().includes(q) ||
            event.groups.some((group) => group.includes(q))),
      );
  }, [data, filter, query]);

  const actions = READ_ONLY ? null : ReviewActions<EventRecord>(COLLECTION, setData, setSaving);

  if (loadError) return <p className="status-line error">{loadError}</p>;
  if (!data) return <p className="status-line">Loading…</p>;

  const { records, reviews } = data;
  const verifiedCount = records.filter(
    (event) => statusOf(reviews, whenPath(event)) === "verified",
  ).length;

  return (
    <section className="events">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search title, summary, group…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!READ_ONLY && (
          <>
            <div className="filter-group">
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  className={filter === status ? "chip active" : "chip"}
                  onClick={() => setFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>
            <span className="progress">
              {verifiedCount} / {records.length} datings verified
            </span>
          </>
        )}
      </div>

      <table className="records">
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th>Sources</th>
            {!READ_ONLY && (
              <>
                <th>Status</th>
                <th>Review</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((event) => {
            const path = whenPath(event);
            const status = statusOf(reviews, path);
            const reviewNote = reviews[path]?.note;
            return (
              <tr key={event.id}>
                <td className="event">
                  <div className="event-date">{formatWhen(event.when)}</div>
                  {event.when.type !== "instant" && (
                    <span className={`tag when-${event.when.type}`}>{event.when.type}</span>
                  )}
                  {event.when.note && <div className="event-note">{event.when.note}</div>}
                </td>
                <td className="person">
                  <div className="person-name">{event.title}</div>
                  <div className="person-role">{event.summary}</div>
                  <div className="person-groups">
                    {event.groups.map((group) => (
                      <span key={group} className="tag">
                        {group}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="sources">
                  {event.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                  ))}
                </td>
                {!READ_ONLY && actions && (
                  <>
                    <td>
                      <span className={`badge badge-${status}`}>{status}</span>
                      {reviewNote && <div className="review-note">{reviewNote}</div>}
                    </td>
                    <td className="actions">
                      <ReviewControls
                        path={path}
                        reviews={reviews}
                        saving={saving}
                        actions={actions}
                      />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {visible.length === 0 && <p className="status-line">No events match.</p>}
    </section>
  );
};
