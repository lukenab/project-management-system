"use client";

import type { FormEvent, ReactNode } from "react";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import styles from "./members.module.css";

export function MemberDialog({
  title,
  description,
  children,
  busy,
  error,
  confirmLabel,
  destructive = false,
  onSubmit,
  onClose,
}: {
  title: string;
  description: ReactNode;
  children?: ReactNode;
  busy: boolean;
  error: string;
  confirmLabel: string;
  destructive?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
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
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return createPortal(
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onPointerDown={(event) => {
        pressedOutside.current = event.button === 0 && isOutside(event);
      }}
      onPointerCancel={() => {
        pressedOutside.current = false;
      }}
      onClick={(event) => {
        const dismiss = pressedOutside.current && isOutside(event);
        pressedOutside.current = false;
        if (dismiss && !busy) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={onSubmit} aria-busy={busy}>
        <div className={styles.dialogHeading}>
          <h2 id={`${id}-title`}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p id={`${id}-description`} className={styles.dialogDescription}>
          {description}
        </p>
        {children}
        {error && (
          <p className={styles.error} role="alert" ref={errorRef} tabIndex={-1}>
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={`button ${styles.secondary}`}
            disabled={busy}
            onClick={onClose}
            autoFocus={destructive}
            data-initial-focus={destructive || undefined}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`button ${destructive ? styles.danger : "button-primary"}`}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
