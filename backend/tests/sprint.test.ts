import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import MembershipModel from "../src/models/membership.ts";
import ProjectModel from "../src/models/project.ts";
import SprintModel from "../src/models/sprint.ts";
import WorkItemModel from "../src/models/workitem.ts";
import {
  compareSprintStart,
  getSprintDetail,
  getSprints,
} from "../src/services/sprints.ts";

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

async function catchError(run: () => Promise<unknown>) {
  try {
    await run();
    return null;
  } catch (e: any) {
    return e;
  }
}

// ObjectId có thứ tự biết trước: id(2) < id(10)
const id = (n: number) =>
  new mongoose.Types.ObjectId(n.toString(16).padStart(24, "0"));

const P = new mongoose.Types.ObjectId().toString(); // projectId
const U = new mongoose.Types.ObjectId().toString(); // userId

const makeSprint = (n: number, extra: Record<string, any> = {}) =>
  new SprintModel({ _id: id(n), projectId: P, name: `Sprint ${n}`, ...extra });

const makeItem = (n: number, sprintId: any, status = "TODO") =>
  new WorkItemModel({
    _id: id(100 + n),
    projectId: P,
    key: `COM-${n}`,
    title: `Item ${n}`,
    workType: "TASK",
    status,
    orderIndex: n,
    sprintId,
  });

// Trạng thái giả lập cho các model; mỗi test gọi setup() để đặt lại
const state: any = {};
function setup(world: Record<string, any> = {}) {
  Object.assign(
    state,
    {
      project: { _id: P, status: "ACTIVE" },
      membership: { userId: U, projectId: P, status: "ACTIVE" },
      sprints: [],
      sprint: null,
      items: [],
      sprintFilter: null,
      itemFilter: null,
      itemSort: null,
      itemQueries: 0,
    },
    world,
  );
}

