import type { Types } from "mongoose";

import SprintModel from "../models/sprint.ts";
import WorkItemModel from "../models/workitem.ts";
import { AppError, createError } from "../utils/error.ts";
import { requireProductOwner, requireProjectMember } from "./projectAccess.ts";

type SprintOrderKey = {
  startDate?: Date | null;
  _id: { toString(): string };
};

/** startDate giảm dần (mới nhất lên đầu), Sprint chưa có ngày xuống cuối, cùng ngày thì id tăng dần */
export const compareSprintStart = (a: SprintOrderKey, b: SprintOrderKey) => {
  const aStart = a.startDate?.getTime();
  const bStart = b.startDate?.getTime();
  if (aStart !== bStart) {
    if (aStart === undefined) return 1;
    if (bStart === undefined) return -1;
    return bStart - aStart;
  }
  return a._id.toString().localeCompare(b._id.toString());
};

// ============================================================================
// ĐỌC DỮ LIỆU
// ============================================================================

/** Sprint thuộc Project và chưa bị xóa */
const requireSprint = async (projectId: string, sprintId: string) => {
  const sprint = await SprintModel.findOne({
    _id: sprintId,
    projectId,
    deletedAt: null,
  });
  if (!sprint) throw createError(404, "Sprint not found");
  return sprint;
};

/** Sprint cùng các item độc lập còn sống đang liên kết với nó */
const loadSprintDetail = async (
  projectId: string,
  sprint: Awaited<ReturnType<typeof requireSprint>>,
) => {
  const items = await WorkItemModel.find({
    projectId,
    sprintId: sprint._id,
    parentId: null,
    deletedAt: null,
  }).sort({ orderIndex: 1, _id: 1 });

  return { ...sprint.toJSON(), items: items.map((item) => item.toJSON()) };
};

/** Danh sách Sprint chưa xóa của Project (kể cả CLOSED), kèm số item và số item DONE */
export const getSprints = async (projectId: string, userId: string) => {
  await requireProjectMember(userId, projectId);

  const sprints = await SprintModel.find({ projectId, deletedAt: null });
  if (sprints.length === 0) return [];
  sprints.sort(compareSprintStart);

  const items = await WorkItemModel.find({
    projectId,
    sprintId: { $in: sprints.map((sprint) => sprint._id) },
    parentId: null,
    deletedAt: null,
  })
    .select("sprintId status")
    .lean();

  const counts = new Map<string, { itemCount: number; doneCount: number }>();
  for (const item of items) {
    const key = String(item.sprintId);
    const count = counts.get(key) ?? { itemCount: 0, doneCount: 0 };
    count.itemCount += 1;
    if (item.status === "DONE") count.doneCount += 1;
    counts.set(key, count);
  }

  return sprints.map((sprint) => ({
    ...sprint.toJSON(),
    ...(counts.get(String(sprint._id)) ?? { itemCount: 0, doneCount: 0 }),
  }));
};

export const getSprintDetail = async (
  projectId: string,
  sprintId: string,
  userId: string,
) => {
  await requireProjectMember(userId, projectId);
  return loadSprintDetail(projectId, await requireSprint(projectId, sprintId));
};

// ============================================================================
// TẠO VÀ SỬA
// ============================================================================

const SPRINT_FIELDS = new Set(["name", "goal", "startDate", "endDate"]);

// Chỉ nhận ngày UTC: YYYY-MM-DD hoặc ngày giờ ISO 8601 kết thúc bằng Z
const UTC_DATE =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,3})?)?Z)?$/;

type SprintInput = {
  name?: string;
  goal?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
};

const parseDate = (value: unknown, field: string) => {
  if (value === null) return null;
  if (typeof value === "string" && UTC_DATE.test(value)) {
    const date = new Date(value);
    // Ngày không tồn tại (2026-02-30) bị JS tràn sang tháng sau nên toISOString không còn khớp
    if (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().startsWith(value.slice(0, 10))
    ) {
      return date;
    }
  }
  throw new AppError("VALIDATION_FAILED", {
    message: `${field} must be a UTC date (YYYY-MM-DD) or a date-time ending in Z, or null`,
    field,
  });
};

