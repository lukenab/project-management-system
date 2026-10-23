"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { previewNotifications } from "@/lib/preview-notifications";

import "./notifications.css";

export function NotificationDropdown() {
  const ref = useRef<HTMLDetailsElement>(null);
  const [notifications, setNotifications] = useState(previewNotifications);
  const unread = notifications.filter((item) => item.unread).length;

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
    <details className="notification-menu" ref={ref}>
      <summary
        className="icon-button header-control notification-control"
        aria-label={`Notifications, ${unread} unread`}
      >
        <Bell size={15} aria-hidden="true" />
        {unread > 0 && (
          <span className="notification-indicator" aria-hidden="true" />
        )}
      </summary>
      <section className="notification-popover" aria-label="Notifications">
        <div className="notification-heading">
          <h2>
            Notifications{" "}
            <span className="count-badge" aria-live="polite">
              {unread}
            </span>
          </h2>
          <button
            type="button"
            className="notification-mark-all"
            disabled={!unread}
            onClick={() =>
              setNotifications((items) =>
                items.map((item) => ({ ...item, unread: false })),
              )
            }
          >
            <CheckCheck size={14} aria-hidden="true" />
            Mark all as read
          </button>
        </div>
        <ul className="notification-list">
          {notifications.map((item) => (
            <li
              key={item.id}
              className={
                item.unread
                  ? "notification-item is-unread"
                  : "notification-item"
              }
            >
              <span className="notification-avatar" aria-hidden="true">
                {item.initials}
              </span>
              <div className="notification-copy">
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <div className="notification-meta">
                  <span>{item.project}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.time}</span>
                </div>
              </div>
              {item.unread && (
                <span className="notification-unread-dot">
                  <span className="sr-only">Unread</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </details>
  );
}
