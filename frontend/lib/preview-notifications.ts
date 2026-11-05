import { useSyncExternalStore } from "react";

import type { AppNotification, NotificationContext } from "./notifications";

import { getPreviewProject } from "./preview-data";

export type PreviewNotification = AppNotification & {
  /** Display helpers the preview keeps beside the API fields. */
  initials: string;
  projectName: string | null;
};

type StoredNotification = AppNotification & {
  recipientId: string;
  initials: string;
  projectName: string;
};

const mention = "MENTION";
const initialNotifications: StoredNotification[] = [
  {
    id: "notification-1",
    recipientId: "alex",
    type: mention,
    title: "You were mentioned",
    body: "Priya Nair mentioned you on COM-1: “can you confirm whether saved products should sync between devices?”",
    context: {
      projectId: "team-workspace",
      targetType: "WORK_ITEM",
      targetId: "c00000000000000000000001",
    },
    contextAccessible: true,
    readAt: null,
    createdAt: "2026-10-27T08:30:00.000Z",
    initials: "PN",
    projectName: "Commerce Platform",
  },
  {
    id: "notification-2",
    recipientId: "alex",
    type: mention,
    title: "You were mentioned",
    body: "Jordan Lee mentioned you on MOB-1: “please start with the sign-in screen so we can demo it this Sprint.”",
    context: {
      projectId: "mobile-app",
      targetType: "WORK_ITEM",
      targetId: "a00000000000000000000001",
    },
    contextAccessible: true,
    readAt: null,
    createdAt: "2026-10-28T06:00:00.000Z",
    initials: "JL",
    projectName: "Mobile Companion",
  },
  {
    id: "notification-3",
    recipientId: "alex",
    type: "COMMENT",
    title: "New comment on a work item",
    body: "Jordan Lee commented on ATL-1: “Please check the account summary against the latest design.”",
    context: {
      projectId: "customer-portal",
      targetType: "WORK_ITEM",
      targetId: "a00000000000000000000001",
    },
    contextAccessible: true,
    readAt: null,
    createdAt: "2026-10-27T04:00:00.000Z",
    initials: "JL",
    projectName: "Atlas Platform",
  },
  {
    id: "notification-4",
    recipientId: "alex",
    type: "SPRINT_STARTED",
    title: "Sprint 1 has started",
    body: "Your team's Sprint is now active. Review the plan on the Sprint page.",
    context: {
      projectId: "customer-portal",
      targetType: "SPRINT",
      targetId: "atl-sprint-1",
    },
    contextAccessible: true,
    readAt: "2026-10-26T09:00:00.000Z",
    createdAt: "2026-10-26T02:00:00.000Z",
    initials: "AP",
    projectName: "Atlas Platform",
  },
];

let notifications = initialNotifications;
let emailEnabled = false;
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function addPreviewNotification(input: {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  context: NotificationContext;
  initials: string;
  projectName: string;
}) {
  notifications = [
    {
      ...input,
      id: `notification-new-${nextId++}`,
      contextAccessible: true,
      readAt: null,
      createdAt: new Date().toISOString(),
    },
    ...notifications,
  ];
  notify();
}

/** Repeating this leaves the original readAt unchanged, as in the API. */
export function markPreviewNotificationRead(id: string) {
  const now = new Date().toISOString();
  notifications = notifications.map((item) =>
    item.id === id && !item.readAt ? { ...item, readAt: now } : item,
  );
  notify();
}

/** Marks only the notifications the user can see. */
export function markPreviewNotificationsRead(ids: string[]) {
  const now = new Date().toISOString();
  notifications = notifications.map((item) =>
    ids.includes(item.id) && !item.readAt ? { ...item, readAt: now } : item,
  );
  notify();
}

export function usePreviewNotifications(
  recipientId: string,
): PreviewNotification[] {
  const all = useSyncExternalStore(
    subscribe,
    () => notifications,
    () => initialNotifications,
  );
  return all
    .filter((item) => item.recipientId === recipientId)
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    )
    .map((item) => {
      const accessible =
        !item.context || !!getPreviewProject(item.context.projectId);
      // Ownership of a notification grants no access to its project.
      return accessible
        ? item
        : {
            ...item,
            title: "Update from a project you can no longer access",
            body: null,
            context: null,
            contextAccessible: false,
            projectName: null,
          };
    });
}

export function usePreviewEmailPreference() {
  return useSyncExternalStore(
    subscribe,
    () => emailEnabled,
    () => false,
  );
}

export async function setPreviewEmailPreference(enabled: boolean) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  emailEnabled = enabled;
  notify();
}
