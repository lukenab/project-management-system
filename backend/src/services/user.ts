import UserModel from "../models/user.ts";
import { createError } from "../utils/error.ts";

interface GetUsersParams {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/** Lấy danh sách users có phân trang, tìm kiếm, lọc */
export const getUsers = async (params: GetUsersParams) => {
  const { search, role, status, page = 1, limit = 10 } = params;
  const filter: Record<string, any> = {};

  if (role) filter.systemRole = role;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);
  return {
    users,
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
  const user = await UserModel.findById(userId).lean();
  if (!user) {
    throw createError(404, "User not found");
  }
  return user;
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
    createError(404, "User not found");
    return user;
  }
};

export default {
  getUsers,
  getUserDetail,
  updateUserStatus,
};
