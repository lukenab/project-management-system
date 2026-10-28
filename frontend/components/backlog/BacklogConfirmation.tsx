"use client";

import type { ReactNode } from "react";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import styles from "./backlog.module.css";

export function BacklogConfirmation({
  title,
  children,
  confirmLabel,
  busy = false,
  busyLabel = "Deleting…",
  tone = "danger",
  confirmClassName,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  busyLabel?: string;
  tone?: "danger" | "primary";
  /** Overrides the confirm button style, e.g. for a domain-specific primary. */
  confirmClassName?: string;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  const id = useId();
  // Backdrop clicks target the dialog itself; compare against its box instead.
  function isOutside(event: { clientX: number; clientY: number }) {
    const box = ref.current?.getBoundingClientRect();
    return (
      !!box &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    );
  }
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = document.querySelector("dialog[open]")
        ? "hidden"
        : previousOverflow === "hidden"
          ? ""
          : previousOverflow;
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={styles.confirmation}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onCancel();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        pressedOutside.current = isOutside(event);
      }}
      onClick={(event) => {
        // Close only when the press began and ended outside, so a text
        // selection dragged past the edge does not dismiss the dialog.
        const dismiss = pressedOutside.current && isOutside(event);
        pressedOutside.current = false;
        if (dismiss && !busy) onCancel();
      }}
    >
      <div className={styles.confirmationHeading}>
        <h2 id={`${id}-title`}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close confirmation"
          disabled={busy}
          onClick={onCancel}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-body`} className={styles.confirmationBody}>
        {children}
      </div>
      {error && (
        <p className={styles.editorError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.confirmationActions}>
        <button
          autoFocus
          className="button"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className={`button ${confirmClassName ?? (tone === "danger" ? styles.dangerButton : "button-primary")}`}
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
