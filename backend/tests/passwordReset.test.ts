import { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AuthSession from "../src/models/authsession.ts";
import PasswordResetToken from "../src/models/passwordresettoken.ts";
import User from "../src/models/user.ts";
import { hashPassword, login, sha256 } from "../src/services/auth.ts";
import { resetPasswordEmail, setMailer } from "../src/services/mail.ts";
import {
  requestPasswordReset,
  resetPassword,
} from "../src/services/passwordReset.ts";

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
// Kho giả trong bộ nhớ
// ---------------------------------------------------------------------------
type Doc = Record<string, any>;
let users: Doc[] = [];
let sessions: Doc[] = [];
let tokens: Doc[] = [];

const same = (a: any, b: any) => String(a) === String(b);
const matches = (doc: Doc, filter: Doc) =>
  Object.entries(filter).every(([key, value]) => same(doc[key], value));
const copy = (d: Doc) => ({ ...d, id: String(d._id) });

function applyUpdate(doc: Doc, update: Doc) {
  Object.assign(doc, update.$set ?? {});
  for (const [key, n] of Object.entries(update.$inc ?? {})) {
    doc[key] += n as number;
  }
}

function installFakes() {
  const U = User as any;
  U.findOne = async (filter: Doc) => {
    const found = users.find((d) => matches(d, filter));
    return found ? copy(found) : null;
  };
  U.findByIdAndUpdate = async (id: any, update: Doc) => {
    const found = users.find((d) => same(d._id, id));
    if (!found) return null;
    applyUpdate(found, update);
    return copy(found);
  };
  U.updateOne = async (filter: Doc, update: Doc) => {
    const found = users.find((d) => matches(d, filter));
    if (found) applyUpdate(found, update);
    return { modifiedCount: found ? 1 : 0 };
  };

  const S = AuthSession as any;
  S.create = async (data: Doc) => {
    const doc = { _id: new Types.ObjectId(), ...data };
    sessions.push(doc);
    return copy(doc);
  };
  S.deleteMany = async (filter: Doc) => {
    const before = sessions.length;
    sessions = sessions.filter((d) => !matches(d, filter));
    return { deletedCount: before - sessions.length };
  };

  const T = PasswordResetToken as any;
  T.create = async (data: Doc) => {
    const doc = { _id: new Types.ObjectId(), createdAt: new Date(), ...data };
    tokens.push(doc);
    return copy(doc);
  };
  T.findOne = async (filter: Doc) => {
    const found = tokens.find((d) => matches(d, filter));
    return found ? copy(found) : null;
  };
  T.deleteMany = async (filter: Doc) => {
    const before = tokens.length;
    tokens = tokens.filter((d) => !matches(d, filter));
    return { deletedCount: before - tokens.length };
  };
  T.findOneAndDelete = async (filter: Doc) => {
    const index = tokens.findIndex((d) => matches(d, filter));
    if (index < 0) return null;
    return tokens.splice(index, 1)[0];
  };
}

const MINUTE = 60 * 1000;
const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "another long passphrase";
let passwordHash: string | null = null;

async function addUser(overrides: Doc = {}) {
  passwordHash ??= await hashPassword(PASSWORD);
  const _id = new Types.ObjectId();
  const now = new Date();
  const doc = {
    _id,
    id: _id.toString(),
    email: "a@example.com",
    passwordHash,
    fullName: "An Binh",
    systemRole: "STAFF",
    status: "ACTIVE",
    emailVerifiedAt: now,
    googleSubject: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  users.push(doc);
  return doc;
}

const sent: { to: string; subject: string; text: string; html?: string }[] = [];
let failSend = false;
const lastToken = () =>
  /token=([0-9a-f-]{36})/.exec(sent[sent.length - 1].text)![1];

function reset() {
  users = [];
  sessions = [];
  tokens = [];
  sent.length = 0;
  failSend = false;
}

async function addSession(user: Doc) {
  const session = await (AuthSession as any).create({
    userId: user._id,
    expiresAt: new Date(Date.now() + MINUTE),
  });
  return String(session._id);
}

/** Yêu cầu link cho a@example.com và trả về token trong email */
async function requestToken(email = "a@example.com") {
  await requestPasswordReset({ email });
  return lastToken();
}

async function runTests() {
  process.env.NODE_ENV = "test";
  process.env.SECRET = "test-secret";
  process.env.APP_URL = "http://localhost:3000/";
  installFakes();
  setMailer({
    async send(message) {
      if (failSend) throw new Error("smtp down");
      sent.push(message);
    },
  });

  // ============================================================================
  // SUITE 1: Yêu cầu đặt lại mật khẩu
  // ============================================================================
  log("\n--- SUITE 1: requestPasswordReset ---");

  await check(
    "1.1: Tài khoản hợp lệ -> gửi một email có link, chỉ lưu bản băm của token, hạn 30 phút",
    async () => {
      reset();
      const user = await addUser();
      const result = await requestPasswordReset({ email: "a@example.com" });
      const token = lastToken();
      const stored = tokens[0];
      const ttl = stored.expiresAt.getTime() - Date.now();
      return (
        sent.length === 1 &&
        sent[0].to === "a@example.com" &&
        sent[0].text.includes(
          `http://localhost:3000/reset-password?token=${token}`,
        ) &&
        sent[0].html!.includes(`reset-password?token=${token}`) &&
        sent[0].text.includes("30 minutes") &&
        tokens.length === 1 &&
        same(stored.userId, user._id) &&
        stored.tokenDigest === sha256(token) &&
        !JSON.stringify(stored).includes(token) &&
        ttl > 29 * MINUTE &&
        ttl <= 30 * MINUTE &&
        typeof result.message === "string"
      );
    },
  );

  await check(
    "1.2: Email lạ và email có thật trả cùng một phản hồi; email lạ không gửi gì",
    async () => {
      reset();
      await addUser();
      const known = await requestPasswordReset({ email: "a@example.com" });
      const unknown = await requestPasswordReset({
        email: "nobody@example.com",
      });
      return (
        JSON.stringify(known) === JSON.stringify(unknown) &&
        sent.length === 1 &&
        tokens.length === 1
      );
    },
  );

  await check(
    "1.3: Tài khoản chỉ có Google, bị khóa hoặc đã xóa -> cùng phản hồi, không gửi, không tạo token",
    async () => {
      reset();
      await addUser({ email: "g@example.com", passwordHash: null });
      await addUser({ email: "s@example.com", status: "SUSPENDED" });
      await addUser({ email: "d@example.com", status: "DELETED" });
      const results = [];
      for (const email of ["g@example.com", "s@example.com", "d@example.com"]) {
        results.push(await requestPasswordReset({ email }));
      }
      return (
        results.every((r) => r.message === results[0].message) &&
        sent.length === 0 &&
        tokens.length === 0
      );
    },
  );

  await check(
    "1.4: Email sai định dạng, thiếu hoặc không phải chuỗi -> VALIDATION_FAILED field email",
    async () => {
      reset();
      const bodies = [{ email: "not-an-email" }, {}, { email: 5 }, null];
      for (const body of bodies) {
        const error = await catchError(() => requestPasswordReset(body));
        if (error?.code !== "VALIDATION_FAILED" || error.field !== "email")
          return false;
      }
      return sent.length === 0;
    },
  );

  await check("1.5: Email được trim và chuyển chữ thường", async () => {
    reset();
    await addUser();
    await requestPasswordReset({ email: "  A@Example.COM " });
    return sent.length === 1 && sent[0].to === "a@example.com";
  });

  await check(
    "1.6: Yêu cầu lại trong 60 giây không gửi thêm; sau 60 giây gửi link mới và link cũ hết tác dụng",
    async () => {
      reset();
      await addUser();
      const first = await requestToken();
      await requestPasswordReset({ email: "a@example.com" });
      const tooSoon = sent.length === 1 && tokens.length === 1;
      tokens[0].createdAt = new Date(Date.now() - 61 * 1000);
      const second = await requestToken();
      const oldLink = await catchError(() =>
        resetPassword({ token: first, newPassword: NEW_PASSWORD }),
      );
      return (
        tooSoon &&
        sent.length === 2 &&
        tokens.length === 1 &&
        first !== second &&
        oldLink?.code === "INVALID_FLOW_TOKEN"
      );
    },
  );

  await check(
    "1.7: Gửi email lỗi vẫn trả phản hồi chung, không ném lỗi",
    async () => {
      reset();
      await addUser();
      failSend = true;
      const result = await requestPasswordReset({ email: "a@example.com" });
      return typeof result.message === "string" && sent.length === 0;
    },
  );

  await check(
    "1.8: Email đặt lại mật khẩu có tiêu đề, text, html, link và hạn dùng",
    async () => {
      const mail = resetPasswordEmail(
        "http://x.test/reset-password?token=abc",
        30,
      );
      return (
        mail.subject.includes("Reset your") &&
        mail.text.includes("http://x.test/reset-password?token=abc") &&
        mail.text.includes("30 minutes") &&
        mail.html.includes('href="http://x.test/reset-password?token=abc"') &&
        mail.html.includes("30 minutes") &&
        !mail.html.includes("undefined")
      );
    },
  );

  // ============================================================================
  // SUITE 2: Đặt mật khẩu mới
  // ============================================================================
  log("\n--- SUITE 2: resetPassword ---");

  await check(
    "2.1: Đặt lại thành công: đăng nhập được bằng mật khẩu mới, mật khẩu cũ hết tác dụng, token bị dùng hết",
    async () => {
      reset();
      await addUser();
      const token = await requestToken();
      const result = await resetPassword({ token, newPassword: NEW_PASSWORD });
      const ok: any = await login({
        email: "a@example.com",
        password: NEW_PASSWORD,
      });
      const old = await catchError(() =>
        login({ email: "a@example.com", password: PASSWORD }),
      );
      return (
        result === undefined &&
        ok.user.email === "a@example.com" &&
        old?.code === "INVALID_CREDENTIALS" &&
        tokens.length === 0
      );
    },
  );

  await check("2.2: Dùng lại link -> 400 INVALID_FLOW_TOKEN", async () => {
    reset();
    await addUser();
    const token = await requestToken();
    await resetPassword({ token, newPassword: NEW_PASSWORD });
    const error = await catchError(() =>
      resetPassword({ token, newPassword: "yet another passphrase" }),
    );
    return error?.code === "INVALID_FLOW_TOKEN" && error.status === 400;
  });

  await check(
    "2.3: Token lạ hoặc hết hạn -> 400 INVALID_FLOW_TOKEN, mật khẩu không đổi",
    async () => {
      reset();
      const user = await addUser();
      const token = await requestToken();
      const unknown = await catchError(() =>
        resetPassword({ token: "nope", newPassword: NEW_PASSWORD }),
      );
      tokens[0].expiresAt = new Date(Date.now() - 1000);
      const expired = await catchError(() =>
        resetPassword({ token, newPassword: NEW_PASSWORD }),
      );
      return (
        unknown?.code === "INVALID_FLOW_TOKEN" &&
        expired?.code === "INVALID_FLOW_TOKEN" &&
        user.passwordHash === passwordHash
      );
    },
  );

  await check(
    "2.4: Mật khẩu mới ngoài 8-128 ký tự hoặc không phải chuỗi -> VALIDATION_FAILED field newPassword và KHÔNG làm mất token",
    async () => {
      reset();
      await addUser();
      const token = await requestToken();
      const bad = ["short", "x".repeat(129), 12345678, undefined];
      for (const newPassword of bad) {
        const error = await catchError(() =>
          resetPassword({ token, newPassword }),
        );
        if (
          error?.code !== "VALIDATION_FAILED" ||
          error.field !== "newPassword"
        )
          return false;
      }
      const stillValid = tokens.length === 1;
      await resetPassword({ token, newPassword: NEW_PASSWORD });
      return stillValid && tokens.length === 0;
    },
  );

  await check("2.5: Thiếu token -> VALIDATION_FAILED field token", async () => {
    reset();
    const error = await catchError(() =>
      resetPassword({ newPassword: NEW_PASSWORD }),
    );
    return error?.code === "VALIDATION_FAILED" && error.field === "token";
  });

  await check(
    "2.6: Hủy mọi phiên của tài khoản, không đụng phiên của người khác",
    async () => {
      reset();
      const user = await addUser();
      const other = await addUser({ email: "b@example.com" });
      await addSession(user);
      await addSession(user);
      const othersSession = await addSession(other);
      const token = await requestToken();
      await resetPassword({ token, newPassword: NEW_PASSWORD });
      return sessions.length === 1 && String(sessions[0]._id) === othersSession;
    },
  );

  await check(
    "2.7: Mở khóa đăng nhập: bộ đếm sai về 0, lockedUntil về null, đăng nhập được ngay",
    async () => {
      reset();
      const user = await addUser({
        failedLoginCount: 3,
        lockedUntil: new Date(Date.now() + 10 * MINUTE),
      });
      const token = await requestToken();
      await resetPassword({ token, newPassword: NEW_PASSWORD });
      const ok: any = await login({
        email: "a@example.com",
        password: NEW_PASSWORD,
      });
      return (
        user.failedLoginCount === 0 &&
        user.lockedUntil === null &&
        typeof ok.accessToken === "string"
      );
    },
  );

  // -------------------------------------------------------------
  // SUMMARY & WRITE LOG FILE
  // -------------------------------------------------------------
  setMailer(null);
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
  const logFilePath = path.join(logDir, "password-reset.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
