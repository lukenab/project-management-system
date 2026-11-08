import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { createHash, randomInt, randomUUID } from "node:crypto";

import type { UserDocument } from "../models/user.ts";
import type { UserPayload } from "../types/jwt.ts";

import AuthSession from "../models/authsession.ts";
import RegistrationRequest from "../models/registrationrequest.ts";
import User from "../models/user.ts";
import { AppError } from "../utils/error.ts";
import logger from "../utils/logger.ts";
import { sendMail, verificationEmail } from "./mail.ts";

// ---------------------------------------------------------------------------
// Kiểm tra dữ liệu vào
// ---------------------------------------------------------------------------

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const BCRYPT_COST = 10;
const FULL_NAME_MAX_LENGTH = 100;

/** Giá trị trong body phải là chuỗi, ngược lại 400 VALIDATION_FAILED kèm field */
export const requireString = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_FAILED", {
      message: `${field} is required and must be a string`,
      field,
    });
  }
  return value;
};

/** Tên hiển thị: cắt khoảng trắng, 1 đến 100 ký tự; trả về tên đã cắt */
export const parseFullName = (value: string) => {
  const fullName = value.trim();
  if (!fullName || fullName.length > FULL_NAME_MAX_LENGTH) {
    throw new AppError("VALIDATION_FAILED", {
      message: `Full name must be 1 to ${FULL_NAME_MAX_LENGTH} characters`,
      field: "fullName",
    });
  }
  return fullName;
};

