import SprintModel from "../models/sprint.ts";
import WorkItemModel from "../models/workitem.ts";
import { createError } from "../utils/error.ts";
import { requireProjectMember } from "./projectAccess.ts";

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

/** Danh sách Sprint chưa xóa của Project (kể cả CLOSED), kèm số item và số item DONE */
export const getSprints = async (projectId: string, userId: string) => {
  await requireProjectMember(userId, projectId);

  const sprints = await SprintModel.find({ projectId, deletedAt: null });
  if (sprints.length === 0) return [];
  sprints.sort(compareSprintStart);

  // Một truy vấn cho cả danh sách, đếm trong code để tránh N+1
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

/** Chi tiết Sprint chưa xóa và các item độc lập đang liên kết với nó */
export const getSprintDetail = async (
  projectId: string,
  sprintId: string,
  userId: string,
) => {
  await requireProjectMember(userId, projectId);

  const sprint = await SprintModel.findOne({
    _id: sprintId,
    projectId,
    deletedAt: null,
  });
  if (!sprint) throw createError(404, "Sprint not found");

  const items = await WorkItemModel.find({
    projectId,
    sprintId: sprint._id,
    parentId: null,
    deletedAt: null,
  }).sort({ orderIndex: 1, _id: 1 });

  return { ...sprint.toJSON(), items: items.map((item) => item.toJSON()) };
};
