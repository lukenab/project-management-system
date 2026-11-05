import { projectHref } from "@/config/navigation";

// Shapes follow docs/api/notifications.md so the preview can be replaced by the API.
export type NotificationContext = {
  projectId: string;
  targetType: "WORK_ITEM" | "SPRINT" | null;
  targetId: string | null;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  context: NotificationContext | null;
  contextAccessible: boolean;
  readAt: string | null;
  createdAt: string;
};

/** Where a notification leads, or null when its context is unavailable. */
export function notificationHref(notification: AppNotification) {
  const { context, contextAccessible } = notification;
  if (!context || !contextAccessible) return null;
  if (context.targetType === "WORK_ITEM" && context.targetId)
    return `${projectHref(context.projectId, "backlog")}?item=${context.targetId}`;
  if (context.targetType === "SPRINT" && context.targetId)
    return projectHref(context.projectId, `sprints/${context.targetId}`);
  return projectHref(context.projectId);
}
