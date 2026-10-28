"use client";

import { useId, useRef, useState } from "react";

import type { DropdownItem } from "@/components/shared/DropdownMenu";
import type { Sprint } from "@/lib/sprints";

import { BacklogConfirmation } from "@/components/backlog/BacklogConfirmation";
import { previewSprintRepository as repository } from "@/lib/preview-sprints";
import {
  fromDateInput,
  sprintDateError,
  sprintErrorMessage,
  sprintLabel,
  toDateInput,
} from "@/lib/sprints";

import styles from "./sprints.module.css";

/** Destructive actions sit in their own group, which the menu separates with a rule. */
export function sprintMenuGroups(items: DropdownItem[]) {
  return [
    items.filter((item) => item.tone !== "danger"),
    items.filter((item) => item.tone === "danger"),
  ].filter((group) => group.length > 0);
}

export type SprintAction = "start" | "complete" | "delete";

type Request = {
  action: SprintAction;
  sprint: Sprint;
  itemCount: number;
  doneCount: number;
  warning?: string;
  /** Captured when the dialog opens: the Sprint closes before its planned end. */
  endsEarly: boolean;
  trigger: HTMLElement | null;
};

const copy: Record<
  SprintAction,
  { confirm: string; busy: string; tone: "danger" | "primary" }
> = {
  start: { confirm: "Start Sprint", busy: "Starting…", tone: "primary" },
  complete: {
    confirm: "Complete Sprint",
    busy: "Completing…",
    tone: "primary",
  },
  delete: { confirm: "Delete Sprint", busy: "Deleting…", tone: "danger" },
};

export const sprintActionDone: Record<SprintAction, string> = {
  start: "started",
  complete: "completed",
  delete: "deleted",
};

type Review = { name: string; goal: string; start: string; end: string };

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Start reviews the Sprint's details first; empty dates default to a two-week Sprint from today. */
function reviewFor(sprint: Sprint): Review {
  const start = sprint.plannedStartAt
    ? toDateInput(sprint.plannedStartAt)
    : new Date().toISOString().slice(0, 10);
  return {
    name: sprint.name,
    goal: sprint.goal ?? "",
    start,
    end: sprint.plannedEndAt
      ? toDateInput(sprint.plannedEndAt)
      : addDays(start, 14),
  };
}

