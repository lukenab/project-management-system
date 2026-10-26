"use client";

import type { FormEvent, RefObject } from "react";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BacklogDataError, backlogErrorMessage } from "@/lib/backlog-items";

import styles from "./backlog.module.css";

export function QuickCreateItem({
  inputRef,
  onCreate,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onCreate: (title: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [invalidTitle, setInvalidTitle] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  useEffect(() => inputRef.current?.focus(), [inputRef]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!title.trim()) {
      setInvalidTitle(true);
      setError("Enter a title.");
      inputRef.current?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError("");
    setInvalidTitle(false);
    try {
      await onCreate(title.trim());
    } catch (cause) {
      setInvalidTitle(
        cause instanceof BacklogDataError && cause.code === "VALIDATION",
      );
      setError(
        backlogErrorMessage(
          cause,
          "Couldn’t create the item. Your title is kept. Please try again.",
        ),
      );
      inputRef.current?.focus();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <form className={styles.quickCreate} onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="backlog-item-title">
        Title
      </label>
      <div className={styles.quickCreateRow}>
        <Plus size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          id="backlog-item-title"
          className={styles.titleInput}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError("");
            setInvalidTitle(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (!submitting.current) onClose();
            }
          }}
          placeholder="What needs to be done?"
          autoComplete="off"
          readOnly={saving}
          aria-invalid={invalidTitle || undefined}
          aria-describedby={`backlog-create-help${error ? " backlog-create-error" : ""}`}
        />
        <button
          type="submit"
          className="button button-primary"
          disabled={saving}
        >
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
      {error && (
        <p className={styles.fieldError} id="backlog-create-error" role="alert">
          {error}
        </p>
      )}
      <p className={styles.keyboardHelp} id="backlog-create-help">
        Enter to create · Esc to close
      </p>
    </form>
  );
}
