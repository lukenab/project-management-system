import type { ClientSession } from "mongoose";

import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import { AppError, createError } from "../utils/error.ts";

/** Kiểm tra Project tồn tại và không bị ARCHIVED */
export const validateActiveProject = async (
  projectId: string,
  session?: ClientSession,
) => {
  const project = await ProjectModel.findById(projectId, null, {
    session,
  }).lean();
  if (!project) throw createError(404, "Project not found");
  if (project.status === "ARCHIVED") {
    throw new AppError("PROJECT_ARCHIVED");
  }
  return project;
};

/** Kiểm tra user là thành viên ACTIVE của Project và trả về membership */
export const getActiveMembership = async (
  userId: string,
  projectId: string,
  session?: ClientSession,
) => {
  const membership = await MembershipModel.findOne(
    {
      userId,
      projectId,
      status: "ACTIVE",
    },
    null,
    { session },
  ).lean();
  if (!membership) {
    throw new AppError("NOT_PROJECT_MEMBER");
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
  session?: ClientSession,
) => {
  const project = await ProjectModel.findById(projectId, null, {
    session,
  }).lean();
  if (!project) throw createError(404, "Project not found");
  return getActiveMembership(userId, projectId, session);
};

/** Quyền ghi của PO: Project ACTIVE (404/409), thành viên ACTIVE (403) và là Product Owner (403) */
export const requireProductOwner = async (
  userId: string,
  projectId: string,
) => {
  await validateActiveProject(projectId);
  const membership = await getActiveMembership(userId, projectId);
  if (!isProductOwner(membership)) {
    throw new AppError("FORBIDDEN", {
      message: "Only the Product Owner can perform this action",
    });
  }
  return membership;
};
