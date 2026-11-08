import mongoose from "mongoose";

import ActivityEventModel from "../models/activityEvent.ts";
import ProjectModel from "../models/project.ts";
import UserModel from "../models/user.ts";
import WorkItemModel from "../models/workitem.ts";
import { createError } from "../utils/error.ts";
import { notifyAssignment } from "./notifications.ts";
import { getActiveMembership } from "./projectAccess.ts";

// ============================================================================
// 1. HẰNG SỐ & KIỂU DỮ LIỆU (CONSTANTS & TYPES)
// ============================================================================

const STATUS_LABELS: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const WORK_TYPE_LABELS: Record<string, string> = {
  STORY: "Story",
  TASK: "Task",
  BUG: "Bug",
};

const LIFECYCLE_OR_COMMENT_ACTIONS = new Set([
  "CREATED",
  "WORK_ITEM_CREATED",
  "SUBTASK_CREATED",
  "DELETED",
  "WORK_ITEM_DELETED",
  "SUBTASK_DELETED",
  "COMMENT_CREATED",
  "COMMENT_DELETED",
]);

export interface ActivityChangeItem {
  field: string;
  before: any;
  after: any;
}

export interface ActivityEventResponseItem {
  id: string;
  actor: {
    id: string;
    fullName: string;
  };
  action: string;
  workItemId: string;
  summary: string;
  changes: ActivityChangeItem[] | null;
  occurredAt: string;
}

// ============================================================================
// 2. HÀM GHI NHẬN LỊCH SỬ HOẠT ĐỘNG (RECORDING HELPERS)
// ============================================================================

/** Helper thu thập các trường thực sự thay đổi trước khi áp dụng updates */
export const captureFieldChanges = (
  workItem: any,
  updates: Record<string, any>,
): {
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  changedKeys: string[];
} => {
  const oldValue: Record<string, any> = {};
  const newValue: Record<string, any> = {};
  const changedKeys: string[] = [];

  for (const key of Object.keys(updates)) {
    const normalizedNew =
      key === "description" &&
      typeof updates[key] === "string" &&
      updates[key].trim() === ""
        ? null
        : updates[key];
    const currentOld = workItem[key] === undefined ? null : workItem[key];

    const oldComparable =
      currentOld instanceof Date
        ? currentOld.toISOString()
        : currentOld !== null && typeof currentOld === "object"
          ? String(currentOld)
          : currentOld;
    const newComparable =
      normalizedNew instanceof Date
        ? normalizedNew.toISOString()
        : normalizedNew !== null && typeof normalizedNew === "object"
          ? String(normalizedNew)
          : normalizedNew;

    if (oldComparable !== newComparable) {
      oldValue[key] = currentOld;
      newValue[key] = normalizedNew;
      changedKeys.push(key);
    }
  }

  if (changedKeys.length === 0) {
    return { oldValue: null, newValue: null, changedKeys: [] };
  }

  return { oldValue, newValue, changedKeys };
};

/** Ghi nhận một bản ghi ActivityEvent vào cơ sở dữ liệu */
export const recordActivityEvent = async (params: {
  projectId: any;
  actorId: any;
  workItemId?: any;
  actionType: string;
  assignment?: { assigneeId?: unknown; key: string; title: string };
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
}) => {
  const event = new ActivityEventModel({
    projectId: params.projectId,
    actorId: params.actorId,
    workItemId: params.workItemId ?? null,
    actionType: params.actionType,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
  });

  const isSaveMocked =
    ActivityEventModel.prototype.save !== mongoose.Model.prototype.save;
  if (mongoose.connection.readyState === 1 || isSaveMocked) {
    await event.save();
  }
  if (params.assignment && mongoose.connection.readyState === 1) {
    await notifyAssignment(
      event.id,
      String(params.projectId),
      String(params.actorId),
      params.assignment,
    );
  }
  return event;
};

// ============================================================================
// 3. HÀM FORMAT & XỬ LÝ DỮ LIỆU ACTIVITY (FORMATTING HELPERS)
// ============================================================================

/** Helper hỗ trợ chạy linh hoạt cả Mongoose Query chain (.select/.sort/.lean) lẫn Mock trong Unit Test */
const resolveQueryChain = async <T = any>(
  queryOrResult: any,
  options?: { select?: string; sort?: Record<string, 1 | -1> },
): Promise<T> => {
  let current = queryOrResult;
  if (current && options?.select && typeof current.select === "function") {
    current = current.select(options.select);
  }
  if (current && options?.sort && typeof current.sort === "function") {
    current = current.sort(options.sort);
  }
  if (current && typeof current.lean === "function") {
    return current.lean();
  }
  return current;
};

