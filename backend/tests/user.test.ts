import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AuthSession from "../src/models/authsession.ts";
import ProjectMembership from "../src/models/membership.ts";
import Project from "../src/models/project.ts";
import UserModel from "../src/models/user.ts";
import {
  getUserDetail,
  getUsers,
  suspendUser,
  reactivateUser,
} from "../src/services/user.ts";
import { requireAdmin } from "../src/utils/middleware.ts";

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

async function catchError(run: () => Promise<unknown> | unknown) {
  try {
    await run();
    return null;
  } catch (e: any) {
    return e;
  }
}

async function runTests() {
  log("===============================================================");
  log(`  TEST SUITE: ADMIN USER MANAGEMENT SERVICE & MIDDLEWARE`);
  log(`  Executed at: ${new Date().toISOString()}`);
  log("===============================================================\n");

  // Save original model methods
  const origFind = UserModel.find;
  const origFindById = UserModel.findById;
  const origFindByIdAndUpdate = UserModel.findByIdAndUpdate;
  const origCountDocuments = UserModel.countDocuments;

  // -------------------------------------------------------------
  // SUITE 1: Middleware requireAdmin
  // -------------------------------------------------------------
  log("--- SUITE 1: Middleware requireAdmin ---");

  // Test 1.1: req.user không tồn tại -> 401 UNAUTHENTICATED
  {
    const req: any = {};
    let nextCalled = false;
    const err = await catchError(() =>
      requireAdmin(req, {} as any, () => {
        nextCalled = true;
      }),
    );
    assert(
      err !== null && err.code === "UNAUTHENTICATED" && !nextCalled,
      "Kịch bản 1.1: Báo lỗi UNAUTHENTICATED khi req.user không tồn tại",
    );
  }

  // Test 1.2: req.user có role STAFF -> 403 FORBIDDEN
  {
    const req: any = {
      user: {
        id: new mongoose.Types.ObjectId().toString(),
        systemRole: "STAFF",
      },
    };
    let nextCalled = false;
    const err = await catchError(() =>
      requireAdmin(req, {} as any, () => {
        nextCalled = true;
      }),
    );
    assert(
      err !== null && err.code === "FORBIDDEN" && !nextCalled,
      "Kịch bản 1.2: Báo lỗi FORBIDDEN khi người dùng không phải SYSTEM_ADMINISTRATOR",
    );
  }

  // Test 1.3: req.user có role SYSTEM_ADMINISTRATOR -> next() được gọi
  {
    const req: any = {
      user: {
        id: new mongoose.Types.ObjectId().toString(),
        systemRole: "SYSTEM_ADMINISTRATOR",
      },
    };
    let nextCalled = false;
    const err = await catchError(() =>
      requireAdmin(req, {} as any, () => {
        nextCalled = true;
      }),
    );
    assert(
      err === null && nextCalled,
      "Kịch bản 1.3: Cho phép đi tiếp (next) khi người dùng là SYSTEM_ADMINISTRATOR",
    );
  }

  // -------------------------------------------------------------
  // SUITE 2: Service getUserDetail
  // -------------------------------------------------------------
  log("\n--- SUITE 2: Service getUserDetail ---");

  const mockAdminId = new mongoose.Types.ObjectId().toString();
  const mockUserId = new mongoose.Types.ObjectId().toString();

  // Test 2.1: Lấy chi tiết user thành công
  {
    const mockUser = {
      _id: mockUserId,
      email: "staff@example.com",
      fullName: "Staff User",
      passwordHash: "test-hash",
      googleSubject: "test-provider-id",
      systemRole: "STAFF",
      status: "ACTIVE",
    };

    (UserModel as any).findById = (id: string) => ({
      lean: async () => (id === mockUserId ? mockUser : null),
    });

    const result = await getUserDetail(mockUserId);
    assert(
      result !== null &&
        result.email === "staff@example.com" &&
        result.fullName === "Staff User" &&
        result.id === mockUserId &&
        result.hasPassword &&
        !("passwordHash" in result) &&
        !("googleSubject" in result),
      "Kịch bản 2.1: Lấy chi tiết user thành công khi ID tồn tại",
    );
  }

  // Test 2.2: Báo lỗi 404 khi userId không tồn tại
  {
    (UserModel as any).findById = () => ({
      lean: async () => null,
    });

    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const err = await catchError(() => getUserDetail(nonExistentId));
    assert(
      err !== null && err.status === 404 && err.message === "User not found",
      "Kịch bản 2.2: Báo lỗi 404 khi userId không tồn tại",
    );
  }

  // -------------------------------------------------------------
  // SUITE 3: Service suspendUser & reactivateUser
  // -------------------------------------------------------------
  log("\n--- SUITE 3: Service suspendUser & reactivateUser ---");

  // Mock dependencies cho session và project check
  const origAuthSessionDeleteMany = AuthSession.deleteMany;
  const origProjectMembershipFind = ProjectMembership.find;
  const origProjectCountDocuments = Project.countDocuments;

  (AuthSession as any).deleteMany = async () => ({
    acknowledged: true,
    deletedCount: 1,
  });
  (ProjectMembership as any).find = () => ({
    select: () => ({
      lean: async () => [],
    }),
  });
  (Project as any).countDocuments = async () => 0;

  // Test 3.1: Chặn Admin tự suspend chính mình -> 409
  {
    const err = await catchError(() =>
      suspendUser(mockAdminId, mockAdminId, "Self suspend"),
    );
    assert(
      err !== null &&
        err.status === 409 &&
        err.message === "You cannot suspend your own account",
      "Kịch bản 3.1: Chặn Admin tự suspend tài khoản của chính mình -> 409",
    );
  }

  // Test 3.2: Báo lỗi 404 khi user cần suspend không tồn tại
  {
    (UserModel as any).findById = async () => null;
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const err = await catchError(() =>
      suspendUser(nonExistentId, mockAdminId, "Not found"),
    );
    assert(
      err !== null && err.status === 404 && err.message === "User not found",
      "Kịch bản 3.2: Báo lỗi 404 khi suspend user không tồn tại",
    );
  }

  // Test 3.3: Báo lỗi 409 khi user không ở trạng thái ACTIVE
  {
    const mockSuspendedUser = {
      _id: mockUserId,
      status: "SUSPENDED",
      systemRole: "STAFF",
    };
    (UserModel as any).findById = async () => mockSuspendedUser;
    const err = await catchError(() =>
      suspendUser(mockUserId, mockAdminId, "Already suspended"),
    );
    assert(
      err !== null &&
        err.status === 409 &&
        err.message === "Cannot suspend account with status SUSPENDED",
      "Kịch bản 3.3: Báo lỗi 409 khi suspend user không ở trạng thái ACTIVE",
    );
  }

  // Test 3.4: Báo lỗi 409 khi user là Admin duy nhất đang ACTIVE
  {
    const mockAdminUser = {
      _id: mockUserId,
      status: "ACTIVE",
      systemRole: "SYSTEM_ADMINISTRATOR",
    };
    (UserModel as any).findById = async () => mockAdminUser;
    (UserModel as any).countDocuments = async () => 1;
    const err = await catchError(() =>
      suspendUser(mockUserId, mockAdminId, "Last admin"),
    );
    assert(
      err !== null &&
        err.status === 409 &&
        err.message === "Cannot suspend the last active administrator",
      "Kịch bản 3.4: Báo lỗi 409 khi suspend Admin duy nhất đang ACTIVE",
    );
  }

  // Test 3.5: Suspend user thành công khi hợp lệ
  {
    const mockTargetUser = {
      _id: mockUserId,
      email: "target@example.com",
      fullName: "Target User",
      systemRole: "STAFF",
      status: "ACTIVE",
      save: async function () {
        return this;
      },
    };
    (UserModel as any).findById = async () => mockTargetUser;
    const result = await suspendUser(mockUserId, mockAdminId, "Valid reason");
    assert(
      result !== null &&
        result.status === "SUSPENDED" &&
        result.id === mockUserId,
      "Kịch bản 3.5: Suspend user thành công, chuyển status sang SUSPENDED",
    );
  }

  // Test 3.6: Báo lỗi 404 khi reactivate user không tồn tại
  {
    (UserModel as any).findById = async () => null;
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const err = await catchError(() =>
      reactivateUser(nonExistentId, mockAdminId),
    );
    assert(
      err !== null && err.status === 404 && err.message === "User not found",
      "Kịch bản 3.6: Báo lỗi 404 khi reactivate user không tồn tại",
    );
  }

  // Test 3.7: Báo lỗi 409 khi reactivate user có status DELETED
  {
    const mockDeletedUser = {
      _id: mockUserId,
      status: "DELETED",
    };
    (UserModel as any).findById = async () => mockDeletedUser;
    const err = await catchError(() => reactivateUser(mockUserId, mockAdminId));
    assert(
      err !== null &&
        err.status === 409 &&
        err.message === "Deleted accounts cannot reactivate",
      "Kịch bản 3.7: Báo lỗi 409 khi reactivate user đã DELETED",
    );
  }

  // Test 3.8: Báo lỗi 409 khi reactivate user không có status SUSPENDED (ví dụ ACTIVE)
  {
    const mockActiveUser = {
      _id: mockUserId,
      status: "ACTIVE",
    };
    (UserModel as any).findById = async () => mockActiveUser;
    const err = await catchError(() => reactivateUser(mockUserId, mockAdminId));
    assert(
      err !== null &&
        err.status === 409 &&
        err.message === "Cannot reactivate account with status ACTIVE",
      "Kịch bản 3.8: Báo lỗi 409 khi reactivate user không có status SUSPENDED",
    );
  }

  // Test 3.9: Reactivate user thành công khi hợp lệ
  {
    const mockSuspendedUser = {
      _id: mockUserId,
      email: "target@example.com",
      fullName: "Target User",
      systemRole: "STAFF",
      status: "SUSPENDED",
      save: async function () {
        return this;
      },
    };
    (UserModel as any).findById = async () => mockSuspendedUser;
    const result = await reactivateUser(mockUserId, mockAdminId);
    assert(
      result !== null && result.status === "ACTIVE" && result.id === mockUserId,
      "Kịch bản 3.9: Reactivate user thành công, chuyển status sang ACTIVE",
    );
  }

  // Restore mocks
  AuthSession.deleteMany = origAuthSessionDeleteMany;
  ProjectMembership.find = origProjectMembershipFind;
  Project.countDocuments = origProjectCountDocuments;

  // -------------------------------------------------------------
  // SUITE 4: Service getUsers (Filter, Search & Pagination)
  // -------------------------------------------------------------
  log("\n--- SUITE 4: Service getUsers (Filter, Search & Pagination) ---");

  // Test 4.1: Lấy danh sách mặc định với phân trang (page = 1, limit = 10)
  {
    let capturedFilter: any = null;
    let capturedSkip: number | null = null;
    let capturedLimit: number | null = null;

    const mockUsers = [
      {
        _id: mockUserId,
        email: "u1@example.com",
        fullName: "User One",
        passwordHash: "test-hash",
      },
      { _id: mockAdminId, email: "u2@example.com", fullName: "User Two" },
    ];

    (UserModel as any).find = (filter: any) => {
      capturedFilter = filter;
      return {
        sort: (_sortObj: any) => ({
          skip: (skipVal: number) => {
            capturedSkip = skipVal;
            return {
              limit: (limitVal: number) => {
                capturedLimit = limitVal;
                return {
                  lean: async () => mockUsers,
                };
              },
            };
          },
        }),
      };
    };

    (UserModel as any).countDocuments = async (filter: any) => {
      return 25;
    };

    const result = await getUsers({});
    assert(
      result.users.length === 2 &&
        result.users[0]?.hasPassword === true &&
        result.users[1]?.hasPassword === false &&
        !("passwordHash" in result.users[0]) &&
        result.pagination.page === 1 &&
        result.pagination.limit === 10 &&
        result.pagination.total === 25 &&
        result.pagination.totalPages === 3 &&
        capturedSkip === 0 &&
        capturedLimit === 10 &&
        Object.keys(capturedFilter).length === 0,
      "Kịch bản 4.1: Lấy danh sách mặc định thành công (page 1, limit 10, total 25 -> 3 trang)",
    );
  }

  // Test 4.2: Tìm kiếm theo từ khóa (search)
  {
    let capturedFilter: any = null;
    (UserModel as any).find = (filter: any) => {
      capturedFilter = filter;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => [],
            }),
          }),
        }),
      };
    };
    (UserModel as any).countDocuments = async () => 0;

    await getUsers({ search: "john.*" });
    const hasOr = Array.isArray(capturedFilter?.$or);
    const fullNameRegex = capturedFilter?.$or?.[0]?.fullName?.$regex;
    const emailRegex = capturedFilter?.$or?.[1]?.email?.$regex;

    assert(
      hasOr && fullNameRegex === "john\\.\\*" && emailRegex === "john\\.\\*",
      "Kịch bản 4.2: Tìm kiếm với regex case-insensitive theo fullName và email",
    );
  }

  // Test 4.3: Lọc theo systemRole
  {
    let capturedFilter: any = null;
    (UserModel as any).find = (filter: any) => {
      capturedFilter = filter;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => [],
            }),
          }),
        }),
      };
    };
    (UserModel as any).countDocuments = async () => 0;

    await getUsers({ role: "SYSTEM_ADMINISTRATOR" });
    assert(
      capturedFilter?.systemRole === "SYSTEM_ADMINISTRATOR",
      "Kịch bản 4.3: Lọc chính xác theo systemRole",
    );
  }

  // Test 4.4: Lọc theo status
  {
    let capturedFilter: any = null;
    (UserModel as any).find = (filter: any) => {
      capturedFilter = filter;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => [],
            }),
          }),
        }),
      };
    };
    (UserModel as any).countDocuments = async () => 0;

    await getUsers({ status: "SUSPENDED" });
    assert(
      capturedFilter?.status === "SUSPENDED",
      "Kịch bản 4.4: Lọc chính xác theo status SUSPENDED",
    );
  }

  // Test 4.5: Tính toán đúng skip cho trang 2 với limit = 5
  {
    let capturedSkip: number | null = null;
    let capturedLimit: number | null = null;

    (UserModel as any).find = () => ({
      sort: () => ({
        skip: (s: number) => {
          capturedSkip = s;
          return {
            limit: (l: number) => {
              capturedLimit = l;
              return { lean: async () => [] };
            },
          };
        },
      }),
    });
    (UserModel as any).countDocuments = async () => 12;

    const result = await getUsers({ page: 2, limit: 5 });
    assert(
      capturedSkip === 5 &&
        capturedLimit === 5 &&
        result.pagination.page === 2 &&
        result.pagination.totalPages === 3,
      "Kịch bản 4.5: Tính đúng skip = 5 khi ở page 2 với limit = 5",
    );
  }

  // Test 4.6: Trả về total = 0 và totalPages = 0 khi danh sách rỗng
  {
    (UserModel as any).find = () => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({ lean: async () => [] }),
        }),
      }),
    });
    (UserModel as any).countDocuments = async () => 0;

    const result = await getUsers({ search: "not_found" });
    assert(
      result.users.length === 0 &&
        result.pagination.total === 0 &&
        result.pagination.totalPages === 0,
      "Kịch bản 4.6: Xử lý đúng khi không có kết quả (total 0 -> 0 trang)",
    );
  }

  // Restore original methods
  UserModel.find = origFind;
  UserModel.findById = origFindById;
  UserModel.findByIdAndUpdate = origFindByIdAndUpdate;
  UserModel.countDocuments = origCountDocuments;

  // -------------------------------------------------------------
  // SUMMARY & WRITE LOG FILE
  // -------------------------------------------------------------
  log("\n===============================================================");
  log(`  TỔNG KẾT KẾT QUẢ TEST:`);
  log(`  Tổng số tests: ${passedCount + failedCount}`);
  log(`  Thành công (PASS): ${passedCount}`);
  log(`  Thất bại   (FAIL): ${failedCount}`);
  log("===============================================================");

  const logDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "logs",
  );
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFilePath = path.join(logDir, "user.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