/** Kiểm tra hình dạng và kiểu của body, trả về các trường hợp lệ đã chuẩn hóa */
const parseSprintInput = (
  body: unknown,
  {
    requireName,
    allowEmpty = false,
  }: { requireName: boolean; allowEmpty?: boolean },
): SprintInput => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Request body must be a JSON object",
    });
  }
  const data = body as Record<string, unknown>;
  const keys = Object.keys(data);
  for (const key of keys) {
    if (!SPRINT_FIELDS.has(key)) {
      throw new AppError("VALIDATION_FAILED", {
        message: `Field '${key}' is not accepted`,
        field: key,
      });
    }
  }
  if (!requireName && !allowEmpty && keys.length === 0) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Request body cannot be empty",
    });
  }

  const input: SprintInput = {};
  if (requireName || "name" in data) {
    if (typeof data.name !== "string" || data.name.trim().length === 0) {
      throw new AppError("VALIDATION_FAILED", {
        message: "Sprint name is required and cannot be blank",
        field: "name",
      });
    }
    input.name = data.name.trim();
  }
  if ("goal" in data) {
    if (data.goal !== null && typeof data.goal !== "string") {
      throw new AppError("VALIDATION_FAILED", {
        message: "goal must be a string or null",
        field: "goal",
      });
    }
    input.goal = data.goal === null ? null : data.goal.trim() || null;
  }
  if ("startDate" in data)
    input.startDate = parseDate(data.startDate, "startDate");
  if ("endDate" in data) input.endDate = parseDate(data.endDate, "endDate");
  return input;
};

/** Tên không trùng (không phân biệt hoa thường) với Sprint chưa xóa khác trong Project */
const assertNameAvailable = async (
  projectId: string,
  name: string,
  excludeId?: unknown,
) => {
  const filter: Record<string, unknown> = { projectId, deletedAt: null, name };
  if (excludeId) filter._id = { $ne: excludeId };
  const duplicate = await SprintModel.findOne(filter).collation({
    locale: "en",
    strength: 2,
  });
  if (duplicate) {
    throw new AppError("CONFLICT", {
      message: "A Sprint with this name already exists",
      field: "name",
    });
  }
};

