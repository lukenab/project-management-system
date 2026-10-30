"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";
import type { SprintStatus, SprintSummary } from "@/lib/sprints";

import { BacklogLoading } from "@/components/backlog/BacklogLoading";
import { SprintIcon } from "@/components/icons/SprintIcon";
import {
  DropdownMenu,
  type DropdownItem,
} from "@/components/shared/DropdownMenu";
import { EmptyState } from "@/components/shared/EmptyState";
import { Toast } from "@/components/shared/Toast";
import { projectHref } from "@/config/navigation";
import { previewSprintRepository as repository } from "@/lib/preview-sprints";
import {
  formatSprintRange,
  nextDraft,
  sprintErrorMessage,
  sprintLabel,
} from "@/lib/sprints";

import { SprintProgress } from "./SprintBadges";
import styles from "./sprints.module.css";
import {
  sprintActionDone,
  sprintMenuGroups,
  useSprintActions,
} from "./useSprintActions";

type ListState =
  | { status: "loading" }
  | { status: "ready"; sprints: SprintSummary[] }
  | { status: "error"; message: string };

const filters: {
  id: "current" | "closed" | "all";
  label: string;
  statuses: SprintStatus[];
}[] = [
  { id: "current", label: "Current", statuses: ["ACTIVE", "DRAFT"] },
  { id: "closed", label: "Closed", statuses: ["CLOSED"] },
  { id: "all", label: "All", statuses: ["ACTIVE", "DRAFT", "CLOSED"] },
];

export function SprintList({ project }: { project: PreviewProject }) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] =
    useState<(typeof filters)[number]["id"]>("current");
  const [notice, setNotice] = useState<{
    message: string;
    sequence: number;
  } | null>(null);
  const sequence = useRef(0);
  const headingRef = useRef<HTMLDivElement>(null);
  const canManage =
    project.status === "ACTIVE" && project.scrumRole === "Product Owner";

  useEffect(() => {
    let active = true;
    repository.list(project.id).then(
      (sprints) => {
        if (active) setState({ status: "ready", sprints });
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
    };
  }, [project.id, attempt]);

  const actions = useSprintActions(project.id, (action, sprint) => {
    setNotice({
      message: `${sprintLabel(sprint)} ${sprintActionDone[action]}.`,
      sequence: ++sequence.current,
    });
    setAttempt((value) => value + 1);
    if (action === "delete")
      requestAnimationFrame(() =>
        headingRef.current?.querySelector<HTMLElement>("a, button")?.focus(),
      );
  });

  const sprints = state.status === "ready" ? state.sprints : [];
  const next = nextDraft(sprints);
  const shown = sprints.filter((sprint) =>
    filters
      .find((entry) => entry.id === filter)!
      .statuses.includes(sprint.status),
  );

  function startWarning(sprint: SprintSummary) {
    return next && next.id !== sprint.id
      ? `${sprintLabel(next)} is planned to start earlier. Starting this Sprint first changes the planned order.`
      : undefined;
  }

  function menuItems(sprint: SprintSummary): DropdownItem[] {
    const counts = { itemCount: sprint.itemCount, doneCount: sprint.doneCount };
    const edit: DropdownItem = {
      label: "Edit Sprint",
      href: projectHref(project.id, `sprints/${sprint.id}/edit`),
    };
    const remove: DropdownItem = {
      label: "Delete Sprint",
      tone: "danger",
      onSelect: () => actions.open("delete", sprint, counts),
    };
    if (sprint.status === "DRAFT")
      return [
        edit,
        {
          label: "Start Sprint",
          onSelect: () =>
            actions.open("start", sprint, counts, startWarning(sprint)),
        },
        remove,
      ];
    if (sprint.status === "ACTIVE")
      return [
        edit,
        {
          label: "Complete Sprint",
          onSelect: () => actions.open("complete", sprint, counts),
        },
        remove,
      ];
    return [remove];
  }

  const planAction = canManage ? (
    <Link
      href={projectHref(project.id, "sprints/new")}
      className="button button-primary"
    >
      <Plus size={16} aria-hidden="true" />
      New Sprint
    </Link>
  ) : undefined;

  return (
    <>
      <h1 className="sr-only">Sprints</h1>
      <div ref={headingRef} className={styles.listToolbar}>
        {state.status === "ready" && sprints.length > 0 && (
          <div
            className={styles.filters}
            role="group"
            aria-label="Filter Sprints"
          >
            {filters.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={styles.filter}
                aria-pressed={filter === entry.id}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
                <span className={styles.count}>
                  {
                    sprints.filter((sprint) =>
                      entry.statuses.includes(sprint.status),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
        )}
        {planAction}
      </div>
      {notice && (
        <Toast
          key={notice.sequence}
          message={notice.message}
          onDismiss={() => setNotice(null)}
          onRestoreFocus={() =>
            headingRef.current?.querySelector<HTMLElement>("a, button")?.focus()
          }
        />
      )}
      {state.status === "loading" ? (
        <BacklogLoading label="Loading Sprints…" rows={3} />
      ) : state.status === "error" ? (
        <div className={styles.loadError} role="alert">
          <h2>Couldn’t load Sprints</h2>
          <p>{state.message}</p>
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
        </div>
      ) : !sprints.length ? (
        <EmptyState
          icon={SprintIcon}
          title="No Sprints yet"
          description={
            canManage
              ? "Create the first Sprint, then add Work Items from their details."
              : "Sprints planned by the Product Owner will appear here."
          }
        />
      ) : (
        <>
          {shown.length ? (
            <ul
              className={styles.list}
              aria-label={`${filters.find((entry) => entry.id === filter)!.label} Sprints`}
            >
              {shown.map((sprint) => {
                const label = sprintLabel(sprint);
                const items = canManage ? menuItems(sprint) : [];
                return (
                  <li key={sprint.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <Link
                        className={styles.title}
                        href={projectHref(project.id, `sprints/${sprint.id}`)}
                        title={label}
                      >
                        {label}
                      </Link>
                      {sprint.goal && (
                        <p className={styles.goal} title={sprint.goal}>
                          {sprint.goal}
                        </p>
                      )}
                    </div>
                    <span className={styles.dates}>
                      {formatSprintRange(sprint)}
                    </span>
                    <SprintProgress
                      label={label}
                      done={sprint.doneCount}
                      total={sprint.itemCount}
                    />
                    <span className={styles.actions}>
                      {items.length > 0 && (
                        <DropdownMenu
                          label={`Actions for ${label}`}
                          triggerLabel={`Actions for ${label}`}
                          triggerClassName={styles.kebab}
                          trigger={
                            <MoreHorizontal size={17} aria-hidden="true" />
                          }
                          groups={sprintMenuGroups(items)}
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={`${styles.list} ${styles.empty}`}>
              <h2>
                {filter === "closed"
                  ? "No closed Sprints"
                  : "No current Sprint"}
              </h2>
              <p>
                {filter === "closed"
                  ? "Completed Sprints will appear here."
                  : canManage
                    ? "Create a Sprint to plan the next iteration."
                    : "The Product Owner has not created the next Sprint yet."}
              </p>
            </div>
          )}
        </>
      )}
      {actions.dialog}
    </>
  );
}
