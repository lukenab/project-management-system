import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

// Import models
import SprintModel from "../src/models/sprint.ts";
import WorkItemModel from "../src/models/workitem.ts";
import ProjectModel from "../src/models/project.ts";
import MembershipModel from "../src/models/membership.ts";

// Import services
import { updateIndependentWorkItem } from "../src/services/workitem.ts";

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

// Helper to create a realistic mock WorkItem document with .set() and .save()
function createMockWorkItemDoc(initialData: Record<string, any>) {
  const doc: any = {
    ...initialData,
    set(key: string, val: any) {
      doc[key] = val;
    },
    async save() {
      doc.saved = true;
      return doc;
    },
  };
  return doc;
}

async function runTests() {
  log("================================================================================");
  log(`  TEST SUITE: WORK ITEM UPDATE SERVICE, BOARD SERVICE & MODEL VALIDATIONS`);
  log(`  Executed at: ${new Date().toISOString()}`);
  log("================================================================================\n");

  const origFindByIdProj = ProjectModel.findById;
  const origFindOneMember = MembershipModel.findOne;
  const origFindOneSprint = SprintModel.findOne;
  const origFindByIdSprint = SprintModel.findById;
  const origFindOneWorkItem = WorkItemModel.findOne;
  const origFindWorkItem = WorkItemModel.find;

  const mockProjectId = new mongoose.Types.ObjectId().toString();
  const mockItemId = new mongoose.Types.ObjectId().toString();
  const mockUserId = new mongoose.Types.ObjectId().toString();

  // ============================================================================
  // SUITE 1: WorkItem Service (updateIndependentWorkItem)
  // ============================================================================
  log("--- SUITE 1: WorkItem Update Service (updateIndependentWorkItem) ---");

  // 1.1 Project không tồn tại
  try {
    (ProjectModel as any).findById = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { title: "New" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 404 && err.message === "Project not found", "1.1: Báo lỗi 404 khi Project không tồn tại");
  } catch (e: any) {
    assert(false, "1.1: Project không tồn tại", e.message);
  }

  // 1.2 Project bị ARCHIVED
  try {
    (ProjectModel as any).findById = () => ({ lean: async () => ({ _id: mockProjectId, status: "ARCHIVED" }) });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { title: "New" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 409 && err.message.includes("Archived"), "1.2: Báo lỗi 409 khi Project ở trạng thái ARCHIVED");
  } catch (e: any) {
    assert(false, "1.2: Project ARCHIVED", e.message);
  }

  // 1.3 User không phải thành viên active
  try {
    (ProjectModel as any).findById = () => ({ lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }) });
    (MembershipModel as any).findOne = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { title: "New" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 403 && err.message.includes("not an active member"), "1.3: Báo lỗi 403 khi User không phải thành viên active");
  } catch (e: any) {
    assert(false, "1.3: User không phải active member", e.message);
  }

  // 1.4 WorkItem không tồn tại hoặc là child item (parentId != null)
  try {
    (ProjectModel as any).findById = () => ({ lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }) });
    (MembershipModel as any).findOne = () => ({
      lean: async () => ({ userId: mockUserId, projectId: mockProjectId, status: "ACTIVE", scrumRole: "PRODUCT_OWNER" }),
    });
    (WorkItemModel as any).findOne = async () => null;
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { title: "New" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 404 && err.message.includes("Work item not found"), "1.4: Báo lỗi 404 khi WorkItem không tồn tại hoặc là child item");
  } catch (e: any) {
    assert(false, "1.4: WorkItem không tồn tại", e.message);
  }

  // Cấu hình mock chung cho các test tiếp theo:
  const setupBaseMocks = (userRole: { scrumRole?: string; accessRole?: string }, itemData: Record<string, any> = {}) => {
    (ProjectModel as any).findById = () => ({ lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }) });
    (MembershipModel as any).findOne = (q: any) => ({
      lean: async () => {
        if (q.scrumRole === "DEVELOPER" && q._id) {
          // Mocking check assignee
          return q._id === "dev_valid" ? { _id: "dev_valid", projectId: mockProjectId, status: "ACTIVE", scrumRole: "DEVELOPER" } : null;
        }
        return { userId: mockUserId, projectId: mockProjectId, status: "ACTIVE", ...userRole };
      },
    });
    const doc = createMockWorkItemDoc({
      _id: mockItemId,
      projectId: mockProjectId,
      parentId: null,
      title: "Original Title",
      description: "Original Description",
      status: "TODO",
      workType: "TASK",
      priority: "MEDIUM",
      startDate: "2026-11-01",
      dueDate: "2026-11-10",
      sprintId: null,
      deletedAt: null,
      ...itemData,
    });
    (WorkItemModel as any).findOne = async () => doc;
    return doc;
  };

  // 1.5 Phân quyền: Developer cố sửa trường của PO (title, workType, priority, description)
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { title: "Dev tries edit title" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 403 && err.message.includes("Forbidden"), "1.5: Developer cố sửa trường của PO (title) -> 403 Forbidden");
  } catch (e: any) {
    assert(false, "1.5: Dev sửa title", e.message);
  }

  // 1.6 Phân quyền: PO cố sửa trường của Dev (status, assigneeId, startDate, dueDate)
  try {
    setupBaseMocks({ scrumRole: "PRODUCT_OWNER" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { status: "IN_PROGRESS" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 403 && err.message.includes("Forbidden"), "1.6: PO cố sửa trường của Dev (status) -> 403 Forbidden");
  } catch (e: any) {
    assert(false, "1.6: PO sửa status", e.message);
  }

  // 1.7 Phân quyền: Cả PO và Dev đều được phép sửa trường dùng chung (sprintId)
  try {
    // Test với PO
    setupBaseMocks({ scrumRole: "PRODUCT_OWNER" }, { description: "Has description" });
    (SprintModel as any).findOne = () => ({ lean: async () => ({ _id: "sprint_draft", status: "DRAFT" }) });
    let errPO: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { sprintId: "sprint_draft" });
    } catch (e: any) {
      errPO = e;
    }

    // Test với Dev
    setupBaseMocks({ scrumRole: "DEVELOPER" }, { description: "Has description" });
    let errDev: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { sprintId: "sprint_draft" });
    } catch (e: any) {
      errDev = e;
    }

    assert(errPO === null && errDev === null, "1.7: Trường 'sprintId' cho phép cả PO và Dev cập nhật thành công");
  } catch (e: any) {
    assert(false, "1.7: sprintId shared permission", e.message);
  }

  // 1.8 Khóa Active Sprint: Item đang trong Sprint ACTIVE -> Cấm sửa description hoặc workType
  try {
    const activeSprintId = new mongoose.Types.ObjectId().toString();
    setupBaseMocks({ scrumRole: "PRODUCT_OWNER" }, { sprintId: activeSprintId });
    (SprintModel as any).findById = (id: any) => ({
      lean: async () => ({ _id: id, status: "ACTIVE" }),
    });

    let errDesc: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { description: "New Desc" });
    } catch (e: any) {
      errDesc = e;
    }

    let errWorkType: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { workType: "BUG" });
    } catch (e: any) {
      errWorkType = e;
    }

    assert(
      errDesc?.status === 409 && errWorkType?.status === 409,
      "1.8: Khóa sửa 'description' và 'workType' khi item đang nằm trong Sprint ACTIVE -> 409 Conflict"
    );
  } catch (e: any) {
    assert(false, "1.8: Active Sprint lock", e.message);
  }

  // 1.9 Khóa Active Sprint: Item trong Sprint ACTIVE nhưng sửa trường khác (title, priority) -> Hợp lệ
  try {
    const activeSprintId = new mongoose.Types.ObjectId().toString();
    const doc = setupBaseMocks({ scrumRole: "PRODUCT_OWNER" }, { sprintId: activeSprintId });
    (SprintModel as any).findById = (id: any) => ({
      lean: async () => ({ _id: id, status: "ACTIVE" }),
    });

    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { title: "Updated in Active Sprint", priority: "HIGH" });
    assert(doc.title === "Updated in Active Sprint" && doc.priority === "HIGH", "1.9: Cho phép PO sửa title/priority khi item nằm trong Sprint ACTIVE");
  } catch (e: any) {
    assert(false, "1.9: Allowed fields in Active sprint", e.message);
  }

  // 1.10 Assignee Validation: Assignee không phải Developer active trong project
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { assigneeId: "dev_invalid" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 409 && err.message.includes("Assignee must be an active Developer"), "1.10: Chặn gán Assignee không phải Developer active -> 409 Conflict");
  } catch (e: any) {
    assert(false, "1.10: Invalid assignee", e.message);
  }

  // 1.11 Assignee Validation: Gán Assignee hợp lệ hoặc Hủy phân công (null)
  try {
    const doc = setupBaseMocks({ scrumRole: "DEVELOPER" });
    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { assigneeId: "dev_valid" });
    const assignedSuccess = doc.assigneeId === "dev_valid";

    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { assigneeId: null });
    const unassignedSuccess = doc.assigneeId === null;

    assert(assignedSuccess && unassignedSuccess, "1.11: Gán Assignee Developer hợp lệ và Hủy phân công (null) thành công");
  } catch (e: any) {
    assert(false, "1.11: Valid assignee / unassign", e.message);
  }

  // 1.12 Dates Validation: dueDate < startDate (cả 2 trong updates)
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { startDate: "2026-11-10", dueDate: "2026-11-05" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 400 && err.message.includes("dueDate cannot be before startDate"), "1.12: Chặn ngày khi dueDate < startDate (cả 2 trong request) -> 400 Bad Request");
  } catch (e: any) {
    assert(false, "1.12: dueDate < startDate", e.message);
  }

  // 1.13 Dates Validation: Chỉ gửi dueDate mới nhưng nhỏ hơn startDate cũ đang lưu
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" }, { startDate: "2026-11-10", dueDate: "2026-11-20" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { dueDate: "2026-11-05" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 400 && err.message.includes("dueDate cannot be before startDate"), "1.13: Chặn dueDate mới nhỏ hơn startDate cũ đang lưu -> 400 Bad Request");
  } catch (e: any) {
    assert(false, "1.13: new dueDate < existing startDate", e.message);
  }

  // 1.14 Sprint Validation: Chặn gán Sprint khi item đã DONE
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" }, { status: "DONE", description: "Completed task" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { sprintId: "sprint_target" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 409 && err.message.includes("completed (DONE)"), "1.14: Chặn gán Sprint cho item đã có trạng thái DONE -> 409 Conflict");
  } catch (e: any) {
    assert(false, "1.14: Assign Sprint to DONE item", e.message);
  }

  // 1.15 Sprint Validation: Chặn gán Sprint khi item không có description
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" }, { description: "   ", status: "TODO" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { sprintId: "sprint_target" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 409 && err.message.includes("non-blank description"), "1.15: Chặn gán Sprint cho item có description rỗng -> 409 Conflict");
  } catch (e: any) {
    assert(false, "1.15: Assign Sprint with empty desc", e.message);
  }

  // 1.16 Sprint Validation: Target sprint không tồn tại hoặc đã CLOSED
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" }, { description: "Valid desc", status: "TODO" });
    (SprintModel as any).findOne = () => ({ lean: async () => null }); // Không tìm thấy Sprint DRAFT/ACTIVE
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { sprintId: "sprint_closed" });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 409 && err.message.includes("Target sprint must be a live DRAFT or ACTIVE sprint"), "1.16: Chặn gán item vào Sprint không tồn tại hoặc đã CLOSED -> 409 Conflict");
  } catch (e: any) {
    assert(false, "1.16: Target sprint closed/missing", e.message);
  }

  // 1.17 Sprint Validation: Chặn gỡ sprintId (null) khi item đang liên kết với Sprint đã CLOSED
  try {
    const closedSprintId = new mongoose.Types.ObjectId().toString();
    setupBaseMocks({ scrumRole: "DEVELOPER" }, { sprintId: closedSprintId });
    (SprintModel as any).findById = (id: any) => ({
      lean: async () => ({ _id: id, status: "CLOSED" }),
    });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { sprintId: null });
    } catch (e: any) {
      err = e;
    }
    assert(err && err.status === 409 && err.message.includes("closed sprint"), "1.17: Chặn gỡ sprintId về null khi item đang liên kết với Sprint đã CLOSED -> 409 Conflict");
  } catch (e: any) {
    assert(false, "1.17: Unassign closed sprint", e.message);
  }

  // 1.18 Description Clearing: Gửi chuỗi rỗng "" hoặc "   " thì tự động xóa thành null
  try {
    const doc = setupBaseMocks({ scrumRole: "PRODUCT_OWNER" }, { description: "Old Description" });
    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { description: "   " });
    assert(doc.description === null, "1.18: Gửi description là khoảng trắng rỗng -> tự động xóa thành null");
  } catch (e: any) {
    assert(false, "1.18: Description clear to null", e.message);
  }

  // 1.19 Partial Update: Cập nhật status thành công mà không làm mất các trường khác
  try {
    const doc = setupBaseMocks({ scrumRole: "DEVELOPER" }, { title: "Preserved Title", status: "TODO" });
    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, { status: "IN_PROGRESS" });
    assert(doc.status === "IN_PROGRESS" && doc.title === "Preserved Title" && doc.saved === true, "1.19: Partial Update thành công: Cập nhật status và bảo toàn các trường cũ");
  } catch (e: any) {
    assert(false, "1.19: Status update partial", e.message);
  }

  // ============================================================================
  // SUITE 2: Model Validations (Offline Mongoose Document Validation)
  // ============================================================================
  log("\n--- SUITE 2: Model Validations (SprintModel & WorkItemModel) ---");

  // 3.1 Sprint: Hợp lệ
  try {
    const sprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint 1",
      status: "DRAFT",
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-15"),
    });
    await sprint.validate();
    assert(true, "3.1: SprintModel: Dữ liệu hợp lệ vượt qua validate");
  } catch (e: any) {
    assert(false, "3.1: Sprint valid", e.message);
  }

  // 3.2 Sprint: endDate <= startDate
  try {
    const sprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint 1",
      startDate: new Date("2026-11-15"),
      endDate: new Date("2026-11-01"),
    });
    let err: any = null;
    try {
      await sprint.validate();
    } catch (e: any) {
      err = e;
    }
    assert(err && err.message.includes("endDate must be after startDate"), "3.2: SprintModel: Chặn endDate <= startDate");
  } catch (e: any) {
    assert(false, "3.2: Sprint endDate <= startDate", e.message);
  }

  // 3.3 Sprint: Kéo dài quá 1 tháng lịch dương
  try {
    const sprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint 1",
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-12-10"),
    });
    let err: any = null;
    try {
      await sprint.validate();
    } catch (e: any) {
      err = e;
    }
    assert(err && err.message.includes("at most one month"), "3.3: SprintModel: Chặn Sprint kéo dài quá 1 tháng lịch dương");
  } catch (e: any) {
    assert(false, "3.3: Sprint > 1 month", e.message);
  }

  // 3.4 WorkItem: Độc lập hợp lệ
  try {
    const item = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-10",
      title: "Valid WorkItem",
      workType: "TASK",
      status: "TODO",
      orderIndex: 0,
    });
    await item.validate();
    assert(true, "3.4: WorkItemModel: WorkItem độc lập hợp lệ vượt qua validate");
  } catch (e: any) {
    assert(false, "3.4: WorkItem valid", e.message);
  }

  // 3.5 WorkItem: Title rỗng
  try {
    const item = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-11",
      title: "   ",
      orderIndex: 1,
    });
    let err: any = null;
    try {
      await item.validate();
    } catch (e: any) {
      err = e;
    }
    assert(err !== null, "3.5: WorkItemModel: Chặn WorkItem có title rỗng");
  } catch (e: any) {
    assert(false, "3.5: WorkItem blank title", e.message);
  }

  // 3.6 WorkItem: Child item có workType khác TASK
  try {
    const child = new WorkItemModel({
      projectId: new mongoose.Types.ObjectId(),
      key: "PRJ-12",
      parentId: new mongoose.Types.ObjectId(),
      title: "Subtask",
      workType: "STORY", // Phải là TASK
      orderIndex: 2,
    });
    let err: any = null;
    try {
      await child.validate();
    } catch (e: any) {
      err = e;
    }
    assert(err && err.message.includes("Child work item workType must be TASK"), "3.6: WorkItemModel: Chặn Child WorkItem có workType khác TASK");
  } catch (e: any) {
    assert(false, "3.6: Child workType != TASK", e.message);
  }

  // Restore mocks
  (ProjectModel as any).findById = origFindByIdProj;
  (MembershipModel as any).findOne = origFindOneMember;
  (SprintModel as any).findOne = origFindOneSprint;
  (SprintModel as any).findById = origFindByIdSprint;
  (WorkItemModel as any).findOne = origFindOneWorkItem;
  (WorkItemModel as any).find = origFindWorkItem;

  // ============================================================================
  // SUMMARY & WRITE LOG
  // ============================================================================
  log("\n================================================================================");
  log(`  TỔNG KẾT KẾT QUẢ TEST:`);
  log(`  Tổng số tests: ${passedCount + failedCount}`);
  log(`  Thành công (PASS): ${passedCount}`);
  log(`  Thất bại   (FAIL): ${failedCount}`);
  log("================================================================================");

  const logFilePath = path.resolve("test-results.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Toàn bộ kết quả đã được ghi vào file log: ${logFilePath}`);
}

runTests().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
