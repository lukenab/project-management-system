"use client";

import { ArrowLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";
import type { SprintDetail, SprintSummary } from "@/lib/sprints";
import type { WorkItemStatus } from "@/lib/work-items";

import { BacklogLoading } from "@/components/backlog/BacklogLoading";
import { WorkTypeIcon } from "@/components/backlog/WorkTypeIcon";
import {
  DropdownMenu,
  type DropdownItem,
} from "@/components/shared/DropdownMenu";
import { Toast } from "@/components/shared/Toast";
import { projectHref } from "@/config/navigation";
import { previewSprintRepository as repository } from "@/lib/preview-sprints";
import {
  SprintDataError,
  formatSprintDate,
  nextDraft,
  sprintErrorMessage,
  sprintLabel,
} from "@/lib/sprints";
import { workItemStatusLabels } from "@/lib/work-items";

import { SprintProgress } from "./SprintBadges";
import styles from "./sprints.module.css";
import {
  sprintActionDone,
  sprintMenuGroups,
  useSprintActions,
} from "./useSprintActions";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; sprint: SprintDetail; next: SprintSummary | undefined }
  | { status: "error"; message: string; missing: boolean };

const columns: { status: WorkItemStatus; hint: string }[] = [
  { status: "TODO", hint: "Not started" },
  { status: "IN_PROGRESS", hint: "Being worked on" },
  { status: "DONE", hint: "Meets the Definition of Done" },
];

