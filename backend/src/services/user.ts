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

/** Cập nhật trạng thái user */
export const updateUserStatus = async (
  userId: string,
  status: "ACTIVE" | "SUSPENDED" | "DELETED",
  currentAdminId: string,
) => {
  if (userId === currentAdminId) {
    throw createError(400, "You cannot change your own account status");
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { status, ...(status === "DELETED" ? { deletedAt: new Date() } : {}) },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw createError(404, "User not found");
  }

  return user;
};

export default {
  getUsers,
  getUserDetail,
  updateUserStatus,
};
