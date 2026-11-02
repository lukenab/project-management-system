import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import SprintModel from "../models/sprint.ts";
import WorkItemModel from "../models/workitem.ts";

// Định nghĩa các trường được phép update theo từng role
const PO_FIELDS = new Set(["title", "description", "workType", "priority"]);
const DEV_FIELDS = new Set(["status", "assigneeId", "startDate", "dueDate"]);
const SHARED_FIELDS = new Set(["sprintId"]);

// Helper tạo lỗi có gắn HTTP status code
const createError = (status: number, message: string) => {
  const error: any = new Error(message);
  error.status = status;
  return error;
};

// ============================================================================
// CÁC HÀM VALIDATION CON
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
  // TH1: Gán vào Sprint mới
  if (updates.sprintId !== null) {
    const currentStatus =
      "status" in updates ? updates.status : workItem.status;
    if (currentStatus === "DONE") {
      throw createError(
        409,
        "Cannot assign a completed (DONE) item to a sprint",
      );
    }

    // Item phải có description không rỗng
    const desc =
      "description" in updates ? updates.description : workItem.description;
    if (!desc || desc.trim().length === 0) {
      throw createError(
        409,
        "Work item must have a non-blank description before joining a sprint",
      );
    }

    // Sprint phải thuộc cùng project và có status là DRAFT hoặc ACTIVE
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
  }

  // TH2: Gỡ sprintId về null
  else {
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

/** Kiểm tra Parent Item: Phải tồn tại, cùng project, chưa xóa và là Item độc lập */
const validateParentItem = async (parentId: string, projectId: string) => {
  const parentItem = await WorkItemModel.findOne({
    _id: parentId,
    projectId,
    deletedAt: null,
  }).lean();
  if (!parentItem) {
    throw createError(404, "Parent work item not found");
  }

  // Chặn tạo Subtask dưới một Subtask khác
  if (parentItem.parentId !== null) {
    throw createError(400, "Cannot create a subtask under another subtask");
  }
};

/** Validate dữ liệu đầu vào của Subtask */
const validateChildItemPayload = (data: {
  title?: string;
  workType?: string;
  priority?: any;
}) => {
  if (!data.title || data.title.trim().length === 0) {
    throw createError(400, "Title is required and cannot be blank");
  }

  // Subtask chỉ có workType là TASK
  if (data.workType && data.workType !== "TASK") {
    throw createError(400, "Child work item workType must be TASK");
  }

  // Subtask không có priority
  if (data.priority !== undefined && data.priority !== null) {
    throw createError(400, "Child work item cannot accept priority");
  }
};

/** Helper gán các giá trị mới vào WorkItem */
const applyUpdates = (workItem: any, updates: Record<string, any>) => {
  for (const key of Object.keys(updates)) {
    if (
      key === "description" &&
      typeof updates[key] === "string" &&
      updates[key].trim() === ""
    ) {
      workItem.set(key, null); // Chuỗi rỗng -> null theo specification
    } else {
      workItem.set(key, updates[key]);
    }
  }
};

// ============================================================================
// HÀM CHÍNH (SERVICE FUNCTION)
// ============================================================================

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
  // 1. Kiểm tra Project có tồn tại & ACTIVE
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");
  if (project.status === "ARCHIVED")
    throw createError(409, "Archived project does not allow modifications");

  // 2. Kiểm tra quyền: Chỉ DEVELOPER mới được tạo Subtask
  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
    scrumRole: "DEVELOPER",
  }).lean();
  if (!membership)
    throw createError(403, "Only Developers can create subtasks");

  // 3. Kiểm tra Parent Item
  await validateParentItem(data.parentId, projectId);

  // 4. Validate các trường của subtask
  validateChildItemPayload(data);

  // 5. Validate assignee
  if (data.assigneeId) {
    await validateAssignee(data.assigneeId, projectId);
  }

  // 6. Tính orderIndex cho Subtask
  const childCount = await WorkItemModel.countDocuments({
    projectId,
    parentId: data.parentId,
    deletedAt: null,
  });

  // 7. Tạo key tiếp theo cho project
  const nextKey = "PRJ_TEMP"; // TODO: Gọi hàm sinh key

  const newSubtask = new WorkItemModel({
    projectId,
    key: nextKey,
    parentId: data.parentId,
    title: data.title.trim(),
    description: data.description ? data.description.trim() : null,
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

  // TODO: Tích hợp ACTIVITY EVENT & NOTIFICATION KHI TẠO SUBTASK
  // TODO: 1. Tạo ActivityEvent:
  //          - projectId: projectId
  //          - actorId: userId
  //          - workItemId: newSubtask._id
  //          - actionType: "WORK_ITEM_CREATED" (hoặc "SUBTASK_CREATED")
  //          - newValue: { title: newSubtask.title, parentId: newSubtask.parentId }
  //
  // TODO: 2. Gửi Notification (nếu có gán assignee và người đó khác actor):
  //          - recipientId: UserAccount ID của assignee
  //          - activityEventId: ActivityEvent ID vừa tạo
  //          - title: "Bạn đã được phân công vào subtask mới"
  //          - message: `Bạn được phân công vào: ${newSubtask.title}`

  return newSubtask;
};

export const updateIndependentWorkItem = async (
  projectId: string,
  itemId: string,
  userId: string,
  updates: Record<string, any>,
) => {
  // 1. Kiểm tra Project
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");
  if (project.status === "ARCHIVED") {
    throw createError(409, "Archived project does not allow modifications");
  }

  // 2. Xác định Membership & Role
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

  // 3. Tìm WorkItem
  const workItem = await WorkItemModel.findOne({
    _id: itemId,
    projectId,
    parentId: null,
    deletedAt: null,
  });
  if (!workItem) {
    throw createError(404, "Work item not found or is a child item");
  }

  // 4. Thực thi các hàm Validation
  validateFieldPermissions(Object.keys(updates), isPO, isDev);
  await validateActiveSprintLock(workItem, updates);
  if ("assigneeId" in updates && updates.assigneeId !== null) {
    await validateAssignee(updates.assigneeId, projectId);
  }
  validateDates(workItem, updates);
  if ("sprintId" in updates) {
    await validateSprintAssignment(workItem, updates, projectId);
  }

  // 5. Cập nhật và lưu vào DB
  applyUpdates(workItem, updates);
  await workItem.save();

  // TODO: TÍCH HỢP ACTIVITY EVENT & NOTIFICATION KHI UPDATE WORK ITEM
  // TODO: 1. Tạo ActivityEvent lưu vết thay đổi:
  //          - projectId: projectId
  //          - actorId: userId
  //          - workItemId: workItem._id
  //          - actionType: "WORK_ITEM_UPDATED"
  //          - oldValue: Lấy các giá trị trước khi update của các trường có trong updates
  //          - newValue: Lấy các giá trị sau khi update
  //
  // TODO: 2. Gửi Notification nếu có phân công người mới ("assigneeId" in updates):
  //          - recipientId: UserAccount ID của assignee mới
  //          - activityEventId: ActivityEvent ID vừa tạo
  //          - title: "Bạn đã được phân công vào công việc"
  //          - message: `Bạn được phân công vào: ${workItem.title}`
  //
  // TODO: 3. Gửi Notification nếu thay đổi trạng thái ("status" in updates):
  //          - Gửi cho Product Owner hoặc người tạo workItem thông báo trạng thái mới
  return workItem;
};
