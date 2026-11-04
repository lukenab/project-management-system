import { useSyncExternalStore } from "react";

export type PreviewNotification = {
  id: string;
  recipientId: string;
  title: string;
  message: string;
  project: string;
  time: string;
  initials: string;
  unread: boolean;
};

// The signed-in preview user; other recipients exist but are never displayed.
const currentUserId = "alex";

const initialNotifications: PreviewNotification[] = [
  {
    id: "notification-mention-1",
    recipientId: currentUserId,
    title: "You were mentioned",
    message:
      "Priya Nair mentioned you on COM-1: “can you confirm whether saved products should sync between devices?”",
    project: "Commerce Platform",
    time: "2 minutes ago",
    initials: "PN",
    unread: true,
  },
  {
    id: "notification-1",
    recipientId: currentUserId,
    title: "You were assigned a task",
    message: "Jordan Lee assigned you “Build the project overview”.",
    project: "Atlas Platform",
    time: "5 minutes ago",
    initials: "JL",
    unread: true,
  },
  {
    id: "notification-2",
    recipientId: currentUserId,
    title: "New comment on your task",
    message:
      "Taylor Chen commented: “The updated requirements are ready for review.”",
    project: "Atlas Platform",
    time: "24 minutes ago",
    initials: "TC",
    unread: true,
  },
  {
    id: "notification-3",
    recipientId: currentUserId,
    title: "Sprint 03 has started",
    message:
      "Your team’s Sprint is now active. Review the plan on the Sprint Board.",
    project: "Commerce Platform",
    time: "1 hour ago",
    initials: "CP",
    unread: false,
  },
];

let notifications = initialNotifications;
let nextId = 1;
const listeners = new Set<() => void>();

function replace(next: PreviewNotification[]) {
  notifications = next;
  listeners.forEach((listener) => listener());
}

export function addPreviewNotification(
  input: Pick<
    PreviewNotification,
    "recipientId" | "title" | "message" | "project" | "initials"
  >,
) {
  replace([
    {
      ...input,
      id: `notification-new-${nextId++}`,
      time: "just now",
      unread: true,
    },
    ...notifications,
  ]);
}

export function markPreviewNotificationsRead() {
  replace(
    notifications.map((item) =>
      item.recipientId === currentUserId ? { ...item, unread: false } : item,
    ),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreviewNotifications() {
  const all = useSyncExternalStore(
    subscribe,
    () => notifications,
    () => initialNotifications,
  );
  return all.filter((item) => item.recipientId === currentUserId);
}
