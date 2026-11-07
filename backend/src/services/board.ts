import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import SprintModel from "../models/sprint.ts";
import WorkItemModel from "../models/workitem.ts";
import { createError } from "../utils/error.ts";

export interface BoardFilterOptions {
  search?: string;
  assigneeId?: string;
  status?: string;
  workType?: string;
  priority?: string;
}

const checkProjectMember = async (userId: string, projectId: string) => {
  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
  }).lean();

  return membership;
};

// Lấy dữ liệu Sprint Board
export const getSprintBoard = async (
  projectId: string,
  userId: string,
  filters: BoardFilterOptions = {},
) => {
  // 1. Kiểm tra project có tồn tại?
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) {
    throw createError(404, "Project not found");
  }

  // 2. Kiểm tra User có phải là thành viên ACTIVE của project?
  const membership = await checkProjectMember(userId, projectId);
  if (!membership) {
    throw createError(403, "You are not a member of this project");
  }

  // 3. Khởi tạo danh sách status 3 cột
  const boardStatuses = ["TODO", "IN_PROGRESS", "DONE"];

  // 4. Tìm Sprint đang ACTIVE của project
  const activeSprint = await SprintModel.findOne({
    projectId,
    status: "ACTIVE",
    deletedAt: null,
  });

  // 5.1. Không có sprint ACTIVE
  if (!activeSprint) {
    return {
      sprint: null,
      columns: boardStatuses.map((status) => ({
        status,
        cards: [],
      })),
    };
  }

  // 5.2. Có sprint ACTIVE
  // Xây dựng MongoDB Query động
  const query: any = {
    projectId,
    sprintId: activeSprint._id,
    parentId: null,
    deletedAt: null,
  };

  // Search theo title HOẶC key
  if (filters.search) {
    const keyword = filters.search.replace(/[.*+?^{}$()|[\]\\]/g, "\\$&");
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { key: { $regex: keyword, $options: "i" } },
    ];
  }

  // Filter theo Assignee và cả unassigned
  if (filters.assigneeId) {
    if (filters.assigneeId.toLowerCase() === "unassigned") {
      query.assigneeId = null;
    } else {
      query.assigneeId = filters.assigneeId;
    }
  }

  // Filter theo workType (STORY, TASK, BUG)
  if (filters.workType) {
    query.workType = filters.workType.toUpperCase();
  }
  // Filter theo priority (LOW, MEDIUM, HIGH)
  if (filters.priority) {
    query.priority = filters.priority.toUpperCase();
  }
  // Filter theo status
  if (filters.status) {
    query.status = filters.status.toUpperCase();
  }

  const items = await WorkItemModel.find(query).sort({ orderIndex: 1, _id: 1 });

  // 6. Gom nhóm item vào từng cột
  const columns = boardStatuses.map((status) => ({
    status,
    cards: items.filter((item) => item.status === status),
  }));

  return {
    sprint: activeSprint,
    columns,
  };
};
