"use client";

import type { RefObject } from "react";

import { useEffect, useRef, useState } from "react";

import type { WorkItem, UpdateWorkItemInput } from "@/lib/work-items";

import { workItemErrorMessage } from "@/lib/work-items";

import styles from "./backlog.module.css";
import { ChoicePopover, ChoiceList } from "./BacklogItemMetadata";

export function BacklogPriorityEditor({
  item,
  triggers,
  onSave,
  onFinish,
  onBusy,
}: {
  item: WorkItem;
  triggers: RefObject<Partial<Record<"Priority", HTMLButtonElement | null>>>;
  onSave: (id: string, changes: UpdateWorkItemInput) => Promise<void>;
  onFinish: (restoreFocus?: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  }, [onFinish]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!pending.current && !root.current?.contains(event.target as Node))
        finish.current(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  async function select(priority: WorkItem["priority"]) {
    if (pending.current) return;
    if (priority === item.priority) {
      onFinish();
      return;
    }
    pending.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      await onSave(item.id, { priority });
      onFinish();
    } catch (cause) {
      setError(
        workItemErrorMessage(
          cause,
          "Couldn’t update priority. Please try again.",
        ),
      );
    } finally {
      pending.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  return (
    <div
      ref={root}
      className={styles.inlineEditor}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!pending.current) onFinish();
        }
      }}
    >
      <ChoicePopover section="Priority" triggers={triggers}>
        <div
          aria-busy={saving}
          onKeyDown={(event) => {
            if (saving) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <ChoiceList
            label="Priority options"
            selected={item.priority ?? ""}
            options={[
              { id: "HIGH", name: "High" },
              { id: "MEDIUM", name: "Medium" },
              { id: "LOW", name: "Low" },
            ]}
            onSelect={(value) => void select(value as WorkItem["priority"])}
          />
          {saving && (
            <p className={styles.noChoices} role="status">
              Saving…
            </p>
          )}
          {error && (
            <p
              className={`${styles.editorError} ${styles.priorityError}`}
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </ChoicePopover>
    </div>
  );
}
