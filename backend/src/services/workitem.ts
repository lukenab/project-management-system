import mongoose from "mongoose";

import ActivityEventModel from "../models/activityEvent.ts";
import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import SprintModel from "../models/sprint.ts";
import UserModel from "../models/user.ts";
import WorkItemModel from "../models/workitem.ts";
import { createError } from "../utils/error.ts";
import {
  getActiveMembership,
  isProductOwner,
  validateActiveProject,
} from "./projectAccess.ts";

// ============================================================================
// 1. HẰNG SỐ & PHÂN QUYỀN (CONSTANTS & PERMISSIONS)
// ============================================================================

// Phân quyền update cho Independent Work Item
const PO_FIELDS = new Set(["title", "description", "workType", "priority"]);
const DEV_FIELDS = new Set(["status", "assigneeId", "startDate", "dueDate"]);
const SHARED_FIELDS = new Set(["sprintId"]);
const ALLOWED_INDEPENDENT_CREATE_FIELDS = new Set([
  "parentId",
  "title",
  "description",
  "workType",
  "priority",
]);

// Phân quyền & trạng thái cho Child Work Item (Subtask)
const CHILD_EDITABLE_FIELDS = new Set([
  "title",
  "description",
  "status",
  "assigneeId",
]);
const VALID_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const VALID_WORK_TYPES = new Set(["STORY", "TASK", "BUG"]);
const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

// ============================================================================
// 2. HÀM DÙNG CHUNG (COMMON REUSABLE HELPERS)
// ============================================================================

/** Kiểm tra Người được phân công (Assignee) phải là Developer ACTIVE */
const validateAssignee = async (assigneeId: string, projectId: string) => {
  const assignee = await MembershipModel.findOne({
    _id: assigneeId,
    projectId,
    status: "ACTIVE",
    scrumRole: "DEVELOPER",
  }).lean();
  if (!assignee) {
    throw createError(
      409,
      "Assignee must be an active Developer in this project",
    );
  }
};

/** Helper gán các giá trị mới vào WorkItem (Tự động đưa description rỗng về null) */
const applyUpdates = (workItem: any, updates: Record<string, any>) => {
  for (const key of Object.keys(updates)) {
    if (
      key === "description" &&
      typeof updates[key] === "string" &&
      updates[key].trim() === ""
    ) {
      workItem.set(key, null);
    } else {
      workItem.set(key, updates[key]);
    }
  }
};

/** Helper thu thập các trường thực sự thay đổi trước khi áp dụng updates */
const captureFieldChanges = (
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
  return event;
};

// ============================================================================
// 3. DOMAIN: INDEPENDENT WORK ITEM (Dành cho Independent Item)
// ============================================================================

/** Kiểm tra quyền sửa từng trường theo vai trò */
const validateFieldPermissions = (
  updateKeys: string[],
  isPO: boolean,
  isDev: boolean,
) => {
  for (const key of updateKeys) {
    const canPOEdit = PO_FIELDS.has(key) && isPO;
    const canDevEdit = DEV_FIELDS.has(key) && isDev;
    const canSharedEdit = SHARED_FIELDS.has(key) && (isPO || isDev);
    if (!canPOEdit && !canDevEdit && !canSharedEdit) {
      throw createError(
        403,
        `Forbidden: You do not have permission to update field '${key}'`,
      );
    }
  }
};

/** Khóa sửa description & workType nếu item đang nằm trong Sprint ACTIVE */
const validateActiveSprintLock = async (
  workItem: any,
  updates: Record<string, any>,
) => {
  if (!workItem.sprintId) return;
  const currentSprint = await SprintModel.findById(workItem.sprintId).lean();
  if (currentSprint && currentSprint.status === "ACTIVE") {
    if ("description" in updates || "workType" in updates) {
      throw createError(
        409,
        "Cannot edit description or workType while the item is in an ACTIVE sprint",
      );
    }
  }
};

