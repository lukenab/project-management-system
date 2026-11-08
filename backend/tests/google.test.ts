import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AuthSession from "../src/models/authsession.ts";
import User from "../src/models/user.ts";
import { authenticate, login } from "../src/services/auth.ts";
import {
  googleConfirm,
  googleSignIn,
  setGoogleVerifier,
  type GoogleIdentity,
} from "../src/services/googleAuth.ts";
import { toErrorResponse } from "../src/utils/error.ts";

// Log collector
const logs: string[] = [];
function log(msg: string = "") {
  console.log(msg);
  logs.push(msg);
}

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    log(`  [PASS] ${testName}`);
  } else {
    failedCount++;
    log(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function check(name: string, run: () => Promise<boolean>) {
  try {
    assert(await run(), name);
  } catch (e: any) {
    assert(false, name, e.message);
  }
}

async function catchError(run: () => unknown): Promise<any> {
  try {
    await run();
    return null;
  } catch (e: any) {
    return e;
  }
}

// ---------------------------------------------------------------------------
// Kho giả trong bộ nhớ cho User và AuthSession
// ---------------------------------------------------------------------------
type Doc = Record<string, any>;
let users: Doc[] = [];
let sessions: Doc[] = [];

const same = (a: any, b: any) => String(a) === String(b);
const matches = (doc: Doc, filter: Doc) =>
  Object.entries(filter).every(([key, value]) => same(doc[key], value));
const copy = (d: Doc) => ({ ...d, id: String(d._id) });

function installFakes() {
  const U = User as any;
  U.findOne = async (filter: Doc) => {
    const found = users.find((d) => matches(d, filter));
    return found ? copy(found) : null;
  };
  U.exists = async (filter: Doc) =>
    users.some((d) => matches(d, filter)) ? { _id: "x" } : null;
  U.create = async (data: Doc) => {
    if (
      users.some(
        (d) =>
          d.email === data.email ||
          (data.googleSubject && d.googleSubject === data.googleSubject),
      )
    ) {
      throw Object.assign(new Error("E11000 duplicate key error"), {
        name: "MongoServerError",
        code: 11000,
      });
    }
    const _id = new Types.ObjectId();
    const now = new Date();
    const doc = {
      _id,
      id: String(_id),
      systemRole: "STAFF",
      status: "ACTIVE",
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    users.push(doc);
    return doc;
  };

  const S = AuthSession as any;
  S.create = async (data: Doc) => {
    const doc = { _id: new Types.ObjectId(), ...data };
    sessions.push(doc);
    return copy(doc);
  };
}

function reset() {
  users = [];
  sessions = [];
}

const MINUTE = 60 * 1000;

let identity: GoogleIdentity = {
  sub: "google-sub-1",
  email: "g@example.com",
  emailVerified: true,
  name: "Gia Google",
};
const asIdentity = (overrides: Partial<GoogleIdentity> = {}) => {
  identity = {
    sub: "google-sub-1",
    email: "g@example.com",
    emailVerified: true,
    name: "Gia Google",
    ...overrides,
  };
};

const SECRET = "test-secret";
const claimsOf = (token: string): any => jwt.verify(token, SECRET);
const codeOf = (error: any) => toErrorResponse(error).body.code;

async function runTests() {
  process.env.NODE_ENV = "test";
  process.env.SECRET = SECRET;
  installFakes();
  setGoogleVerifier(async () => identity);

  // ============================================================================
  // SUITE 1: Đăng nhập bằng Google
  // ============================================================================
  log("\n--- SUITE 1: googleSignIn ---");

  await check(
    "1.1: Tài khoản đã gắn với sub -> AUTHENTICATED, phiên mới, JWT có id và sid, Profile hasPassword false",
    async () => {
      reset();
      asIdentity();
      const { sub } = identity;
      const existing = await (User as any).create({
        email: "g@example.com",
        googleSubject: sub,
        fullName: "Gia Google",
        passwordHash: null,
      });
      const result: any = await googleSignIn({ credential: "any" });
      const payload = claimsOf(result.accessToken);
      return (
        result.outcome === "AUTHENTICATED" &&
        payload.id === existing.id &&
        payload.sid === String(sessions[0]._id) &&
        sessions.length === 1 &&
        result.user.id === existing.id &&
        result.user.hasPassword === false &&
        !JSON.stringify(result).includes("googleSubject")
      );
    },
  );

  await check(
    "1.2: Người mới -> REGISTRATION_REQUIRED kèm token đăng ký 10 phút và profile; chưa tạo tài khoản hay phiên",
    async () => {
      reset();
      asIdentity();
      const result: any = await googleSignIn({ credential: "any" });
      const claims = claimsOf(result.registrationToken);
      const ttl = result.expiresAt.getTime() - Date.now();
      return (
        result.outcome === "REGISTRATION_REQUIRED" &&
        claims.purpose === "google-registration" &&
        claims.sub === "google-sub-1" &&
        claims.email === "g@example.com" &&
        claims.fullName === "Gia Google" &&
        claims.exp - claims.iat === 600 &&
        ttl > 9 * MINUTE &&
        ttl <= 10 * MINUTE &&
        result.profile.fullName === "Gia Google" &&
        result.profile.email === "g@example.com" &&
        !("accessToken" in result) &&
        users.length === 0 &&
        sessions.length === 0
      );
    },
  );

  await check(
    "1.3: Email đã có tài khoản chưa gắn Google -> 409 CONFLICT field email, không tự liên kết",
    async () => {
      reset();
      asIdentity({ email: "Taken@Example.com" });
      const existing = await (User as any).create({
        email: "taken@example.com",
        passwordHash: "hash",
        fullName: "Has Password",
      });
      const error = await catchError(() => googleSignIn({ credential: "any" }));
      return (
        error?.code === "CONFLICT" &&
        error.status === 409 &&
        error.field === "email" &&
        existing.googleSubject === undefined &&
        users.length === 1 &&
        sessions.length === 0
      );
    },
  );

  await check(
    "1.4: Tài khoản đã gắn nhưng bị khóa hoặc đã xóa -> 403 FORBIDDEN, không tạo phiên",
    async () => {
      reset();
      asIdentity();
      await (User as any).create({
        email: "g@example.com",
        googleSubject: "google-sub-1",
        fullName: "G",
        status: "SUSPENDED",
      });
      const suspended = await catchError(() =>
        googleSignIn({ credential: "x" }),
      );
      users[0].status = "DELETED";
      const deleted = await catchError(() => googleSignIn({ credential: "x" }));
      return (
        suspended?.code === "FORBIDDEN" &&
        suspended.status === 403 &&
        deleted?.code === "FORBIDDEN" &&
        sessions.length === 0
      );
    },
  );

  await check(
    "1.5: Email Google chưa xác minh -> 401 INVALID_CREDENTIALS",
    async () => {
      reset();
      asIdentity({ emailVerified: false });
      const error = await catchError(() => googleSignIn({ credential: "x" }));
      return error?.code === "INVALID_CREDENTIALS" && error.status === 401;
    },
  );

  await check(
    "1.6: Credential thiếu hoặc không phải chuỗi -> VALIDATION_FAILED field credential",
    async () => {
      reset();
      const bodies = [{}, { credential: 5 }, null];
      for (const body of bodies) {
        const error = await catchError(() => googleSignIn(body));
        if (error?.code !== "VALIDATION_FAILED" || error.field !== "credential")
          return false;
      }
      return true;
    },
  );

  await check(
    "1.7: Token Google không hợp lệ (bộ kiểm tra ném lỗi) -> 401 INVALID_CREDENTIALS đi nguyên ra ngoài",
    async () => {
      reset();
      setGoogleVerifier(async () => {
        const { AppError } = await import("../src/utils/error.ts");
        throw new AppError("INVALID_CREDENTIALS", { message: "bad token" });
      });
      const error = await catchError(() => googleSignIn({ credential: "x" }));
      setGoogleVerifier(async () => identity);
      return error?.code === "INVALID_CREDENTIALS" && users.length === 0;
    },
  );

  await check(
    "1.8: Tên: cắt khoảng trắng và quá 100 ký tự bị cắt; thiếu tên thì lấy phần trước @ của email",
    async () => {
      reset();
      asIdentity({ name: "  " + "x".repeat(120) + "  " });
      const long: any = await googleSignIn({ credential: "x" });
      asIdentity({ name: null, email: "someone@example.com" });
      const noName: any = await googleSignIn({ credential: "x" });
      asIdentity({ name: "   ", email: "blank@example.com" });
      const blank: any = await googleSignIn({ credential: "x" });
      return (
        long.profile.fullName.length === 100 &&
        noName.profile.fullName === "someone" &&
        blank.profile.fullName === "blank"
      );
    },
  );

  await check(
    "1.9: Email được chuyển chữ thường trong profile và token",
    async () => {
      reset();
      asIdentity({ email: "Mixed@Example.COM" });
      const result: any = await googleSignIn({ credential: "x" });
      return (
        result.profile.email === "mixed@example.com" &&
        claimsOf(result.registrationToken).email === "mixed@example.com"
      );
    },
  );

  // ============================================================================
  // SUITE 2: Xác nhận tạo tài khoản
  // ============================================================================
  log("\n--- SUITE 2: googleConfirm ---");

  const newRegistrationToken = async () => {
    asIdentity();
    const result: any = await googleSignIn({ credential: "x" });
    return result.registrationToken as string;
  };

  await check(
    "2.1: Xác nhận -> tạo tài khoản không mật khẩu, đã xác minh email, trả phiên và Profile",
    async () => {
      reset();
      const registrationToken = await newRegistrationToken();
      const result: any = await googleConfirm({ registrationToken });
      const user = users[0];
      const payload = claimsOf(result.accessToken);
      return (
        users.length === 1 &&
        user.email === "g@example.com" &&
        user.googleSubject === "google-sub-1" &&
        user.fullName === "Gia Google" &&
        user.passwordHash === null &&
        user.emailVerifiedAt instanceof Date &&
        user.systemRole === "STAFF" &&
        payload.id === user.id &&
        payload.sid === String(sessions[0]._id) &&
        result.user.hasPassword === false &&
        result.user.email === "g@example.com" &&
        !JSON.stringify(result).includes("googleSubject")
      );
    },
  );

  await check(
    "2.2: Dùng lại token đã xác nhận -> 409 CONFLICT, không tạo thêm tài khoản",
    async () => {
      reset();
      const registrationToken = await newRegistrationToken();
      await googleConfirm({ registrationToken });
      const error = await catchError(() =>
        googleConfirm({ registrationToken }),
      );
      return (
        error?.code === "CONFLICT" && error.status === 409 && users.length === 1
      );
    },
  );

  await check(
    "2.3: Token hết hạn, ký sai khóa hoặc không phải JWT -> 400 INVALID_FLOW_TOKEN",
    async () => {
      reset();
      const claims = {
        purpose: "google-registration",
        sub: "s",
        email: "g@example.com",
        fullName: "G",
      };
      const expired = jwt.sign(claims, SECRET, { expiresIn: -10 });
      const forged = jwt.sign(claims, "other-secret");
      const bad = [expired, forged, "garbage"];
      for (const registrationToken of bad) {
        const error = await catchError(() =>
          googleConfirm({ registrationToken }),
        );
        if (error?.code !== "INVALID_FLOW_TOKEN" || error.status !== 400)
          return false;
      }
      return users.length === 0;
    },
  );

  await check(
    "2.4: Token đúng chữ ký nhưng không phải token đăng ký Google (ví dụ token truy cập) -> INVALID_FLOW_TOKEN",
    async () => {
      reset();
      const accessLike = jwt.sign({ id: "u", sid: "s" }, SECRET, {
        expiresIn: 60,
      });
      const missing = jwt.sign({ purpose: "google-registration" }, SECRET, {
        expiresIn: 60,
      });
      const a = await catchError(() =>
        googleConfirm({ registrationToken: accessLike }),
      );
      const b = await catchError(() =>
        googleConfirm({ registrationToken: missing }),
      );
      return (
        a?.code === "INVALID_FLOW_TOKEN" &&
        b?.code === "INVALID_FLOW_TOKEN" &&
        users.length === 0
      );
    },
  );

  await check(
    "2.5: Token đăng ký không dùng được như token truy cập",
    async () => {
      reset();
      const registrationToken = await newRegistrationToken();
      const error = await catchError(() => authenticate(registrationToken));
      return codeOf(error) === "INVALID_TOKEN";
    },
  );

  await check(
    "2.6: Thiếu registrationToken -> VALIDATION_FAILED field registrationToken",
    async () => {
      reset();
      const error = await catchError(() => googleConfirm({}));
      return (
        error?.code === "VALIDATION_FAILED" &&
        error.field === "registrationToken"
      );
    },
  );

  await check(
    "2.7: Email bị người khác đăng ký giữa hai bước -> 409 CONFLICT",
    async () => {
      reset();
      const registrationToken = await newRegistrationToken();
      await (User as any).create({
        email: "g@example.com",
        passwordHash: "hash",
        fullName: "Someone else",
      });
      const error = await catchError(() =>
        googleConfirm({ registrationToken }),
      );
      return error?.code === "CONFLICT" && users.length === 1;
    },
  );

  // ============================================================================
  // SUITE 3: Cả luồng và tính tương thích
  // ============================================================================
  log("\n--- SUITE 3: whole flow ---");

  await check(
    "3.1: Lần đầu: đăng nhập -> xác nhận; lần sau đăng nhập thẳng vào cùng tài khoản",
    async () => {
      reset();
      asIdentity();
      const first: any = await googleSignIn({ credential: "x" });
      const created: any = await googleConfirm({
        registrationToken: first.registrationToken,
      });
      const again: any = await googleSignIn({ credential: "x" });
      return (
        first.outcome === "REGISTRATION_REQUIRED" &&
        again.outcome === "AUTHENTICATED" &&
        again.user.id === created.user.id &&
        users.length === 1 &&
        sessions.length === 2
      );
    },
  );

  await check(
    "3.2: Tài khoản Google không có mật khẩu nên không đăng nhập bằng mật khẩu được",
    async () => {
      reset();
      asIdentity();
      const first: any = await googleSignIn({ credential: "x" });
      await googleConfirm({ registrationToken: first.registrationToken });
      const error = await catchError(() =>
        login({ email: "g@example.com", password: "any password 123" }),
      );
      return error?.code === "INVALID_CREDENTIALS";
    },
  );

  // ============================================================================
  // SUITE 4: Bộ kiểm tra thật với Google (không cần thông tin hợp lệ)
  // ============================================================================
  log("\n--- SUITE 4: default verifier ---");

  await check(
    "4.1: Thiếu GOOGLE_CLIENT_ID -> lỗi cấu hình thành 500, không lộ chi tiết",
    async () => {
      setGoogleVerifier(null);
      const saved = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;
      const error = await catchError(() => googleSignIn({ credential: "abc" }));
      if (saved !== undefined) process.env.GOOGLE_CLIENT_ID = saved;
      setGoogleVerifier(async () => identity);
      const response = toErrorResponse(error);
      return (
        response.status === 500 &&
        response.body.code === "INTERNAL_ERROR" &&
        !JSON.stringify(response.body).includes("GOOGLE")
      );
    },
  );

  await check(
    "4.2: Chuỗi không phải ID token của Google -> 401 INVALID_CREDENTIALS",
    async () => {
      setGoogleVerifier(null);
      const saved = process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
      const error = await catchError(() => googleSignIn({ credential: "abc" }));
      if (saved === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = saved;
      setGoogleVerifier(async () => identity);
      return error?.code === "INVALID_CREDENTIALS" && error.status === 401;
    },
  );

  // -------------------------------------------------------------
  // SUMMARY & WRITE LOG FILE
  // -------------------------------------------------------------
  setGoogleVerifier(null);
  log("\n===============================================================");
  log(`  TỔNG KẾT KẾT QUẢ TEST:`);
  log(`  Tổng số tests: ${passedCount + failedCount}`);
  log(`  Thành công (PASS): ${passedCount}`);
  log(`  Thất bại   (FAIL): ${failedCount}`);
  log("===============================================================");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const logDir = path.resolve(here, "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFilePath = path.join(logDir, "google.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