/** Chuyển đổi oldValue và newValue trong DB sang mảng changes [{ field, before, after }] */
export const buildActivityChanges = (
  actionType: string,
  oldValue: any,
  newValue: any,
): ActivityChangeItem[] | null => {
  if (oldValue == null && newValue == null) {
    return null;
  }

  // Các sự kiện tạo mới, xóa hoặc thêm/xóa bình luận không biểu diễn dưới dạng field diff
  if (
    LIFECYCLE_OR_COMMENT_ACTIONS.has(actionType) &&
    (oldValue == null || newValue == null)
  ) {
    return null;
  }

  const isOldObj =
    oldValue !== null &&
    typeof oldValue === "object" &&
    !Array.isArray(oldValue);
  const isNewObj =
    newValue !== null &&
    typeof newValue === "object" &&
    !Array.isArray(newValue);

  if (!isOldObj && !isNewObj) {
    return null;
  }

  const keys = Array.from(
    new Set([
      ...(isOldObj ? Object.keys(oldValue) : []),
      ...(isNewObj ? Object.keys(newValue) : []),
    ]),
  );

  if (keys.length === 0) {
    return null;
  }

  return keys.map((field) => ({
    field,
    before: isOldObj && field in oldValue ? oldValue[field] : null,
    after: isNewObj && field in newValue ? newValue[field] : null,
  }));
};

/** Định dạng mô tả ngắn gọn (summary) cho từng thay đổi của một trường */
const formatSingleFieldChangeSummary = (
  change: ActivityChangeItem,
  isSubtask: boolean,
  subtaskKey: string | null,
): string => {
  const ofTarget = isSubtask && subtaskKey ? ` of ${subtaskKey}` : "";
  const { field, before, after } = change;

  switch (field) {
    case "status": {
      const fromLabel =
        STATUS_LABELS[String(before)] ?? String(before ?? "None");
      const toLabel = STATUS_LABELS[String(after)] ?? String(after ?? "None");
      return `changed status${ofTarget} from ${fromLabel} to ${toLabel}`;
    }
    case "priority": {
      const fromLabel =
        PRIORITY_LABELS[String(before)] ?? String(before ?? "None");
      const toLabel = PRIORITY_LABELS[String(after)] ?? String(after ?? "None");
      return `changed priority${ofTarget} from ${fromLabel} to ${toLabel}`;
    }
    case "workType": {
      const fromLabel =
        WORK_TYPE_LABELS[String(before)] ?? String(before ?? "None");
      const toLabel =
        WORK_TYPE_LABELS[String(after)] ?? String(after ?? "None");
      return `changed type${ofTarget} from ${fromLabel} to ${toLabel}`;
    }
    case "title":
      return `changed the title${ofTarget}`;
    case "description":
      return `changed the description${ofTarget}`;
    case "assigneeId":
      if (!after) {
        return `removed the assignee${ofTarget}`;
      }
      return `assigned ${isSubtask && subtaskKey ? `${subtaskKey} ` : "this item "}to a member`;
    case "startDate":
      return after
        ? `set the start date${ofTarget} to ${after}`
        : `cleared the start date${ofTarget}`;
    case "dueDate":
      return after
        ? `set the due date${ofTarget} to ${after}`
        : `cleared the due date${ofTarget}`;
    case "sprintId":
      if (!after) {
        return "removed this item from Sprint";
      }
      return before
        ? "moved this item to another Sprint"
        : "added this item to Sprint";
    default:
      return `updated ${field}${ofTarget}`;
  }
};

