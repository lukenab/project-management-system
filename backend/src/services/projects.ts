import { isObjectIdOrHexString } from "mongoose";

import type { UserDocument } from "../models/user.ts";

import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";
import SprintModel from "../models/sprint.ts";
import User from "../models/user.ts";
import { AppError } from "../utils/error.ts";
import { requireString } from "./auth.ts";

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

function requireId(id: string) {
  if (!isObjectIdOrHexString(id)) throw new AppError("INVALID_ID");
}

async function projectAccess(
  userId: string,
  projectId: string,
  ownerOnly = false,
) {
  requireId(projectId);
  const project = await ProjectModel.findById(projectId);
  if (!project)
    throw new AppError("NOT_FOUND", { message: "Project not found" });
  const mine = await MembershipModel.findOne({
    userId,
    projectId,
    status: "ACTIVE",
  }).lean();
  if (!mine) throw new AppError("NOT_PROJECT_MEMBER");
  if (ownerOnly) {
    if (mine.accessRole !== "OWNER") throw new AppError("FORBIDDEN");
    if (project.status === "ARCHIVED") throw new AppError("PROJECT_ARCHIVED");
  }
  return { project, mine };
}

const getProject = async (userId: string, projectId: string) => {
  const { project, mine } = await projectAccess(userId, projectId);
  const [members, sprint] = await Promise.all([
    MembershipModel.find({ projectId, status: "ACTIVE" }).lean(),
    SprintModel.findOne({ projectId, status: "ACTIVE", deletedAt: null }),
  ]);
  const owner = members.find((member) => member.accessRole === "OWNER");
  const accounts = await User.find({
    _id: { $in: members.map((member) => member.userId) },
    $or: [{ status: "ACTIVE" }, ...(owner ? [{ _id: owner.userId }] : [])],
  }).lean();
  const ownerAccount = accounts.find((account) =>
    account._id.equals(owner?.userId),
  );
  const activeAccounts = new Set(
    accounts
      .filter((account) => account.status === "ACTIVE")
      .map((account) => String(account._id)),
  );
  return {
    project: toResponse(project, owner, ownerAccount, mine),
    memberCount: members.filter((member) =>
      activeAccounts.has(String(member.userId)),
    ).length,
    currentSprint: sprint
      ? {
          id: sprint.id,
          name: sprint.name,
          status: sprint.status,
          startDate: sprint.startDate ?? null,
          endDate: sprint.endDate ?? null,
        }
      : null,
  };
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

function readUpdate(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("VALIDATION_FAILED");
  }
  const data = body as Record<string, unknown>;
  const keys = Object.keys(data);
  if (!keys.length) throw new AppError("VALIDATION_FAILED");
  const unknownField = keys.find(
    (key) => key !== "name" && key !== "description",
  );
  if (unknownField)
    throw new AppError("VALIDATION_FAILED", { field: unknownField });

  const changes: { name?: string; description?: string | null } = {};
  if ("name" in data) {
    changes.name = requireString(data.name, "name").trim();
    if (!changes.name)
      throw new AppError("VALIDATION_FAILED", {
        field: "name",
        message: "Project name must not be blank",
      });
  }
  if ("description" in data) {
    changes.description =
      data.description === null
        ? null
        : requireString(data.description, "description").trim() || null;
    if (
      changes.description &&
      changes.description.length > DESCRIPTION_MAX_LENGTH
    ) {
      throw new AppError("VALIDATION_FAILED", {
        field: "description",
        message: "Description must be at most 500 characters",
      });
    }
  }
  return changes;
}

const updateProject = async (
  user: UserDocument,
  projectId: string,
  body: unknown,
) => {
  const { mine } = await projectAccess(user.id, projectId, true);
  const changes = readUpdate(body);
  const project = await ProjectModel.findOneAndUpdate(
    { _id: projectId, status: "ACTIVE" },
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  );
  if (!project) throw new AppError("PROJECT_ARCHIVED");
  return toResponse(project, mine, user, mine);
};

const archiveProject = async (user: UserDocument, projectId: string) => {
  const { mine } = await projectAccess(user.id, projectId, true);
  if (
    await SprintModel.exists({ projectId, status: "ACTIVE", deletedAt: null })
  ) {
    throw new AppError("CONFLICT", {
      message: "Complete the active sprint before archiving this project.",
    });
  }
  const project = await ProjectModel.findOneAndUpdate(
    { _id: projectId, status: "ACTIVE" },
    { $set: { status: "ARCHIVED", archivedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!project) throw new AppError("PROJECT_ARCHIVED");
  return toResponse(project, mine, user, mine);
};

const transferOwnership = async (
  user: UserDocument,
  projectId: string,
  body: unknown,
) => {
  requireId(projectId);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("newOwnerId" in body)
  ) {
    throw new AppError("VALIDATION_FAILED", { field: "newOwnerId" });
  }
  const newOwnerId = requireString(body.newOwnerId, "newOwnerId");
  requireId(newOwnerId);

  return ProjectModel.db.transaction(async (session) => {
    const project = await ProjectModel.findOneAndUpdate(
      { _id: projectId, status: "ACTIVE" },
      { $currentDate: { updatedAt: true } },
      { session, returnDocument: "after", timestamps: false },
    );
    if (!project) {
      if (await ProjectModel.exists({ _id: projectId }).session(session)) {
        throw new AppError("PROJECT_ARCHIVED");
      }
      throw new AppError("NOT_FOUND", { message: "Project not found" });
    }
    const currentOwner = await MembershipModel.findOne({
      projectId,
      userId: user._id,
      status: "ACTIVE",
    })
      .session(session)
      .lean();
    if (!currentOwner) throw new AppError("NOT_PROJECT_MEMBER");
    if (currentOwner.accessRole !== "OWNER") throw new AppError("FORBIDDEN");

    const target = await MembershipModel.findOne({
      _id: newOwnerId,
      projectId,
      status: "ACTIVE",
      accessRole: "MEMBER",
    })
      .session(session)
      .lean();
    const targetAccount =
      target &&
      (await User.findOneAndUpdate(
        { _id: target.userId, status: "ACTIVE" },
        { $inc: { __v: 1 } },
        { session, timestamps: false },
      ).lean());
    if (!target || !targetAccount || target.userId.equals(user._id)) {
      throw new AppError("CONFLICT", {
        message: "Choose a different active project member.",
      });
    }

    const demoted = await MembershipModel.updateOne(
      { _id: currentOwner._id, status: "ACTIVE", accessRole: "OWNER" },
      { $set: { accessRole: "MEMBER" } },
      { session },
    );
    const promoted = await MembershipModel.updateOne(
      { _id: target._id, status: "ACTIVE", accessRole: "MEMBER" },
      { $set: { accessRole: "OWNER" } },
      { session },
    );
    if (demoted.modifiedCount !== 1 || promoted.modifiedCount !== 1) {
      throw new AppError("CONFLICT", {
        message: "Project ownership changed. Try again.",
      });
    }

    return toResponse(project, target, targetAccount, {
      ...currentOwner,
      accessRole: "MEMBER",
    });
  });
};

export default {
  getMyProjects,
  getProject,
  creatProject,
  updateProject,
  archiveProject,
  transferOwnership,
};
