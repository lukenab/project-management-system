"use client";

import { ChevronDown, Search, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  WorkItem,
  WorkItemMember,
  WorkItemStatus,
  UpdateWorkItemInput,
} from "@/lib/work-items";

import { workItemErrorMessage, workItemStatusLabels } from "@/lib/work-items";

import styles from "./backlog.module.css";
import { ChoiceList, ChoicePopover } from "./BacklogItemMetadata";

export function SubtaskChoice({
  item,
  field,
  members,
  busy,
  onSave,
}: {
  item: WorkItem;
  field: "assigneeId" | "status";
  members: WorkItemMember[];
  busy: boolean;
  onSave: (changes: UpdateWorkItemInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef<Partial<Record<"choice", HTMLButtonElement | null>>>(
    {},
  );
  const pending = useRef(false);
  const member = members.find(
    (entry) => entry.membershipId === item.assigneeId,
  );
  const isAssignee = field === "assigneeId";
  const label = `${isAssignee ? "Assignee" : "Status"} for ${item.key}`;
  function close(restoreFocus = true) {
    if (pending.current) return;
    setOpen(false);
    setError("");
    if (restoreFocus)
      requestAnimationFrame(() => triggers.current.choice?.focus());
  }
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node) && !pending.current) {
        setOpen(false);
        setError("");
      }
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  async function select(value: string) {
    if (pending.current || busy) return;
    if (value === (item[field] ?? "")) {
      close();
      return;
    }
    pending.current = true;
    setError("");
    try {
      await onSave(
        isAssignee
          ? { assigneeId: value || null }
          : { status: value as WorkItemStatus },
      );
      pending.current = false;
      close();
    } catch (cause) {
      setError(workItemErrorMessage(cause, "Couldn’t save. Please try again."));
    } finally {
      pending.current = false;
    }
  }
  const search = query.trim().toLowerCase();
  return (
    <div
      ref={root}
      className={styles.subtaskChoice}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !pending.current
        ) {
          setOpen(false);
          setError("");
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={(element) => {
          triggers.current.choice = element;
        }}
        type="button"
        className={
          isAssignee
            ? styles.subtaskAssigneeButton
            : `${styles.statusBadge} ${styles.subtaskStatusButton}`
        }
        data-status={!isAssignee ? item.status : undefined}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          if (open) close();
          else {
            setQuery("");
            setError("");
            setOpen(true);
          }
        }}
      >
        {isAssignee ? (
          <>
            <span className={styles.subtaskAvatar} aria-hidden="true">
              {member ? member.initials : <UserRound size={13} />}
            </span>
            <span className={styles.subtaskAssigneeName}>
              {member?.fullName ?? "None"}
            </span>
          </>
        ) : (
          workItemStatusLabels[item.status]
        )}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <ChoicePopover section="choice" triggers={triggers}>
          {isAssignee && (
            <div className={styles.choiceSearch}>
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search"
                aria-label={`Search assignees for ${item.key}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    event.currentTarget
                      .closest("[popover]")
                      ?.querySelector<HTMLButtonElement>('[role="option"]')
                      ?.focus();
                  }
                }}
              />
            </div>
          )}
          <fieldset
            disabled={busy}
            className={styles.subtaskChoiceOptions}
            aria-busy={busy}
          >
            <ChoiceList
              label={`${label} options`}
              selected={item[field] ?? ""}
              options={
                isAssignee
                  ? [
                      { id: "", name: "None" },
                      ...members.map((entry) => ({
                        id: entry.membershipId,
                        name: entry.fullName,
                        subtitle: entry.email,
                        initials: entry.initials,
                      })),
                    ].filter((entry) =>
                      `${entry.name} ${"subtitle" in entry ? entry.subtitle : ""}`
                        .toLowerCase()
                        .includes(search),
                    )
                  : (Object.keys(workItemStatusLabels) as WorkItemStatus[]).map(
                      (status) => ({
                        id: status,
                        name: workItemStatusLabels[status],
                      }),
                    )
              }
              onSelect={(value) => void select(value)}
            />
          </fieldset>
          {busy && (
            <p className={styles.noChoices} role="status">
              Saving…
            </p>
          )}
          {error && (
            <p
              className={`${styles.editorError} ${styles.subtaskChoiceError}`}
              role="alert"
            >
              {error}
            </p>
          )}
        </ChoicePopover>
      )}
    </div>
  );
}
