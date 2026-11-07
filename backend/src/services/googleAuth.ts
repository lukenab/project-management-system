import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

import User from "../models/user.ts";
import { AppError } from "../utils/error.ts";
import {
  getSecret,
  issueSession,
  normalizeEmail,
  requireString,
  toProfile,
} from "./auth.ts";

const REGISTRATION_MINUTES = 10;
const FULL_NAME_MAX_LENGTH = 100;

/** Danh tính Google đã được kiểm tra: sub là định danh ổn định, email chỉ để hiển thị và tạo tài khoản */
export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};
export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity>;

let oauthClient: OAuth2Client | null = null;

// Kiểm tra ID token với Google: chữ ký, hạn dùng, nhà phát hành (iss) và audience (aud)
// phải là client ID của ứng dụng này
const verifyWithGoogle: GoogleVerifier = async (credential) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");

  let payload;
  try {
    oauthClient ??= new OAuth2Client();
    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError("INVALID_CREDENTIALS", {
      message: "Google sign-in failed. Please try again",
    });
  }
  if (!payload?.sub || !payload.email) {
    throw new AppError("INVALID_CREDENTIALS", {
      message: "Google sign-in failed. Please try again",
    });
  }
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
  };
};

let verifier: GoogleVerifier = verifyWithGoogle;

/** Thay cách kiểm tra token (dùng trong test); null để trở về kiểm tra thật với Google */
export const setGoogleVerifier = (replacement: GoogleVerifier | null) => {
  verifier = replacement ?? verifyWithGoogle;
};

/**
 * Đăng nhập bằng Google. Đã có tài khoản gắn với sub này thì tạo phiên; chưa có thì trả token đăng ký
 * để người dùng xác nhận. Không bao giờ tự gắn Google vào tài khoản có sẵn chỉ vì trùng email.
 */
export const googleSignIn = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const credential = requireString(data.credential, "credential");

  const identity = await verifier(credential);
  if (!identity.emailVerified) {
    throw new AppError("INVALID_CREDENTIALS", {
      message: "Your Google email address is not verified",
    });
  }

  const linked = await User.findOne({ googleSubject: identity.sub });
  if (linked) {
    if (linked.status !== "ACTIVE") {
      throw new AppError("FORBIDDEN", {
        message: "This account is not active",
      });
    }
    const { accessToken } = await issueSession(linked);
    return {
      outcome: "AUTHENTICATED" as const,
      accessToken,
      user: toProfile(linked),
    };
  }

  const email = normalizeEmail(identity.email);
  if (await User.exists({ email })) {
    throw new AppError("CONFLICT", {
      message:
        "An account with this email already exists. Sign in with your password instead",
      field: "email",
    });
  }

  const fullName = (identity.name?.trim() || email.split("@")[0]).slice(
    0,
    FULL_NAME_MAX_LENGTH,
  );
  const registrationToken = jwt.sign(
    { purpose: "google-registration", sub: identity.sub, email, fullName },
    getSecret(),
    { algorithm: "HS256", expiresIn: REGISTRATION_MINUTES * 60 },
  );
  return {
    outcome: "REGISTRATION_REQUIRED" as const,
    registrationToken,
    expiresAt: new Date(Date.now() + REGISTRATION_MINUTES * 60 * 1000),
    profile: { fullName, email },
  };
};

/** Người mới xác nhận: tạo tài khoản từ token đăng ký (không có mật khẩu) và trả phiên */
export const googleConfirm = async (body: unknown) => {
  const data = (body ?? {}) as Record<string, unknown>;
  const token = requireString(data.registrationToken, "registrationToken");

  const secret = getSecret();
  let claims: jwt.JwtPayload | string;
  try {
    claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    throw new AppError("INVALID_FLOW_TOKEN", {
      message:
        "This sign-up step has expired. Please sign in with Google again",
    });
  }
  // Token truy cập hay token loại khác không dùng được ở đây
  if (
    typeof claims !== "object" ||
    claims.purpose !== "google-registration" ||
    typeof claims.sub !== "string" ||
    typeof claims.email !== "string" ||
    typeof claims.fullName !== "string"
  ) {
    throw new AppError("INVALID_FLOW_TOKEN");
  }

  let user;
  try {
    user = await User.create({
      email: claims.email,
      googleSubject: claims.sub,
      fullName: claims.fullName,
      passwordHash: null,
      emailVerifiedAt: new Date(),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError("CONFLICT", {
        message: "This Google account or email is already registered",
        field: "email",
      });
    }
    throw error;
  }

  const { accessToken } = await issueSession(user);
  return { accessToken, user: toProfile(user) };
};
