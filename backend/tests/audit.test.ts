import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import SystemAuditEventModel from "../src/models/systemAuditEvent.ts";
import UserModel from "../src/models/user.ts";
import {
  getSystemAuditEvents,
  parseAuditQuery,
  recordSystemAuditEvent,
} from "../src/services/audit.ts";
import { AppError, toErrorResponse } from "../src/utils/error.ts";

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

async function catchError(run: () => Promise<unknown>): Promise<any> {
  try {
    await run();
    return null;
  } catch (e: any) {
    return e;
  }
}

async function runTests() {
  process.env.NODE_ENV = "test";

  log(
    "================================================================================",
  );
  log(
    "  TEST SUITE: SYSTEM AUDIT LOG SERVICE, QUERY VALIDATION & MODEL VALIDATIONS",
  );
  log(`  Executed at: ${new Date().toISOString()}`);
  log(
    "================================================================================\n",
  );

  const origFindByIdUser = UserModel.findById;
  const origFindAudit = SystemAuditEventModel.find;
  const origSaveAuditProto = SystemAuditEventModel.prototype.save;

  const mockAdminId = new mongoose.Types.ObjectId().toString();
  const mockAdmin2Id = new mongoose.Types.ObjectId().toString();
  const mockStaffId = new mongoose.Types.ObjectId().toString();
  const mockTargetUser1Id = new mongoose.Types.ObjectId().toString();
  const mockTargetUser2Id = new mongoose.Types.ObjectId().toString();
  const mockTargetProjectId = new mongoose.Types.ObjectId().toString();

  // ============================================================================
  // SUITE 1: Model Validations & Serialization (SystemAuditEventModel & UserModel)
  // ============================================================================
  log(
    "--- SUITE 1: Model Validations & Serialization (SystemAuditEventModel) ---",
  );

  // 1.1 SystemAuditEventModel hợp lệ và chuẩn hóa toJSON chỉ giữ đúng 7 trường công khai
  try {
    const validDoc = new SystemAuditEventModel({
      actorId: mockAdminId,
      action: "USER_SUSPENDED",
      targetType: "USER_ACCOUNT",
      targetId: mockTargetUser1Id,
      ipAddress: "192.168.1.10",
      userAgent: "Mozilla/5.0",
      metadata: { reason: "Security policy violation.", extraSecret: "hidden" },
    });
    const validationErr = await catchError(() => validDoc.validate());
    const json = validDoc.toJSON() as any;
    const keys = Object.keys(json).sort();
    const expectedKeys = [
      "action",
      "actorId",
      "id",
      "occurredAt",
      "reason",
      "targetId",
      "targetType",
    ];

    assert(
      validationErr === null &&
        JSON.stringify(keys) === JSON.stringify(expectedKeys) &&
        json.actorId === mockAdminId &&
        json.action === "USER_SUSPENDED" &&
        json.targetType === "USER_ACCOUNT" &&
        json.targetId === mockTargetUser1Id &&
        json.reason === "Security policy violation." &&
        typeof json.occurredAt === "string" &&
        json.ipAddress === undefined &&
        json.userAgent === undefined &&
        json.metadata === undefined,
      "1.1: SystemAuditEventModel hợp lệ và toJSON() chỉ trả về đúng 7 trường được phép (ẩn ipAddress, userAgent, metadata, _id)",
    );
  } catch (e: any) {
    assert(false, "1.1: SystemAuditEventModel valid & toJSON", e.message);
  }

  // 1.2 SystemAuditEventModel chặn action rỗng hoặc toàn khoảng trắng
  try {
    const blankActionDoc = new SystemAuditEventModel({
      actorId: mockAdminId,
      action: "   ",
      targetType: "USER_ACCOUNT",
      targetId: mockTargetUser1Id,
    });
    const err = await catchError(() => blankActionDoc.validate());
    assert(
      err !== null && err.errors?.action !== undefined,
      "1.2: SystemAuditEventModel chặn action rỗng hoặc chỉ chứa khoảng trắng",
    );
  } catch (e: any) {
    assert(false, "1.2: SystemAuditEventModel blank action", e.message);
  }

  // 1.3 SystemAuditEventModel chặn targetType ngoài danh mục USER_ACCOUNT / PROJECT
  try {
    const invalidTargetTypeDoc = new SystemAuditEventModel({
      actorId: mockAdminId,
      action: "USER_SUSPENDED",
      targetType: "WORK_ITEM" as any,
      targetId: mockTargetUser1Id,
    });
    const err = await catchError(() => invalidTargetTypeDoc.validate());
    assert(
      err !== null && err.errors?.targetType !== undefined,
      "1.3: SystemAuditEventModel chặn targetType không hợp lệ (chỉ nhận USER_ACCOUNT hoặc PROJECT)",
    );
  } catch (e: any) {
    assert(false, "1.3: SystemAuditEventModel invalid targetType", e.message);
  }

  // 1.4 UserModel mặc định systemRole là STAFF và status là ACTIVE
  try {
    const userDoc = new UserModel({
      username: "staff_member",
      name: "Staff Member",
    });
    const err = await catchError(() => userDoc.validate());
    assert(
      err === null &&
        userDoc.systemRole === "STAFF" &&
        userDoc.status === "ACTIVE",
      "1.4: UserModel hỗ trợ systemRole (mặc định STAFF) và status (mặc định ACTIVE)",
    );
  } catch (e: any) {
    assert(false, "1.4: UserModel defaults", e.message);
  }

  // ============================================================================
  // SUITE 2: Authorization (Phân quyền System Administrator)
  // ============================================================================
  log("\n--- SUITE 2: Authorization (requireSystemAdmin) ---");

  // 2.1 Báo lỗi 401 UNAUTHENTICATED khi User không tồn tại
  try {
    (UserModel as any).findById = () => ({ lean: async () => null });
    const err = await catchError(() => getSystemAuditEvents(mockAdminId));
    assert(
      err instanceof AppError &&
        err.status === 401 &&
        err.code === "UNAUTHENTICATED",
      "2.1: Báo lỗi 401 UNAUTHENTICATED khi tài khoản gọi API không tồn tại",
    );
  } catch (e: any) {
    assert(false, "2.1: User not found -> 401", e.message);
  }

  // 2.2 Báo lỗi 403 FORBIDDEN khi User có systemRole là STAFF
  try {
    (UserModel as any).findById = () => ({
      lean: async () => ({
        _id: mockStaffId,
        systemRole: "STAFF",
        status: "ACTIVE",
      }),
    });
    const err = await catchError(() => getSystemAuditEvents(mockStaffId));
    assert(
      err instanceof AppError && err.status === 403 && err.code === "FORBIDDEN",
      "2.2: Báo lỗi 403 FORBIDDEN khi người dùng là STAFF (không phải SYSTEM_ADMINISTRATOR)",
    );
  } catch (e: any) {
    assert(false, "2.2: STAFF user -> 403", e.message);
  }

  // 2.3 Báo lỗi 403 FORBIDDEN khi tài khoản SYSTEM_ADMINISTRATOR đang bị SUSPENDED hoặc DELETED
  try {
    (UserModel as any).findById = () => ({
      lean: async () => ({
        _id: mockAdminId,
        systemRole: "SYSTEM_ADMINISTRATOR",
        status: "SUSPENDED",
      }),
    });
    const err = await catchError(() => getSystemAuditEvents(mockAdminId));
    assert(
      err instanceof AppError && err.status === 403 && err.code === "FORBIDDEN",
      "2.3: Báo lỗi 403 FORBIDDEN khi tài khoản SYSTEM_ADMINISTRATOR không ở trạng thái ACTIVE",
    );
  } catch (e: any) {
    assert(false, "2.3: Suspended Admin -> 403", e.message);
  }

  // ============================================================================
  // SUITE 3: Query Filter Validation (Kiểm tra hợp lệ bộ lọc)
  // ============================================================================
  log("\n--- SUITE 3: Query Filter Validation (parseAuditQuery) ---");

  // Setup mock Admin hợp lệ cho các test tiếp theo
  (UserModel as any).findById = () => ({
    lean: async () => ({
      _id: mockAdminId,
      systemRole: "SYSTEM_ADMINISTRATOR",
      status: "ACTIVE",
    }),
  });

  // 3.1 Từ chối bộ lọc không xác định (Reject unknown filters)
  try {
    const err = await catchError(() =>
      getSystemAuditEvents(mockAdminId, { unknownParam: "abc" }),
    );
    assert(
      err instanceof AppError &&
        err.status === 400 &&
        err.code === "VALIDATION_FAILED" &&
        err.field === "unknownParam",
      "3.1: Từ chối tham số truy vấn lạ (unknown filter) -> 400 VALIDATION_FAILED kèm field",
    );
  } catch (e: any) {
    assert(false, "3.1: Unknown filter rejected", e.message);
  }

  // 3.2 Từ chối ngày from / to sai định dạng hoặc không tồn tại trên lịch (2026-02-30)
  try {
    const errInvalidFrom = await catchError(() =>
      getSystemAuditEvents(mockAdminId, { from: "not-a-date" }),
    );
    const errImpossibleTo = await catchError(() =>
      getSystemAuditEvents(mockAdminId, { to: "2026-02-30T00:00:00.000Z" }),
    );
    assert(
      errInvalidFrom?.status === 400 &&
        errInvalidFrom?.field === "from" &&
        errImpossibleTo?.status === 400 &&
        errImpossibleTo?.field === "to",
      "3.2: Từ chối from/to sai định dạng UTC hoặc ngày không có thực (2026-02-30) -> 400 VALIDATION_FAILED",
    );
  } catch (e: any) {
    assert(false, "3.2: Invalid from/to date", e.message);
  }

  // 3.3 Từ chối khi from > to
  try {
    const err = await catchError(() =>
      getSystemAuditEvents(mockAdminId, {
        from: "2026-10-20T00:00:00.000Z",
        to: "2026-10-10T00:00:00.000Z",
      }),
    );
    assert(
      err instanceof AppError &&
        err.status === 400 &&
        err.code === "VALIDATION_FAILED" &&
        err.field === "from",
      "3.3: Từ chối khoảng thời gian có from > to -> 400 VALIDATION_FAILED",
    );
  } catch (e: any) {
    assert(false, "3.3: from > to rejected", e.message);
  }

  // 3.4 Từ chối actorId không phải ObjectId hợp lệ
  try {
    const err = await catchError(() =>
      getSystemAuditEvents(mockAdminId, { actorId: "not_an_object_id" }),
    );
    assert(
      err instanceof AppError &&
        err.status === 400 &&
        err.code === "VALIDATION_FAILED" &&
        err.field === "actorId",
      "3.4: Từ chối actorId không phải ObjectId hợp lệ -> 400 VALIDATION_FAILED",
    );
  } catch (e: any) {
    assert(false, "3.4: Invalid actorId", e.message);
  }

  // 3.5 Từ chối action rỗng
  try {
    const err = await catchError(() =>
      getSystemAuditEvents(mockAdminId, { action: "   " }),
    );
    assert(
      err instanceof AppError &&
        err.status === 400 &&
        err.code === "VALIDATION_FAILED" &&
        err.field === "action",
      "3.5: Từ chối action rỗng hoặc chỉ chứa khoảng trắng -> 400 VALIDATION_FAILED",
    );
  } catch (e: any) {
    assert(false, "3.5: Blank action query", e.message);
  }

  // 3.6 Từ chối targetType không hợp lệ
  try {
    const err = await catchError(() =>
      getSystemAuditEvents(mockAdminId, { targetType: "SPRINT" }),
    );
    assert(
      err instanceof AppError &&
        err.status === 400 &&
        err.code === "VALIDATION_FAILED" &&
        err.field === "targetType",
      "3.6: Từ chối targetType ngoài USER_ACCOUNT / PROJECT -> 400 VALIDATION_FAILED",
    );
  } catch (e: any) {
    assert(false, "3.6: Invalid targetType query", e.message);
  }

  // 3.7 Quy tắc: targetId bắt buộc phải đi kèm targetType
  try {
    const err = await catchError(() =>
      getSystemAuditEvents(mockAdminId, { targetId: mockTargetUser1Id }),
    );
    assert(
      err instanceof AppError &&
        err.status === 400 &&
        err.code === "VALIDATION_FAILED" &&
        err.message.includes("targetType"),
      "3.7: Từ chối truy vấn có targetId nhưng thiếu targetType -> 400 VALIDATION_FAILED",
    );
  } catch (e: any) {
    assert(false, "3.7: targetId requires targetType", e.message);
  }

  // 3.8 Từ chối targetId không phải ObjectId hợp lệ (khi đã có targetType)
  try {
    const err = await catchError(() =>
      getSystemAuditEvents(mockAdminId, {
        targetType: "USER_ACCOUNT",
        targetId: "bad-id",
      }),
    );
    assert(
      err instanceof AppError &&
        err.status === 400 &&
        err.code === "VALIDATION_FAILED" &&
        err.field === "targetId",
      "3.8: Từ chối targetId không phải ObjectId hợp lệ -> 400 VALIDATION_FAILED",
    );
  } catch (e: any) {
    assert(false, "3.8: Invalid targetId", e.message);
  }

  // ============================================================================
  // SUITE 4: Filtering, Sorting, Field Whitelisting & Store Error Handling
  // ============================================================================
  log(
    "\n--- SUITE 4: Filtering, Sorting, Field Whitelisting & Store Failures ---",
  );

  const seedEvents = [
    {
      _id: "audit_001",
      actorId: mockAdminId,
      action: "USER_SUSPENDED",
      targetType: "USER_ACCOUNT",
      targetId: mockTargetUser1Id,
      ipAddress: "10.0.0.1",
      userAgent: "Chrome",
      metadata: { reason: "Laptop reported stolen." },
      createdAt: new Date("2026-09-22T03:10:00.000Z"),
    },
    {
      _id: "audit_003",
      actorId: mockAdminId,
      action: "USER_REACTIVATED",
      targetType: "USER_ACCOUNT",
      targetId: mockTargetUser1Id,
      ipAddress: "10.0.0.1",
      userAgent: "Chrome",
      metadata: null,
      createdAt: new Date("2026-09-24T02:00:00.000Z"),
    },
    {
      _id: "audit_002",
      actorId: mockAdmin2Id,
      action: "PROJECT_OWNER_TRANSFERRED",
      targetType: "PROJECT",
      targetId: mockTargetProjectId,
      ipAddress: "10.0.0.2",
      userAgent: "Firefox",
      metadata: null,
      createdAt: new Date("2026-09-24T02:00:00.000Z"), // Cùng thời điểm với audit_003 để test tie-break theo id
    },
    {
      _id: "audit_004",
      actorId: mockAdmin2Id,
      action: "USER_DELETED",
      targetType: "USER_ACCOUNT",
      targetId: mockTargetUser2Id,
      ipAddress: "10.0.0.2",
      userAgent: "Firefox",
      metadata: { reason: "Account no longer required." },
      createdAt: new Date("2026-10-30T03:00:00.000Z"),
    },
  ];

  let lastMongoFilter: Record<string, any> = {};
  (SystemAuditEventModel as any).find = (filter: Record<string, any>) => {
    lastMongoFilter = filter;
    return {
      sort: () => ({
        lean: async () => seedEvents,
      }),
    };
  };

  // 4.1 Truy vấn không truyền bộ lọc: Trả về toàn bộ danh sách sắp xếp newest first (occurredAt giảm dần, id tăng dần) và chỉ chứa đúng các trường công khai
  try {
    const result = await getSystemAuditEvents(mockAdminId);
    const ids = result.map((e) => e.id);
    const expectedIds = ["audit_004", "audit_002", "audit_003", "audit_001"];
    const onlyAllowedFields = result.every((item) => {
      const keys = Object.keys(item).sort();
      return (
        JSON.stringify(keys) ===
        JSON.stringify([
          "action",
          "actorId",
          "id",
          "occurredAt",
          "reason",
          "targetId",
          "targetType",
        ])
      );
    });

    assert(
      result.length === 4 &&
        JSON.stringify(ids) === JSON.stringify(expectedIds) &&
        result[0]?.reason === "Account no longer required." &&
        result[1]?.reason === null &&
        onlyAllowedFields,
      "4.1: Không truyền filter trả về toàn bộ sự kiện sắp xếp newest first (occurredAt giảm dần, id tăng dần) và chỉ lộ đúng 7 trường công khai",
    );
  } catch (e: any) {
    assert(false, "4.1: Unfiltered list & sorting", e.message);
  }

  // 4.2 Lọc theo khoảng thời gian inclusive (from <= occurredAt <= to)
  try {
    const result = await getSystemAuditEvents(mockAdminId, {
      from: "2026-09-22T03:10:00.000Z",
      to: "2026-09-24T02:00:00.000Z",
    });
    const ids = result.map((e) => e.id);

    assert(
      result.length === 3 &&
        JSON.stringify(ids) ===
          JSON.stringify(["audit_002", "audit_003", "audit_001"]) &&
        lastMongoFilter.createdAt?.$gte instanceof Date &&
        lastMongoFilter.createdAt?.$lte instanceof Date,
      "4.2: Lọc theo khoảng thời gian từ from đến to (bao gồm cả 2 đầu mút biên)",
    );
  } catch (e: any) {
    assert(false, "4.2: Filter by time range inclusive", e.message);
  }

  // 4.3 Lọc chính xác theo actorId và action
  try {
    const result = await getSystemAuditEvents(mockAdminId, {
      actorId: mockAdmin2Id,
      action: "USER_DELETED",
    });
    assert(
      result.length === 1 &&
        result[0]?.id === "audit_004" &&
        result[0]?.actorId === mockAdmin2Id &&
        result[0]?.action === "USER_DELETED" &&
        lastMongoFilter.actorId === mockAdmin2Id &&
        lastMongoFilter.action === "USER_DELETED",
      "4.3: Lọc chính xác theo actorId và action",
    );
  } catch (e: any) {
    assert(false, "4.3: Filter by actorId and action", e.message);
  }

  // 4.4 Lọc theo targetType và targetId
  try {
    const resultProject = await getSystemAuditEvents(mockAdminId, {
      targetType: "PROJECT",
      targetId: mockTargetProjectId,
    });
    assert(
      resultProject.length === 1 &&
        resultProject[0]?.id === "audit_002" &&
        resultProject[0]?.targetType === "PROJECT" &&
        resultProject[0]?.targetId === mockTargetProjectId &&
        lastMongoFilter.targetType === "PROJECT" &&
        lastMongoFilter.targetId === mockTargetProjectId,
      "4.4: Lọc chính xác theo cặp targetType và targetId",
    );
  } catch (e: any) {
    assert(false, "4.4: Filter by targetType and targetId", e.message);
  }

  // 4.5 Không có bản ghi khớp trả về mảng rỗng []
  try {
    const result = await getSystemAuditEvents(mockAdminId, {
      action: "NON_EXISTENT_ACTION",
    });
    assert(
      Array.isArray(result) && result.length === 0,
      "4.5: Trả về mảng rỗng [] khi không có sự kiện nào khớp với bộ lọc",
    );
  } catch (e: any) {
    assert(false, "4.5: Empty matches return []", e.message);
  }

  // 4.6 Khi tầng lưu trữ (Database) gặp sự cố -> Ném lỗi 500 INTERNAL_ERROR chứ không trả về mảng rỗng giả
  try {
    (SystemAuditEventModel as any).find = () => ({
      sort: () => ({
        lean: async () => {
          throw new Error("Database connection lost");
        },
      }),
    });
    const err = await catchError(() => getSystemAuditEvents(mockAdminId));
    const errRes = toErrorResponse(err);
    assert(
      err !== null &&
        errRes.status === 500 &&
        errRes.body.code === "INTERNAL_ERROR",
      "4.6: Khi cơ sở dữ liệu lỗi -> Trả về 500 INTERNAL_ERROR (không trả về 200 rỗng)",
    );
  } catch (e: any) {
    assert(false, "4.6: Store failure returns 500", e.message);
  }

  // 4.7 Ghi nhận sự kiện kiểm toán mới qua recordSystemAuditEvent
  try {
    const savedAuditEvents: any[] = [];
    SystemAuditEventModel.prototype.save = async function (this: any) {
      savedAuditEvents.push(this);
      return this;
    };

    const created = await recordSystemAuditEvent({
      actorId: mockAdminId,
      action: "USER_SUSPENDED",
      targetType: "USER_ACCOUNT",
      targetId: mockTargetUser1Id,
      reason: "Suspicious login attempts",
      ipAddress: "127.0.0.1",
      userAgent: "TestRunner/1.0",
    });

    const json = created.toJSON() as any;
    assert(
      savedAuditEvents.length === 1 &&
        json.actorId === mockAdminId &&
        json.action === "USER_SUSPENDED" &&
        json.targetType === "USER_ACCOUNT" &&
        json.targetId === mockTargetUser1Id &&
        json.reason === "Suspicious login attempts",
      "4.7: recordSystemAuditEvent tạo và lưu bản ghi SystemAuditEvent đúng định dạng",
    );
  } catch (e: any) {
    assert(false, "4.7: recordSystemAuditEvent", e.message);
  } finally {
    SystemAuditEventModel.prototype.save = origSaveAuditProto;
    (SystemAuditEventModel as any).find = origFindAudit;
    (UserModel as any).findById = origFindByIdUser;
  }

  // ============================================================================
  // SUMMARY & WRITE LOG
  // ============================================================================
  log(
    "\n================================================================================",
  );
  log("  TỔNG KẾT KẾT QUẢ TEST:");
  log(`  Tổng số tests: ${passedCount + failedCount}`);
  log(`  Thành công (PASS): ${passedCount}`);
  log(`  Thất bại   (FAIL): ${failedCount}`);
  log(
    "================================================================================",
  );

  const logDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "logs",
  );
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFilePath = path.join(logDir, "audit.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Toàn bộ kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