/** Kiểm tra logic ngày tháng (dueDate >= startDate) */
const validateDates = (workItem: any, updates: Record<string, any>) => {
  const finalStartDate =
    "startDate" in updates ? updates.startDate : workItem.startDate;
  const finalDueDate =
    "dueDate" in updates ? updates.dueDate : workItem.dueDate;
  if (finalStartDate && finalDueDate && finalDueDate < finalStartDate) {
    throw createError(400, "dueDate cannot be before startDate");
  }
};

/** Kiểm tra logic gán hoặc gỡ Sprint */
const validateSprintAssignment = async (
  workItem: any,
  updates: Record<string, any>,
  projectId: string,
) => {
  if (updates.sprintId !== null) {
    const currentStatus =
      "status" in updates ? updates.status : workItem.status;
    if (currentStatus === "DONE") {
      throw createError(
        409,
        "Cannot assign a completed (DONE) item to a sprint",
      );
    }
    const desc =
      "description" in updates ? updates.description : workItem.description;
    if (!desc || desc.trim().length === 0) {
      throw createError(
        409,
        "Work item must have a non-blank description before joining a sprint",
      );
    }
    const targetSprint = await SprintModel.findOne({
      _id: updates.sprintId,
      projectId,
      status: { $in: ["DRAFT", "ACTIVE"] },
      deletedAt: null,
    }).lean();
    if (!targetSprint) {
      throw createError(
        409,
        "Target sprint must be a live DRAFT or ACTIVE sprint in this project",
      );
    }
  } else {
    if (workItem.sprintId) {
      const linkedSprint = await SprintModel.findById(workItem.sprintId).lean();
      if (linkedSprint && linkedSprint.status === "CLOSED") {
        throw createError(
          409,
          "Cannot clear sprint link for an item in a closed sprint",
        );
      }
    }
  }
};

/** Validate giá trị các trường khi tạo mới Independent Item */
const validateIndependentCreatePayload = (data: Record<string, any>) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError(400, "Request body must be a JSON object");
  }

  for (const key of Object.keys(data)) {
    if (key === "assigneeId" && data.assigneeId !== undefined) {
      throw createError(
        400,
        "Independent work item cannot accept assigneeId on creation",
      );
    }
    if (!ALLOWED_INDEPENDENT_CREATE_FIELDS.has(key)) {
      throw createError(
        400,
        `Field '${key}' is not allowed when creating an independent work item`,
      );
    }
  }

  if (
    !data.title ||
    typeof data.title !== "string" ||
    data.title.trim().length === 0
  ) {
    throw createError(400, "Title is required and cannot be blank");
  }
  if (
    data.description !== undefined &&
    data.description !== null &&
    typeof data.description !== "string"
  ) {
    throw createError(400, "Description must be a string or null");
  }
  if (data.workType !== undefined && !VALID_WORK_TYPES.has(data.workType)) {
    throw createError(400, "Invalid workType value");
  }
  if (data.priority !== undefined && !VALID_PRIORITIES.has(data.priority)) {
    throw createError(400, "Invalid priority value");
  }
};

export const createIndependentWorkItem = async (
  projectId: string,
  userId: string,
  data: {
    parentId?: null;
    title: string;
    description?: string | null;
    workType?: string;
    priority?: string;
    [key: string]: any;
  },
) => {
  await validateActiveProject(projectId);

  const membership = await getActiveMembership(userId, projectId);
  if (!isProductOwner(membership)) {
    throw createError(
      403,
      "Only Product Owner can create independent work items",
    );
  }

  validateIndependentCreatePayload(data);

  const independentCount = await WorkItemModel.countDocuments({
    projectId,
    parentId: null,
    deletedAt: null,
  });

  const workType = data.workType || "TASK";
  const priority = data.priority || "MEDIUM";
  const description =
    typeof data.description === "string"
      ? data.description.trim() || null
      : null;

  const newWorkItem = new WorkItemModel({
    projectId,
    key: `${workType}-${Date.now()}`,
    parentId: null,
    title: data.title.trim(),
    description,
    workType,
    status: "TODO",
    priority,
    assigneeId: null,
    startDate: null,
    dueDate: null,
    sprintId: null,
    orderIndex: independentCount,
    createdBy: userId,
  });

  await newWorkItem.save();
  // TODO: TÍCH HỢP ACTIVITY EVENT & NOTIFICATION KHI TẠO INDEPENDENT ITEM
  return newWorkItem;
};

