"use client";

import { useRef, useState } from "react";

import type { BacklogItem, UpdateBacklogItemInput } from "@/lib/backlog-items";

import { backlogErrorMessage } from "@/lib/backlog-items";

import styles from "./backlog.module.css";

export type BacklogEditMode = "content" | "priority";

export function BacklogItemEditor({
  item,
  onSave,
  onFinish,
  onDirty,
  onBusy,
}: {
  item: BacklogItem;
  onSave: (id: string, changes: UpdateBacklogItemInput) => Promise<void>;
  onFinish: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState(false);
  const submitting = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  function dirty(next: { title?: string; description?: string }) {
    onDirty(
      (next.title ?? title) !== item.title ||
        (next.description ?? description) !== (item.description ?? ""),
    );
  }
  async function submit() {
    if (submitting.current) return;
    setError("");
    setTitleError(false);
    if (!title.trim()) {
      setTitleError(true);
      setError("Enter a title.");
      titleRef.current?.focus();
      return;
    }
    const changes: UpdateBacklogItemInput = { title, description };
    submitting.current = true;
    setSaving(true);
    onBusy(true);
    try {
      await onSave(item.id, changes);
      onFinish();
    } catch (cause) {
      setError(
        backlogErrorMessage(cause, "Couldn’t save changes. Please try again."),
      );
    } finally {
      submitting.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  return (
    <form
      className={`${styles.inlineEditor} ${styles.itemEditor}`}
      aria-label="Edit item"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <fieldset disabled={saving}>
        <>
          <label>
            <span>
              Title <span className={styles.requiredHint}>(required)</span>
            </span>
            <input
              autoFocus
              ref={titleRef}
              value={title}
              aria-invalid={titleError || undefined}
              aria-describedby={error ? `edit-error-${item.id}` : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                dirty({ title: event.target.value });
                if (titleError) setError("");
                setTitleError(false);
              }}
            />
          </label>
          <label>
            Description
            <textarea
              rows={9}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                dirty({ description: event.target.value });
              }}
              placeholder="Describe what needs to be done…"
            />
          </label>
        </>
      </fieldset>
      {error && (
        <p
          id={`edit-error-${item.id}`}
          className={styles.editorError}
          role="alert"
        >
          {error}
        </p>
      )}
      <div className={`${styles.editorActions} ${styles.stickyEditorActions}`}>
        <button
          className="button button-primary"
          type="submit"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          className={styles.editButton}
          type="button"
          disabled={saving}
          onClick={onFinish}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
