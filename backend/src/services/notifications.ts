import { isObjectIdOrHexString } from "mongoose";

import ActivityEventModel from "../models/activityEvent.ts";
import MembershipModel from "../models/membership.ts";
import NotificationModel from "../models/notification.ts";
import ProjectModel from "../models/project.ts";
import WorkItemModel from "../models/workitem.ts";
import { createError } from "../utils/error.ts";
import logger from "../utils/logger.ts";

export async function notifyAssignment(
  activityEventId: string,
  projectId: string,
  actorId: string,
  item: { assigneeId?: unknown; key: string; title: string },
) {
  if (!item.assigneeId) return;
  try {
    const recipient = await MembershipModel.findOne({
      _id: item.assigneeId,
      projectId,
      status: "ACTIVE",
      userId: { $ne: actorId },
    })
      .select("userId")
      .lean();
    if (!recipient) return;
    await NotificationModel.updateOne(
      { recipientId: recipient.userId, activityEventId },
      {
        $setOnInsert: {
          title: "You were assigned a work item",
          message: item.key + ": " + item.title,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // The Work Item is already saved. A notification failure cannot undo it.
    logger.error("Could not create assignment notification", error);
  }
}

type StoredNotification = {
  _id: unknown;
  activityEventId: unknown;
  title: string;
  message: string;
  readAt?: Date | null;
  createdAt: Date;
};

async function responses(
  recipientId: string,
  notifications: StoredNotification[],
) {
  if (!notifications.length) return [];
  const events = await ActivityEventModel.find({
    _id: {
      $in: notifications.map((notification) => notification.activityEventId),
    },
  })
    .select("projectId workItemId")
    .lean();
  const projectIds = events.map(({ projectId }) => projectId);
  const [projects, memberships, items] = await Promise.all([
    ProjectModel.find({ _id: { $in: projectIds } })
      .select("_id")
      .lean(),
    MembershipModel.find({
      userId: recipientId,
      status: "ACTIVE",
      projectId: { $in: projectIds },
    })
      .select("projectId")
      .lean(),
    WorkItemModel.find({
      _id: {
        $in: events.flatMap(({ workItemId }) =>
          workItemId ? [workItemId] : [],
        ),
      },
      deletedAt: null,
    })
      .select("projectId parentId")
      .lean(),
  ]);
  const parents = await WorkItemModel.find({
    _id: { $in: items.flatMap(({ parentId }) => (parentId ? [parentId] : [])) },
    parentId: null,
    deletedAt: null,
  })
    .select("projectId")
    .lean();
  const liveProjects = new Set(projects.map(({ _id }) => String(_id)));
  const accessible = new Set(
    memberships.map(({ projectId }) => String(projectId)),
  );
  const byEvent = new Map(events.map((event) => [String(event._id), event]));
  const byItem = new Map(items.map((item) => [String(item._id), item]));
  const byParent = new Map(
    parents.map((parent) => [String(parent._id), parent]),
  );
  return notifications.map((notification) => {
    const event = byEvent.get(String(notification.activityEventId));
    const projectId = String(event?.projectId);
    const item = byItem.get(String(event?.workItemId));
    const parentProjectId = item?.parentId
      ? String(byParent.get(String(item.parentId))?.projectId)
      : projectId;
    const contextAccessible =
      liveProjects.has(projectId) &&
      accessible.has(projectId) &&
      String(item?.projectId) === projectId &&
      parentProjectId === projectId;
    return {
      id: String(notification._id),
      type: "WORK_ITEM_ASSIGNED",
      title: contextAccessible
        ? notification.title
        : "Update from a work item you can no longer access",
      body: contextAccessible ? notification.message : null,
      context: contextAccessible
        ? {
            projectId,
            targetType: "WORK_ITEM",
            targetId: String(event?.workItemId),
          }
        : null,
      contextAccessible,
      readAt: notification.readAt ?? null,
      createdAt: notification.createdAt,
    };
  });
}

export async function listNotifications(recipientId: string) {
  const notifications = await NotificationModel.find({ recipientId })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return {
    items: await responses(recipientId, notifications),
    emailNotificationsEnabled: false,
  };
}

export async function markNotificationRead(recipientId: string, id: string) {
  if (!isObjectIdOrHexString(id))
    throw createError(400, "Invalid notification ID");
  const scope = { _id: id, recipientId };
  const updated = await NotificationModel.findOneAndUpdate(
    { ...scope, readAt: null },
    { readAt: new Date(), isRead: true },
    { new: true },
  ).lean();
  const notification =
    updated ?? (await NotificationModel.findOne(scope).lean());
  if (!notification) throw createError(404, "Notification not found");
  const [result] = await responses(recipientId, [notification]);
  return result;
}

export async function markNotificationsRead(
  recipientId: string,
  input: unknown,
) {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.some((id) => typeof id !== "string" || !isObjectIdOrHexString(id))
  )
    throw createError(400, "Provide valid notification IDs");
  const ids = input.map((id: string) => id.toLowerCase());
  if (new Set(ids).size !== ids.length)
    throw createError(400, "Notification IDs must be unique");
  const scope = { _id: { $in: ids }, recipientId };
  if ((await NotificationModel.countDocuments(scope)) !== ids.length)
    throw createError(404, "Notification not found");
  await NotificationModel.updateMany(
    { ...scope, readAt: null },
    { readAt: new Date(), isRead: true },
  );
}
