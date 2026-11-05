"use client";

import type { FormEvent } from "react";

import { useEffect, useRef, useState } from "react";

import { sprintErrorMessage } from "@/lib/sprints";

import styles from "./sprint-board.module.css";

export function BoardCreateItem({
  onCreate,
  onCancel,
}: {
  onCreate: (title: string) => void;
  onCancel: () => void;
}) {
  const titleInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  useEffect(() => titleInput.current?.focus(), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      onCreate(String(data.get("title")));
    } catch (cause) {
      setError(
        sprintErrorMessage(cause, "Couldn’t create the work item. Try again."),
      );
    }
  }

  return (
    <form
      id="board-create-item"
      className={styles.createForm}
      onSubmit={submit}
      onInput={() => setError("")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label>
        Title
        <input ref={titleInput} name="title" autoComplete="off" required />
      </label>
      {error && (
        <p role="alert" className={styles.createError}>
          {error}
        </p>
      )}
      <div className={styles.createActions}>
        <button type="submit" className="button button-primary">
          Create work item
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
