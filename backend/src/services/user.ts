import type { ClientSession } from "mongoose";

import { isObjectIdOrHexString } from "mongoose";

import AuthSession from "../models/authsession.ts";
import ProjectMembership from "../models/membership.ts";
import Project from "../models/project.ts";
import UserModel, { type UserDocument } from "../models/user.ts";
import WorkItem from "../models/workitem.ts";
import { createError } from "../utils/error.ts";
import { recordSystemAuditEvent } from "./audit.ts";

interface GetUsersParams {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

const adminUserFields =
  "_id fullName email systemRole status emailVerifiedAt passwordHash deletedAt createdAt updatedAt";

type AdminUserRecord = Pick<
  UserDocument,
  | "_id"
  | "fullName"
  | "email"
  | "systemRole"
  | "status"
  | "emailVerifiedAt"
  | "passwordHash"
  | "deletedAt"
  | "createdAt"
  | "updatedAt"
>;

function toAdminUser(user: AdminUserRecord) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    systemRole: user.systemRole,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    hasPassword: Boolean(user.passwordHash),
    suspendedAt: null,
    deletedAt: user.deletedAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Lấy danh sách users có phân trang, tìm kiếm, lọc */
export const getUsers = async (params: GetUsersParams) => {
  const { search, role, status, page = 1, limit = 10 } = params;
  const filter: Record<string, any> = {};

  if (role) filter.systemRole = role;
  if (status) filter.status = status;
  if (search) {
    const keyword = search.replace(/[.*+?^{}$()|[\]\\]/g, "\\$&");
    filter.$or = [
      { fullName: { $regex: keyword, $options: "i" } },
      { email: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    UserModel.find(filter, adminUserFields)
      .sort({
        createdAt: -1,
        _id: 1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);
  return {
    users: users.map(toAdminUser),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/** Lấy chi tiết thông tin người dùng */
export const getUserDetail = async (userId: string) => {
  const user = await UserModel.findById(userId, adminUserFields).lean();
  if (!user) {
    throw createError(404, "User not found");
  }
  return toAdminUser(user);
};

async function requireAccountRemovalAllowed(
  user: UserDocument,
  action: "suspend" | "delete",
  session?: ClientSession,
) {
  if (user.status === "ACTIVE" && user.systemRole === "SYSTEM_ADMINISTRATOR") {
    const count = await UserModel.countDocuments(
      { systemRole: "SYSTEM_ADMINISTRATOR", status: "ACTIVE" },
      { session },
    );
    if (count <= 1)
      throw createError(409, `Cannot ${action} the last active administrator`);
  }

  const memberships = await ProjectMembership.find(
    { userId: user._id, accessRole: "OWNER", status: "ACTIVE" },
    "projectId",
    { session },
  )
    .select("projectId")
    .lean();

  if (
    memberships.length &&
    (await Project.countDocuments(
      {
        _id: { $in: memberships.map(({ projectId }) => projectId) },
        status: "ACTIVE",
      },
      { session },
    ))
  )
    throw createError(409, `Cannot ${action} the owner of an active project`);
}

/** Đình chỉ tài khoản người dùng đang ACTIVE */
export const suspendUser = async (
  userId: string,
  adminId: string,
  reason: string,
  session?: ClientSession,
) => {
  if (userId === adminId) {
    throw createError(409, "You cannot suspend your own account");
  }

  const user = await UserModel.findById(userId, null, { session });
  if (!user) {
    throw createError(404, "User not found");
  }

  if (user.status !== "ACTIVE") {
    throw createError(409, `Cannot suspend account with status ${user.status}`);
  }

  await requireAccountRemovalAllowed(user, "suspend", session);

  user.status = "SUSPENDED";
  await user.save({ session });
  await AuthSession.deleteMany({ userId: user._id }, { session });
  await recordSystemAuditEvent(
    {
      actorId: adminId,
      action: "USER_SUSPENDED",
      targetType: "USER_ACCOUNT",
      targetId: user._id,
      reason,
    },
    session,
  );

  return toAdminUser(user);
};

/** Kích hoạt lại tài khoản đang SUSPENDED */
export const reactivateUser = async (
  userId: string,
  adminId: string,
  session?: ClientSession,
) => {
  const user = await UserModel.findById(userId, null, { session });
  if (!user) {
    throw createError(404, "User not found");
  }

  if (user.status === "DELETED") {
    throw createError(409, "Deleted accounts cannot reactivate");
  }

  if (user.status !== "SUSPENDED") {
    throw createError(
      409,
      `Cannot reactivate account with status ${user.status}`,
    );
  }

  user.status = "ACTIVE";
  await user.save({ session });
  await recordSystemAuditEvent(
    {
      actorId: adminId,
      action: "USER_REACTIVATED",
      targetType: "USER_ACCOUNT",
      targetId: user._id,
    },
    session,
  );

  return toAdminUser(user);
};

export async function deleteUser(
  userId: string,
  adminId: string,
  reason: string,
  session: ClientSession,
) {
  if (userId === adminId)
    throw createError(409, "You cannot delete your own account");
  const user = await UserModel.findById(userId, null, { session });
  if (!user) throw createError(404, "User not found");
  if (user.status === "DELETED")
    throw createError(409, "Account is already deleted");
  await requireAccountRemovalAllowed(user, "delete", session);

  const memberships = await ProjectMembership.find({ userId }, "_id", {
    session,
  }).lean();
  const now = new Date();
  user.set({ status: "DELETED", deletedAt: now });
  await user.save({ session });
  await AuthSession.deleteMany({ userId }, { session });
  await WorkItem.updateMany(
    {
      assigneeId: { $in: memberships.map(({ _id }) => _id) },
      deletedAt: null,
      status: { $in: ["TODO", "IN_PROGRESS"] },
    },
    { $set: { assigneeId: null } },
    { session },
  );
  await recordSystemAuditEvent(
    {
      actorId: adminId,
      action: "USER_DELETED",
      targetType: "USER_ACCOUNT",
      targetId: user._id,
      reason,
    },
    session,
  );
}

export function accountTransaction<T>(
  userId: string,
  adminId: string,
  write: (session: ClientSession) => Promise<T>,
) {
  if (!isObjectIdOrHexString(userId)) throw createError(400, "Invalid user ID");
  return UserModel.db.transaction(async (session) => {
    // Serialize actions by the same administrator and conflict with changes to their account.
    const actor = await UserModel.updateOne(
      { _id: adminId, systemRole: "SYSTEM_ADMINISTRATOR", status: "ACTIVE" },
      { $inc: { __v: 1 } },
      { session, timestamps: false },
    );
    if (!actor.matchedCount)
      throw createError(403, "Active administrator required");
    return write(session);
  });
}

export default {
  getUsers,
  getUserDetail,
  suspendUser,
  reactivateUser,
};
