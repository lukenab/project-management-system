"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AppNotification } from "@/lib/notifications";

import { EmptyState } from "@/components/shared/EmptyState";
import { notificationHref } from "@/lib/notifications";
import { relativeTime } from "@/lib/relative-time";

import styles from "./notifications.module.css";
import { useNotifications } from "./NotificationsProvider";

function NotificationRow({
  item,
  now,
  busy,
  markRead,
}: {
  item: AppNotification;
  now: number;
  busy: boolean;
  markRead: (id: string) => void;
}) {
  const href = notificationHref(item);
  const content = (
    <>
      <strong>{item.title}</strong>
      {item.body && <p>{item.body}</p>}
    </>
  );
  return (
    <li className={styles.row} data-unread={!item.readAt || undefined}>
      <span className={styles.avatar} aria-hidden="true">
        <Bell size={14} />
      </span>
      <div className={styles.copy}>
        {href ? (
          <Link
            href={href}
            className={styles.link}
            onClick={() => {
              if (!item.readAt) markRead(item.id);
            }}
          >
            {content}
          </Link>
        ) : (
          content
        )}
        <div className={styles.meta}>
          <time
            dateTime={item.createdAt}
            title={new Date(item.createdAt).toLocaleString("en-GB", {
              timeZoneName: "short",
            })}
          >
            {relativeTime(item.createdAt, now)}
          </time>
        </div>
      </div>
      {!item.readAt && (
        <button
          type="button"
          className={styles.markRead}
          disabled={busy}
          onClick={() => markRead(item.id)}
        >
          Mark as read
        </button>
      )}
    </li>
  );
}

export function NotificationCenter() {
  const { state, refresh, markRead, markAllRead } = useNotifications();
  const { items: notifications, loading, loadError, writeError, busy } = state;
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && !loadError) return <p role="status">Loading notifications…</p>;

  const unread = notifications.filter((item) => !item.readAt);
  const visible = filter === "UNREAD" ? unread : notifications;

  return (
    <div className={styles.page}>
      <section className={styles.section} aria-label="Notifications">
        <div className={styles.toolbar}>
          <div
            className="project-filters"
            role="group"
            aria-label="Filter notifications"
          >
            <button
              type="button"
              aria-pressed={filter === "ALL"}
              onClick={() => setFilter("ALL")}
            >
              All
              <span className="count-badge">{notifications.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={filter === "UNREAD"}
              onClick={() => setFilter("UNREAD")}
            >
              Unread
              <span className="count-badge">{unread.length}</span>
            </button>
          </div>
          <button
            type="button"
            className="button"
            disabled={busy || !unread.length}
            onClick={() => markAllRead(unread.map((item) => item.id))}
          >
            <CheckCheck size={15} aria-hidden="true" />
            Mark all as read
          </button>
        </div>
        {writeError && (
          <p role="alert">
            Couldn’t mark notifications as read. Please try again.
          </p>
        )}
        {loadError && (
          <div role="alert">
            <p>Couldn’t load notifications.</p>
            <button type="button" className="button" onClick={refresh}>
              Try again
            </button>
          </div>
        )}
        {visible.length ? (
          <ul className={styles.list}>
            {visible.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                now={now}
                busy={busy}
                markRead={markRead}
              />
            ))}
          </ul>
        ) : (
          !loadError && (
            <EmptyState
              icon={Bell}
              title={
                filter === "UNREAD"
                  ? "You're all caught up"
                  : "No notifications yet"
              }
              description={
                filter === "UNREAD"
                  ? "New notifications will appear here."
                  : "New work assignments will appear here."
              }
            />
          )
        )}
      </section>
    </div>
  );
}
