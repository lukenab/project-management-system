import { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Membership from "../src/models/membership.ts";
import Project from "../src/models/project.ts";
import User from "../src/models/user.ts";
import projectService from "../src/services/projects.ts";

const createProject = projectService.creatProject;
const listMyProjects = projectService.getMyProjects;

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
// Kho giả trong bộ nhớ cho Project, Membership và User
// ---------------------------------------------------------------------------
type Doc = Record<string, any>;
let projects: Doc[] = [];
let memberships: Doc[] = [];
let accounts: Doc[] = [];
let failProjectCreate: Error | null = null;
let failMembershipCreate: Error | null = null;

const same = (a: any, b: any) => String(a) === String(b);
const matches = (doc: Doc, filter: Doc) =>
  Object.entries(filter).every(([key, cond]) =>
    cond && typeof cond === "object" && "$in" in cond
      ? cond.$in.some((v: any) => same(v, doc[key]))
      : same(doc[key], cond),
  );

function installFakes() {
  const P = Project as any;
  P.db.transaction = async (callback: Function) => {
    const previousProjects = [...projects];
    const previousMemberships = [...memberships];
    try {
      return await callback({});
    } catch (error) {
      projects = previousProjects;
      memberships = previousMemberships;
      throw error;
    }
  };
  P.create = async ([data]: Doc[]) => {
    if (failProjectCreate) throw failProjectCreate;
    if (projects.some((p) => p.key === data.key)) {
      throw Object.assign(new Error("E11000 duplicate key error"), {
        name: "MongoServerError",
        code: 11000,
        keyValue: { key: data.key },
      });
    }
    const _id = new Types.ObjectId();
    const now = new Date();
    const doc = {
      _id,
      id: String(_id),
      status: "ACTIVE",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    projects.push(doc);
    return [doc];
  };
  P.find = (filter: Doc) => {
    const found = projects.filter((p) => matches(p, { _id: filter._id }));
    return {
      sort: async () =>
        [...found].sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            String(a._id).localeCompare(String(b._id)),
        ),
    };
  };

  const M = Membership as any;
  M.create = async ([data]: Doc[]) => {
    if (failMembershipCreate) throw failMembershipCreate;
    const doc = { _id: new Types.ObjectId(), ...data };
    memberships.push(doc);
    return [doc];
  };
  M.find = (filter: Doc) => ({
    lean: async () => memberships.filter((m) => matches(m, filter)),
  });

  const U = User as any;
  U.find = (filter: Doc) => ({
    lean: async () => accounts.filter((a) => matches(a, filter)),
  });
}

function reset() {
  projects = [];
  memberships = [];
  accounts = [];
  failProjectCreate = null;
  failMembershipCreate = null;
}

function addAccount(fullName: string, email: string) {
  const _id = new Types.ObjectId();
  const doc = { _id, id: String(_id), fullName, email };
  accounts.push(doc);
  return doc;
}

/** Thêm sẵn một project có chủ (OWNER) và trả về project, thành viên */
function addProject(
  key: string,
  owner: Doc,
  updatedAt: Date,
  overrides: Doc = {},
) {
  const _id = new Types.ObjectId();
  const project = {
    _id,
    id: String(_id),
    name: `Project ${key}`,
    key,
    description: null,
    status: "ACTIVE",
    archivedAt: null,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
  projects.push(project);
  const ownership = {
    _id: new Types.ObjectId(),
    userId: owner._id,
    projectId: _id,
    accessRole: "OWNER",
    scrumRole: "PRODUCT_OWNER",
    status: "ACTIVE",
  };
  memberships.push(ownership);
  return { project, ownership };
}

function join(project: Doc, user: Doc, overrides: Doc = {}) {
  const membership = {
    _id: new Types.ObjectId(),
    userId: user._id,
    projectId: project._id,
    accessRole: "MEMBER",
    scrumRole: "DEVELOPER",
    status: "ACTIVE",
    ...overrides,
  };
  memberships.push(membership);
  return membership;
}

const asUser = (account: Doc) => account as any;

async function runTests() {
  process.env.NODE_ENV = "test";
  installFakes();

  // ============================================================================
  // SUITE 1: createProject
  // ============================================================================
  log("\n--- SUITE 1: createProject ---");

  await check(
    "1.1: Tạo dự án: người tạo là OWNER và PRODUCT_OWNER, phản hồi đủ trường của hợp đồng",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const result: any = await createProject(asUser(me), {
        name: "Customer portal",
        key: "CP",
        description: "Help customers",
      });
      const membership = memberships[0];
      return (
        Object.keys(result).sort().join(",") ===
          "archivedAt,createdAt,description,id,key,myRole,name,owner,ownerId,status,updatedAt" &&
        result.key === "CP" &&
        result.name === "Customer portal" &&
        result.description === "Help customers" &&
        result.status === "ACTIVE" &&
        result.archivedAt === null &&
        result.ownerId === String(membership._id) &&
        result.owner.fullName === "An Binh" &&
        result.owner.email === "a@example.com" &&
        result.myRole.accessRole === "OWNER" &&
        result.myRole.scrumAccountability === "PRODUCT_OWNER" &&
        projects.length === 1 &&
        memberships.length === 1 &&
        same(membership.userId, me._id) &&
        same(membership.projectId, projects[0]._id) &&
        membership.accessRole === "OWNER" &&
        membership.scrumRole === "PRODUCT_OWNER" &&
        membership.status === "ACTIVE" &&
        membership.joinedAt instanceof Date
      );
    },
  );

  await check(
    "1.2: Tên và mô tả được cắt khoảng trắng; mô tả trống hoặc thiếu thành null",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const a: any = await createProject(asUser(me), {
        name: "  Alpha  ",
        key: "AL",
        description: "  text  ",
      });
      const b: any = await createProject(asUser(me), {
        name: "Beta",
        key: "BE",
        description: "   ",
      });
      const c: any = await createProject(asUser(me), {
        name: "Gamma",
        key: "GA",
      });
      const d: any = await createProject(asUser(me), {
        name: "Delta",
        key: "DE",
        description: null,
      });
      return (
        a.name === "Alpha" &&
        a.description === "text" &&
        b.description === null &&
        c.description === null &&
        d.description === null
      );
    },
  );

  await check(
    "1.3: Tên trống, thiếu hoặc không phải chuỗi -> VALIDATION_FAILED field name, không lưu gì",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const bodies = [
        { key: "CP" },
        { name: "   ", key: "CP" },
        { name: 5, key: "CP" },
        null,
      ];
      for (const body of bodies) {
        const error = await catchError(() => createProject(asUser(me), body));
        if (error?.code !== "VALIDATION_FAILED" || error.field !== "name")
          return false;
      }
      return projects.length === 0 && memberships.length === 0;
    },
  );

  await check(
    "1.4: Key sai định dạng -> 400 VALIDATION_FAILED field key (chữ thường, ngắn, dài, bắt đầu bằng số, ký tự lạ)",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const keys: unknown[] = [
        "cp",
        "Cp",
        "A",
        "ABCDEFGHIJK",
        "1AB",
        "A-B",
        "A B",
        "",
        undefined,
        7,
      ];
      for (const key of keys) {
        const error = await catchError(() =>
          createProject(asUser(me), { name: "X", key }),
        );
        if (
          error?.code !== "VALIDATION_FAILED" ||
          error.status !== 400 ||
          error.field !== "key"
        )
          return false;
      }
      return projects.length === 0;
    },
  );

  await check(
    "1.5: Key hợp lệ ở biên: 2 ký tự và 10 ký tự, có chữ số",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const a: any = await createProject(asUser(me), { name: "A", key: "AB" });
      const b: any = await createProject(asUser(me), {
        name: "B",
        key: "A234567890",
      });
      return a.key === "AB" && b.key === "A234567890";
    },
  );

  await check(
    "1.6: Mô tả quá 500 ký tự hoặc không phải chuỗi -> VALIDATION_FAILED field description",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const ok: any = await createProject(asUser(me), {
        name: "A",
        key: "AB",
        description: "x".repeat(500),
      });
      const tooLong = await catchError(() =>
        createProject(asUser(me), {
          name: "B",
          key: "BC",
          description: "x".repeat(501),
        }),
      );
      const wrongType = await catchError(() =>
        createProject(asUser(me), { name: "C", key: "CD", description: 5 }),
      );
      return (
        ok.description.length === 500 &&
        tooLong?.code === "VALIDATION_FAILED" &&
        tooLong.field === "description" &&
        wrongType?.code === "VALIDATION_FAILED" &&
        wrongType.field === "description" &&
        projects.length === 1
      );
    },
  );

  await check(
    "1.7: Trùng key -> 409 DUPLICATE_VALUE field key, không tạo thành viên",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      await createProject(asUser(me), { name: "First", key: "CP" });
      const error = await catchError(() =>
        createProject(asUser(me), { name: "Second", key: "CP" }),
      );
      return (
        error?.code === "DUPLICATE_VALUE" &&
        error.status === 409 &&
        error.field === "key" &&
        projects.length === 1 &&
        memberships.length === 1
      );
    },
  );

  await check(
    "1.8: Tạo thành viên lỗi -> xóa dự án vừa tạo và ném lỗi gốc",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      failMembershipCreate = new Error("connection lost");
      const error = await catchError(() =>
        createProject(asUser(me), { name: "X", key: "XX" }),
      );
      failMembershipCreate = null;
      const retry: any = await createProject(asUser(me), {
        name: "X",
        key: "XX",
      });
      return (
        error?.message === "connection lost" &&
        projects.length === 1 &&
        retry.key === "XX"
      );
    },
  );

  // ============================================================================
  // SUITE 2: listMyProjects
  // ============================================================================
  log("\n--- SUITE 2: listMyProjects ---");

  await check("2.1: Không thuộc dự án nào -> mảng rỗng", async () => {
    reset();
    const me = addAccount("An Binh", "a@example.com");
    const other = addAccount("Other", "o@example.com");
    addProject("OT", other, new Date());
    return (await listMyProjects(String(me._id))).length === 0;
  });

  await check(
    "2.2: Chỉ trả dự án mình là thành viên ACTIVE, kèm chủ dự án và vai trò của mình",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const boss = addAccount("Boss Person", "boss@example.com");
      const mine = addProject("MY", me, new Date("2026-01-02"));
      const shared = addProject("SH", boss, new Date("2026-01-03"));
      join(shared.project, me, { scrumRole: "SCRUM_MASTER" });
      addProject("NO", boss, new Date("2026-01-04"));
      const left = addProject("LF", boss, new Date("2026-01-05"));
      join(left.project, me, { status: "LEFT" });
      const removed = addProject("RM", boss, new Date("2026-01-06"));
      join(removed.project, me, { status: "REMOVED" });

      const list: any[] = await listMyProjects(String(me._id));
      const mineRow = list.find((p) => p.key === "MY");
      const sharedRow = list.find((p) => p.key === "SH");
      return (
        list
          .map((p) => p.key)
          .sort()
          .join(",") === "MY,SH" &&
        mineRow.owner.fullName === "An Binh" &&
        mineRow.ownerId === String(mine.ownership._id) &&
        mineRow.myRole.accessRole === "OWNER" &&
        mineRow.myRole.scrumAccountability === "PRODUCT_OWNER" &&
        sharedRow.owner.fullName === "Boss Person" &&
        sharedRow.owner.email === "boss@example.com" &&
        sharedRow.ownerId === String(shared.ownership._id) &&
        sharedRow.myRole.accessRole === "MEMBER" &&
        sharedRow.myRole.scrumAccountability === "SCRUM_MASTER"
      );
    },
  );

  await check(
    "2.3: Sắp theo updatedAt giảm dần; thành viên không có accountability trả null",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      addProject("OLD", me, new Date("2026-01-01"));
      addProject("NEW", me, new Date("2026-03-01"));
      const mid = addProject("MID", me, new Date("2026-02-01"));
      mid.ownership.scrumRole = null as any;
      const list: any[] = await listMyProjects(String(me._id));
      return (
        list.map((p) => p.key).join(",") === "NEW,MID,OLD" &&
        list[1].myRole.scrumAccountability === null
      );
    },
  );

  await check(
    "2.4: Dự án đã lưu trữ vẫn có trong danh sách với status và archivedAt",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const archivedAt = new Date("2026-02-02");
      addProject("AR", me, new Date("2026-02-02"), {
        status: "ARCHIVED",
        archivedAt,
      });
      const list: any[] = await listMyProjects(String(me._id));
      return (
        list.length === 1 &&
        list[0].status === "ARCHIVED" &&
        list[0].archivedAt === archivedAt
      );
    },
  );

  await check(
    "2.5: Dự án mới tạo xuất hiện trong danh sách của người tạo, không xuất hiện với người khác",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      const other = addAccount("Other", "o@example.com");
      await createProject(asUser(me), { name: "Mine", key: "MI" });
      const mine: any[] = await listMyProjects(String(me._id));
      const theirs: any[] = await listMyProjects(String(other._id));
      return mine.length === 1 && mine[0].key === "MI" && theirs.length === 0;
    },
  );

  await check(
    "2.6: Phản hồi danh sách không lộ dữ liệu nội bộ (userId, joinedAt, passwordHash)",
    async () => {
      reset();
      const me = addAccount("An Binh", "a@example.com");
      addProject("MY", me, new Date());
      const text = JSON.stringify(await listMyProjects(String(me._id)));
      return (
        !text.includes("userId") &&
        !text.includes("joinedAt") &&
        !text.includes("passwordHash") &&
        !text.includes("projectId")
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
  const logFilePath = path.join(logDir, "projects.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
