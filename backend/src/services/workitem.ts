import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import SprintModel from "../models/sprint.ts";
import WorkItemModel from "../models/workitem.ts";

// ============================================================================
// 1. HẰNG SỐ & PHÂN QUYỀN (CONSTANTS & PERMISSIONS)
// ============================================================================

// Phân quyền update cho Independent Work Item
const PO_FIELDS = new Set(["title", "description", "workType", "priority"]);
const DEV_FIELDS = new Set(["status", "assigneeId", "startDate", "dueDate"]);
const SHARED_FIELDS = new Set(["sprintId"]);

// Phân quyền & trạng thái cho Child Work Item (Subtask)
const CHILD_EDITABLE_FIELDS = new Set([
  "title",
  "description",
  "status",
  "assigneeId",
]);
const VALID_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);

// ============================================================================
// 2. HÀM DÙNG CHUNG (COMMON REUSABLE HELPERS)
// ============================================================================

/** Helper tạo lỗi có gắn HTTP status code */
export const createError = (status: number, message: string) => {
  const error: any = new Error(message);
  error.status = status;
  return error;
};

/** Kiểm tra Project tồn tại và không bị ARCHIVED */
const validateActiveProject = async (projectId: string) => {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");
  if (project.status === "ARCHIVED") {
    throw createError(409, "Archived project does not allow modifications");
  }
  return project;
};

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

export const updateIndependentWorkItem = async (
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
  }).lean();
  if (!membership) {
    throw createError(403, "You are not an active member of this project");
  }
  const isPO =
    membership.scrumRole === "PRODUCT_OWNER" ||
    membership.accessRole === "OWNER";
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
  await validateActiveSprintLock(workItem, updates);
  if ("assigneeId" in updates && updates.assigneeId !== null) {
    await validateAssignee(updates.assigneeId, projectId);
  }
  validateDates(workItem, updates);
  if ("sprintId" in updates) {
    await validateSprintAssignment(workItem, updates, projectId);
  }

  applyUpdates(workItem, updates);
  await workItem.save();

  // TODO: TÍCH HỢP ACTIVITY EVENT & NOTIFICATION KHI UPDATE INDEPENDENT ITEM
  return workItem;
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
  // TODO: TÍCH HỢP ACTIVITY EVENT & NOTIFICATION KHI TẠO SUBTASK
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

  applyUpdates(workItem, updates);
  await workItem.save();

  // TODO: TÍCH HỢP ACTIVITY EVENT & NOTIFICATION KHI UPDATE SUBTASK
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

  // TODO: Tích hợp ActivityEvent & Notification khi xóa subtask

  return true;
};

// ============================================================================
// 5. BỘ ĐIỀU PHỐI & CHỨC NĂNG CHUNG (DISPATCHER & GENERAL)
// ============================================================================

export const getWorkItemDetail = async (
  projectId: string,
  itemId: string,
  userId: string,
) => {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");

  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
  }).lean();
  if (!membership) {
    throw createError(403, "You are not an active member of this project");
  }

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

  // TODO: return deleteIndependentWorkItem(projectId, itemId, userId);
  throw createError(
    501,
    "Independent work item deletion is not implemented yet",
  );
};
