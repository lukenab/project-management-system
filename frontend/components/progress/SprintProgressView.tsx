"use client";

import {
  Check,
  ChartNoAxesCombined,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { BacklogDetailState } from "@/components/backlog/BacklogItemDrawer";
import type { PreviewProject } from "@/lib/preview-data";
import type {
  SprintActivityEntry,
  SprintProgress,
} from "@/lib/sprint-progress";
import type { Sprint } from "@/lib/sprints";
import type { UpdateWorkItemInput, WorkItemMember } from "@/lib/work-items";

import { BacklogItemDrawer } from "@/components/backlog/BacklogItemDrawer";
import { EmptyState } from "@/components/shared/EmptyState";
import { projectHref } from "@/config/navigation";
import { accountInitials } from "@/lib/admin-users";
import { subscribePreviewCollaboration } from "@/lib/preview-collaboration";
import {
  getPreviewSprintActivity,
  getPreviewSprintProgress,
} from "@/lib/preview-sprint-progress";
import { previewWorkItemRepository } from "@/lib/preview-work-items";
import { relativeTime } from "@/lib/relative-time";
import {
  formatSprintDate,
  formatSprintRange,
  sprintErrorMessage,
} from "@/lib/sprints";
import { workItemMemberName } from "@/lib/work-items";

import styles from "./sprint-progress.module.css";

const DAY = 86400000;

type ProgressState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: { sprint: Sprint; progress: SprintProgress } | null;
      members: WorkItemMember[];
      activity: SprintActivityEntry[];
    };

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

