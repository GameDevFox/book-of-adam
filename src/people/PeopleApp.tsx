import { useEffect, useMemo, useState } from "react";

import { ReviewActions, ReviewControls } from "../components/ReviewControls";
import { formatLifeDate } from "../records/events";
import { statusOf, type FactStatus, type ReviewMap } from "../records/reviews";
import { fetchCollection, READ_ONLY, type CollectionData } from "../records/store";
import type { PersonRecord } from "../records/types";

const COLLECTION = "people";

/** The reviewable leaf facts of a person, in display order. */
const factPaths = (person: PersonRecord): string[] => {
  const paths = [`${person.id}.born.date`];
  if (person.born.place) paths.push(`${person.id}.born.place`);
  paths.push(`${person.id}.died.date`);
  if (person.died.place) paths.push(`${person.id}.died.place`);
  return paths;
};

/** Row rollup: disputed if any fact is, verified only when every fact is. */
const rowStatus = (person: PersonRecord, reviews: ReviewMap): FactStatus | "partial" => {
  const statuses = factPaths(person).map((path) => statusOf(reviews, path));
  if (statuses.some((status) => status === "disputed")) return "disputed";
  if (statuses.every((status) => status === "verified")) return "verified";
  if (statuses.some((status) => status === "verified")) return "partial";
  return "unverified";
};

const LifeEventCell = ({
  person,
  field,
  reviews,
  saving,
  actions,
}: {
  person: PersonRecord;
  field: "born" | "died";
  reviews: ReviewMap;
  saving: boolean;
  actions: ReviewActions | null;
}) => {
  const event = person[field];
  const base = `${person.id}.${field}`;
  const factNote = (path: string) =>
    !READ_ONLY && reviews[path]?.note && <div className="review-note">{reviews[path].note}</div>;
  return (
    <td className="event">
      <div className="fact">
        <span className="event-date">
          {typeof event.date === "string" && event.circa ? "c. " : ""}
          {formatLifeDate(event.date)}
        </span>
        {!READ_ONLY && actions && (
          <ReviewControls
            path={`${base}.date`}
            reviews={reviews}
            saving={saving}
            actions={actions}
          />
        )}
      </div>
      {factNote(`${base}.date`)}
      {event.place && (
        <div className="fact">
          <span className="event-place">{event.place}</span>
          {!READ_ONLY && actions && (
            <ReviewControls
              path={`${base}.place`}
              reviews={reviews}
              saving={saving}
              actions={actions}
            />
          )}
        </div>
      )}
      {factNote(`${base}.place`)}
      {event.note && <div className="event-note">{event.note}</div>}
    </td>
  );
};

type StatusFilter = "all" | FactStatus;
const STATUS_FILTERS: StatusFilter[] = ["all", "unverified", "verified", "disputed"];

/** "unverified"/"disputed" match rows with ANY such fact; "verified" means fully verified. */
const matchesFilter = (person: PersonRecord, reviews: ReviewMap, filter: StatusFilter): boolean => {
  if (filter === "all") return true;
  const statuses = factPaths(person).map((path) => statusOf(reviews, path));
  if (filter === "verified") return statuses.every((status) => status === "verified");
  return statuses.some((status) => status === filter);
};

export const PeopleApp = () => {
  const [data, setData] = useState<CollectionData<PersonRecord> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCollection<PersonRecord>(COLLECTION)
      .then(setData)
      .catch((error) => setLoadError(String(error)));
  }, []);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.records.filter(
      (record) =>
        matchesFilter(record, data.reviews, filter) &&
        (!q ||
          record.name.toLowerCase().includes(q) ||
          record.role.toLowerCase().includes(q) ||
          record.groups.some((group) => group.includes(q))),
    );
  }, [data, filter, query]);

  const actions = READ_ONLY ? null : ReviewActions<PersonRecord>(COLLECTION, setData, setSaving);

  if (loadError) return <p className="status-line error">{loadError}</p>;
  if (!data) return <p className="status-line">Loading…</p>;

  const { records, reviews } = data;
  const allPaths = records.flatMap(factPaths);
  const verifiedCount = allPaths.filter((path) => statusOf(reviews, path) === "verified").length;

  return (
    <section className="people">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, role, group…"
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
              {verifiedCount} / {allPaths.length} facts verified
            </span>
          </>
        )}
      </div>

      <table className="records">
        <thead>
          <tr>
            <th>Person</th>
            <th>Born</th>
            <th>Died</th>
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
          {visible.map((record) => {
            const status = rowStatus(record, reviews);
            const unreviewed = factPaths(record).filter(
              (path) => statusOf(reviews, path) === "unverified",
            );
            const cell = { reviews, saving, actions };
            return (
              <tr key={record.id}>
                <td className="person">
                  <div className="person-name">{record.name}</div>
                  <div className="person-role">{record.role}</div>
                  <div className="person-groups">
                    {record.groups.map((group) => (
                      <span key={group} className="tag">
                        {group}
                      </span>
                    ))}
                  </div>
                </td>
                <LifeEventCell person={record} field="born" {...cell} />
                <LifeEventCell person={record} field="died" {...cell} />
                <td className="sources">
                  {record.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                  ))}
                </td>
                {!READ_ONLY && actions && (
                  <>
                    <td>
                      <span className={`badge badge-${status}`}>{status}</span>
                    </td>
                    <td className="actions">
                      {unreviewed.length > 0 && (
                        <button
                          disabled={saving}
                          title="Mark every unreviewed fact in this row verified"
                          onClick={() =>
                            actions.review(
                              unreviewed.map((path) => ({ path, status: "verified" as const })),
                            )
                          }
                        >
                          Verify all
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {visible.length === 0 && <p className="status-line">No records match.</p>}
    </section>
  );
};
