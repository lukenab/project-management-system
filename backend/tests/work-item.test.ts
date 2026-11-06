import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import ActivityEventModel from "../src/models/activityEvent.ts";
import MembershipModel from "../src/models/membership.ts";
import ProjectModel from "../src/models/project.ts";
// Import models
import SprintModel from "../src/models/sprint.ts";
import UserModel from "../src/models/user.ts";
import WorkItemModel from "../src/models/workitem.ts";
// Import services
import {
  createIndependentWorkItem,
  createWorkItem,
  updateIndependentWorkItem,
  createChildWorkItem,
  getWorkItems,
  getWorkItemDetail,
  getWorkItemActivity,
  updateChildWorkItem,
  updateWorkItem,
  deleteIndependentWorkItem,
  deleteChildWorkItem,
  deleteWorkItem,
  reorderWorkItems,
} from "../src/services/workitem.ts";

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
  log(
    "================================================================================",
  );
  log(
    `  TEST SUITE: WORK ITEM UPDATE SERVICE, BOARD SERVICE & MODEL VALIDATIONS`,
  );
  log(`  Executed at: ${new Date().toISOString()}`);
  log(
    "================================================================================\n",
  );

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
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        title: "New",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Project not found",
      "1.1: Báo lỗi 404 khi Project không tồn tại",
    );
  } catch (e: any) {
    assert(false, "1.1: Project không tồn tại", e.message);
  }

  // 1.2 Project bị ARCHIVED
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ARCHIVED" }),
    });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        title: "New",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 409 && err.message.includes("Archived"),
      "1.2: Báo lỗi 409 khi Project ở trạng thái ARCHIVED",
    );
  } catch (e: any) {
    assert(false, "1.2: Project ARCHIVED", e.message);
  }

  // 1.3 User không phải thành viên active
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        title: "New",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 403 && err.message.includes("not an active member"),
      "1.3: Báo lỗi 403 khi User không phải thành viên active",
    );
  } catch (e: any) {
    assert(false, "1.3: User không phải active member", e.message);
  }

  // 1.4 WorkItem không tồn tại hoặc là child item (parentId != null)
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({
      lean: async () => ({
        userId: mockUserId,
        projectId: mockProjectId,
        status: "ACTIVE",
        scrumRole: "PRODUCT_OWNER",
      }),
    });
    (WorkItemModel as any).findOne = async () => null;
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        title: "New",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message.includes("Work item not found"),
      "1.4: Báo lỗi 404 khi WorkItem không tồn tại hoặc là child item",
    );
  } catch (e: any) {
    assert(false, "1.4: WorkItem không tồn tại", e.message);
  }

  // Cấu hình mock chung cho các test tiếp theo:
  const setupBaseMocks = (
    userRole: { scrumRole?: string; accessRole?: string },
    itemData: Record<string, any> = {},
  ) => {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = (q: any) => ({
      lean: async () => {
        if (q.scrumRole === "DEVELOPER" && q._id) {
          // Mocking check assignee
          return q._id === "dev_valid"
            ? {
                _id: "dev_valid",
                projectId: mockProjectId,
                status: "ACTIVE",
                scrumRole: "DEVELOPER",
              }
            : null;
        }
        return {
          userId: mockUserId,
          projectId: mockProjectId,
          status: "ACTIVE",
          ...userRole,
        };
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
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        title: "Dev tries edit title",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 403 && err.message.includes("Forbidden"),
      "1.5: Developer cố sửa trường của PO (title) -> 403 Forbidden",
    );
  } catch (e: any) {
    assert(false, "1.5: Dev sửa title", e.message);
  }

  // 1.6 Phân quyền: PO cố sửa trường của Dev (status, assigneeId, startDate, dueDate)
  try {
    setupBaseMocks({ scrumRole: "PRODUCT_OWNER" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        status: "IN_PROGRESS",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 403 && err.message.includes("Forbidden"),
      "1.6: PO cố sửa trường của Dev (status) -> 403 Forbidden",
    );
  } catch (e: any) {
    assert(false, "1.6: PO sửa status", e.message);
  }

  // 1.7 Phân quyền: Cả PO và Dev đều được phép sửa trường dùng chung (sprintId)
  try {
    // Test với PO
    setupBaseMocks(
      { scrumRole: "PRODUCT_OWNER" },
      { description: "Has description" },
    );
    (SprintModel as any).findOne = () => ({
      lean: async () => ({ _id: "sprint_draft", status: "DRAFT" }),
    });
    let errPO: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        sprintId: "sprint_draft",
      });
    } catch (e: any) {
      errPO = e;
    }

    // Test với Dev
    setupBaseMocks(
      { scrumRole: "DEVELOPER" },
      { description: "Has description" },
    );
    let errDev: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        sprintId: "sprint_draft",
      });
    } catch (e: any) {
      errDev = e;
    }

    assert(
      errPO === null && errDev === null,
      "1.7: Trường 'sprintId' cho phép cả PO và Dev cập nhật thành công",
    );
  } catch (e: any) {
    assert(false, "1.7: sprintId shared permission", e.message);
  }

  // 1.8 Khóa Active Sprint: Item đang trong Sprint ACTIVE -> Cấm sửa description hoặc workType
  try {
    const activeSprintId = new mongoose.Types.ObjectId().toString();
    setupBaseMocks(
      { scrumRole: "PRODUCT_OWNER" },
      { sprintId: activeSprintId },
    );
    (SprintModel as any).findById = (id: any) => ({
      lean: async () => ({ _id: id, status: "ACTIVE" }),
    });

    let errDesc: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        description: "New Desc",
      });
    } catch (e: any) {
      errDesc = e;
    }

    let errWorkType: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        workType: "BUG",
      });
    } catch (e: any) {
      errWorkType = e;
    }

    assert(
      errDesc?.status === 409 && errWorkType?.status === 409,
      "1.8: Khóa sửa 'description' và 'workType' khi item đang nằm trong Sprint ACTIVE -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "1.8: Active Sprint lock", e.message);
  }

  // 1.9 Khóa Active Sprint: Item trong Sprint ACTIVE nhưng sửa trường khác (title, priority) -> Hợp lệ
  try {
    const activeSprintId = new mongoose.Types.ObjectId().toString();
    const doc = setupBaseMocks(
      { scrumRole: "PRODUCT_OWNER" },
      { sprintId: activeSprintId },
    );
    (SprintModel as any).findById = (id: any) => ({
      lean: async () => ({ _id: id, status: "ACTIVE" }),
    });

    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
      title: "Updated in Active Sprint",
      priority: "HIGH",
    });
    assert(
      doc.title === "Updated in Active Sprint" && doc.priority === "HIGH",
      "1.9: Cho phép PO sửa title/priority khi item nằm trong Sprint ACTIVE",
    );
  } catch (e: any) {
    assert(false, "1.9: Allowed fields in Active sprint", e.message);
  }

  // 1.10 Assignee Validation: Assignee không phải Developer active trong project
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        assigneeId: "dev_invalid",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 409 &&
        err.message.includes("Assignee must be an active Developer"),
      "1.10: Chặn gán Assignee không phải Developer active -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "1.10: Invalid assignee", e.message);
  }

  // 1.11 Assignee Validation: Gán Assignee hợp lệ hoặc Hủy phân công (null)
  try {
    const doc = setupBaseMocks({ scrumRole: "DEVELOPER" });
    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
      assigneeId: "dev_valid",
    });
    const assignedSuccess = doc.assigneeId === "dev_valid";

    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
      assigneeId: null,
    });
    const unassignedSuccess = doc.assigneeId === null;

    assert(
      assignedSuccess && unassignedSuccess,
      "1.11: Gán Assignee Developer hợp lệ và Hủy phân công (null) thành công",
    );
  } catch (e: any) {
    assert(false, "1.11: Valid assignee / unassign", e.message);
  }

  // 1.12 Dates Validation: dueDate < startDate (cả 2 trong updates)
  try {
    setupBaseMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        startDate: "2026-11-10",
        dueDate: "2026-11-05",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 400 &&
        err.message.includes("dueDate cannot be before startDate"),
      "1.12: Chặn ngày khi dueDate < startDate (cả 2 trong request) -> 400 Bad Request",
    );
  } catch (e: any) {
    assert(false, "1.12: dueDate < startDate", e.message);
  }

  // 1.13 Dates Validation: Chỉ gửi dueDate mới nhưng nhỏ hơn startDate cũ đang lưu
  try {
    setupBaseMocks(
      { scrumRole: "DEVELOPER" },
      { startDate: "2026-11-10", dueDate: "2026-11-20" },
    );
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        dueDate: "2026-11-05",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 400 &&
        err.message.includes("dueDate cannot be before startDate"),
      "1.13: Chặn dueDate mới nhỏ hơn startDate cũ đang lưu -> 400 Bad Request",
    );
  } catch (e: any) {
    assert(false, "1.13: new dueDate < existing startDate", e.message);
  }

  // 1.14 Sprint Validation: Chặn gán Sprint khi item đã DONE
  try {
    setupBaseMocks(
      { scrumRole: "DEVELOPER" },
      { status: "DONE", description: "Completed task" },
    );
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        sprintId: "sprint_target",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 409 && err.message.includes("completed (DONE)"),
      "1.14: Chặn gán Sprint cho item đã có trạng thái DONE -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "1.14: Assign Sprint to DONE item", e.message);
  }

  // 1.15 Sprint Validation: Chặn gán Sprint khi item không có description
  try {
    setupBaseMocks(
      { scrumRole: "DEVELOPER" },
      { description: "   ", status: "TODO" },
    );
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        sprintId: "sprint_target",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 409 &&
        err.message.includes("non-blank description"),
      "1.15: Chặn gán Sprint cho item có description rỗng -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "1.15: Assign Sprint with empty desc", e.message);
  }

  // 1.16 Sprint Validation: Target sprint không tồn tại hoặc đã CLOSED
  try {
    setupBaseMocks(
      { scrumRole: "DEVELOPER" },
      { description: "Valid desc", status: "TODO" },
    );
    (SprintModel as any).findOne = () => ({ lean: async () => null }); // Không tìm thấy Sprint DRAFT/ACTIVE
    let err: any = null;
    try {
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        sprintId: "sprint_closed",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 409 &&
        err.message.includes(
          "Target sprint must be a live DRAFT or ACTIVE sprint",
        ),
      "1.16: Chặn gán item vào Sprint không tồn tại hoặc đã CLOSED -> 409 Conflict",
    );
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
      await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
        sprintId: null,
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 409 && err.message.includes("closed sprint"),
      "1.17: Chặn gỡ sprintId về null khi item đang liên kết với Sprint đã CLOSED -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "1.17: Unassign closed sprint", e.message);
  }

  // 1.18 Description Clearing: Gửi chuỗi rỗng "" hoặc "   " thì tự động xóa thành null
  try {
    const doc = setupBaseMocks(
      { scrumRole: "PRODUCT_OWNER" },
      { description: "Old Description" },
    );
    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
      description: "   ",
    });
    assert(
      doc.description === null,
      "1.18: Gửi description là khoảng trắng rỗng -> tự động xóa thành null",
    );
  } catch (e: any) {
    assert(false, "1.18: Description clear to null", e.message);
  }

  // 1.19 Partial Update: Cập nhật status thành công mà không làm mất các trường khác
  try {
    const doc = setupBaseMocks(
      { scrumRole: "DEVELOPER" },
      { title: "Preserved Title", status: "TODO" },
    );
    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
      status: "IN_PROGRESS",
    });
    assert(
      doc.status === "IN_PROGRESS" &&
        doc.title === "Preserved Title" &&
        doc.saved === true,
      "1.19: Partial Update thành công: Cập nhật status và bảo toàn các trường cũ",
    );
  } catch (e: any) {
    assert(false, "1.19: Status update partial", e.message);
  }

  // ============================================================================
  // SUITE 2: Subtask Creation Service (createChildWorkItem)
  // ============================================================================
  log("\n--- SUITE 2: Subtask Creation Service (createChildWorkItem) ---");

  // Mock prototype save và countDocuments cho WorkItemModel
  const origSaveProto = WorkItemModel.prototype.save;
  const origCountDocuments = WorkItemModel.countDocuments;
  WorkItemModel.prototype.save = async function (this: any) {
    this.saved = true;
    return this;
  };
  (WorkItemModel as any).countDocuments = async () => 3;

  const mockParentId = new mongoose.Types.ObjectId().toString();
  const mockDevId = new mongoose.Types.ObjectId().toString();

  // Helper setup mocks cho Subtask
  const setupSubtaskMocks = (
    userRole: { scrumRole?: string; accessRole?: string },
    parentData: Record<string, any> | null = {},
  ) => {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = (q: any) => ({
      lean: async () => {
        if (q._id) {
          return q._id === mockDevId && q.scrumRole === "DEVELOPER"
            ? {
                _id: mockDevId,
                projectId: mockProjectId,
                status: "ACTIVE",
                scrumRole: "DEVELOPER",
              }
            : null;
        }
        if (q.userId === mockUserId) {
          if (q.scrumRole && q.scrumRole !== userRole.scrumRole) {
            return null;
          }
          return {
            userId: mockUserId,
            projectId: mockProjectId,
            status: "ACTIVE",
            ...userRole,
          };
        }
        return null;
      },
    });

    (WorkItemModel as any).findOne = (q: any) => ({
      lean: async () => {
        if (parentData === null) return null;
        if (q._id === mockParentId) {
          return {
            _id: mockParentId,
            projectId: mockProjectId,
            parentId: null,
            title: "Parent Story",
            deletedAt: null,
            ...parentData,
          };
        }
        return null;
      },
    });
  };

  // 2.1 Project không tồn tại
  try {
    (ProjectModel as any).findById = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Project not found",
      "2.1: Báo lỗi 404 khi Project không tồn tại",
    );
  } catch (e: any) {
    assert(false, "2.1: Project không tồn tại", e.message);
  }

  // 2.2 Project ARCHIVED
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ARCHIVED" }),
    });
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 409 && err.message.includes("Archived"),
      "2.2: Báo lỗi 409 khi Project ở trạng thái ARCHIVED",
    );
  } catch (e: any) {
    assert(false, "2.2: Project ARCHIVED", e.message);
  }

  // 2.3 User không phải Developer active trong project (ví dụ PO tạo subtask)
  try {
    setupSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 403 &&
        err.message.includes("Only Developers can create subtasks"),
      "2.3: Chỉ Developer mới được tạo Subtask (PO tạo -> 403 Forbidden)",
    );
  } catch (e: any) {
    assert(false, "2.3: PO tạo subtask", e.message);
  }

  // 2.4 Parent work item không tồn tại trong project hoặc đã xóa mềm
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" }, null);
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 404 &&
        err.message.includes("Parent work item not found"),
      "2.4: Báo lỗi 404 khi Parent item không tồn tại hoặc đã bị xóa",
    );
  } catch (e: any) {
    assert(false, "2.4: Parent không tồn tại", e.message);
  }

  // 2.5 Chặn tạo subtask dưới một subtask khác (parentItem có parentId !== null)
  try {
    setupSubtaskMocks(
      { scrumRole: "DEVELOPER" },
      { parentId: "grandparent_id" },
    );
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 400 &&
        err.message.includes("Cannot create a subtask under another subtask"),
      "2.5: Chặn tạo Subtask dưới một Subtask khác (Single-level nesting -> 400 Bad Request)",
    );
  } catch (e: any) {
    assert(false, "2.5: Subtask of subtask", e.message);
  }

  // 2.6 Chặn Subtask có title rỗng hoặc toàn khoảng trắng
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "   ",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 400 && err.message.includes("Title is required"),
      "2.6: Chặn Subtask có title rỗng hoặc toàn khoảng trắng -> 400 Bad Request",
    );
  } catch (e: any) {
    assert(false, "2.6: Blank title", e.message);
  }

  // 2.7 Chặn Subtask có workType khác TASK (ví dụ STORY hoặc BUG)
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
        workType: "STORY",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 400 &&
        err.message.includes("workType must be TASK"),
      "2.7: Chặn Subtask có workType khác TASK (ví dụ STORY) -> 400 Bad Request",
    );
  } catch (e: any) {
    assert(false, "2.7: workType != TASK", e.message);
  }

  // 2.8 Chặn Subtask nhận priority
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
        priority: "HIGH",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 400 &&
        err.message.includes("cannot accept priority"),
      "2.8: Chặn Subtask nhận priority -> 400 Bad Request",
    );
  } catch (e: any) {
    assert(false, "2.8: priority rejected", e.message);
  }

  // 2.9 Chặn gán Assignee không phải Developer active trong project
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await createChildWorkItem(mockProjectId, mockUserId, {
        parentId: mockParentId,
        title: "Subtask 1",
        assigneeId: "dev_invalid",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 409 &&
        err.message.includes("Assignee must be an active Developer"),
      "2.9: Chặn gán Assignee không phải Developer active -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "2.9: Invalid assignee", e.message);
  }

  // 2.10 Tạo Subtask thành công với Assignee Developer hợp lệ
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    const subtask = await createChildWorkItem(mockProjectId, mockUserId, {
      parentId: mockParentId,
      title: "  Implement unit tests  ",
      description: "Test description",
      workType: "TASK",
      assigneeId: mockDevId,
    });
    const success =
      subtask.title === "Implement unit tests" &&
      subtask.description === "Test description" &&
      subtask.workType === "TASK" &&
      subtask.assigneeId?.toString() === mockDevId &&
      subtask.parentId?.toString() === mockParentId &&
      subtask.saved === true;
    assert(
      success,
      "2.10: Tạo Subtask thành công với Assignee Developer hợp lệ",
    );
  } catch (e: any) {
    assert(false, "2.10: Valid subtask with assignee", e.message);
  }

  // 2.11 Tạo Subtask thành công không có Assignee, các thuộc tính mặc định chuẩn (status: TODO, priority: null, sprintId: null, orderIndex: count)
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    const subtask = await createChildWorkItem(mockProjectId, mockUserId, {
      parentId: mockParentId,
      title: "Clean database records",
    });
    const success =
      subtask.title === "Clean database records" &&
      subtask.status === "TODO" &&
      subtask.priority === null &&
      subtask.assigneeId === null &&
      subtask.sprintId === null &&
      subtask.startDate === null &&
      subtask.dueDate === null &&
      subtask.orderIndex === 3 &&
      subtask.createdBy?.toString() === mockUserId;
    assert(
      success,
      "2.11: Tạo Subtask không có Assignee thành công với các giá trị mặc định chuẩn (status: TODO, priority: null, sprintId: null, orderIndex: count)",
    );
  } catch (e: any) {
    assert(false, "2.11: Default properties subtask", e.message);
  }

  // 2.12 Dispatcher createWorkItem: Tự động phân loại và tạo Subtask thành công khi có parentId
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    const subtask = await createWorkItem(mockProjectId, mockUserId, {
      parentId: mockParentId,
      title: "Created via Dispatcher",
    });
    const success =
      subtask.title === "Created via Dispatcher" &&
      subtask.parentId?.toString() === mockParentId &&
      subtask.saved === true;
    assert(
      success,
      "2.12: Dispatcher createWorkItem tự động phân loại và tạo Subtask thành công khi có parentId",
    );
  } catch (e: any) {
    assert(false, "2.12: Dispatcher createWorkItem with parentId", e.message);
  }

  // 2.13 Dispatcher createWorkItem: Tự động phân loại và tạo Independent Item thành công khi không có parentId
  try {
    setupSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    const item = await createWorkItem(mockProjectId, mockUserId, {
      title: "  Independent Item via Dispatcher  ",
      description: "Story description",
      workType: "STORY",
      priority: "HIGH",
    });
    const success =
      item.title === "Independent Item via Dispatcher" &&
      item.description === "Story description" &&
      item.workType === "STORY" &&
      item.priority === "HIGH" &&
      item.parentId === null &&
      item.status === "TODO" &&
      item.assigneeId === null &&
      item.sprintId === null &&
      item.orderIndex === 3 &&
      item.saved === true;
    assert(
      success,
      "2.13: Dispatcher createWorkItem tự động phân loại và tạo Independent Item thành công khi không có parentId",
    );
  } catch (e: any) {
    assert(
      false,
      "2.13: Dispatcher createWorkItem without parentId",
      e.message,
    );
  }

  // 2.14 createIndependentWorkItem: Chặn khi Developer cố tạo Independent Item -> 403 Forbidden
  try {
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await createIndependentWorkItem(mockProjectId, mockUserId, {
        title: "Dev tries to create story",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 403 &&
        err.message.includes("Only Product Owner can create"),
      "2.14: Chặn khi Developer cố tạo Independent Item -> 403 Forbidden",
    );
  } catch (e: any) {
    assert(false, "2.14: Dev create independent item", e.message);
  }

  // 2.15 createIndependentWorkItem: Chặn khi truyền assigneeId hoặc trường không hợp lệ -> 400
  try {
    setupSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    let err: any = null;
    try {
      await createIndependentWorkItem(mockProjectId, mockUserId, {
        title: "Story with assignee",
        assigneeId: mockDevId,
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 400 &&
        err.message.includes("cannot accept assigneeId"),
      "2.15: Chặn truyền assigneeId khi tạo mới Independent Item -> 400",
    );
  } catch (e: any) {
    assert(false, "2.15: Independent create with assigneeId", e.message);
  }

  // Khôi phục prototype save và countDocuments
  WorkItemModel.prototype.save = origSaveProto;
  (WorkItemModel as any).countDocuments = origCountDocuments;

  // ============================================================================
  // SUITE 3: Model Validations (Offline Mongoose Document Validation)
  // ============================================================================
  log("\n--- SUITE 3: Model Validations (SprintModel & WorkItemModel) ---");

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
    assert(
      err &&
        err.name === "ValidationError" &&
        err.message.includes("endDate must be after startDate"),
      "3.2: SprintModel: Chặn endDate <= startDate",
    );
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
    assert(
      err &&
        err.name === "ValidationError" &&
        err.message.includes("at most one month"),
      "3.3: SprintModel: Chặn Sprint kéo dài quá 1 tháng lịch dương",
    );
  } catch (e: any) {
    assert(false, "3.3: Sprint > 1 month", e.message);
  }

  // 3.3b Sprint: ACTIVE nhưng thiếu ngày -> 400
  try {
    const sprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint 1",
      status: "ACTIVE",
    });
    let err: any = null;
    try {
      await sprint.validate();
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.name === "ValidationError" &&
        err.message.includes("must have both startDate and endDate"),
      "3.3b: SprintModel: Chặn Sprint ACTIVE thiếu ngày -> ValidationError",
    );
  } catch (e: any) {
    assert(false, "3.3b: Sprint ACTIVE without dates", e.message);
  }

  // 3.3c Sprint: toJSON chỉ trả các trường của response
  try {
    const sprint = new SprintModel({
      projectId: new mongoose.Types.ObjectId(),
      name: "Sprint 1",
      deletedAt: new Date(),
    });
    const json: any = sprint.toJSON();
    assert(
      typeof json.id === "string" &&
        !("_id" in json) &&
        !("deletedAt" in json) &&
        !("closeNote" in json),
      "3.3c: SprintModel.toJSON: có id, không lộ _id/deletedAt/closeNote",
    );
  } catch (e: any) {
    assert(false, "3.3c: Sprint toJSON", e.message);
  }

  // 3.3d Sprint: ranh giới cuối tháng, ngày không bị tràn sang tháng sau
  try {
    const check = async (start: string, end: string) => {
      try {
        await new SprintModel({
          projectId: new mongoose.Types.ObjectId(),
          name: "Sprint 1",
          startDate: new Date(start),
          endDate: new Date(end),
        }).validate();
        return null;
      } catch (e: any) {
        return e;
      }
    };
    const rejected = (err: any) =>
      err?.name === "ValidationError" &&
      err.message.includes("at most one month");

    assert(
      (await check("2026-01-31", "2026-02-28")) === null &&
        rejected(await check("2026-01-31", "2026-03-01")) &&
        (await check("2028-01-31", "2028-02-29")) === null &&
        rejected(await check("2028-01-31", "2028-03-01")) &&
        (await check("2026-12-31", "2027-01-31")) === null,
      "3.3d: SprintModel: 31/01 tối đa tới cuối tháng 2 (kể cả năm nhuận), 31/12 tới 31/01",
    );
  } catch (e: any) {
    assert(false, "3.3d: Sprint month-end boundary", e.message);
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
    assert(
      true,
      "3.4: WorkItemModel: WorkItem độc lập hợp lệ vượt qua validate",
    );
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
    assert(
      err && err.message.includes("Child work item workType must be TASK"),
      "3.6: WorkItemModel: Chặn Child WorkItem có workType khác TASK",
    );
  } catch (e: any) {
    assert(false, "3.6: Child workType != TASK", e.message);
  }

  // Restore mocks
  // ============================================================================
  // SUITE 4: Get Work Item Detail Service (getWorkItemDetail)
  // ============================================================================
  log("\n--- SUITE 4: Get Work Item Detail Service (getWorkItemDetail) ---");

  const mockDetailSprintId = new mongoose.Types.ObjectId().toString();
  const mockDetailParentId = new mongoose.Types.ObjectId().toString();

  // 4.1: Báo lỗi 404 khi Project không tồn tại
  try {
    (ProjectModel as any).findById = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Project not found",
      "4.1: Báo lỗi 404 khi Project không tồn tại",
    );
  } catch (e: any) {
    assert(false, "4.1: Project không tồn tại", e.message);
  }

  // 4.2: Báo lỗi 403 khi User không phải thành viên active
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 403 &&
        err.message === "You are not an active member of this project",
      "4.2: Báo lỗi 403 khi User không phải thành viên active",
    );
  } catch (e: any) {
    assert(false, "4.2: User không phải active member", e.message);
  }

  // Setup mock chung cho getWorkItemDetail
  let detailWorkItem: any = null;
  let detailParentItem: any = null;
  let detailSprint: any = null;

  const setupDetailMocks = () => {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({
      lean: async () => ({
        userId: mockUserId,
        projectId: mockProjectId,
        status: "ACTIVE",
        scrumRole: "DEVELOPER",
      }),
    });
    (WorkItemModel as any).findOne = (q: any) => {
      let targetDoc: any = null;
      if (q && q._id === mockItemId) {
        targetDoc = detailWorkItem;
      } else if (q && q._id === mockDetailParentId) {
        targetDoc = detailParentItem;
      }
      return {
        then(resolve: any, reject?: any) {
          return Promise.resolve(targetDoc).then(resolve, reject);
        },
        lean() {
          return Promise.resolve(targetDoc);
        },
      };
    };
    (SprintModel as any).findById = (id: any) => ({
      select: (_fields: string) => ({
        lean: async () => {
          if (detailSprint && id === mockDetailSprintId) {
            return detailSprint;
          }
          return null;
        },
      }),
    });
  };

  // 4.3: Báo lỗi 404 khi WorkItem không tồn tại hoặc đã bị soft-delete
  try {
    setupDetailMocks();
    detailWorkItem = null;
    let err: any = null;
    try {
      await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Work item not found",
      "4.3: Báo lỗi 404 khi WorkItem không tồn tại hoặc đã bị xóa",
    );
  } catch (e: any) {
    assert(false, "4.3: WorkItem không tồn tại", e.message);
  }

  // 4.4: Lấy WorkItem độc lập không có Sprint (parentId: null, sprintId: null) -> sprint: null
  try {
    setupDetailMocks();
    detailWorkItem = {
      _id: mockItemId,
      projectId: mockProjectId,
      parentId: null,
      sprintId: null,
      title: "Task independent without sprint",
    };
    detailSprint = null;
    const res = await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    assert(
      res &&
        res.workItem &&
        res.workItem._id === mockItemId &&
        res.sprint === null,
      "4.4: Lấy WorkItem độc lập không có Sprint -> trả về sprint: null",
    );
  } catch (e: any) {
    assert(false, "4.4: Item không có sprint", e.message);
  }

  // 4.5: Lấy WorkItem độc lập có liên kết Sprint -> trả về thông tin sprint
  try {
    setupDetailMocks();
    detailWorkItem = {
      _id: mockItemId,
      projectId: mockProjectId,
      parentId: null,
      sprintId: mockDetailSprintId,
      title: "Task independent with sprint",
    };
    detailSprint = {
      _id: mockDetailSprintId,
      name: "Sprint 1",
    };
    const res = await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    assert(
      res &&
        res.workItem &&
        res.workItem._id === mockItemId &&
        res.sprint &&
        res.sprint.name === "Sprint 1",
      "4.5: Lấy WorkItem độc lập có Sprint -> trả về thông tin sprint tương ứng",
    );
  } catch (e: any) {
    assert(false, "4.5: Item có sprint", e.message);
  }

  // 4.6: Child WorkItem (Subtask) nhưng Parent không tồn tại hoặc đã bị xóa -> 404
  try {
    setupDetailMocks();
    detailWorkItem = {
      _id: mockItemId,
      projectId: mockProjectId,
      parentId: mockDetailParentId,
      sprintId: null,
      title: "Subtask",
    };
    detailParentItem = null;
    let err: any = null;
    try {
      await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Work item not found",
      "4.6: Child WorkItem có Parent không tồn tại hoặc đã bị xóa -> 404",
    );
  } catch (e: any) {
    assert(false, "4.6: Parent không tồn tại", e.message);
  }

  // 4.7: Child WorkItem kế thừa Sprint từ Parent
  try {
    setupDetailMocks();
    detailWorkItem = {
      _id: mockItemId,
      projectId: mockProjectId,
      parentId: mockDetailParentId,
      sprintId: null,
      title: "Subtask inheriting sprint",
    };
    detailParentItem = {
      _id: mockDetailParentId,
      projectId: mockProjectId,
      parentId: null,
      sprintId: mockDetailSprintId,
      title: "Parent Story",
      deletedAt: null,
    };
    detailSprint = {
      _id: mockDetailSprintId,
      name: "Sprint từ Parent",
    };
    const res = await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    assert(
      res &&
        res.workItem &&
        res.workItem._id === mockItemId &&
        res.sprint &&
        res.sprint.name === "Sprint từ Parent",
      "4.7: Child WorkItem kế thừa đúng Sprint từ Parent",
    );
  } catch (e: any) {
    assert(false, "4.7: Child kế thừa sprint", e.message);
  }

  // 4.8: Child WorkItem có Parent không liên kết Sprint -> sprint: null
  try {
    setupDetailMocks();
    detailWorkItem = {
      _id: mockItemId,
      projectId: mockProjectId,
      parentId: mockDetailParentId,
      sprintId: null,
      title: "Subtask with parent no sprint",
    };
    detailParentItem = {
      _id: mockDetailParentId,
      projectId: mockProjectId,
      parentId: null,
      sprintId: null,
      title: "Parent Story No Sprint",
      deletedAt: null,
    };
    detailSprint = null;
    const res = await getWorkItemDetail(mockProjectId, mockItemId, mockUserId);
    assert(
      res &&
        res.workItem &&
        res.workItem._id === mockItemId &&
        res.sprint === null,
      "4.8: Child WorkItem có Parent không có Sprint -> trả về sprint: null",
    );
  } catch (e: any) {
    assert(false, "4.8: Child parent không có sprint", e.message);
  }

  // ============================================================================
  // SUITE 5: Subtask Update Service (updateChildWorkItem & updateWorkItem)
  // ============================================================================
  log(
    "\n--- SUITE 5: Subtask Update Service (updateChildWorkItem & updateWorkItem) ---",
  );

  const mockSubtaskId = new mongoose.Types.ObjectId().toString();
  const mockSubtaskParentId = new mongoose.Types.ObjectId().toString();
  const mockValidDevId = new mongoose.Types.ObjectId().toString();

  let currentSubtaskDoc: any = null;
  let currentSubtaskParentDoc: any = null;

  const setupSubtaskUpdateMocks = (
    userRole: { scrumRole?: string; accessRole?: string } = {
      scrumRole: "DEVELOPER",
    },
    projectStatus: string = "ACTIVE",
  ) => {
    (ProjectModel as any).findById = () => ({
      lean: async () =>
        projectStatus ? { _id: mockProjectId, status: projectStatus } : null,
    });

    (MembershipModel as any).findOne = (q: any) => ({
      lean: async () => {
        // Mock check assignee Developer
        if (q._id) {
          if (
            q._id === mockValidDevId &&
            q.scrumRole === "DEVELOPER" &&
            q.status === "ACTIVE"
          ) {
            return {
              _id: mockValidDevId,
              projectId: mockProjectId,
              status: "ACTIVE",
              scrumRole: "DEVELOPER",
            };
          }
          return null;
        }

        // Mock actor membership
        if (q.userId === mockUserId) {
          if (q.scrumRole && q.scrumRole !== userRole.scrumRole) {
            return null;
          }
          return {
            userId: mockUserId,
            projectId: mockProjectId,
            status: "ACTIVE",
            ...userRole,
          };
        }
        return null;
      },
    });

    (WorkItemModel as any).findOne = (q: any) => {
      let doc: any = null;
      if (q && q._id === mockSubtaskId) {
        doc = currentSubtaskDoc;
      } else if (q && q._id === mockSubtaskParentId) {
        doc = currentSubtaskParentDoc;
      }
      return {
        then(resolve: any, reject?: any) {
          return Promise.resolve(doc).then(resolve, reject);
        },
        lean() {
          return Promise.resolve(doc);
        },
        select(_fields: string) {
          return {
            lean: async () => doc,
          };
        },
      };
    };
  };

  // 5.1 Project không tồn tại
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" }, "");
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        title: "New Subtask Title",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Project not found",
      "5.1: Báo lỗi 404 khi Project không tồn tại",
    );
  } catch (e: any) {
    assert(false, "5.1: Project không tồn tại", e.message);
  }

  // 5.2 Project bị ARCHIVED
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" }, "ARCHIVED");
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        title: "New Subtask Title",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 409 && err.message.includes("Archived"),
      "5.2: Báo lỗi 409 khi Project ở trạng thái ARCHIVED",
    );
  } catch (e: any) {
    assert(false, "5.2: Project ARCHIVED", e.message);
  }

  // 5.3 Chỉ Developer mới được sửa Subtask (Product Owner sửa -> 403)
  try {
    setupSubtaskUpdateMocks({ scrumRole: "PRODUCT_OWNER" });
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        title: "PO tries update subtask",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 403 && err.message.includes("Only Developers"),
      "5.3: Chỉ Developer mới được cập nhật Subtask (PO cập nhật -> 403 Forbidden)",
    );
  } catch (e: any) {
    assert(false, "5.3: PO cập nhật subtask", e.message);
  }

  // 5.4 Subtask không tồn tại hoặc đã bị soft-deleted
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = null;
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        title: "Updated",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Work item not found",
      "5.4: Báo lỗi 404 khi Subtask không tồn tại hoặc đã bị xóa",
    );
  } catch (e: any) {
    assert(false, "5.4: Subtask không tồn tại", e.message);
  }

  // 5.5 Chặn nếu item truyền vào là Independent Item (parentId === null)
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = createMockWorkItemDoc({
      _id: mockSubtaskId,
      projectId: mockProjectId,
      parentId: null, // Không phải subtask
      title: "Story Item",
    });
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        title: "Updated",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 400 && err.message.includes("not a subtask"),
      "5.5: Chặn cập nhật khi itemId truyền vào là Independent item (parentId === null)",
    );
  } catch (e: any) {
    assert(false, "5.5: Item không phải subtask", e.message);
  }

  // 5.6 Parent của Subtask không tồn tại hoặc đã bị xóa -> 404
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = createMockWorkItemDoc({
      _id: mockSubtaskId,
      projectId: mockProjectId,
      parentId: mockSubtaskParentId,
      title: "Subtask",
    });
    currentSubtaskParentDoc = null; // Parent không tìm thấy
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        title: "Updated",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Parent work item not found",
      "5.6: Báo lỗi 404 khi Parent của Subtask không tồn tại hoặc đã bị xóa",
    );
  } catch (e: any) {
    assert(false, "5.6: Parent không tồn tại", e.message);
  }

  // 5.7 Chặn cập nhật các trường bị cấm trên Subtask (workType, priority, startDate, dueDate, sprintId)
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = createMockWorkItemDoc({
      _id: mockSubtaskId,
      projectId: mockProjectId,
      parentId: mockSubtaskParentId,
      title: "Subtask",
    });
    currentSubtaskParentDoc = {
      _id: mockSubtaskParentId,
      projectId: mockProjectId,
      parentId: null,
      title: "Parent Story",
      deletedAt: null,
    };

    const disallowedFields = [
      { workType: "BUG" },
      { priority: "HIGH" },
      { startDate: "2026-11-01" },
      { dueDate: "2026-11-10" },
      { sprintId: new mongoose.Types.ObjectId().toString() },
    ];

    let allBlocked = true;
    for (const disallowed of disallowedFields) {
      try {
        await updateChildWorkItem(
          mockProjectId,
          mockSubtaskId,
          mockUserId,
          disallowed,
        );
        allBlocked = false;
      } catch (e: any) {
        if (
          e.status !== 403 ||
          !e.message.includes("not editable on a subtask")
        ) {
          allBlocked = false;
        }
      }
    }

    assert(
      allBlocked,
      "5.7: Chặn cập nhật các trường bị cấm trên Subtask (workType, priority, startDate, dueDate, sprintId) -> 403",
    );
  } catch (e: any) {
    assert(false, "5.7: Chặn trường bị cấm", e.message);
  }

  // 5.8 Chặn title rỗng hoặc toàn khoảng trắng -> 400
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        title: "    ",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 400 && err.message.includes("Title is required"),
      "5.8: Chặn cập nhật Subtask có title rỗng hoặc toàn khoảng trắng -> 400",
    );
  } catch (e: any) {
    assert(false, "5.8: Title rỗng", e.message);
  }

  // 5.9 Chặn status không hợp lệ -> 400
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        status: "INVALID_STATUS",
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 400 && err.message.includes("Invalid status value"),
      "5.9: Chặn cập nhật Subtask với status không hợp lệ -> 400",
    );
  } catch (e: any) {
    assert(false, "5.9: Status không hợp lệ", e.message);
  }

  // 5.10 Chặn gán Assignee không phải Developer active -> 409
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
        assigneeId: new mongoose.Types.ObjectId().toString(), // Dev không tồn tại
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 409 && err.message.includes("active Developer"),
      "5.10: Chặn gán Assignee không phải Developer active trong project -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "5.10: Assignee không hợp lệ", e.message);
  }

  // 5.11 Cập nhật thành công các trường hợp lệ (title, description, status, assigneeId)
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = createMockWorkItemDoc({
      _id: mockSubtaskId,
      projectId: mockProjectId,
      parentId: mockSubtaskParentId,
      title: "Old Subtask Title",
      description: "Old Desc",
      status: "TODO",
      assigneeId: null,
    });
    currentSubtaskParentDoc = {
      _id: mockSubtaskParentId,
      projectId: mockProjectId,
      parentId: null,
      status: "TODO",
      deletedAt: null,
    };

    const res = await updateChildWorkItem(
      mockProjectId,
      mockSubtaskId,
      mockUserId,
      {
        title: "New Subtask Title",
        description: "New Subtask Description",
        status: "IN_PROGRESS",
        assigneeId: mockValidDevId,
      },
    );

    assert(
      res.title === "New Subtask Title" &&
        res.description === "New Subtask Description" &&
        res.status === "IN_PROGRESS" &&
        res.assigneeId === mockValidDevId &&
        res.saved === true,
      "5.11: Cập nhật thành công các trường hợp lệ (title, description, status, assigneeId)",
    );
  } catch (e: any) {
    assert(false, "5.11: Update hợp lệ", e.message);
  }

  // 5.12 Xóa description về null khi truyền chuỗi rỗng và hủy assignee khi truyền null
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = createMockWorkItemDoc({
      _id: mockSubtaskId,
      projectId: mockProjectId,
      parentId: mockSubtaskParentId,
      title: "Subtask Title",
      description: "Existing Desc",
      assigneeId: mockValidDevId,
      status: "IN_PROGRESS",
    });

    const res = await updateChildWorkItem(
      mockProjectId,
      mockSubtaskId,
      mockUserId,
      {
        description: "   ",
        assigneeId: null,
      },
    );

    assert(
      res.description === null && res.assigneeId === null && res.saved === true,
      "5.12: Xóa description về null khi truyền chuỗi rỗng và hủy assignee khi truyền null",
    );
  } catch (e: any) {
    assert(false, "5.12: Clear nullable fields", e.message);
  }

  // 5.13 Tính độc lập của status: Cập nhật status của Subtask không làm đổi status của Parent
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = createMockWorkItemDoc({
      _id: mockSubtaskId,
      projectId: mockProjectId,
      parentId: mockSubtaskParentId,
      title: "Subtask Title",
      status: "IN_PROGRESS",
    });
    currentSubtaskParentDoc = {
      _id: mockSubtaskParentId,
      projectId: mockProjectId,
      parentId: null,
      status: "TODO", // Parent đang TODO
      deletedAt: null,
    };

    await updateChildWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
      status: "DONE",
    });

    assert(
      currentSubtaskDoc.status === "DONE" &&
        currentSubtaskParentDoc.status === "TODO",
      "5.13: Tính độc lập của status: Cập nhật Subtask thành DONE không làm thay đổi status của Parent",
    );
  } catch (e: any) {
    assert(false, "5.13: Status không cascade", e.message);
  }

  // 5.14 Dispatcher updateWorkItem tự động phân loại và cập nhật Subtask thành công
  try {
    setupSubtaskUpdateMocks({ scrumRole: "DEVELOPER" });
    currentSubtaskDoc = createMockWorkItemDoc({
      _id: mockSubtaskId,
      projectId: mockProjectId,
      parentId: mockSubtaskParentId,
      title: "Before Dispatcher Update",
      status: "TODO",
    });
    currentSubtaskParentDoc = {
      _id: mockSubtaskParentId,
      projectId: mockProjectId,
      parentId: null,
      status: "TODO",
      deletedAt: null,
    };

    const res = await updateWorkItem(mockProjectId, mockSubtaskId, mockUserId, {
      title: "Updated via Dispatcher",
    });

    assert(
      res.title === "Updated via Dispatcher" && res.saved === true,
      "5.14: Dispatcher updateWorkItem tự động phân loại và cập nhật Subtask thành công",
    );
  } catch (e: any) {
    assert(false, "5.14: Dispatcher updateWorkItem", e.message);
  }

  // ============================================================================
  // SUITE 6: Subtask Deletion Service (deleteChildWorkItem & deleteWorkItem)
  // ============================================================================
  log(
    "\n--- SUITE 6: Subtask Deletion Service (deleteChildWorkItem & deleteWorkItem) ---",
  );

  const mockDeleteSubtaskId = new mongoose.Types.ObjectId().toString();
  const mockDeleteParentId = new mongoose.Types.ObjectId().toString();

  let currentDeleteSubtaskDoc: any = null;
  let currentDeleteParentDoc: any = null;

  const setupDeleteSubtaskMocks = (
    userRole: { scrumRole?: string; accessRole?: string } = {
      scrumRole: "DEVELOPER",
    },
    projectStatus: string = "ACTIVE",
  ) => {
    (ProjectModel as any).findById = () => ({
      lean: async () =>
        projectStatus ? { _id: mockProjectId, status: projectStatus } : null,
    });

    (MembershipModel as any).findOne = (q: any) => ({
      lean: async () => {
        if (q.userId === mockUserId) {
          if (q.scrumRole && q.scrumRole !== userRole.scrumRole) {
            return null;
          }
          return {
            userId: mockUserId,
            projectId: mockProjectId,
            status: "ACTIVE",
            ...userRole,
          };
        }
        return null;
      },
    });

    (WorkItemModel as any).findOne = (q: any) => {
      let doc: any = null;
      if (q && q._id === mockDeleteSubtaskId) {
        doc = currentDeleteSubtaskDoc;
      } else if (q && q._id === mockDeleteParentId) {
        doc = currentDeleteParentDoc;
      }
      return {
        then(resolve: any, reject?: any) {
          return Promise.resolve(doc).then(resolve, reject);
        },
        lean() {
          return Promise.resolve(doc);
        },
        select(_fields: string) {
          return {
            lean: async () => doc,
          };
        },
      };
    };
  };

  // 6.1 Project không tồn tại
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" }, "");
    let err: any = null;
    try {
      await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Project not found",
      "6.1: Báo lỗi 404 khi Project không tồn tại",
    );
  } catch (e: any) {
    assert(false, "6.1: Project không tồn tại", e.message);
  }

  // 6.2 Project bị ARCHIVED
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" }, "ARCHIVED");
    let err: any = null;
    try {
      await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 409 && err.message.includes("Archived"),
      "6.2: Báo lỗi 409 khi Project ở trạng thái ARCHIVED",
    );
  } catch (e: any) {
    assert(false, "6.2: Project ARCHIVED", e.message);
  }

  // 6.3 Chỉ Developer mới được xóa Subtask (PO xóa -> 403 Forbidden)
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    let err: any = null;
    try {
      await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 403 && err.message.includes("Only Developers"),
      "6.3: Chỉ Developer mới được xóa Subtask (PO xóa -> 403 Forbidden)",
    );
  } catch (e: any) {
    assert(false, "6.3: PO xóa subtask", e.message);
  }

  // 6.4 Báo lỗi 404 khi Subtask không tồn tại hoặc đã bị xóa
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = null;
    let err: any = null;
    try {
      await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Work item not found",
      "6.4: Báo lỗi 404 khi Subtask không tồn tại hoặc đã bị xóa",
    );
  } catch (e: any) {
    assert(false, "6.4: Subtask không tồn tại", e.message);
  }

  // 6.5 Chặn xóa khi itemId truyền vào là Independent item (parentId === null) -> 400
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: null,
      title: "Story Item",
      deletedAt: null,
    });
    let err: any = null;
    try {
      await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 400 && err.message.includes("not a subtask"),
      "6.5: Chặn xóa khi itemId truyền vào là Independent item (parentId === null) -> 400",
    );
  } catch (e: any) {
    assert(false, "6.5: Item không phải subtask", e.message);
  }

  // 6.6 Parent của Subtask không tồn tại hoặc đã bị xóa -> 404
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: mockDeleteParentId,
      title: "Subtask",
      deletedAt: null,
    });
    currentDeleteParentDoc = null; // Parent đã bị xóa
    let err: any = null;
    try {
      await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Parent work item not found",
      "6.6: Báo lỗi 404 khi Parent của Subtask không tồn tại hoặc đã bị xóa",
    );
  } catch (e: any) {
    assert(false, "6.6: Parent không tồn tại", e.message);
  }

  // 6.7 Xóa Subtask thành công (gán deletedAt và lưu DB) ở bất kỳ status nào
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: mockDeleteParentId,
      title: "Subtask to Delete",
      status: "IN_PROGRESS",
      deletedAt: null,
    });
    currentDeleteParentDoc = {
      _id: mockDeleteParentId,
      projectId: mockProjectId,
      parentId: null,
      status: "TODO",
      deletedAt: null,
    };

    const res = await deleteChildWorkItem(
      mockProjectId,
      mockDeleteSubtaskId,
      mockUserId,
    );

    assert(
      res === true &&
        currentDeleteSubtaskDoc.deletedAt instanceof Date &&
        currentDeleteSubtaskDoc.saved === true,
      "6.7: Xóa Subtask thành công (gán deletedAt là Date và lưu DB) ở bất kỳ status nào",
    );
  } catch (e: any) {
    assert(false, "6.7: Xóa subtask thành công", e.message);
  }

  // 6.8 Tính độc lập khi xóa: Xóa Subtask không làm ảnh hưởng hay thay đổi parent
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: mockDeleteParentId,
      title: "Subtask to Delete",
      status: "DONE",
      deletedAt: null,
    });
    currentDeleteParentDoc = {
      _id: mockDeleteParentId,
      projectId: mockProjectId,
      parentId: null,
      status: "TODO",
      deletedAt: null,
    };

    await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);

    assert(
      currentDeleteParentDoc.deletedAt === null &&
        currentDeleteParentDoc.status === "TODO",
      "6.8: Tính độc lập khi xóa: Xóa Subtask không ảnh hưởng đến Parent (status và deletedAt giữ nguyên)",
    );
  } catch (e: any) {
    assert(false, "6.8: Xóa subtask không ảnh hưởng parent", e.message);
  }

  // 6.9 Dispatcher deleteWorkItem tự động phân loại và xóa Subtask thành công
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: mockDeleteParentId,
      title: "Subtask via Dispatcher",
      deletedAt: null,
    });
    currentDeleteParentDoc = {
      _id: mockDeleteParentId,
      projectId: mockProjectId,
      parentId: null,
      deletedAt: null,
    };

    const res = await deleteWorkItem(
      mockProjectId,
      mockDeleteSubtaskId,
      mockUserId,
    );

    assert(
      res === true &&
        currentDeleteSubtaskDoc.deletedAt instanceof Date &&
        currentDeleteSubtaskDoc.saved === true,
      "6.9: Dispatcher deleteWorkItem tự động phân loại và xóa Subtask thành công",
    );
  } catch (e: any) {
    assert(false, "6.9: Dispatcher deleteWorkItem", e.message);
  }

  // 6.10 Dispatcher deleteWorkItem: Chặn khi Product Owner cố xóa Subtask -> 403 Forbidden
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: mockDeleteParentId,
      title: "Subtask",
      deletedAt: null,
    });
    currentDeleteParentDoc = {
      _id: mockDeleteParentId,
      projectId: mockProjectId,
      parentId: null,
      deletedAt: null,
    };

    let err: any = null;
    try {
      await deleteWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);
    } catch (e: any) {
      err = e;
    }

    assert(
      err && err.status === 403 && err.message.includes("Only Developers"),
      "6.10: Dispatcher deleteWorkItem: Chặn khi PO cố xóa Subtask -> 403 Forbidden",
    );
  } catch (e: any) {
    assert(false, "6.10: Dispatcher PO xóa subtask", e.message);
  }

  // 6.11 Dispatcher deleteWorkItem: Tự động phân loại và xóa Independent Item thành công bởi PO
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: null, // Independent item
      title: "Independent Story",
      sprintId: null,
      deletedAt: null,
    });

    const res = await deleteWorkItem(
      mockProjectId,
      mockDeleteSubtaskId,
      mockUserId,
    );

    assert(
      res === true &&
        currentDeleteSubtaskDoc.deletedAt instanceof Date &&
        currentDeleteSubtaskDoc.saved === true,
      "6.11: Dispatcher deleteWorkItem: Tự động phân loại và xóa Independent Item thành công bởi PO",
    );
  } catch (e: any) {
    assert(false, "6.11: Dispatcher independent delete", e.message);
  }

  // 6.12 deleteIndependentWorkItem: Chặn khi Developer cố xóa Independent Item -> 403 Forbidden
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: null,
      title: "Independent Story",
      sprintId: null,
      deletedAt: null,
    });

    let err: any = null;
    try {
      await deleteIndependentWorkItem(
        mockProjectId,
        mockDeleteSubtaskId,
        mockUserId,
      );
    } catch (e: any) {
      err = e;
    }

    assert(
      err &&
        err.status === 403 &&
        err.message.includes("Only Product Owner can delete"),
      "6.12: Chặn khi Developer cố xóa Independent Item -> 403 Forbidden",
    );
  } catch (e: any) {
    assert(false, "6.12: Dev delete independent item", e.message);
  }

  // 6.13 deleteIndependentWorkItem: Chặn xóa khi Independent Item đang nằm trong Sprint ACTIVE -> 409 Conflict
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    const activeSprintId = new mongoose.Types.ObjectId().toString();
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: null,
      title: "Independent Story in Active Sprint",
      sprintId: activeSprintId,
      deletedAt: null,
    });
    (SprintModel as any).findById = () => ({
      lean: async () => ({ _id: activeSprintId, status: "ACTIVE" }),
    });

    let err: any = null;
    try {
      await deleteIndependentWorkItem(
        mockProjectId,
        mockDeleteSubtaskId,
        mockUserId,
      );
    } catch (e: any) {
      err = e;
    }

    assert(
      err && err.status === 409 && err.message.includes("ACTIVE sprint"),
      "6.13: Chặn xóa Independent Item đang nằm trong Sprint ACTIVE -> 409 Conflict",
    );
  } catch (e: any) {
    assert(false, "6.13: Active sprint delete block", e.message);
  }

  // 6.14 deleteIndependentWorkItem: Gỡ sprintId về null khi xóa Independent Item đang trong Sprint DRAFT
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    const draftSprintId = new mongoose.Types.ObjectId().toString();
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: null,
      title: "Independent Story in Draft Sprint",
      sprintId: draftSprintId,
      deletedAt: null,
    });
    (SprintModel as any).findById = () => ({
      lean: async () => ({ _id: draftSprintId, status: "DRAFT" }),
    });

    const res = await deleteIndependentWorkItem(
      mockProjectId,
      mockDeleteSubtaskId,
      mockUserId,
    );

    assert(
      res === true &&
        currentDeleteSubtaskDoc.sprintId === null &&
        currentDeleteSubtaskDoc.deletedAt instanceof Date &&
        currentDeleteSubtaskDoc.saved === true,
      "6.14: Xóa Independent Item trong Sprint DRAFT tự động gỡ sprintId về null",
    );
  } catch (e: any) {
    assert(false, "6.14: Draft sprint unlink on delete", e.message);
  }

  // ============================================================================
  // SUITE 7: Get Work Item List Service (getWorkItems)
  // ============================================================================
  log("\n--- SUITE 7: Get Work Item List Service (getWorkItems) ---");

  // 7.1 Lấy danh sách Independent Work Items (parentId mặc định = null), sắp xếp theo orderIndex và _id
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    let capturedQuery: any = null;
    let capturedSort: any = null;
    const mockList = [{ _id: "item1" }, { _id: "item2" }];
    (WorkItemModel as any).find = (q: any) => {
      capturedQuery = q;
      return {
        sort: async (s: any) => {
          capturedSort = s;
          return mockList;
        },
      };
    };

    const result = await getWorkItems(mockProjectId, mockUserId);
    assert(
      result === mockList &&
        capturedQuery.projectId === mockProjectId &&
        capturedQuery.parentId === null &&
        capturedQuery.deletedAt === null &&
        capturedSort.orderIndex === 1 &&
        capturedSort._id === 1,
      "7.1: Lấy danh sách Independent Items (parentId = null) và sort theo orderIndex, _id",
    );
  } catch (e: any) {
    assert(false, "7.1: List independent items", e.message);
  }

  // 7.2 Lấy danh sách Subtasks theo parentId hợp lệ
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteParentDoc = {
      _id: mockDeleteParentId,
      projectId: mockProjectId,
      parentId: null,
      deletedAt: null,
    };
    let capturedQuery: any = null;
    const mockSubtasks = [{ _id: "sub1" }];
    (WorkItemModel as any).find = (q: any) => {
      capturedQuery = q;
      return {
        sort: async () => mockSubtasks,
      };
    };

    const result = await getWorkItems(
      mockProjectId,
      mockUserId,
      mockDeleteParentId,
    );
    assert(
      result === mockSubtasks &&
        capturedQuery.parentId === mockDeleteParentId &&
        capturedQuery.deletedAt === null,
      "7.2: Lấy danh sách Subtasks theo parentId hợp lệ",
    );
  } catch (e: any) {
    assert(false, "7.2: List child items", e.message);
  }

  // 7.3 Báo lỗi 404 khi parentId không tồn tại hoặc đã bị xóa
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteParentDoc = null;
    let err: any = null;
    try {
      await getWorkItems(mockProjectId, mockUserId, mockDeleteParentId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message.includes("Parent work item"),
      "7.3: Báo lỗi 404 khi truyền parentId không tồn tại hoặc đã bị xóa",
    );
  } catch (e: any) {
    assert(false, "7.3: Missing parent on list", e.message);
  }

  // 7.4 Báo lỗi 400 khi parentId trỏ tới một Subtask thay vì Independent Item
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteParentDoc = {
      _id: mockDeleteParentId,
      projectId: mockProjectId,
      parentId: new mongoose.Types.ObjectId(), // Không phải independent item
      deletedAt: null,
    };
    let err: any = null;
    try {
      await getWorkItems(mockProjectId, mockUserId, mockDeleteParentId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 400 &&
        err.message.includes("independent work item"),
      "7.4: Báo lỗi 400 khi parentId trỏ tới một Subtask thay vì Independent Item",
    );
  } catch (e: any) {
    assert(false, "7.4: Child as parent on list", e.message);
  }

  // ============================================================================
  // SUITE 8: Reorder Work Items Service (reorderWorkItems)
  // ============================================================================
  log("\n--- SUITE 8: Reorder Work Items Service (reorderWorkItems) ---");

  // 8.1 Chặn khi Developer cố sắp xếp lại thứ tự Backlog -> 403 Forbidden
  try {
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    let err: any = null;
    try {
      await reorderWorkItems(mockProjectId, mockUserId, {
        itemIds: ["id1", "id2"],
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 403 &&
        err.message.includes("Only Product Owner can reorder"),
      "8.1: Chặn khi Developer cố sắp xếp lại thứ tự Work Items -> 403 Forbidden",
    );
  } catch (e: any) {
    assert(false, "8.1: Dev reorder block", e.message);
  }

  // 8.2 Chặn khi itemIds có ít hơn 2 phần tử hoặc trùng lặp -> 400
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    let errLessThan2: any = null;
    let errDuplicate: any = null;
    try {
      await reorderWorkItems(mockProjectId, mockUserId, {
        itemIds: ["id1"],
      });
    } catch (e: any) {
      errLessThan2 = e;
    }
    try {
      await reorderWorkItems(mockProjectId, mockUserId, {
        itemIds: ["id1", "id1"],
      });
    } catch (e: any) {
      errDuplicate = e;
    }
    assert(
      errLessThan2?.status === 400 && errDuplicate?.status === 400,
      "8.2: Chặn khi itemIds có ít hơn 2 phần tử hoặc chứa ID trùng lặp -> 400",
    );
  } catch (e: any) {
    assert(false, "8.2: Invalid itemIds array", e.message);
  }

  // 8.3 Báo lỗi 409 khi tập hợp itemIds không khớp với toàn bộ live independent items của project
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    const itemA = createMockWorkItemDoc({ _id: "idA", orderIndex: 0 });
    const itemB = createMockWorkItemDoc({ _id: "idB", orderIndex: 1 });
    const itemC = createMockWorkItemDoc({ _id: "idC", orderIndex: 2 });
    (WorkItemModel as any).find = async () => [itemA, itemB, itemC];

    let err: any = null;
    try {
      await reorderWorkItems(mockProjectId, mockUserId, {
        itemIds: ["idA", "idB"], // Thiếu idC
      });
    } catch (e: any) {
      err = e;
    }
    assert(
      err &&
        err.status === 409 &&
        err.message.includes("every live independent work item"),
      "8.3: Báo lỗi 409 khi tập hợp itemIds thiếu hoặc lệch với live independent items",
    );
  } catch (e: any) {
    assert(false, "8.3: Order set mismatch 409", e.message);
  }

  // 8.4 Sắp xếp lại thứ tự thành công và cập nhật đúng orderIndex
  try {
    setupDeleteSubtaskMocks({ scrumRole: "PRODUCT_OWNER" });
    const itemA = createMockWorkItemDoc({ _id: "idA", orderIndex: 0 });
    const itemB = createMockWorkItemDoc({ _id: "idB", orderIndex: 1 });
    const itemC = createMockWorkItemDoc({ _id: "idC", orderIndex: 2 });
    (WorkItemModel as any).find = async () => [itemA, itemB, itemC];

    const reordered = await reorderWorkItems(mockProjectId, mockUserId, {
      itemIds: ["idC", "idA", "idB"],
    });

    const success =
      reordered.length === 3 &&
      reordered[0]._id === "idC" &&
      itemC.orderIndex === 0 &&
      itemC.saved === true &&
      reordered[1]._id === "idA" &&
      itemA.orderIndex === 1 &&
      itemA.saved === true &&
      reordered[2]._id === "idB" &&
      itemB.orderIndex === 2 &&
      itemB.saved === true;

    assert(
      success,
      "8.4: Sắp xếp lại thứ tự thành công và cập nhật chuẩn xác orderIndex (0, 1, 2)",
    );
  } catch (e: any) {
    assert(false, "8.4: Reorder success", e.message);
  }

  // ============================================================================
  // SUITE 7: View Work Item Activity (getWorkItemActivity & ActivityEventModel)
  // ============================================================================
  log(
    "\n--- SUITE 7: View Work Item Activity (getWorkItemActivity & ActivityEventModel) ---",
  );

  const origFindActivity = ActivityEventModel.find;
  const origSaveActivityProto = ActivityEventModel.prototype.save;
  const origFindUser = UserModel.find;

  const mockParentItemId = new mongoose.Types.ObjectId().toString();
  const mockSubtask1Id = new mongoose.Types.ObjectId().toString();
  const mockSubtask2Id = new mongoose.Types.ObjectId().toString();
  const mockActor1Id = new mongoose.Types.ObjectId().toString();
  const mockActor2Id = new mongoose.Types.ObjectId().toString();

  // 7.1 ActivityEventModel Validation & toJSON Transform
  try {
    const validEvent = new ActivityEventModel({
      projectId: mockProjectId,
      actorId: mockActor1Id,
      workItemId: mockParentItemId,
      actionType: "STATUS_CHANGED",
      oldValue: { status: "TODO" },
      newValue: { status: "IN_PROGRESS" },
    });
    let validationErr: any = null;
    try {
      await validEvent.validate();
    } catch (e: any) {
      validationErr = e;
    }
    const json = validEvent.toJSON() as any;

    const blankActionEvent = new ActivityEventModel({
      projectId: mockProjectId,
      actorId: mockActor1Id,
      actionType: "   ",
    });
    let blankErr: any = null;
    try {
      await blankActionEvent.validate();
    } catch (e: any) {
      blankErr = e;
    }

    assert(
      !validationErr &&
        typeof json.id === "string" &&
        json._id === undefined &&
        json.__v === undefined &&
        blankErr !== null,
      "7.1: ActivityEventModel: Validate schema hợp lệ, chặn actionType rỗng và chuẩn hóa toJSON (id thay cho _id)",
    );
  } catch (e: any) {
    assert(false, "7.1: ActivityEventModel validation", e.message);
  }

  // 7.2 Báo lỗi 404 khi Project không tồn tại
  try {
    (ProjectModel as any).findById = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await getWorkItemActivity(mockProjectId, mockParentItemId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Project not found",
      "7.2: Báo lỗi 404 khi Project không tồn tại",
    );
  } catch (e: any) {
    assert(false, "7.2: Project không tồn tại", e.message);
  }

  // 7.3 Báo lỗi 403 khi User không phải thành viên ACTIVE của dự án
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({ lean: async () => null });
    let err: any = null;
    try {
      await getWorkItemActivity(mockProjectId, mockParentItemId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 403 && err.message.includes("not an active member"),
      "7.3: Báo lỗi 403 khi User không phải là thành viên ACTIVE của dự án",
    );
  } catch (e: any) {
    assert(false, "7.3: User không phải active member", e.message);
  }

  // 7.4 Báo lỗi 404 khi WorkItem không tồn tại hoặc đã bị xóa mềm
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (MembershipModel as any).findOne = () => ({
      lean: async () => ({
        userId: mockUserId,
        projectId: mockProjectId,
        status: "ACTIVE",
        scrumRole: "DEVELOPER",
      }),
    });
    (WorkItemModel as any).findOne = () => ({ lean: async () => null });

    let err: any = null;
    try {
      await getWorkItemActivity(mockProjectId, mockParentItemId, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Work item not found",
      "7.4: Báo lỗi 404 khi WorkItem không tồn tại hoặc đã bị xóa mềm",
    );
  } catch (e: any) {
    assert(false, "7.4: WorkItem không tồn tại", e.message);
  }

  // 7.5 Báo lỗi 404 khi xem Activity của Subtask nhưng Parent đã bị xóa mềm
  try {
    (WorkItemModel as any).findOne = (q: any) => ({
      lean: async () => {
        if (q._id === mockSubtask1Id) {
          return {
            _id: mockSubtask1Id,
            projectId: mockProjectId,
            parentId: mockParentItemId,
            key: "TASK-1",
            deletedAt: null,
          };
        }
        // Parent trả về null (đã bị xóa mềm)
        return null;
      },
    });

    let err: any = null;
    try {
      await getWorkItemActivity(mockProjectId, mockSubtask1Id, mockUserId);
    } catch (e: any) {
      err = e;
    }
    assert(
      err && err.status === 404 && err.message === "Work item not found",
      "7.5: Báo lỗi 404 khi xem Activity của Subtask có Parent đã bị xóa mềm",
    );
  } catch (e: any) {
    assert(false, "7.5: Subtask có Parent bị xóa mềm", e.message);
  }

  // 7.6 Dự án ở trạng thái ARCHIVED vẫn cho phép xem lịch sử (Read-only 200 OK) và trả về mảng rỗng khi chưa có sự kiện
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ARCHIVED" }),
    });
    (WorkItemModel as any).findOne = () => ({
      lean: async () => ({
        _id: mockParentItemId,
        projectId: mockProjectId,
        parentId: null,
        key: "STORY-1",
        deletedAt: null,
      }),
    });
    (WorkItemModel as any).find = () => ({
      select: () => ({ lean: async () => [] }),
    });
    (ActivityEventModel as any).find = () => ({
      sort: () => ({ lean: async () => [] }),
    });

    const result = await getWorkItemActivity(
      mockProjectId,
      mockParentItemId,
      mockUserId,
    );
    assert(
      Array.isArray(result) && result.length === 0,
      "7.6: Cho phép xem lịch sử trên dự án ARCHIVED (read-only) và trả về [] khi chưa có hoạt động",
    );
  } catch (e: any) {
    assert(false, "7.6: Dự án ARCHIVED & empty activity", e.message);
  }

  // 7.7 Xem lịch sử của Independent Work Item: Bao gồm cả thay đổi của chính nó (status, assignee, dates, comment) VÀ thay đổi của các Subtask con (kể cả subtask đã bị xóa), kèm đúng workItemId, actor fallback và sắp xếp occurredAt giảm dần -> id tăng dần
  try {
    (ProjectModel as any).findById = () => ({
      lean: async () => ({ _id: mockProjectId, status: "ACTIVE" }),
    });
    (WorkItemModel as any).findOne = () => ({
      lean: async () => ({
        _id: mockParentItemId,
        projectId: mockProjectId,
        parentId: null,
        key: "STORY-10",
        title: "Checkout flow",
        deletedAt: null,
      }),
    });
    (WorkItemModel as any).find = () => ({
      select: () => ({
        lean: async () => [
          {
            _id: mockSubtask1Id,
            key: "TASK-101",
            title: "Build UI",
            parentId: mockParentItemId,
          },
          {
            _id: mockSubtask2Id,
            key: "TASK-102",
            title: "Write unit tests",
            parentId: mockParentItemId,
          },
        ],
      }),
    });

    (ActivityEventModel as any).find = () => ({
      sort: () => ({
        lean: async () => [
          {
            _id: "evt_001",
            projectId: mockProjectId,
            actorId: mockActor1Id,
            workItemId: mockParentItemId,
            actionType: "WORK_ITEM_CREATED",
            oldValue: null,
            newValue: null,
            createdAt: new Date("2026-11-01T08:00:00.000Z"),
          },
          {
            _id: "evt_003",
            projectId: mockProjectId,
            actorId: mockActor1Id,
            workItemId: mockSubtask1Id,
            actionType: "SUBTASK_CREATED",
            oldValue: null,
            newValue: { key: "TASK-101", title: "Build UI" },
            createdAt: new Date("2026-11-02T10:00:00.000Z"),
          },
          {
            _id: "evt_002",
            projectId: mockProjectId,
            actorId: mockActor2Id,
            workItemId: mockParentItemId,
            actionType: "STATUS_CHANGED",
            oldValue: { status: "TODO" },
            newValue: { status: "IN_PROGRESS" },
            createdAt: new Date("2026-11-02T10:00:00.000Z"), // Cùng thời điểm với evt_003 để test tie-break theo id tăng dần
          },
          {
            _id: "evt_004",
            projectId: mockProjectId,
            actorId: mockActor2Id,
            workItemId: mockSubtask1Id,
            actionType: "STATUS_CHANGED",
            oldValue: { status: "TODO" },
            newValue: { status: "DONE" },
            createdAt: new Date("2026-11-03T09:00:00.000Z"),
          },
          {
            _id: "evt_005",
            projectId: mockProjectId,
            actorId: mockActor1Id,
            workItemId: mockParentItemId,
            actionType: "COMMENT_CREATED",
            oldValue: null,
            newValue: { content: "Looks good!" },
            createdAt: new Date("2026-11-04T11:30:00.000Z"),
          },
          {
            _id: "evt_006",
            projectId: mockProjectId,
            actorId: mockActor2Id,
            workItemId: mockSubtask2Id,
            actionType: "SUBTASK_DELETED",
            oldValue: { key: "TASK-102", title: "Write unit tests" },
            newValue: null,
            createdAt: new Date("2026-11-05T15:00:00.000Z"),
          },
        ],
      }),
    });

    (UserModel as any).find = () => ({
      select: () => ({
        lean: async () => [
          {
            _id: mockActor1Id,
            fullName: "Nguyen Van A",
            passwordHash: "secret_hash_should_not_leak",
          },
          // mockActor2Id không có fullName để kiểm tra neutral fallback "Unknown member"
          {
            _id: mockActor2Id,
            email: "dev2@example.com",
            passwordHash: "secret_hash_2",
          },
        ],
      }),
    });

    const history = await getWorkItemActivity(
      mockProjectId,
      mockParentItemId,
      mockUserId,
    );

    const idsInOrder = history.map((e) => e.id);
    const expectedOrder = [
      "evt_006",
      "evt_005",
      "evt_004",
      "evt_002",
      "evt_003",
      "evt_001",
    ];

    const evtSubtaskDeleted = history[0];
    const evtComment = history[1];
    const evtSubtaskStatus = history[2];
    const evtParentStatus = history[3];
    const evtSubtaskCreated = history[4];
    const evtParentCreated = history[5];

    const noPasswordLeak = history.every(
      (item: any) => !("passwordHash" in (item.actor as any)),
    );

    assert(
      history.length === 6 &&
        JSON.stringify(idsInOrder) === JSON.stringify(expectedOrder) &&
        evtSubtaskDeleted?.workItemId === mockSubtask2Id &&
        evtSubtaskDeleted?.summary === "deleted subtask TASK-102" &&
        evtSubtaskDeleted?.actor.fullName === "Unknown member" &&
        evtComment?.summary === "added a comment" &&
        evtComment?.actor.fullName === "Nguyen Van A" &&
        evtSubtaskStatus?.workItemId === mockSubtask1Id &&
        evtSubtaskStatus?.summary ===
          "changed status of TASK-101 from To do to Done" &&
        evtSubtaskStatus?.changes?.[0]?.field === "status" &&
        evtSubtaskStatus?.changes?.[0]?.before === "TODO" &&
        evtSubtaskStatus?.changes?.[0]?.after === "DONE" &&
        evtParentStatus?.workItemId === mockParentItemId &&
        evtParentStatus?.summary ===
          "changed status from To do to In progress" &&
        evtSubtaskCreated?.workItemId === mockSubtask1Id &&
        evtSubtaskCreated?.summary === "created subtask TASK-101" &&
        evtParentCreated?.summary === "created this item" &&
        noPasswordLeak,
      "7.7: Lịch sử của Independent Item gộp đúng sự kiện của cả Parent và Subtask (có workItemId riêng), sắp xếp chuẩn (occurredAt desc, id asc), fallback 'Unknown member' và không lộ passwordHash",
    );
  } catch (e: any) {
    assert(false, "7.7: Full parent & subtask activity history", e.message);
  }

  // 7.8 Xem lịch sử trực tiếp trên một Subtask còn sống: Chỉ truy vấn lịch sử của chính Subtask đó
  try {
    let queriedWorkItemIds: any[] = [];
    (WorkItemModel as any).findOne = (q: any) => ({
      lean: async () => {
        if (q._id === mockSubtask1Id) {
          return {
            _id: mockSubtask1Id,
            projectId: mockProjectId,
            parentId: mockParentItemId,
            key: "TASK-101",
            deletedAt: null,
          };
        }
        if (q._id === mockParentItemId) {
          return {
            _id: mockParentItemId,
            projectId: mockProjectId,
            parentId: null,
            key: "STORY-10",
            deletedAt: null,
          };
        }
        return null;
      },
    });
    (ActivityEventModel as any).find = (q: any) => {
      queriedWorkItemIds = q.workItemId?.$in ?? [];
      return {
        sort: () => ({
          lean: async () => [
            {
              _id: "evt_sub_1",
              projectId: mockProjectId,
              actorId: mockActor1Id,
              workItemId: mockSubtask1Id,
              actionType: "SUBTASK_UPDATED",
              oldValue: { startDate: null, dueDate: null },
              newValue: { startDate: "2026-11-01", dueDate: "2026-11-05" },
              createdAt: new Date("2026-11-03T10:00:00.000Z"),
            },
          ],
        }),
      };
    };

    const subHistory = await getWorkItemActivity(
      mockProjectId,
      mockSubtask1Id,
      mockUserId,
    );

    assert(
      queriedWorkItemIds.length === 1 &&
        String(queriedWorkItemIds[0]) === mockSubtask1Id &&
        subHistory.length === 1 &&
        subHistory[0]?.workItemId === mockSubtask1Id &&
        subHistory[0]?.changes?.length === 2,
      "7.8: Xem lịch sử trực tiếp của Subtask: Kiểm tra Parent còn sống và chỉ trả về sự kiện của Subtask đó",
    );
  } catch (e: any) {
    assert(false, "7.8: Subtask direct activity history", e.message);
  }

  // 7.9 Tự động ghi nhận ActivityEvent khi Tạo, Cập nhật, Xóa Subtask và Cập nhật Independent Item
  try {
    const recordedEvents: any[] = [];
    ActivityEventModel.prototype.save = async function (this: any) {
      recordedEvents.push(this);
      return this;
    };
    WorkItemModel.prototype.save = async function (this: any) {
      this.saved = true;
      return this;
    };
    (WorkItemModel as any).countDocuments = async () => 2;

    // 1) Update Independent Item (thay đổi status)
    setupBaseMocks({ scrumRole: "DEVELOPER" }, { status: "TODO" });
    await updateIndependentWorkItem(mockProjectId, mockItemId, mockUserId, {
      status: "IN_PROGRESS",
    });

    // 2) Create Subtask
    setupSubtaskMocks({ scrumRole: "DEVELOPER" });
    await createChildWorkItem(mockProjectId, mockUserId, {
      parentId: mockParentId,
      title: "Subtask with Activity",
    });

    // 3) Delete Subtask
    setupDeleteSubtaskMocks({ scrumRole: "DEVELOPER" });
    currentDeleteSubtaskDoc = createMockWorkItemDoc({
      _id: mockDeleteSubtaskId,
      projectId: mockProjectId,
      parentId: mockDeleteParentId,
      key: "TASK-DEL",
      title: "Subtask to delete",
      deletedAt: null,
    });
    currentDeleteParentDoc = {
      _id: mockDeleteParentId,
      projectId: mockProjectId,
      parentId: null,
      deletedAt: null,
    };
    await deleteChildWorkItem(mockProjectId, mockDeleteSubtaskId, mockUserId);

    assert(
      recordedEvents.length === 3 &&
        recordedEvents[0].actionType === "STATUS_CHANGED" &&
        recordedEvents[0].oldValue?.status === "TODO" &&
        recordedEvents[0].newValue?.status === "IN_PROGRESS" &&
        recordedEvents[1].actionType === "SUBTASK_CREATED" &&
        recordedEvents[2].actionType === "SUBTASK_DELETED" &&
        recordedEvents[2].oldValue?.key === "TASK-DEL",
      "7.9: Tự động lưu bản ghi ActivityEvent khi cập nhật WorkItem, tạo Subtask và xóa Subtask",
    );
  } catch (e: any) {
    assert(false, "7.9: Auto-record ActivityEvent on mutations", e.message);
  } finally {
    ActivityEventModel.prototype.save = origSaveActivityProto;
    WorkItemModel.prototype.save = origSaveProto;
    (WorkItemModel as any).countDocuments = origCountDocuments;
    (ActivityEventModel as any).find = origFindActivity;
    (UserModel as any).find = origFindUser;
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
  log(
    "\n================================================================================",
  );
  log(`  TỔNG KẾT KẾT QUẢ TEST:`);
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
  const logFilePath = path.join(logDir, "work-item.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Toàn bộ kết quả đã được ghi vào file log: ${logFilePath}`);
}

runTests().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
