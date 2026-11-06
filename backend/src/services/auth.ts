import bcrypt from "bcrypt";
import { Types } from "mongoose";
import { createHash, randomInt, randomUUID } from "node:crypto";

import RegistrationRequest from "../models/registrationrequest.ts";
import User from "../models/user.ts";
import { AppError } from "../utils/error.ts";
import logger from "../utils/logger.ts";

// ---------------------------------------------------------------------------
// Kiểm tra dữ liệu vào 
// ---------------------------------------------------------------------------

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const BCRYPT_COST = 10;
const FULL_NAME_MAX_LENGTH = 100;

/** Giá trị trong body phải là chuỗi, ngược lại 400 VALIDATION_FAILED kèm field */
const requireString = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_FAILED", {
      message: `${field} is required and must be a string`,
      field,
    });
  }
  return value;
};

// bcrypt chỉ dùng 72 byte đầu của chuỗi đưa vào. Băm SHA-256 trước (luôn 44 ký tự)
// để mọi ký tự của mật khẩu dài tới 128 ký tự đều có tác dụng.
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
// Gửi email
// ---------------------------------------------------------------------------

export type MailTransport = "console" | "resend";

/**
 * Cách gửi email (MAIL_TRANSPORT): console in nội dung ra log (chỉ để dev và test),
 * resend gửi email thật. Môi trường production phải đặt rõ để không in mã ra log.
 */
export const getMailTransport = (): MailTransport => {
  const value = process.env.MAIL_TRANSPORT;
  if (value === "console" || value === "resend") return value;
  if (value === undefined || value === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MAIL_TRANSPORT must be set in production");
    }
    return "console";
  }
  throw new Error(`MAIL_TRANSPORT must be console or resend, got "${value}"`);
};

export type MailMessage = { to: string; subject: string; text: string };

export type Mailer = { send(message: MailMessage): Promise<void> };

// Chỉ dùng cho dev và test: in cả nội dung (có mã xác minh) ra log
const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    logger.info(`[mail:console] to=${to} subject="${subject}"\n${text}`);
  },
};

const RESEND_URL = "https://api.resend.com/emails";

const resendMailer: Mailer = {
  async send({ to, subject, text }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) {
      throw new Error(
        "RESEND_API_KEY and MAIL_FROM must be set when MAIL_TRANSPORT=resend",
      );
    }
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `Resend rejected the email with status ${response.status}`,
      );
    }
  },
};

let override: Mailer | null = null;

/** Thay cách gửi (dùng trong test); null để trở về cấu hình MAIL_TRANSPORT */
export const setMailer = (mailer: Mailer | null) => {
  override = mailer;
};

export const sendMail = (message: MailMessage) =>
  (
    override ?? (getMailTransport() === "resend" ? resendMailer : consoleMailer)
  ).send(message);

// ---------------------------------------------------------------------------
// Đăng ký bằng email
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const EXPIRY_MS = 10 * MINUTE_MS; // hạn của mã xác minh và của token
const COOLDOWN_MS = MINUTE_MS; // thời gian chờ giữa hai lần gửi mã
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: string) => {
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
      subject: "Your verification code",
      text:
        `Your verification code is ${code}.\n` +
        `It expires in ${EXPIRY_MS / MINUTE_MS} minutes. ` +
        "If you did not request it, you can ignore this email.",
    });
  } catch (error) {
    logger.error("failed to send verification email:", error);
    throw new AppError("INTERNAL_ERROR", {
      message: "We could not send the verification email. Please try again.",
    });
  }
};

/** Bước 1: nhận email, gửi mã xác minh 6 chữ số */
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

/** Bước 2: kiểm tra mã, đúng thì cấp registrationToken dùng một lần */
export const verifyRegistration = async (requestId: string, body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const code = requireString(data.code, "code");
  if (!/^\d{6}$/.test(code)) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Code must be 6 digits",
      field: "code",
    });
  }

  // requestId sai định dạng: Mongoose ném CastError, errorHandler trả 400 INVALID_ID.
  // Tăng số lần thử trước rồi mới kiểm tra: một thao tác nguyên tử nên
  // các yêu cầu song song cũng không đoán được nhiều hơn số lần cho phép
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

/** Bước 3: dùng registrationToken để tạo tài khoản; không tạo phiên đăng nhập */
export const completeRegistration = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const registrationToken = requireString(
    data.registrationToken,
    "registrationToken",
  );
  const fullName = requireString(data.fullName, "fullName").trim();
  const password = requireString(data.password, "password");

  // Kiểm tra trước khi dùng token để nhập sai không làm mất lượt đăng ký
  if (!fullName || fullName.length > FULL_NAME_MAX_LENGTH) {
    throw new AppError("VALIDATION_FAILED", {
      message: `Full name must be 1 to ${FULL_NAME_MAX_LENGTH} characters`,
      field: "fullName",
    });
  }
  const passwordLength = [...password].length;
  if (
    passwordLength < PASSWORD_MIN_LENGTH ||
    passwordLength > PASSWORD_MAX_LENGTH
  ) {
    throw new AppError("VALIDATION_FAILED", {
      message: `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
      field: "password",
    });
  }

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

    return {
      id: user.id as string,
      fullName: user.fullName,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      systemRole: user.systemRole,
      hasPassword: true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError("EMAIL_ALREADY_REGISTERED");
    throw error;
  }
};