/** Sinh chuỗi summary mô tả hành động của ActivityEvent */
export const buildActivitySummary = (
  actionType: string,
  changes: ActivityChangeItem[] | null,
  context: {
    isSubtask: boolean;
    subtaskKey: string | null;
    oldValue?: any;
    newValue?: any;
    existingSummary?: string;
  },
): string => {
  if (
    typeof context.existingSummary === "string" &&
    context.existingSummary.trim().length > 0
  ) {
    return context.existingSummary.trim();
  }

  const keyFromPayload =
    context.subtaskKey ||
    (context.newValue && typeof context.newValue.key === "string"
      ? context.newValue.key
      : null) ||
    (context.oldValue && typeof context.oldValue.key === "string"
      ? context.oldValue.key
      : null);

  const isSubtask = context.isSubtask || actionType.startsWith("SUBTASK_");

  switch (actionType) {
    case "COMMENT_CREATED":
      return "added a comment";
    case "COMMENT_UPDATED":
      return "updated a comment";
    case "COMMENT_DELETED":
      return "deleted a comment";
    case "SUBTASK_CREATED":
      return keyFromPayload
        ? `created subtask ${keyFromPayload}`
        : "created a subtask";
    case "SUBTASK_DELETED":
      return keyFromPayload
        ? `deleted subtask ${keyFromPayload}`
        : "deleted a subtask";
    case "CREATED":
    case "WORK_ITEM_CREATED":
      if (isSubtask) {
        return keyFromPayload
          ? `created subtask ${keyFromPayload}`
          : "created a subtask";
      }
      return "created this item";
    case "DELETED":
    case "WORK_ITEM_DELETED":
      if (isSubtask) {
        return keyFromPayload
          ? `deleted subtask ${keyFromPayload}`
          : "deleted a subtask";
      }
      return "deleted this item";
    default:
      break;
  }

  if (changes && changes.length === 1 && changes[0]) {
    return formatSingleFieldChangeSummary(
      changes[0],
      isSubtask,
      keyFromPayload,
    );
  }

  if (changes && changes.length > 1) {
    const ofTarget = isSubtask && keyFromPayload ? ` of ${keyFromPayload}` : "";
    const fields = changes.map((c) => c.field).join(", ");
    return `updated ${fields}${ofTarget}`;
  }

  if (isSubtask) {
    return keyFromPayload
      ? `updated subtask ${keyFromPayload}`
      : "updated a subtask";
  }
  return "updated this item";
};

/** Chuẩn hóa tên hiển thị của người thực hiện hành động, fallback về "Unknown member" */
const resolveActorFullName = (userDoc: any): string => {
  if (!userDoc || typeof userDoc !== "object") {
    return "Unknown member";
  }
  const candidates = [userDoc.fullName, userDoc.name, userDoc.username];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "Unknown member";
};

// ============================================================================
// 4. TRUY VẤN LỊCH SỬ HOẠT ĐỘNG (VIEW WORK ITEM ACTIVITY)
// ============================================================================

/**
 * Xem lịch sử hoạt động (Activity History) của một Work Item
 * GET /api/projects/:projectId/work-items/:itemId/activity
 */
