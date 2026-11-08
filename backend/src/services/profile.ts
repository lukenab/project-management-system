import type { UserDocument } from "../models/user.ts";

import AuthSession from "../models/authsession.ts";
import User from "../models/user.ts";
import { AppError } from "../utils/error.ts";
import {
  checkPassword,
  hashPassword,
  parseFullName,
  requireString,
  toProfile,
  verifyPassword,
} from "./auth.ts";

/** Đổi tên hiển thị. Chỉ fullName được sửa; các trường khác trong body bị bỏ qua */
export const updateProfile = async (user: UserDocument, body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const fullName = parseFullName(requireString(data.fullName, "fullName"));

  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { fullName } },
    { returnDocument: "after" },
  );
  if (!updated) {
    throw new AppError("UNAUTHENTICATED", { message: "User not found" });
  }
  return toProfile(updated);
};

/** Đổi mật khẩu: giữ phiên hiện tại, hủy mọi phiên khác của tài khoản */
export const changePassword = async (
  user: UserDocument,
  sessionId: string,
  body: unknown,
) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const currentPassword = requireString(
    data.currentPassword,
    "currentPassword",
  );
  const newPassword = requireString(data.newPassword, "newPassword");
  checkPassword(newPassword, "newPassword");

  // Tài khoản chỉ đăng nhập bằng Google chưa có mật khẩu để đổi
  if (!user.passwordHash) {
    throw new AppError("CONFLICT", {
      message: "This account has no password to change",
    });
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Current password is incorrect",
      field: "currentPassword",
    });
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(newPassword) } },
  );
  await AuthSession.deleteMany({
    userId: user._id,
    _id: { $ne: sessionId },
  });
};
