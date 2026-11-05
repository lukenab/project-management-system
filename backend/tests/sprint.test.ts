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
  completeSprint,
  createSprint,
  getSprintBlocker,
  getSprintDetail,
  getSprints,
  startSprint,
  updateSprint,
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

async function check(name: string, run: () => Promise<boolean>) {
  try {
    assert(await run(), name);
  } catch (e: any) {
    assert(false, name, e.message);
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
    description: `Description ${n}`,
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
      nameConflict: null,
      overlap: null,
      nameFilter: null,
      overlapFilter: null,
      collation: null,
      saved: null,
      saves: 0,
      otherActive: null,
      otherActiveFilter: null,
      calls: [],
      updateManyArgs: null,
      closeArgs: null,
      closeResult: null,
      closeError: null,
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
  const origSave = SprintModel.prototype.save;
  const origUpdateMany = WorkItemModel.updateMany;
  const origFindOneAndUpdate = SprintModel.findOneAndUpdate;

  (ProjectModel as any).findById = () => ({ lean: async () => state.project });
  (MembershipModel as any).findOne = () => ({
    lean: async () => state.membership,
  });
  (SprintModel as any).find = (filter: any) => {
    state.sprintFilter = filter;
    return Promise.resolve([...state.sprints]);
  };
  // findOne phục vụ 3 mục đích, phân biệt theo hình dạng bộ lọc: tên trùng, chồng lấn, Sprint đích
  (SprintModel as any).findOne = (filter: any) => {
    state.sprintFilter = filter;
    let result = state.sprint;
    if (filter.name !== undefined) {
      state.nameFilter = filter;
      result = state.nameConflict;
    } else if (filter.status === "ACTIVE") {
      state.otherActiveFilter = filter;
      result = state.otherActive;
    } else if (filter.status !== undefined) {
      state.overlapFilter = filter;
      result = state.overlap;
    }
    const promise = Promise.resolve(result);
    return Object.assign(promise, {
      collation: (collation: any) => {
        state.collation = collation;
        return promise;
      },
    });
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
  (SprintModel.prototype as any).save = async function () {
    state.saved = this;
    state.saves++;
    return this;
  };
  (WorkItemModel as any).updateMany = async (filter: any, update: any) => {
    state.calls.push("updateMany");
    state.updateManyArgs = [filter, update];
    return { modifiedCount: 0 };
  };
  (SprintModel as any).findOneAndUpdate = async (
    filter: any,
    update: any,
    options: any,
  ) => {
    state.calls.push("findOneAndUpdate");
    state.closeArgs = [filter, update, options];
    if (state.closeError) throw state.closeError;
    return state.closeResult;
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

  // 3.4 startDate/endDate mặc định null
  await check(
    "3.4: SprintModel: startDate/endDate mặc định null và có trong toJSON",
    async () => {
      const sprint = makeSprint(1);
      const json: any = sprint.toJSON();
      return (
        sprint.startDate === null &&
        sprint.endDate === null &&
        json.startDate === null &&
        json.endDate === null
      );
    },
  );

  // ============================================================================
  // SUITE 4: createSprint
  // ============================================================================
  log("\n--- SUITE 4: createSprint ---");
  const PO = {
    userId: U,
    projectId: P,
    status: "ACTIVE",
    scrumRole: "PRODUCT_OWNER",
    accessRole: "MEMBER",
  };
  const create = (body: any) => createSprint(P, U, body);
  const fails = async (status: number, body: any) => {
    const err = await catchError(() => create(body));
    return err?.status === status && state.saves === 0;
  };
  const failsAll = async (status: number, bodies: any[]) => {
    for (const body of bodies) {
      setup({ membership: PO });
      if (!(await fails(status, body))) return false;
    }
    return true;
  };

  await check("4.1: Developer (không phải PO) tạo Sprint -> 403", async () => {
    setup({ membership: { ...PO, scrumRole: "DEVELOPER" } });
    return fails(403, { name: "Sprint A" });
  });

  await check(
    "4.2: accessRole OWNER không có scrumRole vẫn được tạo (coi như PO)",
    async () => {
      setup({ membership: { ...PO, scrumRole: null, accessRole: "OWNER" } });
      const result = await create({ name: "Sprint A" });
      return result.status === "DRAFT" && state.saves === 1;
    },
  );

  await check(
    "4.3: Project không tồn tại -> 404; ARCHIVED -> 409; không phải thành viên -> 403",
    async () => {
      setup({ project: null, membership: PO });
      const missing = await fails(404, { name: "Sprint A" });
      setup({ project: { _id: P, status: "ARCHIVED" }, membership: PO });
      const archived = await fails(409, { name: "Sprint A" });
      setup({ membership: null });
      const stranger = await fails(403, { name: "Sprint A" });
      return missing && archived && stranger;
    },
  );

  await check("4.4: Body không phải object JSON -> 400", () =>
    failsAll(400, [null, undefined, [], "Sprint A", 42]),
  );

  await check(
    "4.5: Trường không được nhận (status, items, projectId, id) -> 400",
    () =>
      failsAll(400, [
        { name: "A", status: "ACTIVE" },
        { name: "A", items: [] },
        { name: "A", projectId: P },
        { name: "A", id: "x" },
      ]),
  );

  await check("4.6: Tên thiếu, rỗng hoặc không phải chuỗi -> 400", () =>
    failsAll(400, [
      {},
      { name: "" },
      { name: "   " },
      { name: 5 },
      { name: null },
    ]),
  );

  await check("4.7: goal sai kiểu hoặc ngày sai định dạng -> 400", () =>
    failsAll(400, [
      { name: "A", goal: 5 },
      { name: "A", startDate: "tomorrow" },
      { name: "A", startDate: "2026-02-30" },
      { name: "A", endDate: 12345 },
      { name: "A", startDate: "2026-11-02T10:00:00" },
      { name: "A", startDate: "2026-11-02T25:00:00Z" },
      { name: "A", startDate: "2026-11-02T10:00:00+07:00" },
      { name: "A", startDate: "2026-02-29" },
    ]),
  );

  await check(
    "4.8: endDate không sau startDate -> ValidationError, chưa truy vấn tên",
    async () => {
      setup({ membership: PO });
      const err = await catchError(() =>
        create({ name: "A", startDate: "2026-11-15", endDate: "2026-11-01" }),
      );
      return (
        err?.name === "ValidationError" &&
        state.saves === 0 &&
        state.nameFilter === null
      );
    },
  );

  await check("4.9: Sprint dài hơn một tháng -> ValidationError", async () => {
    setup({ membership: PO });
    const err = await catchError(() =>
      create({ name: "A", startDate: "2026-11-01", endDate: "2026-12-10" }),
    );
    return err?.name === "ValidationError" && state.saves === 0;
  });

  await check(
    "4.10: Tên trùng (không phân biệt hoa thường) -> 409; truy vấn có collation strength 2",
    async () => {
      setup({
        membership: PO,
        nameConflict: makeSprint(7, { name: "sprint a" }),
      });
      const err = await catchError(() => create({ name: "  Sprint A  " }));
      return (
        err?.status === 409 &&
        state.saves === 0 &&
        JSON.stringify(state.nameFilter) ===
          JSON.stringify({ projectId: P, deletedAt: null, name: "Sprint A" }) &&
        JSON.stringify(state.collation) ===
          JSON.stringify({ locale: "en", strength: 2 })
      );
    },
  );

  await check(
    "4.11: Ngày chồng lấn Sprint DRAFT/ACTIVE khác -> 409; truy vấn dùng nửa khoảng [start, end)",
    async () => {
      setup({ membership: PO, overlap: makeSprint(7, { name: "Sprint 7" }) });
      const err = await catchError(() =>
        create({
          name: "A",
          startDate: "2026-11-02T00:00:00Z",
          endDate: "2026-11-09T00:00:00Z",
        }),
      );
      const filter = state.overlapFilter;
      return (
        err?.status === 409 &&
        err.message.includes("Sprint 7") &&
        state.saves === 0 &&
        filter.projectId === P &&
        filter.deletedAt === null &&
        JSON.stringify(filter.status) ===
          JSON.stringify({ $in: ["DRAFT", "ACTIVE"] }) &&
        filter.startDate.$lt.toISOString() === "2026-11-09T00:00:00.000Z" &&
        filter.endDate.$gt.toISOString() === "2026-11-02T00:00:00.000Z" &&
        !("_id" in filter)
      );
    },
  );

  await check(
    "4.12: Sprint chưa có ngày -> không kiểm tra chồng lấn, ngày lưu là null",
    async () => {
      setup({ membership: PO });
      const result: any = await create({ name: "Sprint A" });
      return (
        state.overlapFilter === null &&
        state.saved.startDate === null &&
        result.startDate === null &&
        result.endDate === null
      );
    },
  );

  await check(
    "4.13: Tạo thành công: DRAFT, trim tên và goal, ngày được phân tích, không lộ _id/deletedAt",
    async () => {
      setup({ membership: PO });
      const result: any = await create({
        name: "  Sprint 5  ",
        goal: "  Ship checkout ",
        startDate: "2026-11-02T00:00:00Z",
        endDate: "2026-11-09",
      });
      return (
        state.saves === 1 &&
        String(state.saved.projectId) === P &&
        result.status === "DRAFT" &&
        result.name === "Sprint 5" &&
        result.goal === "Ship checkout" &&
        result.startDate.toISOString() === "2026-11-02T00:00:00.000Z" &&
        result.endDate.toISOString() === "2026-11-09T00:00:00.000Z" &&
        Array.isArray(result.items) &&
        result.items.length === 0 &&
        typeof result.id === "string" &&
        !("_id" in result) &&
        !("deletedAt" in result)
      );
    },
  );

  await check(
    "4.14: goal rỗng hoặc toàn khoảng trắng được lưu là null",
    async () => {
      setup({ membership: PO });
      const result: any = await create({ name: "Sprint A", goal: "   " });
      return result.goal === null;
    },
  );

  await check(
    "4.15: Chấp nhận ngày UTC hợp lệ: YYYY-MM-DD, có mili giây, ngày nhuận 29/02",
    async () => {
      setup({ membership: PO });
      const result: any = await create({
        name: "A",
        startDate: "2028-02-29",
        endDate: "2028-03-10T00:00:00.000Z",
      });
      return (
        result.startDate.toISOString() === "2028-02-29T00:00:00.000Z" &&
        result.endDate.toISOString() === "2028-03-10T00:00:00.000Z"
      );
    },
  );

  await check(
    "4.16: Lỗi 400 chỉ rõ field: trường lạ, tên trống, goal sai kiểu, ngày sai",
    async () => {
      const cases: [any, string | undefined][] = [
        [{ name: "A", status: "ACTIVE" }, "status"],
        [{ name: "  " }, "name"],
        [{ name: "A", goal: 5 }, "goal"],
        [{ name: "A", startDate: "2026-02-30" }, "startDate"],
        [{ name: "A", endDate: 12345 }, "endDate"],
        [[], undefined],
      ];
      for (const [body, field] of cases) {
        setup({ membership: PO });
        const err = await catchError(() => create(body));
        if (err?.code !== "VALIDATION_FAILED" || err.field !== field) {
          return false;
        }
      }
      return true;
    },
  );

  await check(
    "4.17: Tên trùng -> CONFLICT field name; ngày chồng lấn -> CONFLICT field startDate",
    async () => {
      setup({
        membership: PO,
        nameConflict: makeSprint(7, { name: "sprint a" }),
      });
      const taken = await catchError(() => create({ name: "Sprint A" }));
      setup({ membership: PO, overlap: makeSprint(7, { name: "Sprint 7" }) });
      const overlap = await catchError(() =>
        create({ name: "A", startDate: "2026-11-02", endDate: "2026-11-09" }),
      );
      return (
        taken?.code === "CONFLICT" &&
        taken.field === "name" &&
        overlap?.code === "CONFLICT" &&
        overlap.field === "startDate"
      );
    },
  );

  await check(
    "4.18: Mã lỗi quyền: NOT_PROJECT_MEMBER, FORBIDDEN, PROJECT_ARCHIVED, NOT_FOUND",
    async () => {
      setup({ membership: null });
      const stranger = await catchError(() => create({ name: "A" }));
      const reader = await catchError(() => getSprints(P, U));
      setup({ membership: { ...PO, scrumRole: "DEVELOPER" } });
      const developer = await catchError(() => create({ name: "A" }));
      setup({ project: { _id: P, status: "ARCHIVED" }, membership: PO });
      const archived = await catchError(() => create({ name: "A" }));
      setup({ project: null, membership: PO });
      const missing = await catchError(() => create({ name: "A" }));
      return (
        stranger?.code === "NOT_PROJECT_MEMBER" &&
        stranger.status === 403 &&
        reader?.code === "NOT_PROJECT_MEMBER" &&
        developer?.code === "FORBIDDEN" &&
        developer.status === 403 &&
        archived?.code === "PROJECT_ARCHIVED" &&
        archived.status === 409 &&
        missing?.code === "NOT_FOUND" &&
        missing.status === 404
      );
    },
  );

  // ============================================================================
  // SUITE 5: updateSprint
  // ============================================================================
  log("\n--- SUITE 5: updateSprint ---");
  const update = (body: any) => updateSprint(P, S, U, body);
  const dated = {
    name: "Sprint 1",
    startDate: new Date("2026-11-02T00:00:00Z"),
    endDate: new Date("2026-11-09T00:00:00Z"),
  };
  const draft = () => makeSprint(1, dated);
  const active = () =>
    makeSprint(1, { ...dated, status: "ACTIVE", goal: "Old goal" });
  const updateFails = async (status: number, body: any) => {
    const err = await catchError(() => update(body));
    return err?.status === status && state.saves === 0;
  };

  await check("5.1: Developer (không phải PO) sửa Sprint -> 403", async () => {
    setup({ membership: { ...PO, scrumRole: "DEVELOPER" }, sprint: draft() });
    return updateFails(403, { name: "X" });
  });

  await check(
    "5.2: Sprint không tồn tại/đã xóa/khác Project -> 404; truy vấn lọc _id, projectId, deletedAt",
    async () => {
      setup({ membership: PO, sprint: null });
      const ok = await updateFails(404, { name: "X" });
      return (
        ok &&
        JSON.stringify(state.sprintFilter) ===
          JSON.stringify({ _id: S, projectId: P, deletedAt: null })
      );
    },
  );

  await check("5.3: Sprint CLOSED chỉ đọc -> 409", async () => {
    setup({
      membership: PO,
      sprint: makeSprint(1, { ...dated, status: "CLOSED" }),
    });
    return updateFails(409, { name: "X" });
  });

  await check(
    "5.4: Body rỗng, không phải object hoặc có trường không được nhận -> 400",
    async () => {
      for (const body of [
        {},
        [],
        null,
        { status: "CLOSED" },
        { id: "x" },
        { items: [] },
      ]) {
        setup({ membership: PO, sprint: draft() });
        if (!(await updateFails(400, body))) return false;
      }
      return true;
    },
  );

  await check(
    "5.5: Sửa Sprint DRAFT: lưu giá trị mới, trả chi tiết; truy vấn tên và chồng lấn loại trừ chính nó",
    async () => {
      const sprint = draft();
      setup({ membership: PO, sprint, items: [makeItem(1, sprint._id)] });
      const result: any = await update({
        name: " Sprint One ",
        goal: "Ship",
        startDate: "2026-11-03T00:00:00Z",
        endDate: "2026-11-10T00:00:00Z",
      });
      return (
        state.saves === 1 &&
        result.name === "Sprint One" &&
        result.goal === "Ship" &&
        result.startDate.toISOString() === "2026-11-03T00:00:00.000Z" &&
        result.endDate.toISOString() === "2026-11-10T00:00:00.000Z" &&
        result.items.length === 1 &&
        String(state.nameFilter._id.$ne) === S &&
        String(state.overlapFilter._id.$ne) === S
      );
    },
  );

  await check(
    "5.6: Sprint DRAFT xóa ngày (null) -> lưu, không kiểm tra chồng lấn",
    async () => {
      setup({ membership: PO, sprint: draft() });
      const result: any = await update({ startDate: null, endDate: null });
      return (
        state.saves === 1 &&
        result.startDate === null &&
        result.endDate === null &&
        state.overlapFilter === null
      );
    },
  );

  await check("5.7: Sprint ACTIVE đổi startDate -> 409", async () => {
    setup({ membership: PO, sprint: active() });
    return updateFails(409, { startDate: "2026-11-03T00:00:00Z" });
  });

  await check(
    "5.8: Sprint ACTIVE gửi lại startDate không đổi vẫn được lưu",
    async () => {
      setup({ membership: PO, sprint: active() });
      const result: any = await update({
        startDate: "2026-11-02T00:00:00Z",
        name: "Renamed",
      });
      return state.saves === 1 && result.name === "Renamed";
    },
  );

  await check("5.9: Sprint ACTIVE xóa endDate -> ValidationError", async () => {
    setup({ membership: PO, sprint: active() });
    const err = await catchError(() => update({ endDate: null }));
    return err?.name === "ValidationError" && state.saves === 0;
  });

  await check(
    "5.10: Sprint ACTIVE sửa name, goal, endDate trong một tháng -> lưu; quá một tháng -> ValidationError",
    async () => {
      setup({ membership: PO, sprint: active() });
      const result: any = await update({
        name: "Renamed",
        goal: "New goal",
        endDate: "2026-11-16T00:00:00Z",
      });
      const saved =
        state.saves === 1 &&
        result.goal === "New goal" &&
        result.endDate.toISOString() === "2026-11-16T00:00:00.000Z";
      setup({ membership: PO, sprint: active() });
      const err = await catchError(() => update({ endDate: "2026-12-20" }));
      return saved && err?.name === "ValidationError" && state.saves === 0;
    },
  );

  await check("5.11: Tên trùng Sprint khác -> 409", async () => {
    setup({
      membership: PO,
      sprint: draft(),
      nameConflict: makeSprint(7, { name: "Sprint 7" }),
    });
    return updateFails(409, { name: "Sprint 7" });
  });

  await check("5.12: Ngày chồng lấn Sprint khác -> 409", async () => {
    setup({
      membership: PO,
      sprint: draft(),
      overlap: makeSprint(7, { name: "Sprint 7" }),
    });
    return updateFails(409, { endDate: "2026-11-12T00:00:00Z" });
  });

  await check(
    "5.13: endDate không sau startDate -> ValidationError",
    async () => {
      setup({ membership: PO, sprint: draft() });
      const err = await catchError(() => update({ endDate: "2026-11-01" }));
      return err?.name === "ValidationError" && state.saves === 0;
    },
  );

  await check(
    "5.14: Chỉ đổi goal -> không truy vấn tên và chồng lấn",
    async () => {
      setup({ membership: PO, sprint: draft() });
      const result: any = await update({ goal: "Only goal" });
      return (
        state.saves === 1 &&
        result.goal === "Only goal" &&
        state.nameFilter === null &&
        state.overlapFilter === null
      );
    },
  );

  await check(
    "5.15: Mã lỗi khi sửa: khóa ngày bắt đầu, Sprint đóng, chồng lấn theo trường ngày đang đổi, tên trùng, không tìm thấy",
    async () => {
      setup({ membership: PO, sprint: active() });
      const locked = await catchError(() =>
        update({ startDate: "2026-11-03T00:00:00Z" }),
      );
      setup({
        membership: PO,
        sprint: makeSprint(1, { ...dated, status: "CLOSED" }),
      });
      const closed = await catchError(() => update({ name: "X" }));
      setup({
        membership: PO,
        sprint: draft(),
        overlap: makeSprint(7, { name: "Sprint 7" }),
      });
      const endOnly = await catchError(() =>
        update({ endDate: "2026-11-12T00:00:00Z" }),
      );
      setup({
        membership: PO,
        sprint: draft(),
        overlap: makeSprint(7, { name: "Sprint 7" }),
      });
      const both = await catchError(() =>
        update({
          startDate: "2026-11-03T00:00:00Z",
          endDate: "2026-11-12T00:00:00Z",
        }),
      );
      setup({
        membership: PO,
        sprint: draft(),
        nameConflict: makeSprint(7, { name: "Sprint 7" }),
      });
      const taken = await catchError(() => update({ name: "Sprint 7" }));
      setup({ membership: PO, sprint: null });
      const missing = await catchError(() => update({ name: "X" }));
      return (
        locked?.code === "CONFLICT" &&
        locked.field === "startDate" &&
        closed?.code === "CONFLICT" &&
        closed.field === undefined &&
        endOnly?.field === "endDate" &&
        both?.field === "startDate" &&
        taken?.field === "name" &&
        missing?.code === "NOT_FOUND"
      );
    },
  );

  // ============================================================================
  // SUITE 6: startSprint
  // ============================================================================
  log("\n--- SUITE 6: startSprint ---");
  const start = (body?: any) => startSprint(P, S, U, body);
  const undated = () => makeSprint(1, { name: "Sprint 1" });
  const ready = (n: number) => ({
    key: `COM-${n}`,
    status: "TODO",
    description: `Description ${n}`,
  });

  await check(
    "6.1: Quyền: Developer -> FORBIDDEN, người ngoài -> NOT_PROJECT_MEMBER, project ARCHIVED -> PROJECT_ARCHIVED, không có Sprint -> NOT_FOUND",
    async () => {
      setup({ membership: { ...PO, scrumRole: "DEVELOPER" }, sprint: draft() });
      const developer = await catchError(() => start());
      setup({ membership: null, sprint: draft() });
      const stranger = await catchError(() => start());
      setup({
        project: { _id: P, status: "ARCHIVED" },
        membership: PO,
        sprint: draft(),
      });
      const archived = await catchError(() => start());
      setup({ membership: PO, sprint: null });
      const missing = await catchError(() => start());
      return (
        developer?.code === "FORBIDDEN" &&
        stranger?.code === "NOT_PROJECT_MEMBER" &&
        archived?.code === "PROJECT_ARCHIVED" &&
        missing?.code === "NOT_FOUND" &&
        state.saves === 0
      );
    },
  );

  await check(
    "6.2: Chỉ Sprint DRAFT được Start: ACTIVE và CLOSED -> 409 CONFLICT",
    async () => {
      for (const status of ["ACTIVE", "CLOSED"]) {
        setup({
          membership: PO,
          sprint: makeSprint(1, { ...dated, status }),
          items: [ready(1)],
        });
        const err = await catchError(() => start());
        if (
          err?.status !== 409 ||
          err.code !== "CONFLICT" ||
          !err.message.includes("Only a Draft Sprint") ||
          state.saves !== 0
        ) {
          return false;
        }
      }
      return true;
    },
  );

  await check(
    "6.3: Body sai -> 400; không có body hoặc body {} vẫn hợp lệ",
    async () => {
      const invalid = [
        [],
        null,
        "x",
        { status: "ACTIVE" },
        { items: [] },
        { name: "" },
        { startDate: "tomorrow" },
      ];
      for (const body of invalid) {
        setup({ membership: PO, sprint: draft(), items: [ready(1)] });
        const err = await catchError(() => start(body));
        if (err?.status !== 400 || state.saves !== 0) return false;
      }
      for (const body of [undefined, {}]) {
        setup({ membership: PO, sprint: draft(), items: [makeItem(1, id(1))] });
        const result: any = await start(body);
        if (result.status !== "ACTIVE") return false;
      }
      return true;
    },
  );

  await check(
    "6.4: Thiếu ngày -> 400 VALIDATION_FAILED chỉ đúng trường còn thiếu",
    async () => {
      setup({ membership: PO, sprint: undated(), items: [ready(1)] });
      const none = await catchError(() => start());
      setup({ membership: PO, sprint: undated(), items: [ready(1)] });
      const onlyStart = await catchError(() =>
        start({ startDate: "2026-11-02" }),
      );
      setup({ membership: PO, sprint: draft(), items: [ready(1)] });
      const cleared = await catchError(() => start({ endDate: null }));
      return (
        none?.code === "VALIDATION_FAILED" &&
        none.field === "startDate" &&
        onlyStart?.field === "endDate" &&
        cleared?.field === "endDate" &&
        state.saves === 0
      );
    },
  );

  await check(
    "6.5: Ngày trong body vi phạm quy tắc model (end <= start, dài hơn một tháng) -> ValidationError",
    async () => {
      setup({ membership: PO, sprint: undated(), items: [ready(1)] });
      const reversed = await catchError(() =>
        start({ startDate: "2026-11-15", endDate: "2026-11-01" }),
      );
      setup({ membership: PO, sprint: undated(), items: [ready(1)] });
      const long = await catchError(() =>
        start({ startDate: "2026-11-01", endDate: "2026-12-10" }),
      );
      return (
        reversed?.name === "ValidationError" &&
        long?.name === "ValidationError" &&
        state.saves === 0
      );
    },
  );

  await check(
    "6.6: Đổi tên khi Start: trùng -> 409 field name; không đổi tên thì không truy vấn tên",
    async () => {
      setup({
        membership: PO,
        sprint: draft(),
        items: [ready(1)],
        nameConflict: makeSprint(7, { name: "Sprint 7" }),
      });
      const taken = await catchError(() => start({ name: "Sprint 7" }));
      setup({ membership: PO, sprint: draft(), items: [makeItem(1, id(1))] });
      await start();
      return (
        taken?.code === "CONFLICT" &&
        taken.field === "name" &&
        state.nameFilter === null
      );
    },
  );

  await check(
    "6.7: Ngày trong body chồng lấn -> 409 theo trường đang đổi; không gửi ngày thì không kiểm tra chồng lấn",
    async () => {
      const other = () => makeSprint(7, { name: "Sprint 7" });
      setup({
        membership: PO,
        sprint: undated(),
        items: [ready(1)],
        overlap: other(),
      });
      const both = await catchError(() =>
        start({ startDate: "2026-11-02", endDate: "2026-11-09" }),
      );
      setup({
        membership: PO,
        sprint: draft(),
        items: [ready(1)],
        overlap: other(),
      });
      const endOnly = await catchError(() => start({ endDate: "2026-11-12" }));
      setup({
        membership: PO,
        sprint: draft(),
        items: [makeItem(1, id(1))],
        overlap: other(),
      });
      await start();
      return (
        both?.code === "CONFLICT" &&
        both.field === "startDate" &&
        both.message.includes("Sprint 7") &&
        endOnly?.field === "endDate" &&
        state.overlapFilter === null &&
        state.saves === 1
      );
    },
  );

  await check(
    "6.8: Đã có Sprint ACTIVE khác -> 409 nêu tên; truy vấn loại trừ chính Sprint này",
    async () => {
      setup({
        membership: PO,
        sprint: draft(),
        items: [ready(1)],
        otherActive: makeSprint(7, { name: "Sprint 7" }),
      });
      const err = await catchError(() => start());
      const filter = state.otherActiveFilter;
      return (
        err?.status === 409 &&
        err.code === "CONFLICT" &&
        err.message.includes("Sprint 7") &&
        state.saves === 0 &&
        filter.projectId === P &&
        filter.status === "ACTIVE" &&
        filter.deletedAt === null &&
        String(filter._id.$ne) === S
      );
    },
  );

  await check(
    "6.9: Sprint chưa có item -> 409; truy vấn lấy item độc lập còn sống của Sprint",
    async () => {
      setup({ membership: PO, sprint: draft(), items: [] });
      const err = await catchError(() => start());
      const filter = state.itemFilter;
      return (
        err?.status === 409 &&
        err.code === "CONFLICT" &&
        err.message.includes("at least one") &&
        state.saves === 0 &&
        filter.projectId === P &&
        String(filter.sprintId) === S &&
        filter.parentId === null &&
        filter.deletedAt === null
      );
    },
  );

  await check(
    "6.10: Item chưa sẵn sàng (DONE, thiếu mô tả) -> 409 liệt kê mã item; quá 5 thì ghi 'and N more'",
    async () => {
      setup({
        membership: PO,
        sprint: draft(),
        items: [
          ready(1),
          { ...ready(3), status: "DONE" },
          { ...ready(7), description: "   " },
          { ...ready(8), description: null },
        ],
      });
      const err = await catchError(() => start());
      const many = Array.from({ length: 7 }, (_, i) => ({
        ...ready(i + 1),
        status: "DONE",
      }));
      setup({ membership: PO, sprint: draft(), items: many });
      const long = await catchError(() => start());
      return (
        err?.status === 409 &&
        err.message.includes("COM-3 is done") &&
        err.message.includes("COM-7 has no description") &&
        err.message.includes("COM-8 has no description") &&
        !err.message.includes("COM-1") &&
        long?.message.includes("and 2 more") &&
        state.saves === 0
      );
    },
  );

  await check(
    "6.11: Start thành công không body: ACTIVE, startedAt là giờ hiện tại, ngày giữ nguyên, trả chi tiết kèm item",
    async () => {
      const sprint = draft();
      setup({
        membership: PO,
        sprint,
        items: [makeItem(1, sprint._id), makeItem(2, sprint._id)],
      });
      const before = Date.now();
      const result: any = await start();
      const startedAt = new Date(result.startedAt).getTime();
      return (
        state.saves === 1 &&
        result.status === "ACTIVE" &&
        startedAt >= before &&
        startedAt <= Date.now() &&
        result.startDate.toISOString() === "2026-11-02T00:00:00.000Z" &&
        result.items.length === 2 &&
        !("_id" in result) &&
        !("deletedAt" in result)
      );
    },
  );

  await check(
    "6.12: Start kèm giá trị đã duyệt: lưu tên, goal, ngày; truy vấn tên và chồng lấn loại trừ chính nó",
    async () => {
      const sprint = undated();
      setup({ membership: PO, sprint, items: [makeItem(1, sprint._id)] });
      const result: any = await start({
        name: " Sprint One ",
        goal: "Ship",
        startDate: "2026-11-03T00:00:00Z",
        endDate: "2026-11-10T00:00:00Z",
      });
      return (
        state.saves === 1 &&
        result.status === "ACTIVE" &&
        result.name === "Sprint One" &&
        result.goal === "Ship" &&
        result.startDate.toISOString() === "2026-11-03T00:00:00.000Z" &&
        result.endDate.toISOString() === "2026-11-10T00:00:00.000Z" &&
        String(state.nameFilter._id.$ne) === S &&
        String(state.overlapFilter._id.$ne) === S
      );
    },
  );

  // ============================================================================
  // SUITE 7: completeSprint
  // ============================================================================
  log("\n--- SUITE 7: completeSprint ---");
  const complete = () => completeSprint(P, S, U);
  const closedSprint = () =>
    makeSprint(1, { ...dated, status: "CLOSED", closedAt: new Date() });

  await check(
    "7.1: Quyền: Developer -> FORBIDDEN, người ngoài -> NOT_PROJECT_MEMBER, project ARCHIVED -> PROJECT_ARCHIVED, không có Sprint -> NOT_FOUND; không ghi gì",
    async () => {
      setup({
        membership: { ...PO, scrumRole: "DEVELOPER" },
        sprint: active(),
      });
      const developer = await catchError(() => complete());
      setup({ membership: null, sprint: active() });
      const stranger = await catchError(() => complete());
      setup({
        project: { _id: P, status: "ARCHIVED" },
        membership: PO,
        sprint: active(),
      });
      const archived = await catchError(() => complete());
      setup({ membership: PO, sprint: null });
      const missing = await catchError(() => complete());
      return (
        developer?.code === "FORBIDDEN" &&
        stranger?.code === "NOT_PROJECT_MEMBER" &&
        archived?.code === "PROJECT_ARCHIVED" &&
        missing?.code === "NOT_FOUND" &&
        state.calls.length === 0
      );
    },
  );

  await check(
    "7.2: Chỉ Sprint ACTIVE được Complete: DRAFT và CLOSED -> 409, không ghi gì",
    async () => {
      for (const sprint of [draft(), closedSprint()]) {
        setup({ membership: PO, sprint });
        const err = await catchError(() => complete());
        if (
          err?.status !== 409 ||
          err.code !== "CONFLICT" ||
          !err.message.includes("Only an Active Sprint") ||
          state.calls.length !== 0
        ) {
          return false;
        }
      }
      return true;
    },
  );

  await check(
    "7.3: Complete: gỡ liên kết item chưa xong trước (kể cả đã xóa mềm), rồi đóng Sprint bằng cập nhật có điều kiện",
    async () => {
      const sprint = active();
      setup({
        membership: PO,
        sprint,
        closeResult: closedSprint(),
        items: [makeItem(3, sprint._id, "DONE")],
      });
      const result: any = await complete();
      const [manyFilter, manyUpdate] = state.updateManyArgs;
      const [closeFilter, closeUpdate, closeOptions] = state.closeArgs;
      return (
        JSON.stringify(state.calls) ===
          JSON.stringify(["updateMany", "findOneAndUpdate"]) &&
        manyFilter.projectId === P &&
        String(manyFilter.sprintId) === S &&
        manyFilter.parentId === null &&
        JSON.stringify(manyFilter.status) === JSON.stringify({ $ne: "DONE" }) &&
        !("deletedAt" in manyFilter) &&
        JSON.stringify(manyUpdate) ===
          JSON.stringify({ $set: { sprintId: null } }) &&
        closeFilter.projectId === P &&
        String(closeFilter._id) === S &&
        closeFilter.status === "ACTIVE" &&
        closeFilter.deletedAt === null &&
        closeUpdate.$set.status === "CLOSED" &&
        closeUpdate.$set.closedAt instanceof Date &&
        closeOptions.returnDocument === "after" &&
        result.status === "CLOSED" &&
        result.items.length === 1 &&
        result.items[0].status === "DONE"
      );
    },
  );

  await check(
    "7.4: Sprint không còn ACTIVE lúc đóng (có người đóng hoặc xóa trước) -> 409",
    async () => {
      setup({ membership: PO, sprint: active(), closeResult: null });
      const err = await catchError(() => complete());
      return (
        err?.status === 409 &&
        err.code === "CONFLICT" &&
        err.message.includes("no longer active") &&
        state.calls.length === 2
      );
    },
  );

  await check("7.5: Đóng sớm trước endDate vẫn được", async () => {
    const early = makeSprint(1, {
      name: "Sprint 1",
      status: "ACTIVE",
      startDate: new Date("2099-01-01T00:00:00Z"),
      endDate: new Date("2099-01-15T00:00:00Z"),
    });
    setup({ membership: PO, sprint: early, closeResult: closedSprint() });
    const result: any = await complete();
    return result.status === "CLOSED";
  });

  await check(
    "7.6: Lỗi giữa chừng (sau khi gỡ item, trước khi đóng Sprint) -> Sprint vẫn ACTIVE và gọi lại thành công",
    async () => {
      const sprint = active();
      setup({
        membership: PO,
        sprint,
        closeError: new Error("db down"),
      });
      const failed = await catchError(() => complete());
      const stillActive = sprint.status === "ACTIVE";
      state.closeError = null;
      state.closeResult = closedSprint();
      state.calls.length = 0;
      const result: any = await complete();
      return (
        failed?.message === "db down" &&
        stillActive &&
        result.status === "CLOSED" &&
        JSON.stringify(state.calls) ===
          JSON.stringify(["updateMany", "findOneAndUpdate"])
      );
    },
  );

  await check("7.7: Response không lộ _id hay deletedAt", async () => {
    setup({ membership: PO, sprint: active(), closeResult: closedSprint() });
    const result: any = await complete();
    return (
      typeof result.id === "string" &&
      result.closedAt instanceof Date &&
      !("_id" in result) &&
      !("deletedAt" in result)
    );
  });

  // ============================================================================
  // SUITE 8: getSprintBlocker (tư cách của item trong Sprint)
  // ============================================================================
  log("\n--- SUITE 8: getSprintBlocker ---");

  await check(
    "8.1: DONE -> DONE; thiếu hoặc trống mô tả -> NO_DESCRIPTION; DONE được ưu tiên; đủ tư cách -> null",
    async () =>
      getSprintBlocker({ status: "DONE", description: "text" }) === "DONE" &&
      getSprintBlocker({ status: "DONE", description: "" }) === "DONE" &&
      getSprintBlocker({ status: "TODO", description: null }) ===
        "NO_DESCRIPTION" &&
      getSprintBlocker({ status: "TODO", description: "   " }) ===
        "NO_DESCRIPTION" &&
      getSprintBlocker({ status: "TODO" }) === "NO_DESCRIPTION" &&
      getSprintBlocker({ status: "IN_PROGRESS", description: "text" }) === null,
  );

  // Khôi phục các model
  (ProjectModel as any).findById = origFindById;
  (MembershipModel as any).findOne = origFindOneMember;
  (SprintModel as any).find = origFindSprint;
  (SprintModel as any).findOne = origFindOneSprint;
  (WorkItemModel as any).find = origFindItem;
  (SprintModel.prototype as any).save = origSave;
  (WorkItemModel as any).updateMany = origUpdateMany;
  (SprintModel as any).findOneAndUpdate = origFindOneAndUpdate;

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
