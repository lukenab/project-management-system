import { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import RegistrationRequest from "../src/models/registrationrequest.ts";
import User from "../src/models/user.ts";
import {
  completeRegistration,
  digestCode,
  getMailTransport,
  hashPassword,
  requestRegistration,
  resendRegistration,
  sendMail,
  setMailer,
  sha256,
  verifyPassword,
  verifyRegistration,
} from "../src/services/auth.ts";

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
// Kho giả trong bộ nhớ cho RegistrationRequest và User. Mỗi thao tác chạy đồng
// bộ trong một lượt nên có tính nguyên tử như findByIdAndUpdate thật.
// Thời gian được điều khiển bằng cách sửa trực tiếp bản ghi (lastSentAt, expiresAt).
// ---------------------------------------------------------------------------
type Doc = Record<string, any>;
let requests: Doc[] = [];
let users: Doc[] = [];
let failUserCreate: Error | null = null;

const same = (a: any, b: any) => String(a) === String(b);
const copy = (d: Doc) => ({ ...d, id: String(d._id) });
const matches = (doc: Doc, filter: Doc) =>
  Object.entries(filter).every(([key, value]) => same(doc[key], value));

function applyUpdate(doc: Doc, update: Doc) {
  Object.assign(doc, update.$set ?? {});
  for (const [key, n] of Object.entries(update.$inc ?? {})) {
    doc[key] += n as number;
  }
}

function installFakes() {
  const R = RegistrationRequest as any;
  R.create = async (data: Doc) => {
    const doc = { attempts: 0, resendCount: 0, tokenDigest: null, ...data };
    requests.push(doc);
    return copy(doc);
  };
  R.findOne = async (filter: Doc) => {
    const found = requests.find((d) => matches(d, filter));
    return found ? copy(found) : null;
  };
  R.findById = async (id: any) => {
    const found = requests.find((d) => same(d._id, id));
    return found ? copy(found) : null;
  };
  R.findByIdAndUpdate = async (id: any, update: Doc) => {
    const found = requests.find((d) => same(d._id, id));
    if (!found) return null;
    applyUpdate(found, update);
    return copy(found);
  };
  R.updateOne = async (filter: Doc, update: Doc) => {
    const found = requests.find((d) => matches(d, filter));
    if (found) applyUpdate(found, update);
    return { modifiedCount: found ? 1 : 0 };
  };
  R.deleteMany = async (filter: Doc) => {
    const before = requests.length;
    requests = requests.filter((d) => !matches(d, filter));
    return { deletedCount: before - requests.length };
  };
  R.findOneAndDelete = async (filter: Doc) => {
    const index = requests.findIndex((d) => matches(d, filter));
    if (index < 0) return null;
    return requests.splice(index, 1)[0];
  };

  const U = User as any;
  U.exists = async (filter: Doc) =>
    users.some((d) => matches(d, filter)) ? { _id: "x" } : null;
  U.create = async (data: Doc) => {
    if (failUserCreate) throw failUserCreate;
    if (users.some((d) => d.email === data.email)) {
      throw Object.assign(new Error("E11000 duplicate key error"), {
        name: "MongoServerError",
        code: 11000,
        keyValue: { email: data.email },
      });
    }
    const now = new Date();
    const doc = {
      id: new Types.ObjectId().toString(),
      systemRole: "STAFF",
      googleSubject: null,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    users.push(doc);
    return doc;
  };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const sent: { to: string; subject: string; text: string }[] = [];
let failSend = false;
const lastCode = () => /(\d{6})/.exec(sent[sent.length - 1].text)![1];
const wrongCode = (code: string) => (code === "000000" ? "000001" : "000000");

function reset() {
  requests = [];
  users = [];
  sent.length = 0;
  failSend = false;
  failUserCreate = null;
}

const record = (requestId: string) =>
  requests.find((d) => same(d._id, requestId))!;
/** Coi như đã qua thời gian chờ 60 giây kể từ lần gửi mã gần nhất */
const skipCooldown = (requestId: string) => {
  record(requestId).lastSentAt = new Date(Date.now() - 61 * SECOND);
};
/** Coi như mã (hoặc token) của lượt này đã hết hạn */
const expire = (requestId: string) => {
  record(requestId).expiresAt = new Date(Date.now() - SECOND);
};

/** Tạo một lượt đăng ký mới và trả về requestId cùng mã đã gửi */
async function start(email = "a@example.com") {
  const { requestId } = await requestRegistration({ email });
  return { requestId, code: lastCode() };
}

/** Đi hết bước verify, trả về token */
async function verified(email = "a@example.com") {
  const { requestId, code } = await start(email);
  const { registrationToken } = await verifyRegistration(requestId, { code });
  return { requestId, registrationToken };
}

const goodProfile = { fullName: "An Binh", password: "correct horse battery" };

/** Chạy một đoạn với biến môi trường tạm thời, rồi khôi phục */
async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T> | T,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function runTests() {
  process.env.NODE_ENV = "test";

  // ============================================================================
  // SUITE 1: Băm mật khẩu và mã xác minh
  // ============================================================================
  log("\n--- SUITE 1: hashing ---");

  await check(
    "1.1: Mật khẩu dài hơn 72 byte vẫn phân biệt theo phần đuôi",
    async () => {
      const base = "a".repeat(100);
      const hash = await hashPassword(`${base}1`);
      return (
        (await verifyPassword(`${base}1`, hash)) &&
        !(await verifyPassword(`${base}2`, hash))
      );
    },
  );

  await check(
    "1.2: Băm bcrypt, mỗi lần một salt khác, kiểm tra đúng/sai",
    async () => {
      const a = await hashPassword("correct horse");
      const b = await hashPassword("correct horse");
      return (
        a !== b &&
        /^\$2[aby]\$10\$/.test(a) &&
        !a.includes("correct horse") &&
        (await verifyPassword("correct horse", a)) &&
        !(await verifyPassword("Correct horse", a)) &&
        !(await verifyPassword("", a))
      );
    },
  );

  await check(
    "1.3: Mã xác minh gắn với requestId, token chỉ lưu SHA-256",
    async () => {
      return (
        digestCode("req1", "123456") === digestCode("req1", "123456") &&
        digestCode("req1", "123456") !== digestCode("req2", "123456") &&
        digestCode("req1", "123456") !== digestCode("req1", "123457") &&
        /^[0-9a-f]{64}$/.test(sha256("abc")) &&
        sha256("abc") ===
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
    },
  );

  // ============================================================================
  // SUITE 2: Mailer
  // ============================================================================
  log("\n--- SUITE 2: mailer ---");

  await check(
    "2.1: MAIL_TRANSPORT: mặc định console ngoài production, bắt buộc đặt ở production, giá trị lạ bị từ chối",
    async () => {
      const dev = await withEnv(
        { MAIL_TRANSPORT: undefined, NODE_ENV: "development" },
        () => getMailTransport(),
      );
      const test = await withEnv({ MAIL_TRANSPORT: "", NODE_ENV: "test" }, () =>
        getMailTransport(),
      );
      const prod = await catchError(() =>
        withEnv({ MAIL_TRANSPORT: undefined, NODE_ENV: "production" }, () =>
          getMailTransport(),
        ),
      );
      const prodResend = await withEnv(
        { MAIL_TRANSPORT: "resend", NODE_ENV: "production" },
        () => getMailTransport(),
      );
      const weird = await catchError(() =>
        withEnv({ MAIL_TRANSPORT: "smtp" }, () => getMailTransport()),
      );
      return (
        dev === "console" &&
        test === "console" &&
        prod instanceof Error &&
        prodResend === "resend" &&
        weird instanceof Error
      );
    },
  );

  await check("2.2: Transport console không gọi mạng", async () => {
    const realFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    try {
      await withEnv({ MAIL_TRANSPORT: "console" }, () =>
        sendMail({ to: "a@example.com", subject: "s", text: "t" }),
      );
      return !called;
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  await check(
    "2.3: Transport resend gọi API Resend đúng địa chỉ, header và nội dung",
    async () => {
      const realFetch = globalThis.fetch;
      let url = "";
      let init: any = null;
      globalThis.fetch = (async (u: any, i: any) => {
        url = String(u);
        init = i;
        return new Response(JSON.stringify({ id: "1" }), { status: 200 });
      }) as typeof fetch;
      try {
        await withEnv(
          {
            MAIL_TRANSPORT: "resend",
            RESEND_API_KEY: "re_secret",
            MAIL_FROM: "App <no-reply@example.com>",
          },
          () =>
            sendMail({
              to: "a@example.com",
              subject: "Hi",
              text: "Code 123456",
            }),
        );
        const body = JSON.parse(init.body);
        return (
          url === "https://api.resend.com/emails" &&
          init.method === "POST" &&
          init.headers.Authorization === "Bearer re_secret" &&
          init.headers["Content-Type"] === "application/json" &&
          body.from === "App <no-reply@example.com>" &&
          body.to.length === 1 &&
          body.to[0] === "a@example.com" &&
          body.subject === "Hi" &&
          body.text === "Code 123456" &&
          init.signal instanceof AbortSignal
        );
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  );

  await check(
    "2.4: Resend trả lỗi -> ném lỗi không chứa khóa API hay nội dung email",
    async () => {
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response("denied re_secret", { status: 403 })) as typeof fetch;
      try {
        const error = await catchError(() =>
          withEnv(
            {
              MAIL_TRANSPORT: "resend",
              RESEND_API_KEY: "re_secret",
              MAIL_FROM: "x@example.com",
            },
            () =>
              sendMail({
                to: "a@example.com",
                subject: "Hi",
                text: "Code 123456",
              }),
          ),
        );
        return (
          error instanceof Error &&
          error.message.includes("403") &&
          !error.message.includes("re_secret") &&
          !error.message.includes("123456")
        );
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  );

  await check(
    "2.5: Resend thiếu RESEND_API_KEY hoặc MAIL_FROM -> lỗi cấu hình, không gọi mạng",
    async () => {
      const realFetch = globalThis.fetch;
      let called = false;
      globalThis.fetch = (async () => {
        called = true;
        return new Response("{}");
      }) as typeof fetch;
      try {
        const noKey = await catchError(() =>
          withEnv(
            {
              MAIL_TRANSPORT: "resend",
              RESEND_API_KEY: undefined,
              MAIL_FROM: "x@example.com",
            },
            () => sendMail({ to: "a@example.com", subject: "s", text: "t" }),
          ),
        );
        const noFrom = await catchError(() =>
          withEnv(
            {
              MAIL_TRANSPORT: "resend",
              RESEND_API_KEY: "k",
              MAIL_FROM: undefined,
            },
            () => sendMail({ to: "a@example.com", subject: "s", text: "t" }),
          ),
        );
        return noKey instanceof Error && noFrom instanceof Error && !called;
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  );

  await check(
    "2.6: setMailer thay transport và null trả về cấu hình",
    async () => {
      const received: string[] = [];
      setMailer({
        async send(m) {
          received.push(m.to);
        },
      });
      await sendMail({ to: "x@example.com", subject: "s", text: "t" });
      setMailer(null);
      await withEnv({ MAIL_TRANSPORT: "console" }, () =>
        sendMail({ to: "y@example.com", subject: "s", text: "t" }),
      );
      return received.length === 1 && received[0] === "x@example.com";
    },
  );

  // ============================================================================
  // SUITE 3: Model
  // ============================================================================
  log("\n--- SUITE 3: models ---");

  await check(
    "3.1: User lưu ở user_accounts, mặc định đúng, toJSON ẩn passwordHash",
    async () => {
      const user = new User({
        email: " Student@Example.com ",
        fullName: "An",
        passwordHash: "$2b$04$x",
      });
      const json: any = user.toJSON();
      return (
        User.collection.name === "user_accounts" &&
        user.email === "student@example.com" &&
        user.systemRole === "STAFF" &&
        user.status === "ACTIVE" &&
        user.googleSubject === null &&
        !("passwordHash" in json) &&
        typeof json.id === "string" &&
        (await user.validate().then(() => true))
      );
    },
  );

  await check(
    "3.2: User yêu cầu email và fullName; role/status chỉ nhận giá trị hợp lệ",
    async () => {
      const noEmail = await new User({ fullName: "An" }).validate().then(
        () => null,
        (e) => e,
      );
      const noName = await new User({ email: "a@example.com" }).validate().then(
        () => null,
        (e) => e,
      );
      const badRole = await new User({
        email: "a@example.com",
        fullName: "An",
        systemRole: "ROOT",
      })
        .validate()
        .then(
          () => null,
          (e) => e,
        );
      const badStatus = await new User({
        email: "a@example.com",
        fullName: "An",
        status: "X",
      })
        .validate()
        .then(
          () => null,
          (e) => e,
        );
      return (
        !!noEmail?.errors.email &&
        !!noName?.errors.fullName &&
        !!badRole?.errors.systemRole &&
        !!badStatus?.errors.status
      );
    },
  );

  await check(
    "3.3: Chỉ mục: email duy nhất, googleSubject duy nhất một phần",
    async () => {
      const indexes = User.schema.indexes();
      const email = indexes.find(([fields]) => "email" in fields);
      const google = indexes.find(([fields]) => "googleSubject" in fields);
      return (
        email?.[1]?.unique === true &&
        google?.[1]?.unique === true &&
        JSON.stringify(google?.[1]?.partialFilterExpression) ===
          JSON.stringify({ googleSubject: { $type: "string" } })
      );
    },
  );

  await check(
    "3.4: RegistrationRequest: collection, mặc định, TTL 1 giờ sau hạn và chỉ mục token một phần",
    async () => {
      const doc = new RegistrationRequest({
        email: "a@example.com",
        codeDigest: "d",
        lastSentAt: new Date(),
        expiresAt: new Date(),
      });
      const indexes = RegistrationRequest.schema.indexes();
      const ttl = indexes.find(([fields]) => "expiresAt" in fields);
      const token = indexes.find(([fields]) => "tokenDigest" in fields);
      return (
        RegistrationRequest.collection.name === "registration_requests" &&
        doc.attempts === 0 &&
        doc.resendCount === 0 &&
        doc.tokenDigest === null &&
        ttl?.[1]?.expireAfterSeconds === 3600 &&
        JSON.stringify(token?.[1]?.partialFilterExpression) ===
          JSON.stringify({ tokenDigest: { $type: "string" } })
      );
    },
  );

  // ============================================================================
  // Đăng ký bằng email: dùng kho giả và mailer giả
  // ============================================================================
  installFakes();
  setMailer({
    async send(message) {
      if (failSend) throw new Error("smtp down");
      sent.push(message);
    },
  });

  // ============================================================================
  // SUITE 4: Yêu cầu đăng ký
  // ============================================================================
  log("\n--- SUITE 4: requestRegistration ---");

  await check(
    "4.1: Tạo lượt đăng ký, gửi mã 6 chữ số, chỉ lưu bản băm",
    async () => {
      reset();
      const result = await requestRegistration({ email: "a@example.com" });
      const code = lastCode();
      const stored = requests[0];
      const ttl = result.expiresAt.getTime() - Date.now();
      return (
        sent.length === 1 &&
        sent[0].to === "a@example.com" &&
        /^\d{6}$/.test(code) &&
        result.requestId === stored._id.toString() &&
        ttl > 9 * MINUTE &&
        ttl <= 10 * MINUTE &&
        stored.tokenDigest === null &&
        stored.codeDigest !== code &&
        !JSON.stringify(stored).includes(code) &&
        !JSON.stringify(result).includes(code)
      );
    },
  );

  await check("4.2: Email được trim và chuyển chữ thường", async () => {
    reset();
    await requestRegistration({ email: "  Student@Example.COM " });
    return (
      requests[0].email === "student@example.com" &&
      sent[0].to === "student@example.com"
    );
  });

  await check(
    "4.3: Email sai định dạng, thiếu hoặc sai kiểu -> VALIDATION_FAILED",
    async () => {
      reset();
      const bad = [
        { email: "not-an-email" },
        { email: "a@b" },
        { email: `${"x".repeat(250)}@example.com` },
        {},
        { email: 123 },
        null,
        [],
      ];
      for (const body of bad) {
        const error = await catchError(() => requestRegistration(body));
        if (error?.code !== "VALIDATION_FAILED") return false;
      }
      const field = await catchError(() =>
        requestRegistration({ email: "nope" }),
      );
      return (
        field.field === "email" && sent.length === 0 && requests.length === 0
      );
    },
  );

  await check(
    "4.4: Email đã có tài khoản -> 409 EMAIL_ALREADY_REGISTERED, không gửi mail",
    async () => {
      reset();
      users.push({ email: "a@example.com" });
      const error = await catchError(() =>
        requestRegistration({ email: "A@example.com" }),
      );
      return (
        error?.code === "EMAIL_ALREADY_REGISTERED" &&
        error.status === 409 &&
        sent.length === 0
      );
    },
  );

  await check(
    "4.5: Trong 60 giây chờ -> 429 RATE_LIMITED, không gửi thêm",
    async () => {
      reset();
      await start();
      const error = await catchError(() =>
        requestRegistration({ email: "a@example.com" }),
      );
      return (
        error?.code === "RATE_LIMITED" &&
        error.status === 429 &&
        /\d+ seconds/.test(error.message) &&
        sent.length === 1 &&
        requests.length === 1
      );
    },
  );

  await check(
    "4.6: Hết thời gian chờ -> lượt mới thay lượt cũ, lượt cũ không còn dùng được",
    async () => {
      reset();
      const first = await start();
      skipCooldown(first.requestId);
      const second = await start();
      const oldRequest = await catchError(() =>
        verifyRegistration(first.requestId, { code: first.code }),
      );
      return (
        requests.length === 1 &&
        first.requestId !== second.requestId &&
        oldRequest?.code === "INVALID_FLOW_TOKEN" &&
        sent.length === 2
      );
    },
  );

  await check("4.7: Thời gian chờ chỉ áp dụng theo từng email", async () => {
    reset();
    await start("a@example.com");
    await start("b@example.com");
    return sent.length === 2 && requests.length === 2;
  });

  await check(
    "4.8: Gửi mail lỗi -> 500 không lộ chi tiết; thử lại được sau thời gian chờ",
    async () => {
      reset();
      failSend = true;
      const error = await catchError(() =>
        requestRegistration({ email: "a@example.com" }),
      );
      failSend = false;
      const early = await catchError(() =>
        requestRegistration({ email: "a@example.com" }),
      );
      skipCooldown(requests[0]._id.toString());
      const retry = await requestRegistration({ email: "a@example.com" });
      return (
        error?.code === "INTERNAL_ERROR" &&
        error.status === 500 &&
        !error.message.includes("smtp") &&
        early?.code === "RATE_LIMITED" &&
        typeof retry.requestId === "string" &&
        sent.length === 1
      );
    },
  );

  // ============================================================================
  // SUITE 5: Xác minh mã
  // ============================================================================
  log("\n--- SUITE 5: verifyRegistration ---");

  await check(
    "5.1: Mã đúng -> trả registrationToken, chỉ lưu SHA-256 của token",
    async () => {
      reset();
      const { requestId, code } = await start();
      const result = await verifyRegistration(requestId, { code });
      const stored = requests[0];
      const ttl = result.expiresAt.getTime() - Date.now();
      return (
        typeof result.registrationToken === "string" &&
        /^[0-9a-f-]{36}$/.test(result.registrationToken) &&
        ttl > 9 * MINUTE &&
        ttl <= 10 * MINUTE &&
        stored.tokenDigest === sha256(result.registrationToken) &&
        !JSON.stringify(stored).includes(result.registrationToken)
      );
    },
  );

  await check(
    "5.2: Mã sai -> 400 INVALID_VERIFICATION_CODE và tính một lần thử",
    async () => {
      reset();
      const { requestId, code } = await start();
      const error = await catchError(() =>
        verifyRegistration(requestId, { code: wrongCode(code) }),
      );
      return (
        error?.code === "INVALID_VERIFICATION_CODE" &&
        error.status === 400 &&
        requests[0].attempts === 1 &&
        requests[0].tokenDigest === null
      );
    },
  );

  await check(
    "5.3: Sai 5 lần thì khóa, kể cả nhập đúng ở lần 6 -> 429 RATE_LIMITED",
    async () => {
      reset();
      const { requestId, code } = await start();
      for (let i = 0; i < 5; i++) {
        const error = await catchError(() =>
          verifyRegistration(requestId, { code: wrongCode(code) }),
        );
        if (error?.code !== "INVALID_VERIFICATION_CODE") return false;
      }
      const locked = await catchError(() =>
        verifyRegistration(requestId, { code }),
      );
      return (
        locked?.code === "RATE_LIMITED" &&
        locked.status === 429 &&
        requests[0].tokenDigest === null
      );
    },
  );

  await check(
    "5.4: Nhập song song 10 mã sai chỉ có đúng 5 lần được kiểm tra",
    async () => {
      reset();
      const { requestId, code } = await start();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          catchError(() =>
            verifyRegistration(requestId, { code: wrongCode(code) }),
          ),
        ),
      );
      const wrong = results.filter(
        (e) => e?.code === "INVALID_VERIFICATION_CODE",
      ).length;
      const limited = results.filter((e) => e?.code === "RATE_LIMITED").length;
      return wrong === 5 && limited === 5;
    },
  );

  await check(
    "5.5: Mã hết hạn -> 400 INVALID_VERIFICATION_CODE nói rõ đã hết hạn, kể cả mã đúng",
    async () => {
      reset();
      const { requestId, code } = await start();
      expire(requestId);
      const error = await catchError(() =>
        verifyRegistration(requestId, { code }),
      );
      return (
        error?.code === "INVALID_VERIFICATION_CODE" &&
        /expired/.test(error.message) &&
        requests[0].tokenDigest === null
      );
    },
  );

  await check(
    "5.6: requestId không tồn tại -> 400 INVALID_FLOW_TOKEN",
    async () => {
      reset();
      const unknown = await catchError(() =>
        verifyRegistration(new Types.ObjectId().toString(), { code: "123456" }),
      );
      return unknown?.code === "INVALID_FLOW_TOKEN" && unknown.status === 400;
    },
  );

  await check(
    "5.7: Mã sai định dạng hoặc body sai -> VALIDATION_FAILED, không tính lượt thử",
    async () => {
      reset();
      const { requestId } = await start();
      const bodies = [
        { code: "12345" },
        { code: "1234567" },
        { code: "12345a" },
        { code: 123456 },
        {},
      ];
      for (const body of bodies) {
        const error = await catchError(() =>
          verifyRegistration(requestId, body),
        );
        if (error?.code !== "VALIDATION_FAILED") return false;
      }
      return requests[0].attempts === 0;
    },
  );

  await check("5.8: Mã bắt đầu bằng số 0 được giữ nguyên", async () => {
    reset();
    const { requestId } = await start();
    requests[0].codeDigest = digestCode(requestId, "004217");
    const result = await verifyRegistration(requestId, { code: "004217" });
    return typeof result.registrationToken === "string";
  });

  await check("5.9: Lượt đã xác minh -> 400 INVALID_FLOW_TOKEN", async () => {
    reset();
    const { requestId, code } = await start();
    await verifyRegistration(requestId, { code });
    const again = await catchError(() =>
      verifyRegistration(requestId, { code }),
    );
    return again?.code === "INVALID_FLOW_TOKEN";
  });

  // ============================================================================
  // SUITE 6: Gửi lại mã
  // ============================================================================
  log("\n--- SUITE 6: resendRegistration ---");

  await check(
    "6.1: Gửi lại trong 60 giây -> 429 RATE_LIMITED, không gửi thêm",
    async () => {
      reset();
      const { requestId } = await start();
      const error = await catchError(() => resendRegistration(requestId));
      return (
        error?.code === "RATE_LIMITED" &&
        sent.length === 1 &&
        requests[0].resendCount === 0
      );
    },
  );

  await check(
    "6.2: Gửi lại sau thời gian chờ -> mã mới, mã cũ vô hiệu, số lần thử giữ nguyên",
    async () => {
      reset();
      const { requestId, code: oldCode } = await start();
      await catchError(() =>
        verifyRegistration(requestId, { code: wrongCode(oldCode) }),
      );
      skipCooldown(requestId);
      const result = await resendRegistration(requestId);
      const newCode = lastCode();
      const stale = await catchError(() =>
        verifyRegistration(requestId, { code: oldCode }),
      );
      const ok = await verifyRegistration(requestId, { code: newCode });
      return (
        sent.length === 2 &&
        result.requestId === requestId &&
        result.expiresAt.getTime() > Date.now() + 9 * MINUTE &&
        (newCode !== oldCode
          ? stale?.code === "INVALID_VERIFICATION_CODE"
          : true) &&
        requests[0].resendCount === 1 &&
        requests[0].attempts === 3 &&
        typeof ok.registrationToken === "string"
      );
    },
  );

  await check("6.3: Mã hết hạn vẫn gửi lại được", async () => {
    reset();
    const { requestId } = await start();
    expire(requestId);
    skipCooldown(requestId);
    await resendRegistration(requestId);
    const ok = await verifyRegistration(requestId, { code: lastCode() });
    return typeof ok.registrationToken === "string";
  });

  await check(
    "6.4: Tối đa 3 lần gửi lại, lần 4 -> 429 RATE_LIMITED",
    async () => {
      reset();
      const { requestId } = await start();
      for (let i = 0; i < 3; i++) {
        skipCooldown(requestId);
        await resendRegistration(requestId);
      }
      skipCooldown(requestId);
      const error = await catchError(() => resendRegistration(requestId));
      return error?.code === "RATE_LIMITED" && sent.length === 4;
    },
  );

  await check(
    "6.5: Hết lượt nhập sai thì không gửi lại được -> 429 RATE_LIMITED",
    async () => {
      reset();
      const { requestId, code } = await start();
      for (let i = 0; i < 5; i++)
        await catchError(() =>
          verifyRegistration(requestId, { code: wrongCode(code) }),
        );
      skipCooldown(requestId);
      const error = await catchError(() => resendRegistration(requestId));
      return error?.code === "RATE_LIMITED" && sent.length === 1;
    },
  );

  await check(
    "6.6: Lượt đã xác minh hoặc không tồn tại -> INVALID_FLOW_TOKEN",
    async () => {
      reset();
      const { requestId, code } = await start();
      await verifyRegistration(requestId, { code });
      skipCooldown(requestId);
      const verifiedError = await catchError(() =>
        resendRegistration(requestId),
      );
      const unknown = await catchError(() =>
        resendRegistration(new Types.ObjectId().toString()),
      );
      return (
        verifiedError?.code === "INVALID_FLOW_TOKEN" &&
        unknown?.code === "INVALID_FLOW_TOKEN"
      );
    },
  );

  await check(
    "6.7: Gửi mail lỗi khi gửi lại -> 500; sau thời gian chờ gửi lại được và mã mới dùng được",
    async () => {
      reset();
      const { requestId } = await start();
      skipCooldown(requestId);
      failSend = true;
      const error = await catchError(() => resendRegistration(requestId));
      failSend = false;
      skipCooldown(requestId);
      await resendRegistration(requestId);
      const ok = await verifyRegistration(requestId, { code: lastCode() });
      return (
        error?.code === "INTERNAL_ERROR" &&
        typeof ok.registrationToken === "string"
      );
    },
  );

  // ============================================================================
  // SUITE 7: Hoàn tất đăng ký
  // ============================================================================
  log("\n--- SUITE 7: completeRegistration ---");

  await check(
    "7.1: Tạo tài khoản, trả Profile, mật khẩu là bcrypt, xóa lượt đăng ký",
    async () => {
      reset();
      const { registrationToken } = await verified("Student@Example.com");
      const profile: any = await completeRegistration({
        registrationToken,
        ...goodProfile,
      });
      const user = users[0];
      return (
        Object.keys(profile).sort().join(",") ===
          "createdAt,email,emailVerifiedAt,fullName,hasPassword,id,systemRole,updatedAt" &&
        profile.email === "student@example.com" &&
        profile.fullName === "An Binh" &&
        profile.hasPassword === true &&
        profile.systemRole === "STAFF" &&
        profile.emailVerifiedAt instanceof Date &&
        user.passwordHash.startsWith("$2") &&
        user.passwordHash !== goodProfile.password &&
        (await verifyPassword(goodProfile.password, user.passwordHash)) &&
        !(await verifyPassword("another password", user.passwordHash)) &&
        requests.length === 0
      );
    },
  );

  await check("7.2: fullName được trim", async () => {
    reset();
    const { registrationToken } = await verified();
    const profile: any = await completeRegistration({
      registrationToken,
      fullName: "  An Binh  ",
      password: goodProfile.password,
    });
    return profile.fullName === "An Binh";
  });

  await check(
    "7.3: Dùng lại token -> 400 INVALID_FLOW_TOKEN, không tạo thêm tài khoản",
    async () => {
      reset();
      const { registrationToken } = await verified();
      await completeRegistration({ registrationToken, ...goodProfile });
      const error = await catchError(() =>
        completeRegistration({ registrationToken, ...goodProfile }),
      );
      return (
        error?.code === "INVALID_FLOW_TOKEN" &&
        !/expired/.test(error.message) &&
        users.length === 1
      );
    },
  );

  await check(
    "7.4: Token hết hạn -> 400 INVALID_FLOW_TOKEN nói rõ đã hết hạn",
    async () => {
      reset();
      const { requestId, registrationToken } = await verified();
      expire(requestId);
      const error = await catchError(() =>
        completeRegistration({ registrationToken, ...goodProfile }),
      );
      return (
        error?.code === "INVALID_FLOW_TOKEN" &&
        /expired/.test(error.message) &&
        users.length === 0
      );
    },
  );

  await check(
    "7.5: Token không tồn tại -> 400 INVALID_FLOW_TOKEN",
    async () => {
      reset();
      const error = await catchError(() =>
        completeRegistration({ registrationToken: "nope", ...goodProfile }),
      );
      return error?.code === "INVALID_FLOW_TOKEN" && error.status === 400;
    },
  );

  await check(
    "7.6: Token của lượt đã bị thay bằng lượt mới -> INVALID_FLOW_TOKEN",
    async () => {
      reset();
      const { requestId, registrationToken } = await verified("a@example.com");
      skipCooldown(requestId);
      await start("a@example.com");
      const error = await catchError(() =>
        completeRegistration({ registrationToken, ...goodProfile }),
      );
      return error?.code === "INVALID_FLOW_TOKEN" && users.length === 0;
    },
  );

  await check(
    "7.7: Dữ liệu sai -> VALIDATION_FAILED kèm field và KHÔNG tiêu thụ token",
    async () => {
      reset();
      const { registrationToken } = await verified();
      const cases: [any, string | undefined][] = [
        [
          {
            registrationToken,
            fullName: "   ",
            password: goodProfile.password,
          },
          "fullName",
        ],
        [
          {
            registrationToken,
            fullName: "x".repeat(101),
            password: goodProfile.password,
          },
          "fullName",
        ],
        [{ registrationToken, fullName: "An", password: "short" }, "password"],
        [
          { registrationToken, fullName: "An", password: "x".repeat(129) },
          "password",
        ],
        [{ registrationToken, fullName: "An" }, "password"],
        [{ registrationToken, fullName: "An", password: 12345678 }, "password"],
        [
          { fullName: "An", password: goodProfile.password },
          "registrationToken",
        ],
        [
          { registrationToken, fullName: "An", password: "😀".repeat(129) },
          "password",
        ],
      ];
      for (const [body, field] of cases) {
        const error = await catchError(() => completeRegistration(body));
        if (error?.code !== "VALIDATION_FAILED" || error.field !== field)
          return false;
      }
      const ok: any = await completeRegistration({
        registrationToken,
        ...goodProfile,
      });
      return users.length === 1 && ok.email === "a@example.com";
    },
  );

  await check(
    "7.8: Mật khẩu không bị trim, dài 128 ký tự và ký tự ngoài BMP đều hợp lệ",
    async () => {
      reset();
      const a = await verified("a@example.com");
      await completeRegistration({
        registrationToken: a.registrationToken,
        fullName: "An",
        password: "  spaced out  ",
      });
      const b = await verified("b@example.com");
      await completeRegistration({
        registrationToken: b.registrationToken,
        fullName: "An",
        password: "p".repeat(128),
      });
      const c = await verified("c@example.com");
      await completeRegistration({
        registrationToken: c.registrationToken,
        fullName: "An",
        password: "😀".repeat(8),
      });
      return (
        (await verifyPassword("  spaced out  ", users[0].passwordHash)) &&
        !(await verifyPassword("spaced out", users[0].passwordHash)) &&
        users.length === 3
      );
    },
  );

  await check(
    "7.9: Hai yêu cầu song song cùng token chỉ một yêu cầu thành công",
    async () => {
      reset();
      const { registrationToken } = await verified();
      const results = await Promise.all([
        catchError(() =>
          completeRegistration({ registrationToken, ...goodProfile }),
        ),
        catchError(() =>
          completeRegistration({ registrationToken, ...goodProfile }),
        ),
      ]);
      const failures = results.filter((e) => e !== null);
      return (
        users.length === 1 &&
        failures.length === 1 &&
        failures[0].code === "INVALID_FLOW_TOKEN"
      );
    },
  );

  await check(
    "7.10: Email bị người khác đăng ký trong lúc đó -> 409 EMAIL_ALREADY_REGISTERED",
    async () => {
      reset();
      const { registrationToken } = await verified("a@example.com");
      users.push({ email: "a@example.com" });
      const error = await catchError(() =>
        completeRegistration({ registrationToken, ...goodProfile }),
      );
      return (
        error?.code === "EMAIL_ALREADY_REGISTERED" &&
        error.status === 409 &&
        users.length === 1
      );
    },
  );

  await check(
    "7.11: Lỗi bất ngờ khi tạo tài khoản -> lỗi được ném lên, phải đăng ký lại từ đầu",
    async () => {
      reset();
      const { registrationToken } = await verified();
      failUserCreate = new Error("connection lost");
      const error = await catchError(() =>
        completeRegistration({ registrationToken, ...goodProfile }),
      );
      failUserCreate = null;
      const retry = await catchError(() =>
        completeRegistration({ registrationToken, ...goodProfile }),
      );
      return (
        error?.message === "connection lost" &&
        retry?.code === "INVALID_FLOW_TOKEN" &&
        users.length === 0
      );
    },
  );

  await check(
    "7.12: Toàn luồng: request -> verify -> register; Profile không lộ dữ liệu nhạy cảm",
    async () => {
      reset();
      const { requestId, code } = await start("flow@example.com");
      const { registrationToken } = await verifyRegistration(requestId, {
        code,
      });
      const profile: any = await completeRegistration({
        registrationToken,
        ...goodProfile,
      });
      const text = JSON.stringify(profile);
      return (
        profile.email === "flow@example.com" &&
        !text.includes("passwordHash") &&
        !text.includes("$2") &&
        !text.includes(goodProfile.password) &&
        !text.includes("googleSubject")
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
  const logFilePath = path.join(logDir, "auth.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