async function runTests() {
  log("===============================================================");
  log(`  TEST SUITE: SPRINT READ SERVICE & MODEL`);
  log(`  Executed at: ${new Date().toISOString()}`);
  log("===============================================================\n");

  const origFindById = ProjectModel.findById;
  const origFindOneMember = MembershipModel.findOne;
  const origFindSprint = SprintModel.find;
  const origFindOneSprint = SprintModel.findOne;
  const origFindItem = WorkItemModel.find;

  (ProjectModel as any).findById = () => ({ lean: async () => state.project });
  (MembershipModel as any).findOne = () => ({
    lean: async () => state.membership,
  });
  (SprintModel as any).find = (filter: any) => {
    state.sprintFilter = filter;
    return Promise.resolve([...state.sprints]);
  };
  (SprintModel as any).findOne = (filter: any) => {
    state.sprintFilter = filter;
    return Promise.resolve(state.sprint);
  };
  (WorkItemModel as any).find = (filter: any) => {
    state.itemFilter = filter;
    state.itemQueries++;
    return {
      select: () => ({ lean: async () => state.items }),
      sort: async (order: any) => {
        state.itemSort = order;
        return state.items;
      },
    };
  };

  // ============================================================================
  // SUITE 1: getSprints
  // ============================================================================
  log("--- SUITE 1: getSprints ---");

  // 1.1 Project không tồn tại
  try {
    setup({ project: null });
    const err = await catchError(() => getSprints(P, U));
    assert(
      err?.status === 404 && err.message === "Project not found",
      "1.1: Project không tồn tại -> 404",
    );
  } catch (e: any) {
    assert(false, "1.1: List project not found", e.message);
  }

  // 1.2 Không phải thành viên ACTIVE
  try {
    setup({ membership: null });
    const err = await catchError(() => getSprints(P, U));
    assert(
      err?.status === 403,
      "1.2: User không phải thành viên ACTIVE -> 403",
    );
  } catch (e: any) {
    assert(false, "1.2: List non-member", e.message);
  }

  // 1.3 Project đã archive vẫn đọc được
  try {
    setup({
      project: { _id: P, status: "ARCHIVED" },
      sprints: [makeSprint(1)],
    });
    const result = await getSprints(P, U);
    assert(
      result.length === 1,
      "1.3: Project ARCHIVED vẫn xem được danh sách Sprint",
    );
  } catch (e: any) {
    assert(false, "1.3: List archived project", e.message);
  }

  // 1.4 Truy vấn chỉ lấy Sprint chưa xóa của đúng Project
  try {
    setup({ sprints: [makeSprint(1)] });
    await getSprints(P, U);
    assert(
      JSON.stringify(state.sprintFilter) ===
        JSON.stringify({ projectId: P, deletedAt: null }),
      "1.4: Truy vấn lọc theo projectId và deletedAt: null",
    );
  } catch (e: any) {
    assert(false, "1.4: List filter", e.message);
  }

  // 1.5 Bao gồm cả Sprint CLOSED
  try {
    setup({
      sprints: [
        makeSprint(1, { status: "DRAFT" }),
        makeSprint(2, { status: "ACTIVE" }),
        makeSprint(3, { status: "CLOSED" }),
      ],
    });
    const result = await getSprints(P, U);
    assert(
      result.length === 3 &&
        result.some((sprint) => sprint.status === "CLOSED"),
      "1.5: Danh sách gồm cả Sprint CLOSED",
    );
  } catch (e: any) {
    assert(false, "1.5: List includes closed", e.message);
  }

  // 1.6 Thứ tự: startDate giảm dần, chưa có ngày xuống cuối, cùng ngày thì id tăng dần
  try {
    setup({
      sprints: [
        makeSprint(1, { startDate: new Date("2026-10-01") }),
        makeSprint(2, { startDate: new Date("2026-12-01") }),
        makeSprint(3),
        makeSprint(4),
        makeSprint(5, { startDate: new Date("2026-12-01") }),
        makeSprint(6, { startDate: new Date("2026-11-01") }),
      ],
    });
    const result = await getSprints(P, U);
    const expected = [2, 5, 6, 1, 3, 4].map((n) => id(n).toString());
    assert(
      JSON.stringify(result.map((sprint) => sprint.id)) ===
        JSON.stringify(expected),
      "1.6: Sắp xếp: startDate giảm dần, chưa có ngày xuống cuối, cùng ngày id tăng dần",
      JSON.stringify(result.map((sprint) => sprint.id)),
    );
  } catch (e: any) {
    assert(false, "1.6: List order", e.message);
  }

  // 1.7 Đếm itemCount và doneCount từ một truy vấn WorkItem
  try {
    setup({
      sprints: [makeSprint(1), makeSprint(2), makeSprint(3)],
      items: [
        { sprintId: id(1), status: "DONE" },
        { sprintId: id(1), status: "TODO" },
        { sprintId: id(1), status: "IN_PROGRESS" },
        { sprintId: id(2), status: "TODO" },
      ],
    });
    const result = await getSprints(P, U);
    const counts = result.map((sprint) => [sprint.itemCount, sprint.doneCount]);
    assert(
      JSON.stringify(counts) ===
        JSON.stringify([
          [3, 1],
          [1, 0],
          [0, 0],
        ]) && state.itemQueries === 1,
      "1.7: itemCount/doneCount đúng cho từng Sprint, chỉ một truy vấn WorkItem",
      JSON.stringify(counts),
    );
  } catch (e: any) {
    assert(false, "1.7: List counts", e.message);
  }

  // 1.8 Truy vấn item chỉ lấy item độc lập còn sống của Project
  try {
    setup({ sprints: [makeSprint(1), makeSprint(2)] });
    await getSprints(P, U);
    const filter = state.itemFilter;
    assert(
      filter.projectId === P &&
        filter.parentId === null &&
        filter.deletedAt === null &&
        filter.sprintId.$in.length === 2,
      "1.8: Đếm item độc lập (parentId null), chưa xóa, thuộc các Sprint của Project",
    );
  } catch (e: any) {
    assert(false, "1.8: List item filter", e.message);
  }

  // 1.9 Không có Sprint nào -> [] và không truy vấn WorkItem
  try {
    setup({ sprints: [] });
    const result = await getSprints(P, U);
    assert(
      Array.isArray(result) && result.length === 0 && state.itemQueries === 0,
      "1.9: Không có Sprint -> [] và không truy vấn WorkItem",
    );
  } catch (e: any) {
    assert(false, "1.9: List empty", e.message);
  }

  // 1.10 Hình dạng response
  try {
    setup({ sprints: [makeSprint(1, { deletedAt: null })] });
    const [first] = await getSprints(P, U);
    assert(
      typeof first.id === "string" &&
        first.goal === null &&
        !("_id" in first) &&
        !("deletedAt" in first) &&
        typeof first.itemCount === "number" &&
        typeof first.doneCount === "number",
      "1.10: Response có id, goal, itemCount, doneCount; không lộ _id/deletedAt",
    );
  } catch (e: any) {
    assert(false, "1.10: List shape", e.message);
  }

  // 1.11 compareSprintStart
  try {
    const undated = { startDate: null, _id: id(9) };
    const early = { startDate: new Date("2026-10-01"), _id: id(1) };
    const late = { startDate: new Date("2026-12-01"), _id: id(2) };
    const lateLowId = { startDate: new Date("2026-12-01"), _id: id(1) };
    assert(
      compareSprintStart(undated, late) > 0 &&
        compareSprintStart(late, undated) < 0 &&
        compareSprintStart(late, early) < 0 &&
        compareSprintStart(lateLowId, late) < 0 &&
        compareSprintStart(late, late) === 0,
      "1.11: compareSprintStart: mới hơn trước -> chưa có ngày xuống cuối -> cùng ngày id nhỏ hơn trước",
    );
  } catch (e: any) {
    assert(false, "1.11: compareSprintStart", e.message);
  }

  // ============================================================================
  // SUITE 2: getSprintDetail
  // ============================================================================
  log("\n--- SUITE 2: getSprintDetail ---");
  const S = id(1).toString();

  // 2.1 Project không tồn tại
  try {
    setup({ project: null });
    const err = await catchError(() => getSprintDetail(P, S, U));
    assert(err?.status === 404, "2.1: Project không tồn tại -> 404");
  } catch (e: any) {
    assert(false, "2.1: Detail project not found", e.message);
  }

  // 2.2 Không phải thành viên ACTIVE
  try {
    setup({ membership: null, sprint: makeSprint(1) });
    const err = await catchError(() => getSprintDetail(P, S, U));
    assert(
      err?.status === 403,
      "2.2: User không phải thành viên ACTIVE -> 403",
    );
  } catch (e: any) {
    assert(false, "2.2: Detail non-member", e.message);
  }

  // 2.3 Sprint không tồn tại (đã xóa hoặc thuộc Project khác) -> 404
  try {
    setup({ sprint: null });
    const err = await catchError(() => getSprintDetail(P, S, U));
    assert(
      err?.status === 404 &&
        err.message === "Sprint not found" &&
        JSON.stringify(state.sprintFilter) ===
          JSON.stringify({ _id: S, projectId: P, deletedAt: null }),
      "2.3: Sprint không tồn tại/đã xóa/khác Project -> 404; truy vấn lọc _id, projectId, deletedAt",
    );
  } catch (e: any) {
    assert(false, "2.3: Detail sprint not found", e.message);
  }

  // 2.4 Trả Sprint cùng các item, truy vấn và thứ tự item đúng
  try {
    const sprint = makeSprint(1, { status: "ACTIVE" });
    setup({
      sprint,
      items: [makeItem(1, sprint._id), makeItem(2, sprint._id, "DONE")],
    });
    const result = await getSprintDetail(P, S, U);
    const filter = state.itemFilter;
    assert(
      result.id === S &&
        result.items.length === 2 &&
        filter.projectId === P &&
        String(filter.sprintId) === S &&
        filter.parentId === null &&
        filter.deletedAt === null &&
        JSON.stringify(state.itemSort) ===
          JSON.stringify({ orderIndex: 1, _id: 1 }),
      "2.4: Trả Sprint và item độc lập đang liên kết, sắp xếp orderIndex rồi _id",
    );
  } catch (e: any) {
    assert(false, "2.4: Detail items", e.message);
  }

  // 2.5 Sprint CLOSED vẫn trả các item còn liên kết
  try {
    const sprint = makeSprint(1, { status: "CLOSED" });
    setup({ sprint, items: [makeItem(1, sprint._id, "DONE")] });
    const result = await getSprintDetail(P, S, U);
    assert(
      result.status === "CLOSED" && result.items.length === 1,
      "2.5: Sprint CLOSED vẫn trả các item còn liên kết",
    );
  } catch (e: any) {
    assert(false, "2.5: Detail closed sprint", e.message);
  }

  // 2.6 Sprint chưa có item -> items rỗng
  try {
    setup({ sprint: makeSprint(1), items: [] });
    const result = await getSprintDetail(P, S, U);
    assert(
      Array.isArray(result.items) && result.items.length === 0,
      "2.6: Sprint chưa có item -> items là mảng rỗng",
    );
  } catch (e: any) {
    assert(false, "2.6: Detail no items", e.message);
  }

  // 2.7 Hình dạng response
  try {
    const sprint = makeSprint(1, { deletedAt: null });
    setup({ sprint, items: [makeItem(1, sprint._id)] });
    const result: any = await getSprintDetail(P, S, U);
    assert(
      typeof result.id === "string" &&
        result.goal === null &&
        !("_id" in result) &&
        !("deletedAt" in result) &&
        typeof result.items[0].id === "string" &&
        !("_id" in result.items[0]),
      "2.7: Response có id, goal, items; không lộ _id/deletedAt",
    );
  } catch (e: any) {
    assert(false, "2.7: Detail shape", e.message);
  }

  // 2.8 Project đã archive vẫn đọc được
  try {
    setup({
      project: { _id: P, status: "ARCHIVED" },
      sprint: makeSprint(1),
    });
    const result = await getSprintDetail(P, S, U);
    assert(
      result.id === S,
      "2.8: Project ARCHIVED vẫn xem được chi tiết Sprint",
    );
  } catch (e: any) {
    assert(false, "2.8: Detail archived project", e.message);
  }

  // ============================================================================
  // SUITE 3: Sprint model - goal
  // ============================================================================
  log("\n--- SUITE 3: Sprint model (goal) ---");

  // 3.1 goal mặc định null
  try {
    assert(
      makeSprint(1).goal === null,
      "3.1: SprintModel: goal mặc định là null",
    );
  } catch (e: any) {
    assert(false, "3.1: Sprint goal default", e.message);
  }

  // 3.2 goal được trim
  try {
    assert(
      makeSprint(1, { goal: "  Ship checkout  " }).goal === "Ship checkout",
      "3.2: SprintModel: goal được trim khoảng trắng hai đầu",
    );
  } catch (e: any) {
    assert(false, "3.2: Sprint goal trim", e.message);
  }

  // 3.3 goal xuất hiện trong toJSON
  try {
    const json: any = makeSprint(1, { goal: "Ship checkout" }).toJSON();
    assert(
      json.goal === "Ship checkout",
      "3.3: SprintModel.toJSON: có trường goal",
    );
  } catch (e: any) {
    assert(false, "3.3: Sprint goal toJSON", e.message);
  }

  // Khôi phục các model
  (ProjectModel as any).findById = origFindById;
  (MembershipModel as any).findOne = origFindOneMember;
  (SprintModel as any).find = origFindSprint;
  (SprintModel as any).findOne = origFindOneSprint;
  (WorkItemModel as any).find = origFindItem;

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
  const logFilePath = path.join(logDir, "sprint.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
