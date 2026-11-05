import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import { createError } from "../utils/error.ts";

/** Kiểm tra Project tồn tại và không bị ARCHIVED */
export const validateActiveProject = async (projectId: string) => {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");
  if (project.status === "ARCHIVED") {
    throw createError(409, "Archived project does not allow modifications");
  }
  return project;
};

/** Kiểm tra user là thành viên ACTIVE của Project và trả về membership */
export const getActiveMembership = async (
  userId: string,
  projectId: string,
) => {
  const membership = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
  }).lean();
  if (!membership) {
    throw createError(403, "You are not an active member of this project");
  }
  return membership;
};

/** Product Owner: scrumRole PRODUCT_OWNER hoặc accessRole OWNER */
export const isProductOwner = (membership: {
  scrumRole?: string | null;
  accessRole?: string | null;
}) =>
  membership.scrumRole === "PRODUCT_OWNER" || membership.accessRole === "OWNER";

/** Quyền đọc: Project tồn tại (404) và user là thành viên ACTIVE (403) */
export const requireProjectMember = async (
  userId: string,
  projectId: string,
) => {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw createError(404, "Project not found");
  return getActiveMembership(userId, projectId);
};