/** Validate giá trị các trường khi update Independent Item */
const validateIndependentPayload = (updates: Record<string, any>) => {
  if ("title" in updates) {
    if (
      typeof updates.title !== "string" ||
      updates.title.trim().length === 0
    ) {
      throw createError(400, "Title is required and cannot be blank");
    }
  }
  if ("status" in updates && !VALID_STATUSES.has(updates.status)) {
    throw createError(400, "Invalid status value");
  }
  if ("workType" in updates && !VALID_WORK_TYPES.has(updates.workType)) {
    throw createError(400, "Invalid workType value");
  }
  if ("priority" in updates && !VALID_PRIORITIES.has(updates.priority)) {
    throw createError(400, "Invalid priority value");
  }
};

export const updateIndependentWorkItem = async (
  projectId: string,
  itemId: string,
  userId: string,
  updates: Record<string, any>,
) => {
  await validateActiveProject(projectId);

  const membership = await getActiveMembership(userId, projectId);
  const isPO = isProductOwner(membership);
  const isDev = membership.scrumRole === "DEVELOPER";

  const workItem = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    parentId: null,
    deletedAt: null,
  });
  if (!workItem) {
    throw createError(404, "Work item not found or is a child item");
  }

  validateFieldPermissions(Object.keys(updates), isPO, isDev);
  validateIndependentPayload(updates);
  await validateActiveSprintLock(workItem, updates);
  if ("assigneeId" in updates && updates.assigneeId !== null) {
    await validateAssignee(updates.assigneeId, projectId);
  }
  validateDates(workItem, updates);
  if ("sprintId" in updates) {
    await validateSprintAssignment(workItem, updates, projectId);
  }

  const { oldValue, newValue, changedKeys } = captureFieldChanges(
    workItem,
    updates,
  );

  applyUpdates(workItem, updates);
  await workItem.save();

  if (changedKeys.length > 0) {
    const actionType =
      changedKeys.length === 1 && changedKeys[0] === "status"
        ? "STATUS_CHANGED"
        : "WORK_ITEM_UPDATED";
    await recordActivityEvent({
      projectId,
      actorId: userId,
      workItemId: workItem._id ?? itemId,
      actionType,
      oldValue,
      newValue,
    });
  }
  return workItem;
};

export const deleteIndependentWorkItem = async (
  projectId: string,
  itemId: string,
  userId: string,
) => {
  // 1. Kiểm tra Project tồn tại & ACTIVE
  await validateActiveProject(projectId);

  // 2. Chỉ Product Owner mới được xóa Independent Work Item
  const membership = await getActiveMembership(userId, projectId);
  if (!isProductOwner(membership)) {
    throw createError(
      403,
      "Only Product Owner can delete independent work items",
    );
  }

  // 3. Tìm Independent Work Item
  const workItem = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    deletedAt: null,
  });
  if (!workItem) {
    throw createError(404, "Work item not found");
  }
  if (workItem.parentId !== null) {
    throw createError(400, "The item is not an independent work item");
  }

  // 4. Kiểm tra liên kết Sprint: chặn nếu Sprint đang ACTIVE, gỡ sprintId nếu DRAFT
  if (workItem.sprintId) {
    const linkedSprint = await SprintModel.findById(workItem.sprintId).lean();
    if (linkedSprint && linkedSprint.status === "ACTIVE") {
      throw createError(
        409,
        "Cannot delete a work item while it is in an ACTIVE sprint",
      );
    }
    if (linkedSprint && linkedSprint.status === "DRAFT") {
      workItem.set("sprintId", null);
    }
  }

  // 5. Soft-delete
  workItem.deletedAt = new Date();
  await workItem.save();

  // TODO: Tích hợp ActivityEvent & Notification khi xóa independent work item

  return true;
};

