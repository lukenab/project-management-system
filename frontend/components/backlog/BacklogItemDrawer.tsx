"use client";

import { Maximize2, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import type { BacklogItem } from "@/lib/backlog-items";

import styles from "./backlog.module.css";
import { BacklogItemContent } from "./BacklogItemContent";
import { BacklogLoading } from "./BacklogLoading";

export type BacklogDetailState =
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; item: BacklogItem }
  | { status: "error"; id: string; message: string; missing: boolean };

const mobileQuery = "(max-width: 700px)";
function subscribeToViewport(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function isMobileViewport() {
  return window.matchMedia(mobileQuery).matches;
}
function getServerViewport() {
  return false;
}

export function BacklogItemDrawer({
  state,
  canEditDescription,
  canEditMetadata,
  onSaveDescription,
  expanded,
  onToggleExpanded,
  onClose,
  onRetry,
}: {
  state: BacklogDetailState;
  canEditDescription: boolean;
  canEditMetadata: boolean;
  onSaveDescription: (id: string, description: string) => Promise<void>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const mobile = useSyncExternalStore(
    subscribeToViewport,
    isMobileViewport,
    getServerViewport,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeAnimation = useRef<Animation | null>(null);

  const requestClose = useCallback(() => {
    if (closeAnimation.current) return;
    const panel = mobile ? dialogRef.current : drawerRef.current;
    if (
      !panel ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onClose();
      return;
    }
    const current = getComputedStyle(panel);
    const animation = panel.animate(
      [
        { opacity: current.opacity, transform: current.transform },
        {
          opacity: 0,
          transform: mobile ? "translateY(20px)" : "translateX(32px)",
        },
      ],
      { duration: 160, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    );
    closeAnimation.current = animation;
    animation.finished.then(
      () => {
        if (closeAnimation.current === animation) {
          closeAnimation.current = null;
          onClose();
        }
      },
      () => {},
    );
  }, [mobile, onClose]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    return () => {
      closeAnimation.current?.cancel();
      closeAnimation.current = null;
    };
  }, [state.id, mobile]);

  useEffect(() => {
    if (!mobile) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [mobile]);

  useEffect(() => closeRef.current?.focus(), [state.id, mobile]);

  useEffect(() => {
    if (mobile) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        requestClose();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobile, requestClose]);

  const content = (
    <>
      <div className={styles.drawerHeader}>
        <span className={styles.drawerLabel}>Backlog item</span>
        <div className={styles.drawerActions}>
          {!mobile && (
            <button
              className="icon-button"
              type="button"
              onClick={onToggleExpanded}
              aria-label={
                expanded ? "Collapse item details" : "Expand item details"
              }
              aria-pressed={expanded}
            >
              {expanded ? (
                <Minimize2 size={17} aria-hidden="true" />
              ) : (
                <Maximize2 size={17} aria-hidden="true" />
              )}
            </button>
          )}
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            onClick={requestClose}
            aria-label="Close item details"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className={styles.drawerScroll}>
        {state.status === "loading" ? (
          <BacklogLoading label="Loading item details…" rows={3} />
        ) : state.status === "error" ? (
          <div className={styles.detailError} role="alert">
            <h2>
              {state.missing ? "Item not found" : "Couldn’t load this item"}
            </h2>
            <p>{state.message}</p>
            <button
              type="button"
              className="button"
              onClick={state.missing ? requestClose : onRetry}
            >
              {state.missing ? "Back to backlog" : "Try again"}
            </button>
          </div>
        ) : (
          <BacklogItemContent
            key={state.item.id}
            item={state.item}
            canEditDescription={canEditDescription}
            canEditMetadata={canEditMetadata}
            onSaveDescription={onSaveDescription}
          />
        )}
      </div>
    </>
  );

  return mobile ? (
    <dialog
      id="backlog-item-details"
      ref={dialogRef}
      className={styles.mobileDrawer}
      aria-label="Backlog item details"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      {content}
    </dialog>
  ) : typeof document !== "undefined" ? (
    createPortal(
      <aside
        ref={drawerRef}
        id="backlog-item-details"
        className={`${styles.drawer} ${expanded ? styles.drawerExpanded : ""}`}
        aria-label="Backlog item details"
      >
        {content}
      </aside>,
      document.body,
    )
  ) : null;
}
