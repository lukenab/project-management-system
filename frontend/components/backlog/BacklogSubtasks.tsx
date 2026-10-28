"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import type {
  WorkItem,
  WorkItemMember,
  UpdateWorkItemInput,
} from "@/lib/work-items";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { Toast } from "@/components/shared/Toast";
import { previewWorkItemRepository as repository } from "@/lib/preview-work-items";
import {
  isWorkItemAssignee,
  workItemErrorMessage,
  workItemStatusLabels,
} from "@/lib/work-items";

import styles from "./backlog.module.css";
import { BacklogConfirmation } from "./BacklogConfirmation";
import { BacklogStatusBadge } from "./BacklogItemStatus";
import { BacklogLoading } from "./BacklogLoading";
import { SubtaskChoice } from "./SubtaskChoice";
import { WorkTypeIcon } from "./WorkTypeIcon";

type ListState =
  | { status: "loading" }
  | { status: "ready"; subtasks: WorkItem[]; members: WorkItemMember[] }
  | { status: "error"; message: string };
type FormState = { kind: "create" } | { kind: "edit"; id: string } | null;

export function BacklogSubtasks({
  item,
  editable,
  onBusy,
}: {
  item: WorkItem;
  editable: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<FormState>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<WorkItem | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [toast, setToast] = useState<number | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const titleTriggers = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    mounted.current = true;
    let active = true;
    Promise.all([
      repository.list(item.projectId, { parentId: item.id }),
      repository.listMembers(item.projectId),
    ]).then(
      ([subtasks, members]) => {
        if (active) setState({ status: "ready", subtasks, members });
      },
      (cause) => {
        if (active)
          setState({
            status: "error",
            message: workItemErrorMessage(
              cause,
              "Couldn’t load subtasks. Please try again.",
            ),
          });
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [item.projectId, item.id, attempt]);

  const subtasks = state.status === "ready" ? state.subtasks : [];
  const members = state.status === "ready" ? state.members : [];
  const developers = members.filter(isWorkItemAssignee);
  const counts = {
    DONE: subtasks.filter((entry) => entry.status === "DONE").length,
    IN_PROGRESS: subtasks.filter((entry) => entry.status === "IN_PROGRESS")
      .length,
    TODO: subtasks.filter((entry) => entry.status === "TODO").length,
  };
  const percent = subtasks.length
    ? Math.round((counts.DONE / subtasks.length) * 100)
    : 0;

  function startForm(subtask?: WorkItem) {
    if (pending.current) return;
    setForm(subtask ? { kind: "edit", id: subtask.id } : { kind: "create" });
    setTitle(subtask?.title ?? "");
    setDescription(subtask?.description ?? "");
    setFormError("");
    if (editable) requestAnimationFrame(() => titleRef.current?.focus());
  }
  function closeForm() {
    if (pending.current) return;
    const previous = form;
    setForm(null);
    setFormError("");
    requestAnimationFrame(() =>
      (previous?.kind === "edit"
        ? titleTriggers.current[previous.id]
        : addTrigger.current
      )?.focus(),
    );
  }
  function markBusy(value: boolean) {
    pending.current = value;
    setBusy(value);
    onBusy(value);
  }
  function replace(updated: WorkItem) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            subtasks: current.subtasks.map((entry) =>
              entry.id === updated.id ? updated : entry,
            ),
          }
        : current,
    );
  }
  async function submitForm() {
    if (pending.current || !form || !editable) return;
    markBusy(true);
    setFormError("");
    try {
      const updated =
        form.kind === "create"
          ? await repository.create(item.projectId, {
              parentId: item.id,
              title,
            })
          : await repository.update(item.projectId, form.id, {
              title,
              description: description.trim() ? description : null,
            });
      if (!mounted.current) return;
      if (form.kind === "create")
        setState((current) =>
          current.status === "ready"
            ? { ...current, subtasks: [...current.subtasks, updated] }
            : current,
        );
      else replace(updated);
      setForm(null);
      requestAnimationFrame(() =>
        (form.kind === "edit"
          ? titleTriggers.current[updated.id]
          : addTrigger.current
        )?.focus(),
      );
    } catch (cause) {
      if (mounted.current)
        setFormError(
          workItemErrorMessage(
            cause,
            "Couldn’t save the subtask. Please try again.",
          ),
        );
    } finally {
      markBusy(false);
    }
  }
  async function updateField(subtask: WorkItem, changes: UpdateWorkItemInput) {
    if (pending.current || !editable) return;
    markBusy(true);
    try {
      const updated = await repository.update(
        item.projectId,
        subtask.id,
        changes,
      );
      if (mounted.current) replace(updated);
    } finally {
      markBusy(false);
    }
  }
  async function confirmRemove() {
    if (!removing || pending.current || !editable) return;
    markBusy(true);
    setRemoveError("");
    try {
      await repository.remove(item.projectId, removing.id);
      if (!mounted.current) return;
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              subtasks: current.subtasks.filter(
                (entry) => entry.id !== removing.id,
              ),
            }
          : current,
      );
      if (form?.kind === "edit" && form.id === removing.id) setForm(null);
      setRemoving(null);
      setToast((sequence) => (sequence ?? 0) + 1);
      requestAnimationFrame(() => addTrigger.current?.focus());
    } catch (cause) {
      if (mounted.current)
        setRemoveError(
          workItemErrorMessage(
            cause,
            "Couldn’t delete this subtask. Please try again.",
          ),
        );
    } finally {
      markBusy(false);
    }
  }

  const editor = (subtask: WorkItem) => (
    <tr className={styles.subtaskExpandedRow}>
      <td colSpan={editable ? 4 : 3}>
        {editable ? (
          <form
            aria-label={`Edit ${subtask.key}`}
            className={styles.subtaskEditor}
            onSubmit={(event) => {
              event.preventDefault();
              void submitForm();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeForm();
              }
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Title
                <input
                  ref={titleRef}
                  value={title}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Description{" "}
                <span className={styles.placeholder}>— optional</span>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </fieldset>
            {formError && (
              <p role="alert" className={styles.editorError}>
                {formError}
              </p>
            )}
            <div className={styles.editorActions}>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy || !title.trim()}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className={styles.editButton}
                disabled={busy}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.subtaskEditor}>
            <h4>Description</h4>
            <p
              className={!subtask.description ? styles.placeholder : undefined}
            >
              {subtask.description || "No description added."}
            </p>
            <button
              className={styles.editButton}
              type="button"
              onClick={closeForm}
            >
              Close
            </button>
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <section className={styles.subtasks} aria-label="Subtasks">
      <div className={styles.subtaskHeading}>
        <h3>
          Subtasks{" "}
          <span className={styles.placeholder}>
            {state.status === "ready" ? subtasks.length : ""}
          </span>
        </h3>
        {editable && state.status === "ready" && (
          <button
            ref={addTrigger}
            className={styles.editButton}
            type="button"
            aria-label="Add subtask"
            title="Add subtask"
            disabled={busy}
            onClick={() => startForm()}
          >
            <Plus size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      {state.status === "loading" && (
        <BacklogLoading label="Loading subtasks…" rows={2} />
      )}
      {state.status === "error" && (
        <>
          <p className={styles.editorError} role="alert">
            {state.message}
          </p>
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
        </>
      )}
      {state.status === "ready" && (
        <>
          {!!subtasks.length && (
            <div className={styles.subtaskProgress}>
              <div
                className={styles.subtaskProgressTrack}
                role="progressbar"
                aria-label="Subtask completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${counts.DONE}/${subtasks.length} done, ${counts.IN_PROGRESS} in progress, ${counts.TODO} to do`}
              >
                {(["DONE", "IN_PROGRESS", "TODO"] as const).map((status) => (
                  <span
                    key={status}
                    data-status={status}
                    style={{
                      width: `${(counts[status] / subtasks.length) * 100}%`,
                    }}
                    title={`${workItemStatusLabels[status]}: ${counts[status]}`}
                  />
                ))}
              </div>
              <span>
                {counts.DONE}/{subtasks.length} done · {percent}%
              </span>
            </div>
          )}
          {!!subtasks.length ? (
            <div className={styles.subtaskTableFrame}>
              <table className={styles.subtaskTable} aria-label="Subtasks list">
                <colgroup>
                  <col />
                  <col className={styles.subtaskAssigneeColumn} />
                  <col className={styles.subtaskStatusColumn} />
                  {editable && <col className={styles.subtaskActionsColumn} />}
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Assignee</th>
                    <th scope="col">Status</th>
                    {editable && (
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {subtasks.map((subtask) => {
                    const member = members.find(
                      (entry) => entry.membershipId === subtask.assigneeId,
                    );
                    const expanded =
                      form?.kind === "edit" && form.id === subtask.id;
                    return (
                      <Fragment key={subtask.id}>
                        <tr data-subtask-id={subtask.id}>
                          <td>
                            <button
                              ref={(element) => {
                                titleTriggers.current[subtask.id] = element;
                              }}
                              type="button"
                              className={styles.subtaskTitleButton}
                              disabled={busy}
                              aria-expanded={expanded}
                              onClick={() =>
                                expanded ? closeForm() : startForm(subtask)
                              }
                            >
                              <WorkTypeIcon workType="TASK" />
                              <span>
                                <span className={styles.childKey}>
                                  {subtask.key}
                                </span>{" "}
                                <span>{subtask.title}</span>
                              </span>
                            </button>
                          </td>
                          <td>
                            {editable ? (
                              <SubtaskChoice
                                item={subtask}
                                field="assigneeId"
                                members={developers}
                                busy={busy}
                                onSave={(changes) =>
                                  updateField(subtask, changes)
                                }
                              />
                            ) : (
                              <span className={styles.subtaskAssigneeName}>
                                {member?.fullName ?? "None"}
                              </span>
                            )}
                          </td>
                          <td>
                            {editable ? (
                              <SubtaskChoice
                                item={subtask}
                                field="status"
                                members={developers}
                                busy={busy}
                                onSave={(changes) =>
                                  updateField(subtask, changes)
                                }
                              />
                            ) : (
                              <BacklogStatusBadge status={subtask.status} />
                            )}
                          </td>
                          {editable && (
                            <td>
                              <DropdownMenu
                                label={`Actions for ${subtask.key}`}
                                triggerLabel={`Actions for ${subtask.key}`}
                                triggerClassName={styles.subtaskMore}
                                trigger={
                                  <MoreHorizontal
                                    size={16}
                                    aria-hidden="true"
                                  />
                                }
                                groups={[
                                  [
                                    {
                                      label: "Edit",
                                      icon: Pencil,
                                      onSelect: busy
                                        ? undefined
                                        : () => startForm(subtask),
                                    },
                                  ],
                                  [
                                    {
                                      label: "Delete",
                                      icon: Trash2,
                                      tone: "danger",
                                      onSelect: busy
                                        ? undefined
                                        : () => {
                                            setRemoving(subtask);
                                            setRemoveError("");
                                          },
                                    },
                                  ],
                                ]}
                              />
                            </td>
                          )}
                        </tr>
                        {expanded && editor(subtask)}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.subtaskEmpty}>No subtasks yet.</p>
          )}
          {editable && form?.kind === "create" && (
            <form
              aria-label="Create subtask"
              className={styles.subtaskQuickCreate}
              onSubmit={(event) => {
                event.preventDefault();
                void submitForm();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeForm();
                }
              }}
            >
              <div>
                <WorkTypeIcon workType="TASK" />
                <input
                  ref={titleRef}
                  aria-label="New subtask title"
                  placeholder="What needs to be done?"
                  value={title}
                  required
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={busy || !title.trim()}
                >
                  {busy ? "Adding…" : "Add"}
                </button>
              </div>
              {formError && (
                <p className={styles.editorError} role="alert">
                  {formError}
                </p>
              )}
              <p className={styles.subtaskHint}>Enter to add · Esc to close</p>
            </form>
          )}
        </>
      )}
      {removing && (
        <BacklogConfirmation
          title={`Delete ${removing.key}?`}
          confirmLabel="Delete"
          busy={busy}
          error={removeError}
          onCancel={() => {
            const previous = removing.id;
            setRemoving(null);
            setRemoveError("");
            requestAnimationFrame(() =>
              titleTriggers.current[previous]?.focus(),
            );
          }}
          onConfirm={() => void confirmRemove()}
        >
          <p>{removing.title}</p>
        </BacklogConfirmation>
      )}
      {toast !== null && (
        <Toast
          key={toast}
          message="Subtask deleted."
          onDismiss={() => setToast(null)}
          onRestoreFocus={() => addTrigger.current?.focus()}
        />
      )}
    </section>
  );
}