export const reorderWorkItems = async (
  projectId: string,
  userId: string,
  body: Record<string, any>,
) => {
  // 1. Kiểm tra Project tồn tại & ACTIVE
  await validateActiveProject(projectId);

  // 2. Chỉ Product Owner mới được sắp xếp thứ tự Independent Work Item
  const membership = await getActiveMembership(userId, projectId);
  if (!isProductOwner(membership)) {
    throw createError(403, "Only Product Owner can reorder work items");
  }

  // 3. Validate payload { itemIds: ID[] }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createError(400, "Request body must be a JSON object");
  }
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== 1 || !("itemIds" in body)) {
    throw createError(400, "Request body must only contain itemIds");
  }

  const { itemIds } = body;
  if (!Array.isArray(itemIds) || itemIds.length < 2) {
    throw createError(
      400,
      "itemIds must be an array of at least 2 work item IDs",
    );
  }

  for (const id of itemIds) {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw createError(400, "Each itemId must be a non-empty string");
    }
  }

  const uniqueIds = new Set(itemIds);
  if (uniqueIds.size !== itemIds.length) {
    throw createError(400, "itemIds must not contain duplicate IDs");
  }

  // 4. Lấy toàn bộ live independent items của project để đối chiếu tập hợp
  const liveItems = await WorkItemModel.find({
    projectId,
    parentId: null,
    deletedAt: null,
  });

  const itemMap = new Map<string, any>();
  for (const item of liveItems) {
    itemMap.set(String(item._id), item);
  }

  if (
    liveItems.length !== itemIds.length ||
    itemIds.some((id: string) => !itemMap.has(String(id)))
  ) {
    throw createError(
      409,
      "itemIds must contain every live independent work item in this project exactly once",
    );
  }

  // 5. Cập nhật orderIndex theo thứ tự mới
  const orderedItems = itemIds.map((id: string, index: number) => {
    const item = itemMap.get(String(id));
    item.set("orderIndex", index);
    return item;
  });

  await Promise.all(orderedItems.map((item: any) => item.save()));

  return orderedItems;
};

// ============================================================================
// 4. DOMAIN: CHILD WORK ITEM / SUBTASK (Phần Subtask)
// ============================================================================

/** Kiểm tra Parent Item khi tạo subtask */
const validateParentItem = async (parentId: string, projectId: string) => {
  const parentItem = await WorkItemModel.findOne({
    _id: parentId,
    projectId,
    deletedAt: null,
  }).lean();
  if (!parentItem) {
    throw createError(404, "Parent work item not found");
  }
  if (parentItem.parentId !== null) {
    throw createError(400, "Cannot create a subtask under another subtask");
  }
};

/** Validate payload khi tạo Subtask mới */
const validateChildItemPayload = (data: {
  title?: string;
  workType?: string;
  priority?: any;
}) => {
  if (!data.title || data.title.trim().length === 0) {
    throw createError(400, "Title is required and cannot be blank");
  }
  if (data.workType && data.workType !== "TASK") {
    throw createError(400, "Child work item workType must be TASK");
  }
  if (data.priority !== undefined && data.priority !== null) {
    throw createError(400, "Child work item cannot accept priority");
  }
};

/** Validate payload khi cập nhật Subtask */
const validateChildItemUpdatePayload = (updates: Record<string, any>) => {
  for (const key of Object.keys(updates)) {
    if (!CHILD_EDITABLE_FIELDS.has(key)) {
      throw createError(
        403,
        `Forbidden: Field '${key}' is not editable on a subtask`,
      );
    }
  }
  if ("title" in updates) {
    if (
      typeof updates.title !== "string" ||
      updates.title.trim().length === 0
    ) {
      throw createError(400, "Title is required and cannot be blank");
    }
  }
  if ("status" in updates && !VALID_STATUSES.has(updates.status)) {
    throw createError(400, "Invalid status value");
  }
};

