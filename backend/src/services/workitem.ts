import { isObjectIdOrHexString } from "mongoose";

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
import {
  captureFieldChanges,
  recordActivityEvent,
} from "./workItemActivity.ts";

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
  if (
    !assignee ||
    !(await UserModel.exists({ _id: assignee.userId, status: "ACTIVE" }))
  ) {
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

// Initialize existing projects once, including deleted items so keys stay reserved.
async function reserveWorkItemPosition(
  projectId: string,
  project: Awaited<ReturnType<typeof validateActiveProject>>,
) {
  const filter = { _id: projectId, status: "ACTIVE" } as const;
  const prefix = project.key + "-";
  if (project.workItemSequence == null) {
    const existing = await WorkItemModel.find({ projectId })
      .select("key orderIndex")
      .lean();
    let floor = 0;
    for (const item of existing) {
      const suffix = item.key.startsWith(prefix)
        ? item.key.slice(prefix.length)
        : "";
      const sequence = /^d+$/.test(suffix) ? Number(suffix) : 0;
      floor = Math.max(floor, sequence, item.orderIndex + 1);
    }
    await ProjectModel.updateOne(
      filter,
      { $max: { workItemSequence: floor } },
      { timestamps: false },
    );
  }

  const updated = await ProjectModel.findOneAndUpdate(
    { ...filter, workItemSequence: { $lt: Number.MAX_SAFE_INTEGER } },
    { $inc: { workItemSequence: 1 } },
    { returnDocument: "after", timestamps: false },
  );
  if (!updated || updated.workItemSequence == null) {
    throw createError(
      409,
      "Could not reserve a work item key for this project",
    );
  }
  return {
    key: prefix + updated.workItemSequence,
    orderIndex: updated.workItemSequence - 1,
  };
}

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
  const project = await validateActiveProject(projectId);

  const membership = await getActiveMembership(userId, projectId);
  if (!isProductOwner(membership)) {
    throw createError(
      403,
      "Only the Project Owner or Product Owner can create independent work items",
    );
  }

  validateIndependentCreatePayload(data);

  const workType = data.workType || "TASK";
  const priority = data.priority || "MEDIUM";
  const description =
    typeof data.description === "string"
      ? data.description.trim() || null
      : null;

  const newWorkItem = new WorkItemModel({
    projectId,
    ...(await reserveWorkItemPosition(projectId, project)),
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
      assignment: changedKeys.includes("assigneeId") ? workItem : undefined,
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
      "Only the Project Owner or Product Owner can delete independent work items",
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
  if (workItem.parentId != null) {
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
    throw createError(
      403,
      "Only the Project Owner or Product Owner can reorder work items",
    );
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

  if (
    itemIds.some(
      (id: unknown) => typeof id !== "string" || !isObjectIdOrHexString(id),
    )
  ) {
    throw createError(400, "Each itemId must be an ObjectId");
  }
  const ids: string[] = itemIds.map((id: string) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    throw createError(400, "itemIds must not contain duplicate IDs");
  }

  return ProjectModel.db.transaction(async (session) => {
    // Serialize competing reorders even if they leave different rows unchanged.
    const project = await ProjectModel.findOneAndUpdate(
      { _id: projectId, status: "ACTIVE" },
      { $inc: { workItemOrderRevision: 1 } },
      { session, timestamps: false },
    );
    if (!project) throw createError(409, "The project is no longer active");

    const liveItems = await WorkItemModel.find(
      { projectId, parentId: null, deletedAt: null },
      null,
      { session },
    );
    const itemsById = new Map(
      liveItems.map((item) => [String(item._id), item]),
    );
    if (
      liveItems.length !== ids.length ||
      ids.some((id) => !itemsById.has(id))
    ) {
      throw createError(
        409,
        "itemIds must contain every live independent work item in this project exactly once",
      );
    }

    const orderedItems = ids.map((id) => itemsById.get(id)!);
    for (const [index, item] of orderedItems.entries()) {
      item.set("orderIndex", index);
      await item.save({ session });
    }
    return orderedItems;
  });
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
  if (parentItem.parentId != null) {
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
  const project = await validateActiveProject(projectId);

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

  const newSubtask = new WorkItemModel({
    projectId,
    ...(await reserveWorkItemPosition(projectId, project)),
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
    createdBy: userId,
  });

  await newSubtask.save();
  await recordActivityEvent({
    projectId,
    actorId: userId,
    workItemId: newSubtask._id,
    actionType: "SUBTASK_CREATED",
    assignment: newSubtask,
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
  if (workItem.parentId == null) {
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
      assignment: changedKeys.includes("assigneeId") ? workItem : undefined,
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
  if (workItem.parentId == null) {
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
    if (parentItem.parentId != null) {
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
  if (workItem.parentId != null) {
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
    sprintSummary = await SprintModel.findOne({
      _id: effectiveSprintId,
      projectId,
      deletedAt: null,
    })
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

  if (item.parentId != null) {
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

  if (item.parentId != null) {
    return deleteChildWorkItem(projectId, itemId, userId);
  }

  return deleteIndependentWorkItem(projectId, itemId, userId);
};
