import type { UserDocument } from "../models/user.ts";

import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import User from "../models/user.ts";
import { AppError } from "../utils/error.ts";
import { requireString } from "./auth.ts";

interface ProjectPayload {
  name: string;
  description: string | null;
}

const getAccessRole = async (userId: string, projectId: string) => {
  const membership = await MembershipModel.findOne({
    userId,
    projectId,
  }).lean();
  return membership?.accessRole;
};

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
const DESCRIPTION_MAX_LENGTH = 500;

type ProjectLike = {
  id: string;
  name: string;
  key: string;
  description?: string | null;
  status: string;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type MembershipLike = {
  _id: { toString(): string };
  accessRole: string;
  scrumRole?: string | null;
};

/** Project của hợp đồng API kèm chủ dự án và vai trò của người gọi (docs/api/projects.md) */
const toResponse = (
  project: ProjectLike,
  owner: MembershipLike | undefined,
  ownerAccount: { fullName: string; email: string } | undefined,
  mine: MembershipLike,
) => ({
  id: project.id,
  name: project.name,
  key: project.key,
  description: project.description ?? null,
  status: project.status,
  ownerId: owner ? owner._id.toString() : null,
  archivedAt: project.archivedAt ?? null,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  owner: ownerAccount
    ? { fullName: ownerAccount.fullName, email: ownerAccount.email }
    : null,
  myRole: {
    accessRole: mine.accessRole,
    scrumAccountability: mine.scrumRole ?? null,
  },
});

/** Các Project mà người dùng đang là thành viên, mới cập nhật nhất trước */
const getMyProjects = async (userId: string) => {
  const mine = await MembershipModel.find({ userId, status: "ACTIVE" }).lean();
  const projectIds = mine.map((membership) => membership.projectId);
  if (projectIds.length === 0) return [];

  const projects = await ProjectModel.find({ _id: { $in: projectIds } }).sort({
    updatedAt: -1,
    _id: 1,
  });
  const owners = await MembershipModel.find({
    projectId: { $in: projectIds },
    accessRole: "OWNER",
    status: "ACTIVE",
  }).lean();
  const accounts = await User.find({
    _id: { $in: owners.map((owner) => owner.userId) },
  }).lean();

  return projects.map((project) => {
    const owner = owners.find((o) => String(o.projectId) === project.id);
    const account = owner
      ? accounts.find((a) => String(a._id) === String(owner.userId))
      : undefined;
    const membership = mine.find((m) => String(m.projectId) === project.id);
    return toResponse(project, owner, account, membership as MembershipLike);
  });
};

const getProject = async (userId: string, projectId: string) => {
  const accessRole = await getAccessRole(userId, projectId);
  if (accessRole === null) {
    return null;
  }

  const project = await ProjectModel.findById({ projectId });
  return project;
};

/** Tạo Project và gán người tạo làm Owner đồng thời là Product Owner */
const creatProject = async (user: UserDocument, body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;

  const name = requireString(data.name, "name").trim();
  if (!name) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Project name must not be blank",
      field: "name",
    });
  }

  const key = requireString(data.key, "key");
  if (!KEY_PATTERN.test(key)) {
    throw new AppError("VALIDATION_FAILED", {
      message:
        "Key must be 2 to 10 uppercase letters or digits, starting with a letter",
      field: "key",
    });
  }

  let description: string | null = null;
  if (data.description !== undefined && data.description !== null) {
    description = requireString(data.description, "description").trim() || null;
    if (description && description.length > DESCRIPTION_MAX_LENGTH) {
      throw new AppError("VALIDATION_FAILED", {
        message: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
        field: "description",
      });
    }
  }

  let project;
  try {
    project = await ProjectModel.create({ name, key, description });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError("DUPLICATE_VALUE", {
        message: "This project key is already in use",
        field: "key",
      });
    }
    throw error;
  }

  try {
    const membership = await MembershipModel.create({
      userId: user._id,
      projectId: project._id,
      accessRole: "OWNER",
      scrumRole: "PRODUCT_OWNER",
      status: "ACTIVE",
      joinedAt: new Date(),
    });
    return toResponse(project, membership, user, membership);
  } catch (error) {
    // Không để lại dự án không có chủ
    await ProjectModel.deleteOne({ _id: project._id }).catch(() => undefined);
    throw error;
  }
};

const updateProject = async (
  userId: string,
  projectId: string,
  payload: ProjectPayload,
) => {
  const accessRole = await getAccessRole(userId, projectId);
  if (accessRole !== "OWNER") {
    return null;
  }

  const project = await ProjectModel.findByIdAndUpdate({ projectId }, payload, {
    returnDocument: "after",
  });
  return project;
};

const archiveProject = async (userId: string, projectId: string) => {
  const accessRole = await getAccessRole(userId, projectId);
  if (accessRole !== "OWNER") {
    return null;
  }

  //TODO: Check no ACTIVE Sprint

  const project = await ProjectModel.findByIdAndUpdate(
    { projectId },
    { status: "ARCHIVE" },
    { returnDocument: "after" },
  );
  return project;
};

export default {
  getMyProjects,
  getProject,
  creatProject,
  updateProject,
  archiveProject,
};