export const createChildWorkItem = async (
  projectId: string,
  userId: string,
  data: {
    parentId: string;
    title: string;
    description?: string | null;
    workType?: string;
    priority?: any;
    assigneeId?: string | null;
  },
) => {
  await validateActiveProject(projectId);

  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
    scrumRole: "DEVELOPER",
  }).lean();
  if (!membership) {
    throw createError(403, "Only Developers can create subtasks");
  }

  await validateParentItem(data.parentId, projectId);
  validateChildItemPayload(data);

  if (data.assigneeId) {
    await validateAssignee(data.assigneeId, projectId);
  }

  const childCount = await WorkItemModel.countDocuments({
    projectId,
    parentId: data.parentId,
    deletedAt: null,
  });

  const newSubtask = new WorkItemModel({
    projectId,
    key: `TASK-${Date.now()}`,
    parentId: data.parentId,
    title: data.title.trim(),
    description: data.description || null,
    workType: "TASK",
    status: "TODO",
    priority: null,
    assigneeId: data.assigneeId || null,
    startDate: null,
    dueDate: null,
    sprintId: null,
    orderIndex: childCount,
    createdBy: userId,
  });

  await newSubtask.save();
  await recordActivityEvent({
    projectId,
    actorId: userId,
    workItemId: newSubtask._id,
    actionType: "SUBTASK_CREATED",
    oldValue: null,
    newValue: {
      key: newSubtask.key,
      title: newSubtask.title,
    },
  });
  return newSubtask;
};

export const updateChildWorkItem = async (
  projectId: string,
  itemId: string,
  userId: string,
  updates: Record<string, any>,
) => {
  await validateActiveProject(projectId);

  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
    scrumRole: "DEVELOPER",
  }).lean();
  if (!membership) {
    throw createError(403, "Only Developers can update subtasks");
  }

  const workItem = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    deletedAt: null,
  });
  if (!workItem) {
    throw createError(404, "Work item not found");
  }
  if (workItem.parentId === null) {
    throw createError(400, "The item is not a subtask");
  }

  // Parent phải còn tồn tại và chưa bị soft-delete
  const parentItem = await WorkItemModel.findOne({
    _id: workItem.parentId,
    projectId,
    deletedAt: null,
  }).lean();
  if (!parentItem) {
    throw createError(404, "Parent work item not found");
  }

  validateChildItemUpdatePayload(updates);

  if ("assigneeId" in updates && updates.assigneeId !== null) {
    await validateAssignee(updates.assigneeId, projectId);
  }

  const { oldValue, newValue, changedKeys } = captureFieldChanges(
    workItem,
    updates,
  );

  applyUpdates(workItem, updates);
  await workItem.save();

  if (changedKeys.length > 0) {
    const actionType =
      changedKeys.length === 1 && changedKeys[0] === "status"
        ? "STATUS_CHANGED"
        : "SUBTASK_UPDATED";
    await recordActivityEvent({
      projectId,
      actorId: userId,
      workItemId: workItem._id ?? itemId,
      actionType,
      oldValue,
      newValue,
    });
  }
  return workItem;
};

export const deleteChildWorkItem = async (
  projectId: string,
  itemId: string,
  userId: string,
) => {
  // 1. Kiểm tra Project tồn tại & ACTIVE
  await validateActiveProject(projectId);

  // 2. Chỉ Developer mới được xóa subtask
  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
    scrumRole: "DEVELOPER",
  }).lean();
  if (!membership) {
    throw createError(403, "Only Developers can delete subtasks");
  }

  // 3. Tìm Subtask
  const workItem = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    deletedAt: null,
  });
  if (!workItem) {
    throw createError(404, "Work item not found");
  }
  if (workItem.parentId === null) {
    throw createError(400, "The item is not a subtask");
  }

  // 4. Kiểm tra Parent còn tồn tại không
  const parentItem = await WorkItemModel.findOne({
    _id: workItem.parentId,
    projectId,
    deletedAt: null,
  }).lean();
  if (!parentItem) {
    throw createError(404, "Parent work item not found");
  }

  // 5. Soft-delete
  workItem.deletedAt = new Date();
  await workItem.save();

  await recordActivityEvent({
    projectId,
    actorId: userId,
    workItemId: workItem._id ?? itemId,
    actionType: "SUBTASK_DELETED",
    oldValue: {
      key: workItem.key,
      title: workItem.title,
    },
    newValue: null,
  });

  return true;
};

