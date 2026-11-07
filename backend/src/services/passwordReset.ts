import { randomUUID } from "node:crypto";

import AuthSession from "../models/authsession.ts";
import PasswordResetToken from "../models/passwordresettoken.ts";
import User from "../models/user.ts";
import { AppError } from "../utils/error.ts";
import logger from "../utils/logger.ts";
import {
  checkPassword,
  hashPassword,
  normalizeEmail,
  requireString,
  sha256,
} from "./auth.ts";
import { resetPasswordEmail, sendMail } from "./mail.ts";

const EXPIRY_MINUTES = 30;
const COOLDOWN_MS = 60 * 1000;

const MESSAGE =
  "If the account is eligible, password reset instructions will be sent.";

// Địa chỉ của frontend, dùng để dựng link trong email
const appUrl = () =>
  (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/**
 * Gửi link đặt lại mật khẩu. Luôn trả cùng một thông báo cho email hợp lệ, dù tài khoản có tồn tại,
 * có đủ điều kiện hay không, để không ai dò được email nào đã đăng ký qua chức năng này.
 */
export const requestPasswordReset = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(requireString(data.email, "email"));

  const user = await User.findOne({ email });
  // Tài khoản chỉ có Google (chưa có mật khẩu), bị khóa hoặc đã xóa thì không gửi
  if (user && user.passwordHash && user.status === "ACTIVE") {
    const previous = await PasswordResetToken.findOne({ userId: user._id });
    // Vừa gửi link trong 60 giây thì bỏ qua, tránh bị dùng để gửi email dồn dập
    if (!previous || Date.now() - previous.createdAt.getTime() >= COOLDOWN_MS) {
      await PasswordResetToken.deleteMany({ userId: user._id });
      const token = randomUUID();
      await PasswordResetToken.create({
        userId: user._id,
        tokenDigest: sha256(token),
        expiresAt: new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000),
      });
      try {
        await sendMail({
          to: user.email,
          ...resetPasswordEmail(
            `${appUrl()}/reset-password?token=${token}`,
            EXPIRY_MINUTES,
          ),
        });
      } catch (error) {
        logger.error("failed to send password reset email:", error);
      }
    }
  }
  return { message: MESSAGE };
};

/**
 * Đặt mật khẩu mới bằng token trong email. Mật khẩu sai chính sách không làm mất token.
 * Thành công thì đăng xuất mọi thiết bị và mở khóa đăng nhập của tài khoản.
 */
export const resetPassword = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const token = requireString(data.token, "token");
  const newPassword = requireString(data.newPassword, "newPassword");
  checkPassword(newPassword, "newPassword");

  // Xóa token chính là dùng token: chỉ một yêu cầu lấy được nó
  const found = await PasswordResetToken.findOneAndDelete({
    tokenDigest: sha256(token),
  });
  if (!found || found.expiresAt <= new Date()) {
    throw new AppError("INVALID_FLOW_TOKEN", {
      message: "This reset link is invalid or has expired",
    });
  }

  await User.updateOne(
    { _id: found.userId },
    {
      $set: {
        passwordHash: await hashPassword(newPassword),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    },
  );
  await AuthSession.deleteMany({ userId: found.userId });
};