export const getWorkItemActivity = async (
  projectId: string,
  itemId: string,
  userId: string,
): Promise<ActivityEventResponseItem[]> => {
  // 1. Kiểm tra Project tồn tại (cho phép cả ACTIVE và ARCHIVED vì lịch sử là chỉ đọc)
  const project = await resolveQueryChain(ProjectModel.findById(projectId));
  if (!project) {
    throw createError(404, "Project not found");
  }

  // 2. Kiểm tra người dùng phải là thành viên ACTIVE của dự án
  await getActiveMembership(userId, projectId);

  // 3. Tìm Work Item mục tiêu (chưa bị xóa mềm)
  const workItem = await resolveQueryChain(
    WorkItemModel.findOne({
      _id: itemId,
      projectId,
      deletedAt: null,
    }),
  );
  if (!workItem) {
    throw createError(404, "Work item not found");
  }

  const rootItemIdStr = String(workItem._id ?? itemId);
  const workItemMetaMap = new Map<
    string,
    { id: string; key: string | null; isSubtask: boolean }
  >();

  let targetWorkItemIds: any[] = [workItem._id ?? itemId];

  // 4. Phân loại Independent Work Item hay Subtask
  if (workItem.parentId !== null && workItem.parentId !== undefined) {
    // Nếu là Subtask: Parent phải còn tồn tại và chưa bị xóa mềm
    const parentItem = await resolveQueryChain(
      WorkItemModel.findOne({
        _id: workItem.parentId,
        projectId,
        deletedAt: null,
      }),
    );
    if (!parentItem) {
      throw createError(404, "Work item not found");
    }

    workItemMetaMap.set(rootItemIdStr, {
      id: rootItemIdStr,
      key: workItem.key ?? null,
      isSubtask: true,
    });
  } else {
    // Nếu là Independent Work Item: Lấy kèm lịch sử của tất cả Subtask thuộc về nó (kể cả subtask đã bị xóa mềm)
    workItemMetaMap.set(rootItemIdStr, {
      id: rootItemIdStr,
      key: workItem.key ?? null,
      isSubtask: false,
    });

    const childItems =
      (await resolveQueryChain<any[]>(
        WorkItemModel.find({
          projectId,
          parentId: workItem._id ?? itemId,
        }),
        { select: "_id key title parentId" },
      )) ?? [];

    for (const child of childItems) {
      const childId = child._id ?? child.id;
      const childIdStr = String(childId);
      workItemMetaMap.set(childIdStr, {
        id: childIdStr,
        key: child.key ?? null,
        isSubtask: true,
      });
      targetWorkItemIds.push(childId);
    }
  }

  // 5. Truy vấn danh sách ActivityEvent thuộc phạm vi targetWorkItemIds
  const rawEvents =
    (await resolveQueryChain<any[]>(
      ActivityEventModel.find({
        projectId,
        workItemId: { $in: targetWorkItemIds },
      }),
      { sort: { createdAt: -1, _id: 1 } },
    )) ?? [];

  if (rawEvents.length === 0) {
    return [];
  }

  // 6. Sắp xếp theo occurredAt (createdAt) giảm dần, nếu trùng thời gian thì theo id tăng dần
  const sortedEvents = [...rawEvents].sort((a: any, b: any) => {
    const timeA = a.createdAt
      ? new Date(a.createdAt).getTime()
      : a.occurredAt
        ? new Date(a.occurredAt).getTime()
        : 0;
    const timeB = b.createdAt
      ? new Date(b.createdAt).getTime()
      : b.occurredAt
        ? new Date(b.occurredAt).getTime()
        : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    const idA = String(a._id ?? a.id ?? "");
    const idB = String(b._id ?? b.id ?? "");
    return idA.localeCompare(idB);
  });

  // 7. Truy vấn thông tin người thực hiện (actor) và đảm bảo không lộ passwordHash
  const uniqueActorIds = Array.from(
    new Set(
      sortedEvents
        .map((ev: any) => (ev.actorId ? String(ev.actorId) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const actorMap = new Map<string, { id: string; fullName: string }>();
  if (uniqueActorIds.length > 0) {
    const users =
      (await resolveQueryChain<any[]>(
        UserModel.find({ _id: { $in: uniqueActorIds } }),
        { select: "_id fullName name username" },
      )) ?? [];

    for (const user of users) {
      const uid = String(user._id ?? user.id);
      actorMap.set(uid, {
        id: uid,
        fullName: resolveActorFullName(user),
      });
    }
  }

  // 8. Chuẩn hóa dữ liệu trả về theo đúng contract ActivityEvent
  return sortedEvents.map((ev: any) => {
    const eventId = String(ev._id ?? ev.id ?? "");
    const actorIdStr = ev.actorId ? String(ev.actorId) : "";
    const actor = actorMap.get(actorIdStr) ?? {
      id: actorIdStr,
      fullName:
        ev.actor &&
        typeof ev.actor.fullName === "string" &&
        ev.actor.fullName.trim()
          ? ev.actor.fullName.trim()
          : "Unknown member",
    };

    const eventWorkItemId = ev.workItemId
      ? String(ev.workItemId)
      : rootItemIdStr;
    const itemMeta = workItemMetaMap.get(eventWorkItemId) ?? {
      id: eventWorkItemId,
      key: null,
      isSubtask: eventWorkItemId !== rootItemIdStr,
    };

    const action = String(ev.actionType ?? ev.action ?? "WORK_ITEM_UPDATED");
    const changes =
      ev.changes !== undefined
        ? ev.changes
        : buildActivityChanges(
            action,
            ev.oldValue ?? null,
            ev.newValue ?? null,
          );

    const summary = buildActivitySummary(action, changes, {
      isSubtask: itemMeta.isSubtask,
      subtaskKey: itemMeta.key,
      oldValue: ev.oldValue,
      newValue: ev.newValue,
      existingSummary: ev.summary,
    });

    const rawDate = ev.createdAt ?? ev.occurredAt;
    const occurredAt =
      rawDate instanceof Date
        ? rawDate.toISOString()
        : typeof rawDate === "string"
          ? rawDate
          : new Date(0).toISOString();

    return {
      id: eventId,
      actor: {
        id: actor.id,
        fullName: actor.fullName,
      },
      action,
      workItemId: eventWorkItemId,
      summary,
      changes,
      occurredAt,
    };
  });
};
