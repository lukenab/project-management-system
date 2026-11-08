import AuthSession from "../models/authsession.ts";
import ProjectMembership from "../models/membership.ts";
import Project from "../models/project.ts";
import UserModel, { type UserDocument } from "../models/user.ts";
import { createError } from "../utils/error.ts";

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

/** Đình chỉ tài khoản người dùng đang ACTIVE */
export const suspendUser = async (
  userId: string,
  adminId: string,
  _reason: string,
) => {
  if (userId === adminId) {
    throw createError(409, "You cannot suspend your own account");
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw createError(404, "User not found");
  }

  if (user.status !== "ACTIVE") {
    throw createError(409, `Cannot suspend account with status ${user.status}`);
  }

  // Chặn đình chỉ Admin cuối cùng đang ACTIVE
  if (user.systemRole === "SYSTEM_ADMINISTRATOR") {
    const activeAdminCount = await UserModel.countDocuments({
      systemRole: "SYSTEM_ADMINISTRATOR",
      status: "ACTIVE",
    });
    if (activeAdminCount <= 1) {
      throw createError(409, "Cannot suspend the last active administrator");
    }
  }

  // Chặn đình chỉ Owner của dự án đang ACTIVE
  const ownedMemberships = await ProjectMembership.find({
    userId: user._id,
    accessRole: "OWNER",
    status: "ACTIVE",
  })
    .select("projectId")
    .lean();

  if (ownedMemberships.length > 0) {
    const activeProjectCount = await Project.countDocuments({
      _id: { $in: ownedMemberships.map((m: any) => m.projectId) },
      status: "ACTIVE",
    });
    if (activeProjectCount > 0) {
      throw createError(409, "Cannot suspend the owner of an active project");
    }
  }

  user.status = "SUSPENDED";
  await user.save();

  // Thu hồi toàn bộ phiên đăng nhập của tài khoản bị đình chỉ
  await AuthSession.deleteMany({ userId: user._id });

  return toAdminUser(user);
};

/** Kích hoạt lại tài khoản đang SUSPENDED */
export const reactivateUser = async (userId: string, _adminId: string) => {
  const user = await UserModel.findById(userId);
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
  await user.save();

  return toAdminUser(user);
};

export default {
  getUsers,
  getUserDetail,
  suspendUser,
  reactivateUser,
};