export function SprintDetailView({
  project,
  sprintId,
}: {
  project: PreviewProject;
  sprintId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<{
    message: string;
    sequence: number;
  } | null>(null);
  const sequence = useRef(0);
  const actionsRef = useRef<HTMLDivElement>(null);
  const canManage =
    project.status === "ACTIVE" && project.scrumRole === "Product Owner";
  const listHref = projectHref(project.id, "sprints");

  useEffect(() => {
    let active = true;
    Promise.all([
      repository.get(project.id, sprintId),
      repository.list(project.id),
    ]).then(
      ([sprint, sprints]) => {
        if (active)
          setState({ status: "ready", sprint, next: nextDraft(sprints) });
      },
      (cause) => {
        if (active)
          setState({
            status: "error",
            missing:
              cause instanceof SprintDataError && cause.code === "NOT_FOUND",
            message: sprintErrorMessage(cause, "Please try again."),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [project.id, sprintId, attempt]);

  const actions = useSprintActions(project.id, (action, sprint) => {
    if (action === "delete") {
      router.push(listHref);
      return;
    }
    setNotice({
      message: `${sprintLabel(sprint)} ${sprintActionDone[action]}.`,
      sequence: ++sequence.current,
    });
    setAttempt((value) => value + 1);
  });

  const back = (
    <Link className={styles.back} href={listHref}>
      <ArrowLeft size={15} aria-hidden="true" />
      Sprints
    </Link>
  );

  if (state.status === "loading")
    return (
      <>
        {back}
        <BacklogLoading label="Loading Sprint…" rows={3} />
      </>
    );

  if (state.status === "error")
    return (
      <>
        {back}
        <div className={styles.notice} role="alert">
          <h2>
            {state.missing ? "Sprint not found" : "Couldn’t load this Sprint"}
          </h2>
          <p>
            {state.missing
              ? "It may have been deleted, or the link is incorrect."
              : state.message}
          </p>
          {state.missing ? (
            <Link className={`button ${styles.secondary}`} href={listHref}>
              Back to Sprints
            </Link>
          ) : (
            <button
              type="button"
              className={`button ${styles.secondary}`}
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          )}
        </div>
      </>
    );

  const { sprint, next } = state;
  const label = sprintLabel(sprint);
  const byStatus = (status: WorkItemStatus) =>
    sprint.items.filter((item) => item.status === status);
  const done = byStatus("DONE").length;
  const counts = { itemCount: sprint.items.length, doneCount: done };
  const startWarning =
    next && next.id !== sprint.id
      ? `${sprintLabel(next)} is planned to start earlier. Starting this Sprint first changes the planned order.`
      : undefined;

  const remove: DropdownItem = {
    label: "Delete Sprint",
    tone: "danger",
    onSelect: () => actions.open("delete", sprint, counts),
  };
  const menu: DropdownItem[] = !canManage
    ? []
    : sprint.status === "CLOSED"
      ? [remove]
      : [
          {
            label: "Edit Sprint",
            href: projectHref(project.id, `sprints/${sprint.id}/edit`),
          },
          remove,
        ];

  return (
    <>
      {back}
      {notice && (
        <Toast
          key={notice.sequence}
          message={notice.message}
          onDismiss={() => setNotice(null)}
          onRestoreFocus={() =>
            actionsRef.current?.querySelector<HTMLElement>("button")?.focus()
          }
        />
      )}
      <div className={styles.detailLayout}>
        <div className={styles.detailMain}>
          <div className={styles.detailBar}>
            <div className={styles.detailHeading}>
              <h1 className={styles.detailTitle}>{label}</h1>
            </div>
            {canManage && (
              <div className={styles.detailActions} ref={actionsRef}>
                {sprint.status === "DRAFT" && (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() =>
                      actions.open("start", sprint, counts, startWarning)
                    }
                  >
                    Start Sprint
                  </button>
                )}
                {sprint.status === "ACTIVE" && (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => actions.open("complete", sprint, counts)}
                  >
                    Complete Sprint
                  </button>
                )}
                {menu.length > 0 && (
                  <DropdownMenu
                    label={`More actions for ${label}`}
                    triggerLabel={`More actions for ${label}`}
                    triggerClassName={styles.kebab}
                    trigger={<MoreHorizontal size={18} aria-hidden="true" />}
                    groups={sprintMenuGroups(menu)}
                  />
                )}
              </div>
            )}
          </div>
          {sprint.goal && <p className={styles.detailGoal}>{sprint.goal}</p>}
          <h2 className={styles.columnsHeading}>
            Work Items{" "}
            <span className={styles.count}>{sprint.items.length}</span>
          </h2>
          <div className={styles.columns}>
            {columns.map((column) => {
              const items = byStatus(column.status);
              return (
                <section
                  key={column.status}
                  className={styles.column}
                  aria-labelledby={`column-${column.status}`}
                >
                  <header className={styles.columnHeader}>
                    <span>
                      <h3 id={`column-${column.status}`}>
                        {workItemStatusLabels[column.status]}
                      </h3>
                      <small>{column.hint}</small>
                    </span>
                    <span className={styles.count}>{items.length}</span>
                  </header>
                  {items.length ? (
                    <ul className={styles.items}>
                      {items.map((item) => (
                        <li key={item.id} className={styles.item}>
                          <WorkTypeIcon workType={item.workType} />
                          <span className={styles.key}>{item.key}</span>
                          <span className={styles.itemTitle} title={item.title}>
                            {item.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.columnEmpty}>No Work Items</p>
                  )}
                </section>
              );
            })}
          </div>
          {!sprint.items.length &&
            (sprint.status === "DRAFT" || sprint.status === "ACTIVE") && (
              <p className={styles.hint}>
                Choose this Sprint in a Work Item’s details to add it here.
              </p>
            )}
        </div>
        <aside className={styles.sidebar} aria-label="Sprint details">
          <div className={styles.sideBlock}>
            <SprintProgress
              label={label}
              done={done}
              total={sprint.items.length}
            />
          </div>
          <dl className={styles.sideFacts}>
            <div>
              <dt>Start date</dt>
              <dd>
                {sprint.plannedStartAt
                  ? formatSprintDate(sprint.plannedStartAt, true)
                  : "No start date"}
              </dd>
            </div>
            <div>
              <dt>End date</dt>
              <dd>
                {sprint.plannedEndAt
                  ? formatSprintDate(sprint.plannedEndAt, true)
                  : "No end date"}
              </dd>
            </div>
            <div>
              <dt>Work Items</dt>
              <dd>
                {columns
                  .map(
                    (column) =>
                      `${workItemStatusLabels[column.status]}: ${byStatus(column.status).length}`,
                  )
                  .join(" · ")}
              </dd>
            </div>
            {sprint.startedAt && (
              <div>
                <dt>Started</dt>
                <dd>{formatSprintDate(sprint.startedAt, true)}</dd>
              </div>
            )}
            {sprint.closedAt && (
              <div>
                <dt>Closed</dt>
                <dd>{formatSprintDate(sprint.closedAt, true)}</dd>
              </div>
            )}
            {sprint.closeNote && (
              <div>
                <dt>Close note</dt>
                <dd>{sprint.closeNote}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
      {actions.dialog}
    </>
  );
}