function sprintTiming(sprint: Sprint, calculatedAt: string) {
  if (!sprint.plannedEndAt) return { text: "No end date", late: false };
  const days = daysBetween(calculatedAt, sprint.plannedEndAt);
  if (days > 0) return { text: `${plural(days, "day")} left`, late: false };
  if (days === 0) return { text: "Ends today", late: false };
  return { text: `Ended ${plural(-days, "day")} ago`, late: true };
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

function StatusDonut({ items }: { items: SprintProgress["sprintItems"] }) {
  const parts = stages
    .map((stage) => ({ ...stage, value: items[stage.key] }))
    .filter((part) => part.value > 0);
  const summary = stages
    .map((stage) => `${stage.label}: ${items[stage.key]}`)
    .join(", ");
  return (
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
            parts.slice(0, index).reduce((sum, entry) => sum + entry.value, 0) /
            items.total;
          const gap = parts.length > 1 ? SEGMENT_GAP : 0;
          const length = Math.max(share * CIRCUMFERENCE - gap, 0.5);
          return (
            <circle
              key={part.key}
              cx="60"
              cy="60"
              r={RADIUS}
              className={`${styles.segment} ${part.className}`}
              strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
              strokeDashoffset={-before * CIRCUMFERENCE}
              transform="rotate(-90 60 60)"
            >
              <title>{`${part.label}: ${plural(part.value, "item")} (${Math.round(share * 100)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div className={styles.donutLabel} aria-hidden="true">
        <strong>{items.total}</strong>
        <span>Total work items</span>
      </div>
    </div>
  );
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function groupByDay(entries: SprintActivityEntry[]) {
  const groups: { day: string; entries: SprintActivityEntry[] }[] = [];
  for (const entry of entries) {
    const day = dayFormat.format(new Date(entry.occurredAt));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

export function SprintProgressView({ project }: { project: PreviewProject }) {
  const [state, setState] = useState<ProgressState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [detail, setDetail] = useState<BacklogDetailState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const mounted = useRef(false);
  const detailRequest = useRef(0);
  const busy = useRef(false);
  const lastOpener = useRef<HTMLElement | null>(null);
  const canChange =
    project.status === "ACTIVE" && project.scrumRole === "Developer";

  useEffect(() => {
    let active = true;
    const requests = detailRequest;
    mounted.current = true;
    Promise.all([
      getPreviewSprintProgress(project.id),
      previewWorkItemRepository.listMembers(project.id),
    ])
      .then(
        async ([data, members]) =>
          [
            data,
            members,
            data
              ? await getPreviewSprintActivity(project.id, data.sprint.id)
              : [],
          ] as const,
      )
      .then(
        ([data, members, activity]) => {
          if (active) {
            setState({ status: "ready", data, members, activity });
            setNow(Date.now());
          }
        },
        (cause) => {
          if (active)
            setState({
              status: "error",
              message: sprintErrorMessage(cause, "Please try again."),
            });
        },
      );
    return () => {
      active = false;
      mounted.current = false;
      requests.current++;
    };
  }, [project.id, attempt]);

  // Comments and changes made in the drawer appear without a manual refresh.
  useEffect(
    () => subscribePreviewCollaboration(() => setAttempt((value) => value + 1)),
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const panelLayout = detail ? (expanded ? "expanded" : "overlay") : null;
  useEffect(() => {
    if (!panelLayout) return;
    document.body.dataset.backlogPanel = panelLayout;
    return () => {
      delete document.body.dataset.backlogPanel;
    };
  }, [panelLayout]);

  async function openItem(id: string) {
    if (busy.current) return;
    const request = ++detailRequest.current;
    setDetail({ status: "loading", id });
    try {
      const item = await previewWorkItemRepository.get(project.id, id);
      if (mounted.current && request === detailRequest.current)
        setDetail({ status: "ready", id, item });
    } catch (cause) {
      if (mounted.current && request === detailRequest.current)
        setDetail({
          status: "error",
          id,
          missing: false,
          message: sprintErrorMessage(
            cause,
            "Couldn’t load this item. Please try again.",
          ),
        });
    }
  }
  function closeDetails() {
    detailRequest.current++;
    setDetail(null);
    setExpanded(false);
    const opener = lastOpener.current;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }
  async function saveItem(id: string, input: UpdateWorkItemInput) {
    const item = await previewWorkItemRepository.update(project.id, id, input);
    if (!mounted.current) return;
    setDetail((current) =>
      current?.id === id ? { status: "ready", id, item } : current,
    );
    setAttempt((value) => value + 1);
  }

  if (state.status === "loading")
    return (
      <>
        <h1 className="sr-only">Sprint Progress</h1>
        <p className={styles.loading} role="status">
          Loading progress…
        </p>
      </>
    );
  if (state.status === "error")
    return (
      <div role="alert">
        <h1 className="sr-only">Sprint Progress</h1>
        <EmptyState
          icon={TriangleAlert}
          title="Couldn’t load Sprint progress"
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
  if (!state.data)
    return (
      <>
        <h1 className="sr-only">Sprint Progress</h1>
        <EmptyState
          icon={ChartNoAxesCombined}
          title="No active Sprint"
          description="Start a Sprint to follow its progress here."
          action={
            <Link className="button" href={projectHref(project.id, "sprints")}>
              View Sprints
            </Link>
          }
        />
      </>
    );

  const { sprint, progress } = state.data;
  const items = progress.sprintItems;
  const timing = sprintTiming(sprint, progress.calculatedAt);
  const workloadTotal = progress.memberWorkload.reduce(
    (sum, entry) => sum + entry.itemCount,
    0,
  );
  const workload = progress.memberWorkload
    .map((entry) => {
      const member = state.members.find(
        (candidate) => candidate.membershipId === entry.assigneeId,
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
    <>
      <h1 className="sr-only">Sprint Progress</h1>
      <div className={styles.sprintBar}>
        <div className={styles.sprintTitle}>
          <h2>{sprint.name}</h2>
          <span>{formatSprintRange(sprint)}</span>
          <span className={timing.late ? styles.late : undefined}>
            {timing.text}
          </span>
        </div>
      </div>
      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="progress-status">
          <h3 id="progress-status">Status overview</h3>
          <p className={styles.cardSub}>
            {items.total
              ? `${Math.round(progress.completionPercent)}% complete · ${items.done} of ${plural(items.total, "work item")} done`
              : "No work items in this Sprint yet"}
          </p>
          <div className={styles.status}>
            <StatusDonut items={items} />
            <ul className={styles.legend}>
              {stages.map((stage) => (
                <li key={stage.key}>
                  <span
                    className={`${styles.swatch} ${stage.className}`}
                    aria-hidden="true"
                  />
                  {stage.label}: {items[stage.key]}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="progress-overdue">
          <div className={styles.cardHead}>
            <h3 id="progress-overdue">Overdue work items</h3>
            <span className="count-badge">{progress.overdueItems.length}</span>
          </div>
          {progress.overdueItems.length ? (
            <ul className={styles.overdue}>
              {progress.overdueItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={(event) => {
                      lastOpener.current = event.currentTarget;
                      void openItem(item.id);
                    }}
                  >
                    <span>{item.key}</span>
                    {item.title}
                  </button>
                  <span className={styles.lateBy}>
                    {plural(
                      daysBetween(item.dueDate, progress.calculatedAt),
                      "day",
                    )}{" "}
                    late
                  </span>
                  <span className={styles.due}>
                    Due{" "}
                    {formatSprintDate(`${item.dueDate}T00:00:00.000Z`, true)}
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
          <h3 id="progress-workload">Team workload</h3>
          <p className={styles.cardSub}>
            Share of this Sprint&apos;s work items by assignee.
          </p>
          {workload.length ? (
            <div className={styles.scroll} tabIndex={0}>
              <table className={styles.workload}>
                <thead>
                  <tr>
                    <th scope="col">Assignee</th>
                    <th scope="col">Work distribution</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.allClear}>No work items in this Sprint yet.</p>
          )}
        </section>
        <section
          className={`${styles.card} ${styles.tall}`}
          aria-labelledby="progress-activity"
        >
          <h3 id="progress-activity">Recent activity</h3>
          <p className={styles.cardSub}>
            What&apos;s happening across this Sprint&apos;s work items.
          </p>
          {state.activity.length ? (
            <div className={styles.scroll} tabIndex={0}>
              {groupByDay(state.activity).map((group) => (
                <div key={group.day} className={styles.day}>
                  <h4>{group.day}</h4>
                  <ul>
                    {group.entries.map((entry) => (
                      <li key={entry.id}>
                        <span className={styles.mini} aria-hidden="true">
                          {accountInitials(entry.actor.fullName)}
                        </span>
                        <div>
                          <p>
                            <strong>{entry.actor.fullName}</strong>{" "}
                            {entry.kind === "COMMENT"
                              ? "commented on"
                              : `${entry.text} on`}{" "}
                            <button
                              type="button"
                              onClick={(event) => {
                                lastOpener.current = event.currentTarget;
                                void openItem(entry.workItem.id);
                              }}
                            >
                              {entry.workItem.key}: {entry.workItem.title}
                            </button>
                          </p>
                          {entry.kind === "COMMENT" && (
                            <blockquote>{entry.text}</blockquote>
                          )}
                          <time
                            dateTime={entry.occurredAt}
                            title={new Date(entry.occurredAt).toLocaleString(
                              "en-GB",
                              { timeZoneName: "short" },
                            )}
                          >
                            {relativeTime(entry.occurredAt, now)}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.allClear}>No activity yet.</p>
          )}
        </section>
      </div>
      {detail && (
        <BacklogItemDrawer
          state={detail}
          canEditContent={false}
          canChangeStatus={canChange}
          canEditMetadata={false}
          editing={null}
          onEdit={() => {}}
          onFinishEditing={() => {}}
          onDirty={() => {}}
          onBusy={(value) => {
            busy.current = value;
          }}
          onSave={saveItem}
          onDelete={() => {}}
          canClose={() => !busy.current}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((value) => !value)}
          onClose={closeDetails}
          onRetry={() => void openItem(detail.id)}
        />
      )}
    </>
  );
}