/** Sprint DRAFT/ACTIVE đã đủ ngày không được chồng lấn nhau theo nửa khoảng [start, end) */
const assertNoOverlap = async (
  projectId: string,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
  field: "startDate" | "endDate",
  excludeId?: unknown,
) => {
  if (!startDate || !endDate) return;
  const filter: Record<string, unknown> = {
    projectId,
    deletedAt: null,
    status: { $in: ["DRAFT", "ACTIVE"] },
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const overlapping = await SprintModel.findOne(filter);
  if (overlapping) {
    throw new AppError("CONFLICT", {
      message: `These dates overlap ${overlapping.name}`,
      field,
    });
  }
};

const sameInstant = (a?: Date | null, b?: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Tạo Sprint DRAFT; chỉ PO của Project ACTIVE */
export const createSprint = async (
  projectId: string,
  userId: string,
  body: unknown,
) => {
  await requireProductOwner(userId, projectId);
  const input = parseSprintInput(body, { requireName: true });

  const sprint = new SprintModel({ projectId, ...input });
  // Quy tắc ngày của model (400) được kiểm tra trước các xung đột (409)
  await sprint.validate();
  await assertNameAvailable(projectId, sprint.name);
  await assertNoOverlap(
    projectId,
    sprint.startDate,
    sprint.endDate,
    "startDate",
  );
  await sprint.save();

  return { ...sprint.toJSON(), items: [] };
};

/** Sửa Sprint DRAFT hoặc ACTIVE; Sprint ACTIVE không được đổi startDate */
export const updateSprint = async (
  projectId: string,
  sprintId: string,
  userId: string,
  body: unknown,
) => {
  await requireProductOwner(userId, projectId);
  const sprint = await requireSprint(projectId, sprintId);
  if (sprint.status === "CLOSED") {
    throw createError(409, "A closed Sprint cannot be edited");
  }
  const input = parseSprintInput(body, { requireName: false });

  if (
    sprint.status === "ACTIVE" &&
    "startDate" in input &&
    !sameInstant(input.startDate, sprint.startDate)
  ) {
    throw new AppError("CONFLICT", {
      message: "The start date of an active Sprint cannot be changed",
      field: "startDate",
    });
  }

  sprint.set(input);
  await sprint.validate();
  if (input.name !== undefined) {
    await assertNameAvailable(projectId, input.name, sprint._id);
  }
  if ("startDate" in input || "endDate" in input) {
    await assertNoOverlap(
      projectId,
      sprint.startDate,
      sprint.endDate,
      "startDate" in input ? "startDate" : "endDate",
      sprint._id,
    );
  }
  await sprint.save();

  return loadSprintDetail(projectId, sprint);
};

// ============================================================================
// VÒNG ĐỜI: START VÀ COMPLETE
// ============================================================================

/** Mỗi Project chỉ có một Sprint ACTIVE */
const assertNoOtherActiveSprint = async (
  projectId: string,
  excludeId: unknown,
) => {
  const active = await SprintModel.findOne({
    projectId,
    status: "ACTIVE",
    deletedAt: null,
    _id: { $ne: excludeId },
  });
  if (active) {
    throw new AppError("CONFLICT", {
      message: `Complete or delete ${active.name} first`,
    });
  }
};

export type SprintBlocker = "DONE" | "NO_DESCRIPTION";

/**
 * Lý do một item độc lập không được ở trong Sprint, hoặc null nếu đủ tư cách:
 * item chưa DONE và có mô tả không trống.
 * validateSprintAssignment trong workitem.ts đang kiểm tra cùng quy tắc này trực tiếp;
 * khi nhánh Work Item đã merge, nên dùng lại hàm này ở đó.
 */
export const getSprintBlocker = (item: {
  status?: string | null;
  description?: string | null;
}): SprintBlocker | null => {
  if (item.status === "DONE") return "DONE";
  if (!item.description || item.description.trim().length === 0) {
    return "NO_DESCRIPTION";
  }
  return null;
};

/** Sprint cần ít nhất một item, và mọi item vẫn đủ tư cách (chưa DONE, có mô tả) */
const assertItemsReady = async (
  projectId: string,
  sprintId: Types.ObjectId,
) => {
  const items = await WorkItemModel.find({
    projectId,
    sprintId,
    parentId: null,
    deletedAt: null,
  })
    .select("key status description")
    .lean();
  if (items.length === 0) {
    throw new AppError("CONFLICT", {
      message: "Add at least one Work Item to the Sprint before starting it",
    });
  }

  const notReady = items.flatMap((item) => {
    const blocker = getSprintBlocker(item);
    if (!blocker) return [];
    return [
      `${item.key} ${blocker === "DONE" ? "is done" : "has no description"}`,
    ];
  });
  if (notReady.length > 0) {
    const more = notReady.length > 5 ? ` and ${notReady.length - 5} more` : "";
    throw new AppError("CONFLICT", {
      message: `These items are not ready: ${notReady.slice(0, 5).join(", ")}${more}`,
    });
  }
};

/**
 * Bắt đầu Sprint DRAFT: lưu các giá trị đã duyệt (tùy chọn) và chuyển sang ACTIVE trong một bước.
 * Thứ tự kiểm tra: quyền, trạng thái, body, đủ ngày, quy tắc ngày của model,
 * tên, chồng lấn, Sprint ACTIVE khác, item.
 */
export const startSprint = async (
  projectId: string,
  sprintId: string,
  userId: string,
  body: unknown,
) => {
  await requireProductOwner(userId, projectId);
  const sprint = await requireSprint(projectId, sprintId);
  if (sprint.status !== "DRAFT") {
    throw new AppError("CONFLICT", {
      message: "Only a Draft Sprint can be started",
    });
  }
  const input =
    body === undefined
      ? {}
      : parseSprintInput(body, { requireName: false, allowEmpty: true });

  sprint.set(input);
  for (const field of ["startDate", "endDate"] as const) {
    if (!sprint[field]) {
      throw new AppError("VALIDATION_FAILED", {
        message: `${field} is required to start a Sprint`,
        field,
      });
    }
  }
  sprint.status = "ACTIVE";
  sprint.startedAt = new Date();
  await sprint.validate();

  if (input.name !== undefined) {
    await assertNameAvailable(projectId, input.name, sprint._id);
  }
  if ("startDate" in input || "endDate" in input) {
    await assertNoOverlap(
      projectId,
      sprint.startDate,
      sprint.endDate,
      "startDate" in input ? "startDate" : "endDate",
      sprint._id,
    );
  }
  await assertNoOtherActiveSprint(projectId, sprint._id);
  await assertItemsReady(projectId, sprint._id);
  await sprint.save();

  return loadSprintDetail(projectId, sprint);
};

/**
 * Đóng Sprint ACTIVE: item DONE giữ liên kết, item chưa xong bị gỡ liên kết.
 */
export const completeSprint = async (
  projectId: string,
  sprintId: string,
  userId: string,
) => {
  await requireProductOwner(userId, projectId);
  const sprint = await requireSprint(projectId, sprintId);
  if (sprint.status !== "ACTIVE") {
    throw new AppError("CONFLICT", {
      message: "Only an Active Sprint can be completed",
    });
  }

  // Cả item đã bị xóa mềm cũng được gỡ để Sprint CLOSED chỉ còn item DONE
  await WorkItemModel.updateMany(
    {
      projectId,
      sprintId: sprint._id,
      parentId: null,
      status: { $ne: "DONE" },
    },
    { $set: { sprintId: null } },
  );

  const closed = await SprintModel.findOneAndUpdate(
    { _id: sprint._id, projectId, status: "ACTIVE", deletedAt: null },
    { $set: { status: "CLOSED", closedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!closed) {
    throw new AppError("CONFLICT", {
      message: "The Sprint is no longer active",
    });
  }

  return loadSprintDetail(projectId, closed);
};
