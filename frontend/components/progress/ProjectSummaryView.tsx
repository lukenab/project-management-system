"use client";

import { Check, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";

import { EmptyState } from "@/components/shared/EmptyState";
import { projectHref } from "@/config/navigation";
import { getProjectSummary } from "@/lib/project-summary";
import { formatSprintDate, sprintErrorMessage } from "@/lib/sprints";
import { workItemMemberName } from "@/lib/work-items";

import styles from "./project-summary-view.module.css";

const DAY = 86400000;

type Summary = Awaited<ReturnType<typeof getProjectSummary>>;
type SummaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Summary };

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      DAY,
  );
}

const stages = [
  { key: "toDo", label: "To do", className: styles.toDo },
  { key: "inProgress", label: "In progress", className: styles.inProgress },
  { key: "done", label: "Done", className: styles.done },
] as const;

const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Leaves a sliver of surface between segments.
const SEGMENT_GAP = 1.5;

type Stage = (typeof stages)[number];

function StatusChart({ items }: { items: Summary["counts"] }) {
  const [hovered, setHovered] = useState<Stage | null>(null);
  const [focused, setFocused] = useState<Stage | null>(null);
  const active = hovered ?? focused;
  const percent = (count: number) =>
    items.total ? Math.round((count / items.total) * 100) : 0;
  const parts = stages
    .map((stage) => ({ ...stage, value: items[stage.key] }))
    .filter((part) => part.value > 0);
  const summary = stages
    .map((stage) => `${stage.label}: ${items[stage.key]}`)
    .join(", ");
  return (
    <div className={styles.status}>
      <div className={styles.donut}>
        <svg
          viewBox="0 0 120 120"
          role="img"
          aria-label={`${plural(items.total, "work item")} in total. ${summary}.`}
        >
          <circle cx="60" cy="60" r={RADIUS} className={styles.ring} />
          {parts.map((part, index) => {
            const share = part.value / items.total;
            const before =
              parts
                .slice(0, index)
                .reduce((sum, entry) => sum + entry.value, 0) / items.total;
            const gap = parts.length > 1 ? SEGMENT_GAP : 0;
            const length = Math.max(share * CIRCUMFERENCE - gap, 0.5);
            return (
              <circle
                key={part.key}
                cx="60"
                cy="60"
                r={RADIUS}
                className={`${styles.segment} ${part.className}`}
                data-muted={
                  active !== null && active.key !== part.key ? "" : undefined
                }
                onPointerEnter={() => setHovered(part)}
                onPointerLeave={() => setHovered(null)}
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-before * CIRCUMFERENCE}
                transform="rotate(-90 60 60)"
              />
            );
          })}
        </svg>
        <div
          className={styles.donutLabel}
          aria-hidden="true"
          data-visible={!active}
        >
          <strong>{items.total}</strong>
          <span>Total work items</span>
        </div>
        {stages.map((stage) => (
          <div
            key={stage.key}
            className={styles.donutLabel}
            aria-hidden="true"
            data-visible={active?.key === stage.key}
          >
            <strong>{percent(items[stage.key])}%</strong>
            <span>{stage.label}</span>
          </div>
        ))}
      </div>
      <ul className={styles.legend}>
        {stages.map((stage) => (
          <li
            key={stage.key}
            tabIndex={0}
            aria-label={`${stage.label}: ${plural(items[stage.key], "item")}, ${percent(items[stage.key])}%`}
            data-active={active?.key === stage.key ? "" : undefined}
            onPointerEnter={() => setHovered(stage)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setFocused(stage)}
            onBlur={() => setFocused(null)}
          >
            <span
              className={`${styles.swatch} ${stage.className}`}
              aria-hidden="true"
            />
            {stage.label}: {items[stage.key]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectSummaryView({ project }: { project: PreviewProject }) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getProjectSummary(project.id).then(
      (data) => {
        if (active) setState({ status: "ready", data });
      },
      (cause: unknown) => {
        if (active)
          setState({
            status: "error",
            message: sprintErrorMessage(cause, "Please try again."),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [project.id, attempt]);

  if (state.status === "loading")
    return (
      <p className={styles.loading} role="status">
        Loading project summary…
      </p>
    );
  if (state.status === "error")
    return (
      <div role="alert">
        <EmptyState
          icon={TriangleAlert}
          title="Couldn’t load project summary"
          description={state.message}
          action={
            <button
              type="button"
              className="button"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          }
        />
      </div>
    );
  const {
    counts: items,
    calculatedAt,
    overdueItems,
    memberWorkload,
    members,
  } = state.data;
  const workloadTotal = memberWorkload.reduce(
    (sum, entry) => sum + entry.itemCount,
    0,
  );
  const workload = memberWorkload
    .map((entry) => {
      const member = members.find(
        (candidate) => candidate.id === entry.assigneeId,
      );
      return {
        ...entry,
        share: Math.round((entry.itemCount / workloadTotal) * 100),
        name: entry.assigneeId
          ? member
            ? workItemMemberName(member)
            : "Unknown member"
          : "Unassigned",
        initials: entry.assigneeId ? (member?.initials ?? "?") : "",
      };
    })
    .sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name));

  return (
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="progress-status">
        <h2 id="progress-status">Status overview</h2>
        <p className={styles.cardSub}>
          {items.total
            ? "Work items across this project."
            : "No work items in this project yet."}
        </p>
        <StatusChart items={items} />
      </section>
      <section className={styles.card} aria-labelledby="progress-overdue">
        <div className={styles.cardHead}>
          <h2 id="progress-overdue">Overdue work items</h2>
          <span className="count-badge">{overdueItems.length}</span>
        </div>
        {overdueItems.length ? (
          <ul className={styles.overdue}>
            {overdueItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={{
                    pathname: projectHref(project.id, "backlog"),
                    query: { item: item.id },
                  }}
                >
                  <span>{item.key}</span>
                  {item.title}
                </Link>
                <span className={styles.lateBy}>
                  {plural(daysBetween(item.dueDate, calculatedAt), "day")} late
                </span>
                <span className={styles.due}>
                  Due {formatSprintDate(`${item.dueDate}T00:00:00.000Z`, true)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.allClear}>
            <Check size={16} aria-hidden="true" />
            Nothing is overdue.
          </p>
        )}
      </section>
      <section
        className={`${styles.card} ${styles.tall}`}
        aria-labelledby="progress-workload"
      >
        <h2 id="progress-workload">Work by assignee</h2>
        <p className={styles.cardSub}>
          Share of unfinished work items by assignee.
        </p>
        {workload.length ? (
          <div className={styles.scroll} tabIndex={0}>
            <table className={styles.workload}>
              <thead>
                <tr>
                  <th scope="col">Assignee</th>
                  <th scope="col">Work distribution</th>
                  <th scope="col">Items</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((entry) => (
                  <tr key={entry.assigneeId ?? "unassigned"}>
                    <td>
                      <span className={styles.who}>
                        <span
                          className={styles.mini}
                          data-unassigned={!entry.assigneeId || undefined}
                          aria-hidden="true"
                        >
                          {entry.initials || (
                            <UserRound size={13} aria-hidden="true" />
                          )}
                        </span>
                        <span>{entry.name}</span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={styles.track}
                        title={`${entry.name}: ${plural(entry.itemCount, "item")}`}
                      >
                        <span
                          className={styles.fill}
                          style={{ width: `${entry.share}%` }}
                        >
                          {entry.share}%
                        </span>
                      </span>
                    </td>
                    <td>{entry.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.allClear}>No unfinished work items.</p>
        )}
      </section>
    </div>
  );
}