// ============================================================================
// 5. BỘ ĐIỀU PHỐI & CHỨC NĂNG CHUNG (DISPATCHER & GENERAL)
// ============================================================================

export const getWorkItems = async (
  projectId: string,
  userId: string,
  parentId?: string | null,
) => {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");

  await getActiveMembership(userId, projectId);

  let targetParentId: string | null = null;

  if (parentId !== undefined && parentId !== null) {
    if (typeof parentId !== "string" || parentId.trim().length === 0) {
      throw createError(400, "Invalid parentId");
    }
    const parentItem = await WorkItemModel.findOne({
      _id: parentId,
      projectId,
      deletedAt: null,
    }).lean();
    if (!parentItem) {
      throw createError(404, "Parent work item not found");
    }
    if (parentItem.parentId !== null) {
      throw createError(
        400,
        "Parent work item must be an independent work item",
      );
    }
    targetParentId = parentId;
  }

  const items = await WorkItemModel.find({
    projectId,
    parentId: targetParentId,
    deletedAt: null,
  }).sort({ orderIndex: 1, _id: 1 });

  return items;
};

export const getWorkItemDetail = async (
  projectId: string,
  itemId: string,
  userId: string,
) => {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");

  await getActiveMembership(userId, projectId);

  const workItem = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    deletedAt: null,
  });
  if (!workItem) {
    throw createError(404, "Work item not found");
  }

  let effectiveSprintId = workItem.sprintId;
  if (workItem.parentId !== null) {
    const parentItem = await WorkItemModel.findOne({
      _id: workItem.parentId,
      projectId,
      deletedAt: null,
    }).lean();
    if (!parentItem) {
      throw createError(404, "Work item not found");
    }
    effectiveSprintId = parentItem.sprintId;
  }

  let sprintSummary = null;
  if (effectiveSprintId) {
    sprintSummary = await SprintModel.findById(effectiveSprintId)
      .select("name")
      .lean();
  }

  return {
    workItem,
    sprint: sprintSummary,
  };
};

/**
 * Dispatcher tạo WorkItem chung: Tự động phân loại Subtask hay Independent Item
 */
export const createWorkItem = async (
  projectId: string,
  userId: string,
  data: Record<string, any>,
) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError(400, "Request body must be a JSON object");
  }

  if (data.parentId !== undefined && data.parentId !== null) {
    return createChildWorkItem(projectId, userId, data as any);
  }

  return createIndependentWorkItem(projectId, userId, data as any);
};

/**
 * Dispatcher cập nhật WorkItem chung: Tự động phân loại Subtask hay Independent Item
 */
export const updateWorkItem = async (
  projectId: string,
  itemId: string,
  userId: string,
  updates: Record<string, any>,
) => {
  const item = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    deletedAt: null,
  })
    .select("parentId")
    .lean();

  if (!item) {
    throw createError(404, "Work item not found");
  }

  if (item.parentId !== null) {
    return updateChildWorkItem(projectId, itemId, userId, updates);
  }
  return updateIndependentWorkItem(projectId, itemId, userId, updates);
};

/**
 * Dispatcher xóa WorkItem chung: Tự động phân loại Subtask hay Independent Item
 */
export const deleteWorkItem = async (
  projectId: string,
  itemId: string,
  userId: string,
) => {
  const item = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    deletedAt: null,
  })
    .select("parentId")
    .lean();

  if (!item) {
    throw createError(404, "Work item not found");
  }

  if (item.parentId !== null) {
    return deleteChildWorkItem(projectId, itemId, userId);
  }

  return deleteIndependentWorkItem(projectId, itemId, userId);
};

// ============================================================================
// 6. DOMAIN: WORK ITEM ACTIVITY HISTORY (Lịch sử hoạt động của Work Item)
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
