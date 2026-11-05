"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { PreviewNotification } from "@/lib/preview-notifications";

import { EmptyState } from "@/components/shared/EmptyState";
import { notificationHref } from "@/lib/notifications";
import {
  markPreviewNotificationRead,
  markPreviewNotificationsRead,
  setPreviewEmailPreference,
  usePreviewEmailPreference,
  usePreviewNotifications,
} from "@/lib/preview-notifications";
import { usePreviewProfile } from "@/lib/preview-profile";
import { relativeTime } from "@/lib/relative-time";

import styles from "./notifications.module.css";

const subscribeToNothing = () => () => {};

function NotificationRow({
  item,
  now,
}: {
  item: PreviewNotification;
  now: number;
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
        {item.initials}
      </span>
      <div className={styles.copy}>
        {href ? (
          <Link
            href={href}
            className={styles.link}
            onClick={() => markPreviewNotificationRead(item.id)}
          >
            {content}
          </Link>
        ) : (
          content
        )}
        <div className={styles.meta}>
          {item.projectName && <span>{item.projectName}</span>}
          {item.projectName && <span aria-hidden="true">·</span>}
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
          onClick={() => markPreviewNotificationRead(item.id)}
        >
          Mark as read
        </button>
      )}
    </li>
  );
}

export function NotificationCenter() {
  const profile = usePreviewProfile();
  const notifications = usePreviewNotifications(profile.id);
  const emailEnabled = usePreviewEmailPreference();
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Relative times depend on the viewer's clock, so wait for the browser.
  if (!hydrated) return <p role="status">Loading notifications…</p>;

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
            disabled={!unread.length}
            onClick={() =>
              markPreviewNotificationsRead(unread.map((item) => item.id))
            }
          >
            <CheckCheck size={15} aria-hidden="true" />
            Mark all as read
          </button>
        </div>
        {visible.length ? (
          <ul className={styles.list}>
            {visible.map((item) => (
              <NotificationRow key={item.id} item={item} now={now} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Bell}
            title={
              filter === "UNREAD"
                ? "You're all caught up"
                : "No notifications yet"
            }
            description={
              filter === "UNREAD"
                ? "New mentions and updates will appear here."
                : "Mentions and updates on your work will appear here."
            }
          />
        )}
      </section>
      <section className={styles.section} aria-labelledby="email-heading">
        <div className={styles.sectionHead}>
          <h2 id="email-heading">Email notifications</h2>
        </div>
        <label className={styles.preference}>
          <input
            type="checkbox"
            role="switch"
            checked={emailEnabled}
            aria-checked={emailEnabled}
            disabled={saving}
            onChange={async (event) => {
              const enabled = event.target.checked;
              setSaving(true);
              await setPreviewEmailPreference(enabled);
              setSaving(false);
            }}
          />
          <span>
            <strong>Send me an email for notifications</strong>
            <small>Account verification and password emails always send.</small>
          </span>
        </label>
      </section>
    </div>
  );
}
