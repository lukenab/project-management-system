"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import styles from "./toast.module.css";

export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  onRestoreFocus,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  onRestoreFocus?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onDismiss, onRestoreFocus });
  const closing = useRef<Animation | null>(null);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbacks.current = { onDismiss, onRestoreFocus };
  }, [onDismiss, onRestoreFocus]);

  const dismiss = useCallback(() => {
    if (!mounted.current || closing.current) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const panel = panelRef.current;
    const restoreFocus = panel?.contains(document.activeElement);
    function finish() {
      if (!mounted.current) return;
      callbacks.current.onDismiss();
      if (restoreFocus)
        requestAnimationFrame(() => callbacks.current.onRestoreFocus?.());
    }
    if (
      !panel ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      finish();
      return;
    }
    const current = getComputedStyle(panel);
    const animation = panel.animate(
      [
        { opacity: current.opacity, transform: current.transform },
        { opacity: 0, transform: "translateY(8px)" },
      ],
      { duration: 140, easing: "ease-in", fill: "forwards" },
    );
    closing.current = animation;
    animation.finished.then(finish, () => {});
  }, []);

  useEffect(() => {
    mounted.current = true;
    const panel = panelRef.current;
    if (!panel) return;
    let remaining = 5000;
    let deadline = 0;
    let hovered = false;
    let focused = panel.contains(document.activeElement);
    function pause() {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        remaining = Math.max(0, deadline - performance.now());
      }
    }
    function resume() {
      if (hovered || focused || closing.current || timer.current) return;
      deadline = performance.now() + remaining;
      timer.current = setTimeout(dismiss, remaining);
    }
    function enter(event: PointerEvent) {
      if (event.pointerType === "mouse") {
        hovered = true;
        pause();
      }
    }
    function leave(event: PointerEvent) {
      if (event.pointerType === "mouse") {
        hovered = false;
        resume();
      }
    }
    function focusIn() {
      focused = true;
      pause();
    }
    function focusOut(event: FocusEvent) {
      if (
        event.relatedTarget instanceof Node &&
        panel?.contains(event.relatedTarget)
      )
        return;
      focused = false;
      resume();
    }
    panel.addEventListener("pointerenter", enter);
    panel.addEventListener("pointerleave", leave);
    panel.addEventListener("focusin", focusIn);
    panel.addEventListener("focusout", focusOut);
    resume();
    return () => {
      mounted.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      closing.current?.cancel();
      closing.current = null;
      panel.removeEventListener("pointerenter", enter);
      panel.removeEventListener("pointerleave", leave);
      panel.removeEventListener("focusin", focusIn);
      panel.removeEventListener("focusout", focusOut);
    };
  }, [dismiss]);

  return typeof document === "undefined"
    ? null
    : createPortal(
        <div
          ref={panelRef}
          className={styles.toast}
          data-development={process.env.NODE_ENV === "development" || undefined}
          role="region"
          aria-label="Action notification"
        >
          <span className={styles.message} role="status" aria-atomic="true">
            {message}
          </span>
          {actionLabel && onAction && (
            <button type="button" className={styles.action} onClick={onAction}>
              {actionLabel}
            </button>
          )}
          <button
            type="button"
            className={styles.close}
            aria-label="Dismiss notification"
            onClick={dismiss}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>,
        document.body,
      );
}