/** Shared confirmation flow for lifecycle actions on the list and detail pages. */
export function useSprintActions(
  projectId: string,
  onDone: (action: SprintAction, sprint: Sprint) => void,
  onBusy?: (busy: boolean) => void,
) {
  const [request, setRequest] = useState<Request | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const pending = useRef(false);
  const ids = useId();
  const reasonId = `${ids}-reason`;

  function open(
    action: SprintAction,
    sprint: Sprint,
    counts: { itemCount: number; doneCount: number },
    warning?: string,
  ) {
    setError("");
    setReason("");
    setReview(action === "start" ? reviewFor(sprint) : null);
    setRequest({
      action,
      sprint,
      ...counts,
      warning,
      endsEarly:
        sprint.plannedEndAt !== null &&
        Date.now() < Date.parse(sprint.plannedEndAt),
      trigger: document.activeElement as HTMLElement | null,
    });
  }

  function close(restoreFocus = true) {
    const trigger = request?.trigger;
    setRequest(null);
    setError("");
    if (restoreFocus)
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
  }

  async function confirm() {
    if (!request || pending.current) return;
    const { action, sprint } = request;
    if (action === "start" && review) {
      const problem = !review.name.trim()
        ? "Enter a Sprint name."
        : !review.start || !review.end
          ? "Enter a start and end date."
          : sprintDateError(
              fromDateInput(review.start),
              fromDateInput(review.end),
            );
      if (problem) {
        setError(problem);
        return;
      }
    }
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      let result: Sprint = sprint;
      if (action === "start" && review)
        result = await repository.start(projectId, sprint.id, {
          name: review.name.trim(),
          goal: review.goal.trim() || null,
          plannedStartAt: fromDateInput(review.start),
          plannedEndAt: fromDateInput(review.end),
        });
      else if (action === "complete")
        result = await repository.complete(projectId, sprint.id, reason);
      else await repository.remove(projectId, sprint.id);
      close(action !== "delete");
      onDone(action, result);
    } catch (cause) {
      setError(
        sprintErrorMessage(
          cause,
          "Couldn’t update the Sprint. Please try again.",
        ),
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }

  let dialog = null;
  if (request) {
    const { action, sprint, itemCount, doneCount, warning, endsEarly } =
      request;
    const label = sprintLabel(sprint);
    const unfinished = itemCount - doneCount;
    dialog = (
      <BacklogConfirmation
        title={
          action === "start"
            ? "Start Sprint"
            : action === "delete"
              ? `Delete ${label}?`
              : `${copy[action].confirm.replace(" Sprint", "")} ${label}?`
        }
        confirmLabel={copy[action].confirm}
        busyLabel={copy[action].busy}
        tone={copy[action].tone}
        confirmClassName={action === "complete" ? styles.primary : undefined}
        busy={busy}
        error={error}
        onCancel={() => {
          if (!pending.current) close();
        }}
        onConfirm={() => void confirm()}
      >
        {action === "start" && review && (
          <div className={styles.startFields}>
            {warning && <p className={styles.warning}>{warning}</p>}
            <p>
              <strong>{itemCount}</strong> Work{" "}
              {itemCount === 1 ? "Item" : "Items"} will be included in this
              Sprint.
            </p>
            <div className={styles.field}>
              <label htmlFor={`${ids}-name`}>
                Sprint Name{" "}
                <span className={styles.required} aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id={`${ids}-name`}
                value={review.name}
                maxLength={120}
                disabled={busy}
                onChange={(event) =>
                  setReview({ ...review, name: event.target.value })
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${ids}-start`}>
                Start date{" "}
                <span className={styles.required} aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id={`${ids}-start`}
                type="date"
                value={review.start}
                disabled={busy}
                onChange={(event) =>
                  setReview({ ...review, start: event.target.value })
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${ids}-end`}>
                End date{" "}
                <span className={styles.required} aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id={`${ids}-end`}
                type="date"
                value={review.end}
                disabled={busy}
                onChange={(event) =>
                  setReview({ ...review, end: event.target.value })
                }
              />
              <p className={styles.hint}>
                At most one month, without overlapping another open Sprint.
              </p>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${ids}-goal`}>Sprint Goal</label>
              <textarea
                id={`${ids}-goal`}
                value={review.goal}
                disabled={busy}
                onChange={(event) =>
                  setReview({ ...review, goal: event.target.value })
                }
              />
            </div>
          </div>
        )}
        {action === "complete" && (
          <div className={styles.startFields}>
            <p>
              {doneCount} done {doneCount === 1 ? "item stays" : "items stay"}{" "}
              with this Sprint. {unfinished} unfinished{" "}
              {unfinished === 1 ? "item returns" : "items return"} to the
              backlog with {unfinished === 1 ? "its" : "their"} status
              unchanged.
            </p>
            {endsEarly && (
              <p className={styles.warning}>
                The Sprint is closing before its end date. Note why, for example
                if the Sprint Goal became obsolete.
              </p>
            )}
            <div className={styles.field}>
              <label htmlFor={reasonId}>Close note</label>
              <textarea
                id={reasonId}
                value={reason}
                disabled={busy}
                placeholder={
                  endsEarly
                    ? "Why is the Sprint closing early?"
                    : "Optional summary for the team"
                }
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
        )}
        {action === "delete" && (
          <p>
            You’re about to permanently delete <strong>{label}</strong> and
            remove it from {itemCount} Work {itemCount === 1 ? "Item" : "Items"}
            . {itemCount === 1 ? "It returns" : "They return"} to the backlog
            with {itemCount === 1 ? "its" : "their"} status unchanged
            {sprint.status === "CLOSED"
              ? ", and the Sprint’s results are lost."
              : "."}{" "}
            Once deleted, it cannot be undone or recovered.
          </p>
        )}
      </BacklogConfirmation>
    );
  }

  return { open, dialog };
}
