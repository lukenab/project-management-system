import { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AuthSession from "../src/models/authsession.ts";
import User from "../src/models/user.ts";
import { hashPassword, login, verifyPassword } from "../src/services/auth.ts";
import { toProfile } from "../src/services/auth.ts";
import { changePassword, updateProfile } from "../src/services/profile.ts";

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
  Object.entries(filter).every(([key, cond]) =>
    cond && typeof cond === "object" && "$ne" in cond
      ? !same(doc[key], cond.$ne)
      : same(doc[key], cond),
  );
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
    found.updatedAt = new Date(Date.now() + 1000);
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
}

const PASSWORD = "correct horse battery";
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

/** Tạo một phiên cho tài khoản và trả về id của nó */
async function addSession(user: Doc) {
  const session = await (AuthSession as any).create({
    userId: user._id,
    expiresAt: new Date(Date.now() + 1000 * 60),
  });
  return String(session._id);
}

function reset() {
  users = [];
  sessions = [];
}

async function runTests() {
  process.env.NODE_ENV = "test";
  process.env.SECRET = "test-secret";
  installFakes();

  // ============================================================================
  // SUITE 1: GET /api/me (toProfile)
  // ============================================================================
  log("\n--- SUITE 1: view profile ---");

  await check(
    "1.1: Profile có đúng 8 trường và không lộ passwordHash hay dữ liệu nội bộ",
    async () => {
      reset();
      const user: any = await addUser();
      const profile: any = toProfile(user);
      const text = JSON.stringify(profile);
      return (
        Object.keys(profile).sort().join(",") ===
          "createdAt,email,emailVerifiedAt,fullName,hasPassword,id,systemRole,updatedAt" &&
        profile.hasPassword === true &&
        !text.includes("passwordHash") &&
        !text.includes("failedLoginCount") &&
        !text.includes("lockedUntil")
      );
    },
  );

  await check("1.2: Tài khoản chỉ có Google -> hasPassword false", async () => {
    reset();
    const user: any = await addUser({ passwordHash: null });
    return toProfile(user).hasPassword === false;
  });

  // ============================================================================
  // SUITE 2: PATCH /api/me (updateProfile)
  // ============================================================================
  log("\n--- SUITE 2: update profile ---");

  await check("2.1: Đổi fullName, tên được cắt khoảng trắng", async () => {
    reset();
    const user: any = await addUser();
    const profile: any = await updateProfile(user, { fullName: "  Binh An  " });
    return profile.fullName === "Binh An" && users[0].fullName === "Binh An";
  });

  await check(
    "2.2: fullName rỗng, quá 100 ký tự, thiếu hoặc không phải chuỗi -> VALIDATION_FAILED kèm field, dữ liệu không đổi",
    async () => {
      reset();
      const user: any = await addUser();
      const bodies = [
        { fullName: "   " },
        { fullName: "x".repeat(101) },
        {},
        { fullName: 123 },
        null,
      ];
      for (const body of bodies) {
        const error = await catchError(() => updateProfile(user, body));
        if (error?.code !== "VALIDATION_FAILED" || error.field !== "fullName")
          return false;
      }
      return users[0].fullName === "An Binh";
    },
  );

  await check(
    "2.3: Các trường khác (email, vai trò, trạng thái) bị bỏ qua, không đổi được",
    async () => {
      reset();
      const user: any = await addUser();
      const profile: any = await updateProfile(user, {
        fullName: "New Name",
        email: "evil@example.com",
        systemRole: "SYSTEM_ADMINISTRATOR",
        status: "DELETED",
        passwordHash: "x",
      });
      return (
        profile.fullName === "New Name" &&
        profile.email === "a@example.com" &&
        profile.systemRole === "STAFF" &&
        users[0].email === "a@example.com" &&
        users[0].systemRole === "STAFF" &&
        users[0].status === "ACTIVE" &&
        users[0].passwordHash === passwordHash
      );
    },
  );

  // ============================================================================
  // SUITE 3: PUT /api/me/password (changePassword)
  // ============================================================================
  log("\n--- SUITE 3: change password ---");

  await check(
    "3.1: Đổi mật khẩu đúng: mật khẩu mới dùng được, mật khẩu cũ hết tác dụng",
    async () => {
      reset();
      const user: any = await addUser();
      const sid = await addSession(user);
      const result = await changePassword(user, sid, {
        currentPassword: PASSWORD,
        newPassword: "another long passphrase",
      });
      const hash = users[0].passwordHash;
      return (
        result === undefined &&
        (await verifyPassword("another long passphrase", hash)) &&
        !(await verifyPassword(PASSWORD, hash))
      );
    },
  );

  await check(
    "3.2: Mật khẩu hiện tại sai -> 400 VALIDATION_FAILED field currentPassword, không đổi gì",
    async () => {
      reset();
      const user: any = await addUser();
      const sid = await addSession(user);
      await addSession(user);
      const error = await catchError(() =>
        changePassword(user, sid, {
          currentPassword: "wrong-password",
          newPassword: "another long passphrase",
        }),
      );
      return (
        error?.code === "VALIDATION_FAILED" &&
        error.status === 400 &&
        error.field === "currentPassword" &&
        users[0].passwordHash === passwordHash &&
        sessions.length === 2
      );
    },
  );

  await check(
    "3.3: Mật khẩu mới ngoài 8-128 ký tự hoặc không phải chuỗi -> VALIDATION_FAILED field newPassword, không đổi gì",
    async () => {
      reset();
      const user: any = await addUser();
      const sid = await addSession(user);
      const bad = [
        "short",
        "x".repeat(7),
        "x".repeat(129),
        12345678,
        undefined,
      ];
      for (const newPassword of bad) {
        const error = await catchError(() =>
          changePassword(user, sid, { currentPassword: PASSWORD, newPassword }),
        );
        if (
          error?.code !== "VALIDATION_FAILED" ||
          error.field !== "newPassword"
        )
          return false;
      }
      return users[0].passwordHash === passwordHash;
    },
  );

  await check(
    "3.4: Thiếu currentPassword -> VALIDATION_FAILED field currentPassword",
    async () => {
      reset();
      const user: any = await addUser();
      const sid = await addSession(user);
      const error = await catchError(() =>
        changePassword(user, sid, { newPassword: "another long passphrase" }),
      );
      return (
        error?.code === "VALIDATION_FAILED" && error.field === "currentPassword"
      );
    },
  );

  await check("3.5: Tài khoản chỉ có Google -> 409 CONFLICT", async () => {
    reset();
    const user: any = await addUser({ passwordHash: null });
    const sid = await addSession(user);
    const error = await catchError(() =>
      changePassword(user, sid, {
        currentPassword: "whatever",
        newPassword: "another long passphrase",
      }),
    );
    return error?.code === "CONFLICT" && error.status === 409;
  });

  await check(
    "3.6: Giữ phiên hiện tại, hủy các phiên khác của chính tài khoản, không đụng phiên của người khác",
    async () => {
      reset();
      const user: any = await addUser();
      const other: any = await addUser({ email: "b@example.com" });
      const current = await addSession(user);
      await addSession(user);
      await addSession(user);
      const othersSession = await addSession(other);
      await changePassword(user, current, {
        currentPassword: PASSWORD,
        newPassword: "another long passphrase",
      });
      const ids = sessions.map((s) => String(s._id)).sort();
      return (
        sessions.length === 2 &&
        ids.includes(current) &&
        ids.includes(othersSession)
      );
    },
  );

  await check(
    "3.7: Sau khi đổi, đăng nhập được bằng mật khẩu mới và không còn bằng mật khẩu cũ",
    async () => {
      reset();
      const user: any = await addUser();
      const sid = await addSession(user);
      await changePassword(user, sid, {
        currentPassword: PASSWORD,
        newPassword: "another long passphrase",
      });
      const ok: any = await login({
        email: "a@example.com",
        password: "another long passphrase",
      });
      const old = await catchError(() =>
        login({ email: "a@example.com", password: PASSWORD }),
      );
      return (
        ok.user.email === "a@example.com" && old?.code === "INVALID_CREDENTIALS"
      );
    },
  );

  // -------------------------------------------------------------
  // SUMMARY & WRITE LOG FILE
  // -------------------------------------------------------------
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
  const logFilePath = path.join(logDir, "profile.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
