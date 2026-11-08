"use client";

import { useEffect, useState } from "react";

import type { AuditEvent } from "@/lib/admin-users";

import { auditActionLabels } from "@/lib/admin-users";
import { listAuditEvents } from "@/lib/admin-users-api";

import styles from "./admin.module.css";
import { AuditFilterMenu } from "./AuditFilterMenu";

const PAGE_SIZE = 10;
const DEFAULT_RANGE = "30";
const rangeOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const emptyFilters = {
  range: DEFAULT_RANGE as string,
  from: "",
  to: "",
  actorId: "",
  action: "",
  // "TYPE:id"; the API takes targetType and targetId separately.
  target: "",
};
const targetGroups: Record<AuditEvent["targetType"], string> = {
  USER_ACCOUNT: "User accounts",
  PROJECT: "Projects",
};

function targetLabel(event: AuditEvent) {
  return `${event.targetType === "PROJECT" ? "Project" : "Account"} · ${event.targetId}`;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function rangeLabel(filters: typeof emptyFilters) {
  if (filters.range !== "custom")
    return rangeOptions.find((option) => option.value === filters.range)?.label;
  const from =
    filters.from && dayFormat.format(new Date(`${filters.from}T00:00`));
  const to = filters.to && dayFormat.format(new Date(`${filters.to}T00:00`));
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "Custom range";
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

export function AuditLog() {
  const [options, setOptions] = useState<AuditEvent[]>([]);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const rangeInvalid =
    filters.range === "custom" &&
    !!filters.from &&
    !!filters.to &&
    filters.from > filters.to;

  useEffect(() => {
    let active = true;
    listAuditEvents().then(
      (all) => {
        if (active) setOptions(all);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    if (rangeInvalid) return;
    let active = true;
    const [targetType, targetId] = filters.target.split(":");
    const presetFrom =
      filters.range === "custom"
        ? undefined
        : new Date(Date.now() - Number(filters.range) * 86400000).toISOString();
    listAuditEvents({
      from:
        presetFrom ??
        (filters.from
          ? new Date(`${filters.from}T00:00:00`).toISOString()
          : undefined),
      to:
        filters.range === "custom" && filters.to
          ? new Date(`${filters.to}T23:59:59.999`).toISOString()
          : undefined,
      actorId: filters.actorId || undefined,
      action: filters.action || undefined,
      targetType: (targetType || undefined) as AuditEvent["targetType"],
      targetId: targetId || undefined,
    }).then(
      (result) => {
        if (active) {
          setEvents(result);
          setFailed(false);
        }
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [filters, rangeInvalid, retry]);

  function change(next: Partial<typeof emptyFilters>) {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
    setEvents(null);
    setFailed(false);
  }

  const filtered = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const list = rangeInvalid ? [] : (events ?? []);
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visible = list.slice(firstIndex, firstIndex + PAGE_SIZE);
  const actorOptions = uniqueBy(options, (event) => event.actorId).map(
    (event) => ({
      value: event.actorId,
      label: event.actorId,
    }),
  );
  const actionOptions = uniqueBy(options, (event) => event.action).map(
    (event) => ({
      value: event.action,
      label: auditActionLabels[event.action] ?? event.action,
    }),
  );
  const targetOptions = uniqueBy(
    options,
    (event) => `${event.targetType}:${event.targetId}`,
  )
    .map((event) => ({
      value: `${event.targetType}:${event.targetId}`,
      label: targetLabel(event),
      group: targetGroups[event.targetType],
    }))
    .sort((a, b) => a.group.localeCompare(b.group) * -1);

  return (
    <section aria-label="Audit log">
      <div className={styles.auditFilters}>
        <AuditFilterMenu
          label="Date range"
          value={filters.range === DEFAULT_RANGE ? "" : filters.range}
          valueLabel={rangeLabel(filters)}
          clearable={false}
        >
          <>
            <div className={styles.filterOptions}>
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.filterOption}
                  data-filter-option
                  data-filter-close
                  aria-pressed={filters.range === option.value}
                  onClick={() =>
                    change({ range: option.value, from: "", to: "" })
                  }
                >
                  <span>{option.label}</span>
                </button>
              ))}
              <button
                type="button"
                className={styles.filterOption}
                data-filter-option
                aria-pressed={filters.range === "custom"}
                onClick={() => change({ range: "custom" })}
              >
                <span>Custom range</span>
              </button>
            </div>
            {filters.range === "custom" && (
              <div className={styles.filterDates}>
                <label>
                  From
                  <input
                    type="date"
                    className={styles.select}
                    value={filters.from}
                    aria-invalid={rangeInvalid}
                    aria-describedby={
                      rangeInvalid ? "audit-range-error" : undefined
                    }
                    onChange={(event) => change({ from: event.target.value })}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    className={styles.select}
                    value={filters.to}
                    aria-invalid={rangeInvalid}
                    aria-describedby={
                      rangeInvalid ? "audit-range-error" : undefined
                    }
                    onChange={(event) => change({ to: event.target.value })}
                  />
                </label>
                {rangeInvalid && (
                  <p
                    id="audit-range-error"
                    className={styles.rangeError}
                    role="alert"
                  >
                    The start date must be on or before the end date.
                  </p>
                )}
              </div>
            )}
          </>
        </AuditFilterMenu>
        <AuditFilterMenu
          label="Actor"
          value={filters.actorId}
          valueLabel={filters.actorId || undefined}
          options={actorOptions}
          searchable
          onSelect={(actorId) => change({ actorId })}
        />
        <AuditFilterMenu
          label="Action"
          value={filters.action}
          valueLabel={
            filters.action
              ? (auditActionLabels[filters.action] ?? filters.action)
              : undefined
          }
          options={actionOptions}
          onSelect={(action) => change({ action })}
        />
        <AuditFilterMenu
          label="Affected resource"
          value={filters.target}
          valueLabel={
            targetOptions.find((option) => option.value === filters.target)
              ?.label
          }
          options={targetOptions}
          searchable
          onSelect={(target) => change({ target })}
        />
        {filtered && (
          <button
            type="button"
            className={styles.filterClearAll}
            onClick={() => change(emptyFilters)}
          >
            Clear all
          </button>
        )}
      </div>
      <div className="surface directory-surface">
        <table className={`project-table ${styles.auditTable}`}>
          <caption className="sr-only">Audit events, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Date and time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Affected resource</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((event) => (
              <tr key={event.id}>
                <td data-label="Date and time" className={styles.auditTime}>
                  <time
                    dateTime={event.occurredAt}
                    title={new Date(event.occurredAt).toLocaleString("en-GB", {
                      timeZoneName: "short",
                    })}
                  >
                    {timeFormat.format(new Date(event.occurredAt))}
                  </time>
                </td>
                <td data-label="Actor">{event.actorId}</td>
                <td data-label="Action">
                  {auditActionLabels[event.action] ?? event.action}
                </td>
                <td data-label="Affected resource">{targetLabel(event)}</td>
                <td data-label="Reason" className={styles.auditReason}>
                  {event.reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {failed ? (
          <div className="directory-empty" role="alert">
            <h2>Couldn&apos;t load audit events</h2>
            <button
              type="button"
              className="button"
              onClick={() => {
                setEvents(null);
                setFailed(false);
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : rangeInvalid ? (
          <div className="directory-empty" role="status">
            <h2>Invalid date range</h2>
            <p>Choose a start date on or before the end date.</p>
          </div>
        ) : !events ? (
          <div className="directory-empty" role="status">
            <p>Loading audit events…</p>
          </div>
        ) : (
          !list.length && (
            <div className="directory-empty" role="status">
              <h2>No matching audit events</h2>
              <p>Try a wider date range or clear the filters.</p>
            </div>
          )
        )}
      </div>
      {pageCount > 1 && (
        <div className="directory-footer">
          <span aria-live="polite">
            Showing {firstIndex + 1}–{firstIndex + visible.length} of{" "}
            {list.length}
          </span>
          <nav aria-label="Audit log pages">
            <button
              type="button"
              className="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              className="button"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