/** Mật khẩu 8 đến 128 ký tự, không cắt khoảng trắng; field là tên trường báo lỗi */
export const checkPassword = (password: string, field = "password") => {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new AppError("VALIDATION_FAILED", {
      message: `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
      field,
    });
  }
};

const prehash = (password: string) =>
  createHash("sha256").update(password).digest("base64");

export const hashPassword = (password: string) =>
  bcrypt.hash(prehash(password), BCRYPT_COST);

export const verifyPassword = (password: string, hash: string) =>
  bcrypt.compare(prehash(password), hash);

// Mã xác minh và token chỉ được lưu dưới dạng băm
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Bản băm của mã xác minh, gắn với requestId để mã không dùng chéo giữa các lượt */
export const digestCode = (requestId: string, code: string) =>
  sha256(`${requestId}:${code}`);

const generateCode = () => String(randomInt(1_000_000)).padStart(6, "0");

// ---------------------------------------------------------------------------
// Đăng ký bằng email
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const EXPIRY_MS = 10 * MINUTE_MS; // hạn của mã xác minh và của token
const COOLDOWN_MS = MINUTE_MS; // thời gian chờ giữa hai lần gửi mã
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: string) => {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Email is not valid",
      field: "email",
    });
  }
  return email;
};

const checkCooldown = (lastSentAt: Date) => {
  const wait = Math.ceil(
    (lastSentAt.getTime() + COOLDOWN_MS - Date.now()) / 1000,
  );
  if (wait > 0) {
    throw new AppError("RATE_LIMITED", {
      message: `Please wait ${wait} seconds before requesting another code`,
    });
  }
};

const sendCode = async (email: string, code: string) => {
  try {
    await sendMail({
      to: email,
      ...verificationEmail(code, EXPIRY_MS / MINUTE_MS),
    });
  } catch (error) {
    logger.error("failed to send verification email:", error);
    throw new AppError("INTERNAL_ERROR", {
      message: "We could not send the verification email. Please try again.",
    });
  }
};

export const requestRegistration = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(requireString(data.email, "email"));

  if (await User.exists({ email })) {
    throw new AppError("EMAIL_ALREADY_REGISTERED");
  }

  const previous = await RegistrationRequest.findOne({ email });
  if (previous) checkCooldown(previous.lastSentAt);

  // Mỗi email chỉ giữ một lượt: lượt mới thay thế lượt cũ
  await RegistrationRequest.deleteMany({ email });
  const id = new Types.ObjectId();
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRY_MS);
  await RegistrationRequest.create({
    _id: id,
    email,
    codeDigest: digestCode(id.toString(), code),
    lastSentAt: now,
    expiresAt,
  });
  await sendCode(email, code);

  return { requestId: id.toString(), expiresAt };
};

export const verifyRegistration = async (requestId: string, body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const code = requireString(data.code, "code");
  if (!/^\d{6}$/.test(code)) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Code must be 6 digits",
      field: "code",
    });
  }

  const request = await RegistrationRequest.findByIdAndUpdate(
    requestId,
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!request || request.tokenDigest) throw new AppError("INVALID_FLOW_TOKEN");
  if (request.attempts > MAX_ATTEMPTS) {
    throw new AppError("RATE_LIMITED", {
      message: "Too many incorrect codes. Please start registration again",
    });
  }
  if (request.expiresAt <= new Date()) {
    throw new AppError("INVALID_VERIFICATION_CODE", {
      message: "The code has expired. Please request a new one",
    });
  }
  if (request.codeDigest !== digestCode(request.id, code)) {
    throw new AppError("INVALID_VERIFICATION_CODE");
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + EXPIRY_MS);
  await RegistrationRequest.updateOne(
    { _id: request._id },
    { $set: { tokenDigest: sha256(token), expiresAt } },
  );
  return { registrationToken: token, expiresAt };
};

/** Gửi lại mã mới; mã cũ mất hiệu lực, số lần nhập sai không được đặt lại */
export const resendRegistration = async (requestId: string) => {
  const request = await RegistrationRequest.findById(requestId);
  if (!request || request.tokenDigest) throw new AppError("INVALID_FLOW_TOKEN");
  if (request.attempts >= MAX_ATTEMPTS || request.resendCount >= MAX_RESENDS) {
    throw new AppError("RATE_LIMITED", {
      message: "Too many attempts. Please start registration again",
    });
  }
  checkCooldown(request.lastSentAt);

  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRY_MS);
  await RegistrationRequest.updateOne(
    { _id: request._id },
    {
      $set: {
        codeDigest: digestCode(request.id, code),
        lastSentAt: now,
        expiresAt,
      },
      $inc: { resendCount: 1 },
    },
  );
  await sendCode(request.email, code);

  return { requestId: request.id as string, expiresAt };
};

/** registrationToken để tạo tài khoản; không tạo phiên đăng nhập */
export const completeRegistration = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const registrationToken = requireString(
    data.registrationToken,
    "registrationToken",
  );
  const password = requireString(data.password, "password");

  // Kiểm tra trước khi dùng token để nhập sai không làm mất lượt đăng ký
  const fullName = parseFullName(requireString(data.fullName, "fullName"));
  checkPassword(password);

  // Xóa lượt đăng ký chính là dùng token: hai yêu cầu song song chỉ một yêu cầu lấy được bản ghi
  const request = await RegistrationRequest.findOneAndDelete({
    tokenDigest: sha256(registrationToken),
  });
  if (!request) throw new AppError("INVALID_FLOW_TOKEN");
  if (request.expiresAt <= new Date()) {
    throw new AppError("INVALID_FLOW_TOKEN", {
      message: "This registration has expired. Please start again",
    });
  }

  try {
    const user = await User.create({
      email: request.email,
      passwordHash: await hashPassword(password),
      fullName,
      emailVerifiedAt: new Date(),
    });

    return toProfile(user);
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError("EMAIL_ALREADY_REGISTERED");
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Đăng nhập, đăng xuất và xác thực
// ---------------------------------------------------------------------------

const SESSION_MS = 7 * 24 * 60 * MINUTE_MS; // hạn của phiên và của JWT
const MAX_LOGIN_FAILURES = 5;
const LOCK_MS = 15 * MINUTE_MS;

export const getSecret = () => {
  const secret = process.env.SECRET;
  if (!secret) throw new Error("SECRET is empty");
  return secret;
};

export const toProfile = (user: UserDocument) => ({
  id: user.id as string,
  fullName: user.fullName,
  email: user.email,
  emailVerifiedAt: user.emailVerifiedAt,
  systemRole: user.systemRole,
  hasPassword: Boolean(user.passwordHash),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/** Tạo một phiên đăng nhập mới và JWT của nó (dùng cho đăng nhập mật khẩu và Google) */
export const issueSession = async (user: UserDocument) => {
  const session = await AuthSession.create({
    userId: user._id,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  const accessToken = jwt.sign(
    { id: user.id, sid: session.id } satisfies UserPayload,
    getSecret(),
    { algorithm: "HS256", expiresIn: SESSION_MS / 1000 },
  );
  return { accessToken };
};

export const login = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(requireString(data.email, "email"));
  const password = requireString(data.password, "password");

  const user = await User.findOne({ email });
  if (!user || !user.passwordHash) {
    throw new AppError("INVALID_CREDENTIALS");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / MINUTE_MS,
    );
    throw new AppError("RATE_LIMITED", {
      message: `Too many failed attempts. Try again in ${minutes} minutes`,
    });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $inc: { failedLoginCount: 1 } },
      { returnDocument: "after" },
    );
    if (updated && updated.failedLoginCount >= MAX_LOGIN_FAILURES) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + LOCK_MS),
          },
        },
      );
    }
    throw new AppError("INVALID_CREDENTIALS");
  }

  if (user.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN", { message: "This account is not active" });
  }

  if (user.failedLoginCount || user.lockedUntil) {
    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginCount: 0, lockedUntil: null } },
    );
  }

  const { accessToken } = await issueSession(user);
  return { accessToken, user: toProfile(user) };
};

export const logout = async (sessionId: string) => {
  await AuthSession.deleteOne({ _id: sessionId });
};

export const authenticate = async (token: string) => {
  const payload = jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
  const { id, sid } = (
    typeof payload === "object" ? payload : {}
  ) as Partial<UserPayload>;
  if (typeof id !== "string" || typeof sid !== "string") {
    throw new AppError("INVALID_TOKEN");
  }

  const session = await AuthSession.findOne({ _id: sid, userId: id });
  if (!session) {
    throw new AppError("INVALID_TOKEN", { message: "Session has ended" });
  }

  const user = await User.findById(id);
  if (!user) {
    throw new AppError("UNAUTHENTICATED", { message: "User not found" });
  }
  if (user.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN", { message: "This account is not active" });
  }
  return { user, sessionId: session.id as string };
};
