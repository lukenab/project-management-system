"use client";

import { useRef, useState } from "react";

import type {
  WorkItem,
  WorkItemStatus,
  UpdateWorkItemInput,
} from "@/lib/work-items";

import { workItemErrorMessage } from "@/lib/work-items";

import styles from "./backlog.module.css";

const labels: Record<WorkItemStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export function BacklogStatusBadge({ status }: { status: WorkItemStatus }) {
  return (
    <span className={styles.statusBadge} data-status={status}>
      {labels[status]}
    </span>
  );
}

export function BacklogItemStatus({
  item,
  editable,
  onSave,
  onBusy,
}: {
  item: WorkItem;
  editable: boolean;
  onSave: (id: string, changes: UpdateWorkItemInput) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function change(status: WorkItemStatus) {
    if (pending.current || status === item.status) return;
    pending.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      await onSave(item.id, { status });
    } catch (cause) {
      setError(
        workItemErrorMessage(
          cause,
          "Couldn’t update status. Please try again.",
        ),
      );
    } finally {
      pending.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  return (
    <div className={styles.statusControl}>
      {editable ? (
        <select
          aria-label="Item status"
          value={item.status}
          disabled={saving}
          aria-busy={saving}
          className={styles.statusSelect}
          data-status={item.status}
          onChange={(event) =>
            void change(event.target.value as WorkItemStatus)
          }
        >
          <option value="TODO">To do</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
        </select>
      ) : (
        <BacklogStatusBadge status={item.status} />
      )}
      {saving && (
        <span className={styles.placeholder} role="status">
          Saving…
        </span>
      )}
      {error && (
        <p role="alert" className={styles.editorError}>
          {error}
        </p>
      )}
    </div>
  );
}
