import { isObjectIdOrHexString } from "mongoose";

import ActivityEvent from "../models/activityEvent.ts";
import Comment from "../models/comment.ts";
import Sprint from "../models/sprint.ts";
import User from "../models/user.ts";
import WorkItem from "../models/workitem.ts";
import { AppError } from "../utils/error.ts";
import { requireProjectMember } from "./projectAccess.ts";
import {
  buildActivityChanges,
  buildActivitySummary,
} from "./workItemActivity.ts";

async function activeSprintItems(projectId: string, userId: string) {
  if (!isObjectIdOrHexString(projectId)) throw new AppError("INVALID_ID");
  await requireProjectMember(userId, projectId);
  const sprint = await Sprint.findOne({
    projectId,
    status: "ACTIVE",
    deletedAt: null,
  })
    .select("_id")
    .lean();
  if (!sprint) throw new AppError("CONFLICT", { message: "No active Sprint." });
  const items = await WorkItem.find({
    projectId,
    sprintId: sprint._id,
    parentId: null,
    deletedAt: null,
  })
    .select("key title status assigneeId dueDate")
    .lean();
  return { sprintId: String(sprint._id), items };
}

export async function getSprintProgress(projectId: string, userId: string) {
  const { sprintId, items } = await activeSprintItems(projectId, userId);
  const calculatedAt = new Date().toISOString();
  const today = calculatedAt.slice(0, 10);
  const sprintItems = { total: items.length, toDo: 0, inProgress: 0, done: 0 };
  const counts = {
    TODO: "toDo",
    IN_PROGRESS: "inProgress",
    DONE: "done",
  } as const;
  const workload = new Map<string | null, number>();
  const overdueItems = [];

  for (const item of items) {
    sprintItems[counts[item.status]]++;
    const assigneeId = item.assigneeId ? String(item.assigneeId) : null;
    workload.set(assigneeId, (workload.get(assigneeId) ?? 0) + 1);
    if (item.status !== "DONE" && item.dueDate && item.dueDate < today) {
      overdueItems.push({
        id: String(item._id),
        key: item.key,
        title: item.title,
        dueDate: item.dueDate,
      });
    }
  }

  return {
    sprintId,
    calculatedAt,
    sprintItems,
    completionPercent: items.length
      ? Math.round((sprintItems.done * 10_000) / items.length) / 100
      : 0,
    overdueItems: overdueItems.sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key),
    ),
    memberWorkload: [...workload].map(([assigneeId, itemCount]) => ({
      assigneeId,
      itemCount,
    })),
  };
}

export async function getSprintActivity(projectId: string, userId: string) {
  const { items } = await activeSprintItems(projectId, userId);
  if (!items.length) return [];

  const rootIds = items.map(({ _id }) => _id);
  const children = await WorkItem.find({
    projectId,
    parentId: { $in: rootIds },
  })
    .select("parentId key")
    .lean();
  const [events, comments] = await Promise.all([
    ActivityEvent.find({
      projectId,
      actionType: { $ne: "COMMENT_CREATED" },
      workItemId: { $in: [...rootIds, ...children.map(({ _id }) => _id)] },
    }).lean(),
    Comment.find({ workItemId: { $in: rootIds } }).lean(),
  ]);
  const actors = await User.find({
    _id: {
      $in: [
        ...events.map(({ actorId }) => actorId),
        ...comments.map(({ authorId }) => authorId),
      ],
    },
  })
    .select("fullName")
    .lean();
  const names = new Map(
    actors.map((actor) => [String(actor._id), actor.fullName]),
  );
  const actor = (id: string) => ({
    id,
    fullName: names.get(id) ?? "Unknown member",
  });
  const roots = new Map(
    items.map(({ _id, key, title }) => [
      String(_id),
      { id: String(_id), key, title },
    ]),
  );
  const childById = new Map(
    children.map((child) => [String(child._id), child]),
  );

  return [
    ...comments.flatMap((comment) => {
      const workItem = roots.get(String(comment.workItemId));
      if (!workItem) return [];
      return [
        {
          id: String(comment._id),
          kind: "COMMENT" as const,
          actor: actor(String(comment.authorId)),
          workItem,
          text: comment.content,
          occurredAt: comment.createdAt.toISOString(),
        },
      ];
    }),
    ...events.flatMap((event) => {
      const child = childById.get(String(event.workItemId));
      const workItem = roots.get(String(child?.parentId ?? event.workItemId));
      if (!workItem) return [];
      return [
        {
          id: String(event._id),
          kind: "HISTORY" as const,
          actor: actor(String(event.actorId)),
          workItem,
          text: buildActivitySummary(
            event.actionType,
            buildActivityChanges(
              event.actionType,
              event.oldValue,
              event.newValue,
            ),
            {
              isSubtask: Boolean(child),
              subtaskKey: child?.key ?? null,
              oldValue: event.oldValue,
              newValue: event.newValue,
            },
          ),
          occurredAt: event.createdAt.toISOString(),
        },
      ];
    }),
  ].sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id),
  );
}
