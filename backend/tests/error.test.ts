import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import SprintModel from "../src/models/sprint.ts";
import UserModel from "../src/models/user.ts";
import { AppError, createError, toErrorResponse } from "../src/utils/error.ts";
import { ErrorCode } from "../src/utils/errorCodes.ts";
import {
  errorHandler,
  unknownEndpoint,
  userExtractor,
} from "../src/utils/middleware.ts";

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

// Response giả để chạy errorHandler mà không cần server
function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function handle(error: any) {
  const res = fakeRes();
  errorHandler(error, {} as any, res, () => {});
  return res;
}

async function catchError(run: () => Promise<unknown>) {
  try {
    await run();
    return null;
  } catch (e: any) {
    return e;
  }
}

async function runTests() {
  // Logger im lặng khi NODE_ENV=test
  process.env.NODE_ENV = "test";

  log("===============================================================");
  log(`  TEST SUITE: ERROR CODES, ERROR HANDLER & AUTH MIDDLEWARE`);
  log(`  Executed at: ${new Date().toISOString()}`);
  log("===============================================================\n");

  // ============================================================================
  // SUITE 1: Danh mục mã lỗi, AppError và createError
  // ============================================================================
  log("--- SUITE 1: ErrorCode, AppError, createError ---");

  await check(
    "1.1: Mỗi mã có dạng HOA_GẠCH_DƯỚI, status 4xx/5xx và message",
    async () =>
      Object.entries(ErrorCode).every(
        ([key, value]) =>
          /^[A-Z][A-Z_]*$/.test(key) &&
          Number.isInteger(value.status) &&
          value.status >= 400 &&
          value.status < 600 &&
          value.message.length > 0,
      ),
  );

  await check(
    "1.2: AppError lấy status và message mặc định từ danh mục",
    async () => {
      const error = new AppError("CONFLICT");
      return (
        error instanceof Error &&
        error.name === "AppError" &&
        error.code === "CONFLICT" &&
        error.status === 409 &&
        error.message === ErrorCode.CONFLICT.message &&
        error.field === undefined
      );
    },
  );

  await check(
    "1.3: AppError cho phép ghi đè message và đặt field",
    async () => {
      const error = new AppError("VALIDATION_FAILED", {
        message: "Name is required",
        field: "name",
      });
      return (
        error.status === 400 &&
        error.message === "Name is required" &&
        error.field === "name"
      );
    },
  );

  await check(
    "1.4: createError kiểu cũ giữ nguyên status và message, mã suy ra từ status",
    async () => {
      const expected: Record<number, string> = {
        400: "VALIDATION_FAILED",
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        501: "NOT_IMPLEMENTED",
      };
      return Object.entries(expected).every(([status, code]) => {
        const error = createError(Number(status), "Some message");
        return (
          error instanceof AppError &&
          error.status === Number(status) &&
          error.code === code &&
          error.message === "Some message"
        );
      });
    },
  );

  await check(
    "1.5: createError với status ngoài danh sách: giữ status, 5xx -> INTERNAL_ERROR, 4xx khác -> VALIDATION_FAILED",
    async () => {
      const server = createError(503, "Down");
      const other = createError(429, "Slow down");
      return (
        server.status === 503 &&
        server.code === "INTERNAL_ERROR" &&
        other.status === 429 &&
        other.code === "VALIDATION_FAILED"
      );
    },
  );

  // ============================================================================
  // SUITE 2: errorHandler và toErrorResponse
  // ============================================================================
  log("\n--- SUITE 2: errorHandler ---");

  await check(
    "2.1: AppError -> { error, code, field } và đúng HTTP status",
    async () => {
      const res = handle(
        new AppError("CONFLICT", { message: "Taken", field: "name" }),
      );
      return (
        res.statusCode === 409 &&
        JSON.stringify(res.body) ===
          JSON.stringify({ error: "Taken", code: "CONFLICT", field: "name" })
      );
    },
  );

  await check("2.2: Không có field thì body không có khóa field", async () => {
    const res = handle(new AppError("NOT_FOUND"));
    return (
      res.statusCode === 404 &&
      JSON.stringify(res.body) ===
        JSON.stringify({
          error: ErrorCode.NOT_FOUND.message,
          code: "NOT_FOUND",
        })
    );
  });

  await check(
    "2.3: createError kiểu cũ -> có code mặc định theo status",
    async () => {
      const res = handle(createError(409, "Already exists"));
      return (
        res.statusCode === 409 &&
        JSON.stringify(res.body) ===
          JSON.stringify({ error: "Already exists", code: "CONFLICT" })
      );
    },
  );

  await check(
    "2.4: Mongoose ValidationError -> VALIDATION_FAILED, field và message không còn tiền tố",
    async () => {
      const sprint = new SprintModel({
        projectId: new mongoose.Types.ObjectId(),
        name: "Sprint",
        startDate: new Date("2026-11-15"),
        endDate: new Date("2026-11-01"),
      });
      const err = await catchError(() => sprint.validate());
      const res = handle(err);
      return (
        res.statusCode === 400 &&
        res.body.code === "VALIDATION_FAILED" &&
        res.body.field === "endDate" &&
        res.body.error === "endDate must be after startDate"
      );
    },
  );

  await check("2.5: Thiếu trường bắt buộc -> field là tên trường", async () => {
    const sprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
    });
    const res = handle(await catchError(() => sprint.validate()));
    return (
      res.statusCode === 400 &&
      res.body.code === "VALIDATION_FAILED" &&
      res.body.field === "name"
    );
  });

  await check("2.6: CastError -> 400 INVALID_ID", async () => {
    const res = handle(new mongoose.Error.CastError("ObjectId", "abc", "_id"));
    return (
      res.statusCode === 400 &&
      JSON.stringify(res.body) ===
        JSON.stringify({ error: "malformatted id", code: "INVALID_ID" })
    );
  });

  await check(
    "2.7: Trùng khóa E11000 -> 409 DUPLICATE_VALUE, field là tên khóa, không lộ giá trị",
    async () => {
      const error = Object.assign(
        new Error(
          "E11000 duplicate key error collection: db.users index: username_1",
        ),
        {
          name: "MongoServerError",
          code: 11000,
          keyValue: { username: "bob" },
        },
      );
      const res = handle(error);
      return (
        res.statusCode === 409 &&
        res.body.code === "DUPLICATE_VALUE" &&
        res.body.field === "username" &&
        !JSON.stringify(res.body).includes("bob")
      );
    },
  );

  await check("2.8: Token sai chữ ký -> 401 INVALID_TOKEN", async () => {
    const token = jwt.sign({ id: "u1" }, "other-secret");
    const err = await catchError(async () => jwt.verify(token, "real-secret"));
    const res = handle(err);
    return res.statusCode === 401 && res.body.code === "INVALID_TOKEN";
  });

  await check("2.9: Token hết hạn -> 401 TOKEN_EXPIRED", async () => {
    const token = jwt.sign({ id: "u1" }, "real-secret", { expiresIn: -10 });
    const err = await catchError(async () => jwt.verify(token, "real-secret"));
    const res = handle(err);
    return res.statusCode === 401 && res.body.code === "TOKEN_EXPIRED";
  });

  await check(
    "2.10: Lỗi có status từ thư viện (JSON sai cú pháp) -> giữ status, code mặc định, giữ message",
    async () => {
      const error = Object.assign(
        new SyntaxError("Unexpected token } in JSON"),
        {
          status: 400,
        },
      );
      const res = handle(error);
      return (
        res.statusCode === 400 &&
        res.body.code === "VALIDATION_FAILED" &&
        res.body.error === "Unexpected token } in JSON"
      );
    },
  );

  await check(
    "2.11: Lỗi không lường trước -> 500 INTERNAL_ERROR, không lộ chi tiết",
    async () => {
      const res = handle(
        new Error("connection to db failed, password=hunter2"),
      );
      return (
        res.statusCode === 500 &&
        res.body.code === "INTERNAL_ERROR" &&
        res.body.error === ErrorCode.INTERNAL_ERROR.message &&
        !JSON.stringify(res.body).includes("hunter2")
      );
    },
  );

  await check("2.12: Đường dẫn không tồn tại -> 404 NOT_FOUND", async () => {
    const res = fakeRes();
    unknownEndpoint({} as any, res);
    return (
      res.statusCode === 404 &&
      JSON.stringify(res.body) ===
        JSON.stringify({ error: "unknown endpoint", code: "NOT_FOUND" })
    );
  });

  await check(
    "2.13: toErrorResponse chấp nhận giá trị không phải Error",
    async () => {
      return (
        toErrorResponse(undefined).status === 500 &&
        toErrorResponse(null).body.code === "INTERNAL_ERROR" &&
        toErrorResponse("oops").body.code === "INTERNAL_ERROR"
      );
    },
  );

  // ============================================================================
  // SUITE 3: userExtractor
  // ============================================================================
  log("\n--- SUITE 3: userExtractor ---");

  const origSecret = process.env.SECRET;
  const origFindById = UserModel.findById;
  process.env.SECRET = "unit-test-secret";
  let foundUser: any = { id: "u1", username: "alex" };
  (UserModel as any).findById = async () => foundUser;

  async function extract(authorization?: string) {
    const req: any = {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? authorization : undefined,
    };
    let received: any = "next was not called";
    await userExtractor(req, fakeRes(), (arg?: any) => {
      received = arg;
    });
    return { req, received };
  }
  const bearer = (payload: object, secret = "unit-test-secret", options = {}) =>
    `Bearer ${jwt.sign(payload, secret, options)}`;

  await check(
    "3.1: Không có header Authorization -> next(AppError UNAUTHENTICATED 401)",
    async () => {
      const { received } = await extract();
      return (
        received instanceof AppError &&
        received.code === "UNAUTHENTICATED" &&
        received.status === 401
      );
    },
  );

  await check(
    "3.2: Header không bắt đầu bằng Bearer -> UNAUTHENTICATED",
    async () => {
      const { received } = await extract("Token abc");
      return (
        received instanceof AppError && received.code === "UNAUTHENTICATED"
      );
    },
  );

  await check(
    "3.3: Token sai chữ ký -> lỗi đi vào next và thành 401 INVALID_TOKEN (không ném ra ngoài)",
    async () => {
      const { received } = await extract(bearer({ id: "u1" }, "other-secret"));
      const res = handle(received);
      return res.statusCode === 401 && res.body.code === "INVALID_TOKEN";
    },
  );

  await check("3.4: Token hết hạn -> 401 TOKEN_EXPIRED", async () => {
    const { received } = await extract(
      bearer({ id: "u1" }, "unit-test-secret", { expiresIn: -10 }),
    );
    const res = handle(received);
    return res.statusCode === 401 && res.body.code === "TOKEN_EXPIRED";
  });

  await check("3.5: Chuỗi không phải JWT -> 401 INVALID_TOKEN", async () => {
    const { received } = await extract("Bearer abc");
    const res = handle(received);
    return res.statusCode === 401 && res.body.code === "INVALID_TOKEN";
  });

  await check(
    "3.6: Token đúng nhưng thiếu id -> 401 INVALID_TOKEN",
    async () => {
      const { received } = await extract(bearer({ name: "x" }));
      const res = handle(received);
      return res.statusCode === 401 && res.body.code === "INVALID_TOKEN";
    },
  );

  await check(
    "3.7: User trong token không còn tồn tại -> 401 UNAUTHENTICATED",
    async () => {
      foundUser = null;
      const { received } = await extract(bearer({ id: "u1" }));
      foundUser = { id: "u1", username: "alex" };
      const res = handle(received);
      return (
        res.statusCode === 401 &&
        res.body.code === "UNAUTHENTICATED" &&
        res.body.error === "User not found"
      );
    },
  );

  await check(
    "3.8: Token hợp lệ -> gán req.user và gọi next() không kèm lỗi",
    async () => {
      const { req, received } = await extract(bearer({ id: "u1" }));
      return received === undefined && req.user?.username === "alex";
    },
  );

  await check(
    "3.9: Thiếu SECRET trong môi trường -> 500, không lộ chi tiết",
    async () => {
      delete process.env.SECRET;
      const { received } = await extract(bearer({ id: "u1" }));
      process.env.SECRET = "unit-test-secret";
      const res = handle(received);
      return (
        res.statusCode === 500 &&
        res.body.code === "INTERNAL_ERROR" &&
        !JSON.stringify(res.body).includes("secret")
      );
    },
  );

  (UserModel as any).findById = origFindById;
  if (origSecret === undefined) delete process.env.SECRET;
  else process.env.SECRET = origSecret;

  // ============================================================================
  // SUITE 4: Danh mục trong code khớp với docs/api/errors.md
  // ============================================================================
  log("\n--- SUITE 4: docs/api/errors.md ---");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const docs = fs.readFileSync(
    path.resolve(here, "..", "..", "docs", "api", "errors.md"),
    "utf-8",
  );
  const documented = new Map<string, number>();
  for (const line of docs.split(/\r?\n/)) {
    const match = /^\| `([A-Z_]+)` \| ([0-9]{3}) \|/.exec(line);
    if (match) documented.set(match[1], Number(match[2]));
  }

  await check(
    "4.1: Mọi mã trong code đều có trong docs với cùng HTTP status",
    async () =>
      Object.entries(ErrorCode).every(
        ([key, value]) => documented.get(key) === value.status,
      ),
  );

  await check("4.2: Docs không ghi mã nào không có trong code", async () =>
    [...documented.keys()].every((key) => key in ErrorCode),
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

  const logDir = path.resolve(here, "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFilePath = path.join(logDir, "error.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
