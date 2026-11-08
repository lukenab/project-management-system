"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { projectHref } from "@/config/navigation";
import { listProjectMembers } from "@/lib/projects";
import { loadSprintReport } from "@/lib/sprint-progress";
import { formatSprintDate } from "@/lib/sprints";

import styles from "./sprints.module.css";

type Report = Awaited<ReturnType<typeof loadSprintReport>>;

export function ActiveSprintReport({
  projectId,
  sprintId,
}: {
  projectId: string;
  sprintId: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void loadSprintReport(projectId).then(
      (data) => {
        if (!active) return;
        if (data.progress.sprintId === sprintId) setReport(data);
        else setError("The active Sprint changed. Refresh Sprint Details.");
      },
      (cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Couldn’t load Sprint progress.",
          );
      },
    );
    void listProjectMembers(projectId).then(
      (members) => {
        if (active)
          setNames(
            Object.fromEntries(
              members.map(({ id, fullName }) => [id, fullName]),
            ),
          );
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [projectId, sprintId, attempt]);

  const itemHref = (id: string) =>
    projectHref(projectId, `backlog?item=${encodeURIComponent(id)}`);

  return (
    <section className={styles.report} aria-labelledby="active-sprint-report">
      <h2 className={styles.columnsHeading} id="active-sprint-report">
        Sprint progress
      </h2>
      {error ? (
        <div className={styles.notice} role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : !report ? (
        <p role="status">Loading Sprint progress…</p>
      ) : (
        <div className={styles.columns}>
          <section className={styles.column}>
            <h3>Overdue work items</h3>
            {report.progress.overdueItems.length ? (
              <ul className={styles.items}>
                {report.progress.overdueItems.map((item) => (
                  <li className={styles.reportRow} key={item.id}>
                    <Link href={itemHref(item.id)}>
                      {item.key} · {item.title}
                    </Link>
                    <small>{formatSprintDate(item.dueDate, true)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.columnEmpty}>Nothing is overdue.</p>
            )}
          </section>
          <section className={styles.column}>
            <h3>Work by assignee</h3>
            {report.progress.memberWorkload.length ? (
              <ul className={styles.items}>
                {report.progress.memberWorkload.map(
                  ({ assigneeId, itemCount }) => (
                    <li
                      className={styles.reportRow}
                      key={assigneeId ?? "unassigned"}
                    >
                      <span>
                        {assigneeId
                          ? (names[assigneeId] ?? "Unavailable member")
                          : "Unassigned"}
                      </span>
                      <small>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </small>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className={styles.columnEmpty}>
                No work items in this Sprint.
              </p>
            )}
          </section>
          <section className={styles.column}>
            <h3>Recent activity</h3>
            {report.activity.length ? (
              <ul className={styles.items}>
                {report.activity.slice(0, 10).map((entry) => (
                  <li
                    className={styles.reportRow}
                    key={`${entry.kind}-${entry.id}`}
                  >
                    <div>
                      <strong>{entry.actor.fullName}</strong>{" "}
                      {entry.kind === "COMMENT" ? "commented on" : entry.text}{" "}
                      <Link href={itemHref(entry.workItem.id)}>
                        {entry.workItem.key}
                      </Link>
                      {entry.kind === "COMMENT" && <p>{entry.text}</p>}
                    </div>
                    <small>{formatSprintDate(entry.occurredAt, true)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.columnEmpty}>No activity yet.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
