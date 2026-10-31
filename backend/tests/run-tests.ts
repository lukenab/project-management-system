import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

// Import models
import SprintModel from "../src/models/sprint.ts";
import WorkItemModel from "../src/models/workitem.ts";
import ProjectModel from "../src/models/project.ts";
import MembershipModel from "../src/models/membership.ts";

// Import service
import { getSprintBoard } from "../src/services/board.ts";

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

async function runTests() {
  log("===============================================================");
  log(`  TEST SUITE: SPRINT BOARD SERVICE & MODEL VALIDATIONS`);
  log(`  Executed at: ${new Date().toISOString()}`);
  log("===============================================================\n");

  // -------------------------------------------------------------
  // SUITE 1: Service getSprintBoard (Mocking Data)
  // -------------------------------------------------------------
  log("--- SUITE 1: Board Service (getSprintBoard) ---");

  const origFindById = ProjectModel.findById;
  const origFindOneMembership = MembershipModel.findOne;
  const origFindOneSprint = SprintModel.findOne;
  const origFindWorkItem = WorkItemModel.find;

  const mockProjectId = new mongoose.Types.ObjectId().toString();
  const mockUserId = new mongoose.Types.ObjectId().toString();

  // Test 1.1: Project không tồn tại
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => null,
    });
    let errorCaught: any = null;
    try {
      await getSprintBoard(mockProjectId, mockUserId);
    } catch (err: any) {
      errorCaught = err;
    }
    assert(
      errorCaught !== null && errorCaught.status === 404 && errorCaught.message === "Project not found",
      "Kịch bản 1: Báo lỗi 404 khi Project không tồn tại"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 1: Báo lỗi 404 khi Project không tồn tại", e.message);
  }

  // Test 1.2: User không phải thành viên active
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, name: "Project Demo", status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({
      lean: async () => null,
    });
    let errorCaught: any = null;
    try {
      await getSprintBoard(mockProjectId, mockUserId);
    } catch (err: any) {
      errorCaught = err;
    }
    assert(
      errorCaught !== null && errorCaught.status === 403 && errorCaught.message === "You are not a member of this project",
      "Kịch bản 2: Báo lỗi 403 khi User không phải thành viên active"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 2: Báo lỗi 403 khi User không phải thành viên active", e.message);
  }

  // Test 1.3: Dự án không có Sprint nào ACTIVE
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, name: "Project Demo", status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({
      lean: async () => ({ _id: "m1", userId: mockUserId, projectId: mockProjectId, status: "ACTIVE" }),
    });
    (SprintModel as any).findOne = async () => null;

    const res = await getSprintBoard(mockProjectId, mockUserId);
    const hasThreeCols =
      res.sprint === null &&
      Array.isArray(res.columns) &&
      res.columns.length === 3 &&
      res.columns[0].status === "TODO" && res.columns[0].cards.length === 0 &&
      res.columns[1].status === "IN_PROGRESS" && res.columns[1].cards.length === 0 &&
      res.columns[2].status === "DONE" && res.columns[2].cards.length === 0;

    assert(
      hasThreeCols,
      "Kịch bản 3: Không có Sprint ACTIVE -> trả về sprint: null và đủ 3 cột trống (TODO, IN_PROGRESS, DONE)"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 3: Không có Sprint ACTIVE", e.message);
  }

  // Test 1.4: Có Sprint ACTIVE nhưng không có WorkItem nào
  const mockActiveSprint = {
    _id: new mongoose.Types.ObjectId(),
    name: "Sprint 1 Active",
    status: "ACTIVE",
    startDate: new Date("2026-11-01"),
    endDate: new Date("2026-11-15"),
  };

  try {
    (SprintModel as any).findOne = async () => mockActiveSprint;
    (WorkItemModel as any).find = () => ({
      sort: () => Promise.resolve([]),
    });

    const res = await getSprintBoard(mockProjectId, mockUserId);
    const valid =
      res.sprint !== null &&
      res.sprint._id === mockActiveSprint._id &&
      res.columns.every((col: any) => col.cards.length === 0);

    assert(
      valid,
      "Kịch bản 4: Có Sprint ACTIVE nhưng không có items -> trả về sprint info và 3 cột cards rỗng"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 4: Có Sprint ACTIVE nhưng không có items", e.message);
  }

  // Test 1.5: Có Sprint ACTIVE và có WorkItems được phân loại đúng vào 3 cột
  const mockItems = [
    { _id: "item1", title: "Task 1", status: "TODO", orderIndex: 0, parentId: null },
    { _id: "item2", title: "Task 2", status: "TODO", orderIndex: 1, parentId: null },
    { _id: "item3", title: "Task 3", status: "IN_PROGRESS", orderIndex: 2, parentId: null },
    { _id: "item4", title: "Task 4", status: "DONE", orderIndex: 3, parentId: null },
  ];

  let queryCaptured: any = null;
  let sortCaptured: any = null;

  try {
    (SprintModel as any).findOne = async () => mockActiveSprint;
    (WorkItemModel as any).find = (q: any) => {
      queryCaptured = q;
      return {
        sort: (s: any) => {
          sortCaptured = s;
          return Promise.resolve(mockItems);
        },
      };
    };

    const res = await getSprintBoard(mockProjectId, mockUserId);
    const todoCol = res.columns.find((c: any) => c.status === "TODO");
    const inProgCol = res.columns.find((c: any) => c.status === "IN_PROGRESS");
    const doneCol = res.columns.find((c: any) => c.status === "DONE");

    const categorizedCorrectly =
      todoCol?.cards.length === 2 &&
      inProgCol?.cards.length === 1 &&
      doneCol?.cards.length === 1;

    assert(
      categorizedCorrectly,
      "Kịch bản 5: Phân loại đúng các WorkItems vào 3 cột (TODO, IN_PROGRESS, DONE)"
    );

    // Test 1.6: Query filter kiểm tra parentId: null và deletedAt: null
    const correctFilters =
      queryCaptured?.projectId === mockProjectId &&
      queryCaptured?.sprintId === mockActiveSprint._id &&
      queryCaptured?.parentId === null &&
      queryCaptured?.deletedAt === null;

    assert(
      correctFilters,
      "Kịch bản 6: Bộ lọc WorkItem chuẩn xác (parentId: null, deletedAt: null, sprintId đúng active sprint)"
    );

    // Test 1.7: Query sort đúng { orderIndex: 1, _id: 1 }
    const correctSort = sortCaptured?.orderIndex === 1 && sortCaptured?._id === 1;
    assert(
      correctSort,
      "Kịch bản 7: Sắp xếp cards đúng tiêu chuẩn: sort({ orderIndex: 1, _id: 1 })"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 5-7: Lấy và phân loại WorkItems", e.message);
  }

  // Restore mocks
  (ProjectModel as any).findById = origFindById;
  (MembershipModel as any).findOne = origFindOneMembership;
  (SprintModel as any).findOne = origFindOneSprint;
  (WorkItemModel as any).find = origFindWorkItem;

  // -------------------------------------------------------------
  // SUITE 2: Model Validation cho Sprint
  // -------------------------------------------------------------
  log("\n--- SUITE 2: Model Validation (SprintModel) ---");

  // Test 2.1: Sprint hợp lệ
  try {
    const validSprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint 1 Valid",
      status: "DRAFT",
      startDate: new Date("2026-11-01T00:00:00Z"),
      endDate: new Date("2026-11-15T00:00:00Z"),
    });
    await validSprint.validate();
    assert(true, "Kịch bản 2.1: Sprint hợp lệ vượt qua validate thành công");
  } catch (e: any) {
    assert(false, "Kịch bản 2.1: Sprint hợp lệ", e.message);
  }

  // Test 2.2: Sprint name rỗng hoặc chỉ toàn khoảng trắng
  try {
    const blankNameSprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "   ",
      status: "DRAFT",
    });
    let err: any = null;
    try {
      await blankNameSprint.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null,
      "Kịch bản 2.2: Chặn Sprint có name rỗng hoặc toàn khoảng trắng"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 2.2", e.message);
  }

  // Test 2.3: endDate trước startDate
  try {
    const invalidDatesSprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint Invalid Dates",
      startDate: new Date("2026-11-20T00:00:00Z"),
      endDate: new Date("2026-11-10T00:00:00Z"),
    });
    let err: any = null;
    try {
      await invalidDatesSprint.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null && err.message.includes("endDate must be after startDate"),
      "Kịch bản 2.3: Chặn Sprint có endDate <= startDate"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 2.3", e.message);
  }

  // Test 2.4: Sprint kéo dài quá 1 tháng
  try {
    const tooLongSprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint Too Long",
      startDate: new Date("2026-11-01T00:00:00Z"),
      endDate: new Date("2026-12-10T00:00:00Z"), // > 1 tháng
    });
    let err: any = null;
    try {
      await tooLongSprint.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null && err.message.includes("at most one month"),
      "Kịch bản 2.4: Chặn Sprint kéo dài quá 1 tháng (> 1 calendar month)"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 2.4", e.message);
  }

  // Test 2.5: Sprint kẹp ngày cuối tháng (31/01 đến 28/02 năm không nhuận)
  try {
    const clampedValidSprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint Jan to Feb Clamped",
      startDate: new Date("2026-01-31T00:00:00Z"),
      endDate: new Date("2026-02-28T00:00:00Z"),
    });
    await clampedValidSprint.validate();
    assert(
      true,
      "Kịch bản 2.5: Sprint từ 31/01 đến 28/02 (kẹp ngày cuối tháng) hợp lệ"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 2.5", e.message);
  }

  // Test 2.6: Chuyển sang ACTIVE nhưng thiếu ngày
  try {
    const activeWithoutDates = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint Active Missing Dates",
      status: "ACTIVE",
    });
    let err: any = null;
    try {
      await activeWithoutDates.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null && err.message.includes("ACTIVE sprint must have both startDate and endDate"),
      "Kịch bản 2.6: Chặn Sprint ACTIVE mà thiếu startDate hoặc endDate"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 2.6", e.message);
  }

  // -------------------------------------------------------------
  // SUITE 3: Model Validation cho WorkItem
  // -------------------------------------------------------------
  log("\n--- SUITE 3: Model Validation (WorkItemModel) ---");

  // Test 3.1: WorkItem độc lập hợp lệ
  try {
    const validWorkItem = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-1",
      title: "Implement user authentication",
      workType: "STORY",
      status: "TODO",
      priority: "MEDIUM",
      orderIndex: 0,
      startDate: "2026-11-01",
      dueDate: "2026-11-05",
    });
    await validWorkItem.validate();
    assert(true, "Kịch bản 3.1: WorkItem độc lập hợp lệ vượt qua validate thành công");
  } catch (e: any) {
    assert(false, "Kịch bản 3.1: WorkItem hợp lệ", e.message);
  }

  // Test 3.2: Title rỗng
  try {
    const blankTitleItem = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-2",
      title: "   ",
      orderIndex: 1,
    });
    let err: any = null;
    try {
      await blankTitleItem.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null,
      "Kịch bản 3.2: Chặn WorkItem có title rỗng hoặc toàn khoảng trắng"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 3.2", e.message);
  }

  // Test 3.3: dueDate < startDate ở Independent Item
  try {
    const invalidDateItem = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-3",
      title: "Invalid dates task",
      orderIndex: 2,
      startDate: "2026-11-10",
      dueDate: "2026-11-05", // dueDate trước startDate
    });
    let err: any = null;
    try {
      await invalidDateItem.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null,
      "Kịch bản 3.3: Chặn WorkItem độc lập có dueDate < startDate"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 3.3", e.message);
  }

  // Test 3.4: Child WorkItem có workType khác TASK (ví dụ STORY)
  try {
    const invalidChildItem = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-4",
      parentId: new mongoose.Types.ObjectId(),
      title: "Child item invalid type",
      workType: "STORY", // Child bắt buộc phải là TASK
      orderIndex: 3,
    });
    let err: any = null;
    try {
      await invalidChildItem.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null,
      "Kịch bản 3.4: Chặn Child WorkItem (Subtask) có workType khác TASK"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 3.4", e.message);
  }

  // Test 3.5: Child WorkItem có gán ngày startDate hoặc dueDate
  try {
    const childWithDates = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-5",
      parentId: new mongoose.Types.ObjectId(),
      title: "Child item with dates",
      workType: "TASK",
      startDate: "2026-11-01",
      orderIndex: 4,
    });
    let err: any = null;
    try {
      await childWithDates.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null,
      "Kịch bản 3.5: Chặn Child WorkItem có ngày startDate hoặc dueDate"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 3.5", e.message);
  }

  // Test 3.6: Child WorkItem lưu sprintId trực tiếp
  try {
    const childWithSprint = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-6",
      parentId: new mongoose.Types.ObjectId(),
      sprintId: new mongoose.Types.ObjectId(),
      title: "Child item with sprintId",
      workType: "TASK",
      orderIndex: 5,
    });
    let err: any = null;
    try {
      await childWithSprint.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err !== null,
      "Kịch bản 3.6: Chặn Child WorkItem lưu sprintId trực tiếp"
    );
  } catch (e: any) {
    assert(false, "Kịch bản 3.6", e.message);
  }

  // -------------------------------------------------------------
  // SUMMARY & WRITE LOG FILE
  // -------------------------------------------------------------
  log("\n===============================================================");
  log(`  TỔNG KẾT KẾT QUẢ TEST:`);
  log(`  Tổng số tests: ${passedCount + failedCount}`);
  log(`  Thành công (PASS): ${passedCount}`);
  log(`  Thất bại   (FAIL): ${failedCount}`);
  log("===============================================================");

  const logFilePath = path.resolve("test-results.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

