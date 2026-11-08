"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { notificationHref } from "@/lib/notifications";
import { relativeTime } from "@/lib/relative-time";

import "./notifications.css";

export function NotificationDropdown() {
  const ref = useRef<HTMLDetailsElement>(null);
  const { state, refresh, markRead, markAllRead } = useNotifications();
  const { items: notifications, loading, loadError, writeError, busy } = state;
  const unread = notifications.filter((item) => !item.readAt);
  // Rendered on open: relative times depend on the viewer's clock.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  function close() {
    if (ref.current) ref.current.open = false;
  }

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details
      className="notification-menu"
      ref={ref}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setOpenedAt(Date.now());
          refresh();
        }
      }}
    >
      <summary
        className="icon-button header-control notification-control"
        aria-label={`Notifications, ${unread.length} unread`}
      >
        <Bell size={15} aria-hidden="true" />
        {unread.length > 0 && (
          <span className="notification-indicator" aria-hidden="true" />
        )}
      </summary>
      <section className="notification-popover" aria-label="Notifications">
        <div className="notification-heading">
          <h2>
            Notifications{" "}
            <span className="count-badge" aria-live="polite">
              {unread.length}
            </span>
          </h2>
          <button
            type="button"
            className="notification-mark-all"
            disabled={busy || !unread.length}
            onClick={() => markAllRead(unread.map((item) => item.id))}
          >
            <CheckCheck size={14} aria-hidden="true" />
            Mark all as read
          </button>
        </div>
        {writeError && (
          <p className="notification-empty" role="alert">
            Couldn’t mark notifications as read.
          </p>
        )}
        {loadError && (
          <div className="notification-empty" role="alert">
            <p>Couldn’t load notifications.</p>
            <button type="button" className="button" onClick={refresh}>
              Try again
            </button>
          </div>
        )}
        {notifications.length ? (
          <ul className="notification-list">
            {openedAt !== null &&
              notifications.map((item) => {
                const href = notificationHref(item);
                const copy = (
                  <>
                    <h3>{item.title}</h3>
                    {item.body && <p>{item.body}</p>}
                  </>
                );
                return (
                  <li
                    key={item.id}
                    className={
                      item.readAt
                        ? "notification-item"
                        : "notification-item is-unread"
                    }
                  >
                    <span className="notification-avatar" aria-hidden="true">
                      <Bell size={14} />
                    </span>
                    <div className="notification-copy">
                      {href ? (
                        <Link
                          href={href}
                          className="notification-link"
                          onClick={() => {
                            if (!item.readAt) markRead(item.id);
                            close();
                          }}
                        >
                          {copy}
                        </Link>
                      ) : (
                        copy
                      )}
                      <div className="notification-meta">
                        <span>{relativeTime(item.createdAt, openedAt)}</span>
                      </div>
                    </div>
                    {!item.readAt && (
                      <span className="notification-unread-dot">
                        <span className="sr-only">Unread</span>
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        ) : (
          !loadError && (
            <p className="notification-empty" role="status">
              {loading ? "Loading notifications…" : "No notifications yet."}
            </p>
          )
        )}
        <div className="notification-footer">
          <Link href="/notifications" onClick={close}>
            View all notifications
          </Link>
        </div>
      </section>
    </details>
  );
}
