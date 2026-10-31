import ProjectModel from "../models/project.ts";
import MembershipModel from "../models/membership.ts";
import SprintModel from "../models/sprint.ts";
import WorkItemModel from "../models/workitem.ts";

const checkProjectMember = async (userId: string, projectId: string) => {
  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
  }).lean();

  return membership;
};

// Lấy dữ liệu Sprint Board
export const getSprintBoard = async (projectId: string, userId: string) => {
  // 1. Kiểm tra project có tồn tại?
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) {
    const error: any = new Error("Project not found");
    error.status = 404;
    throw error;
  }

  // 2. Kiểm tra User có phải là thành viên ACTIVE của project?
  const membership = await checkProjectMember(userId, projectId);
  if (!membership) {
    const error: any = new Error("You are not a member of this project");
    error.status = 403;
    throw error;
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
  const items = await WorkItemModel.find({
    projectId,
    sprintId: activeSprint._id,
    parentId: null,
    deletedAt: null,
  }).sort({ orderIndex: 1, _id: 1 });

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
