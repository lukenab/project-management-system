import type { ClientSession } from "mongoose";

import { isObjectIdOrHexString } from "mongoose";

import ActivityEvent from "../models/activityEvent.ts";
import Membership from "../models/membership.ts";
import Project from "../models/project.ts";
import Sprint from "../models/sprint.ts";
import User from "../models/user.ts";
import WorkItem from "../models/workitem.ts";
import { AppError } from "../utils/error.ts";
import { normalizeEmail } from "./auth.ts";
import { requireProjectMember } from "./projectAccess.ts";

type Member = InstanceType<typeof Membership>;
type Account = { fullName: string; email: string };
type ScrumRole = "PRODUCT_OWNER" | "SCRUM_MASTER" | "DEVELOPER";
const exclusiveRoles = ["PRODUCT_OWNER", "SCRUM_MASTER"];

function requireRole(value: unknown, field: string): ScrumRole {
  if (
    value === "PRODUCT_OWNER" ||
    value === "SCRUM_MASTER" ||
    value === "DEVELOPER"
  )
    return value;
  throw new AppError("VALIDATION_FAILED", {
    field,
    message: "Choose a valid Scrum role.",
  });
}

function readPayload(body: unknown, allowed: string[]) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  ) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Invalid membership request fields.",
    });
  }
  return body as Record<string, unknown>;
}

function memberResponse(member: Member, account: Account) {
  return {
    id: String(member._id),
    userId: String(member.userId),
    projectId: String(member.projectId),
    fullName: account.fullName,
    email: account.email,
    accessRole: member.accessRole,
    scrumAccountability: member.scrumRole ?? null,
    status: member.status,
    joinedAt: member.joinedAt,
  };
}

async function writeMembership<T>(
  projectId: string,
  userId: string,
  ownerOnly: boolean,
  write: (actor: Member, session: ClientSession) => Promise<T>,
) {
  try {
    return await Project.db.transaction(async (session) => {
      // Use the same project write lock as ownership transfer.
      const project = await Project.findOneAndUpdate(
        { _id: projectId, status: "ACTIVE" },
        { $inc: { __v: 1 } },
        { session, timestamps: false },
      );
      if (!project) {
        if (await Project.exists({ _id: projectId }).session(session))
          throw new AppError("PROJECT_ARCHIVED");
        throw new AppError("NOT_FOUND", { message: "Project not found." });
      }
      const actor = await Membership.findOne({
        projectId,
        userId,
        status: "ACTIVE",
      }).session(session);
      if (!actor) throw new AppError("NOT_PROJECT_MEMBER");
      if (ownerOnly && actor.accessRole !== "OWNER")
        throw new AppError("FORBIDDEN");
      return write(actor, session);
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new AppError("CONFLICT", {
        message:
          "This membership or Scrum role is already assigned. Refresh the member list and try again.",
      });
    }
    throw error;
  }
}

async function recordMembership(
  actor: Member,
  member: Member,
  actionType: string,
  oldValue: object | null,
  newValue: object,
  session: ClientSession,
) {
  await new ActivityEvent({
    projectId: actor.projectId,
    actorId: actor.userId,
    actionType,
    oldValue: oldValue && { membershipId: member.id, ...oldValue },
    newValue: { membershipId: member.id, ...newValue },
  }).save({ session });
}

const getMembers = async (projectId: string, userId: string) => {
  await requireProjectMember(userId, projectId);
  const members = await Membership.find({ projectId, status: "ACTIVE" });
  const accounts = await User.find({
    _id: { $in: members.map((member) => member.userId) },
    status: "ACTIVE",
  })
    .select("fullName email")
    .lean();
  const byId = new Map(
    accounts.map((account) => [String(account._id), account]),
  );
  return members
    .flatMap((member) => {
      const account = byId.get(String(member.userId));
      return account ? [memberResponse(member, account)] : [];
    })
    .sort(
      (a, b) =>
        a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id),
    );
};

const addMember = async (projectId: string, userId: string, body: unknown) => {
  const payload = readPayload(body, ["email", "scrumAccountability"]);
  if (typeof payload.email !== "string")
    throw new AppError("VALIDATION_FAILED", { field: "email" });
  const email = normalizeEmail(payload.email);
  const role = requireRole(payload.scrumAccountability, "scrumAccountability");
  return writeMembership(projectId, userId, true, async (actor, session) => {
    const account = await User.findOne({
      email,
      status: "ACTIVE",
      systemRole: "STAFF",
    })
      .session(session)
      .lean();
    if (!account)
      throw new AppError("NOT_FOUND", {
        message: "No active Staff account was found for this email.",
        field: "email",
      });
    const existing = await Membership.findOne({
      userId: account._id,
      projectId,
    }).session(session);
    if (existing?.status === "ACTIVE") {
      throw new AppError("CONFLICT", {
        message: "This account is already a project member.",
        field: "email",
      });
    }

    const member =
      existing ?? new Membership({ userId: account._id, projectId });
    const previousStatus = existing?.status;
    member.set({
      accessRole: "MEMBER",
      scrumRole: role,
      status: "ACTIVE",
      joinedAt: new Date(),
      endedAt: null,
    });
    await member.save({ session });
    await recordMembership(
      actor,
      member,
      "PROJECT_MEMBER_ADDED",
      previousStatus ? { status: previousStatus } : null,
      { status: "ACTIVE", scrumAccountability: role },
      session,
    );
    return memberResponse(member, account);
  });
};

const unfinishedAssigned = (projectId: string, member: Member) => ({
  projectId,
  assigneeId: member._id,
  deletedAt: null,
  status: { $in: ["TODO" as const, "IN_PROGRESS" as const] },
});

async function listUnfinishedAssigned(
  projectId: string,
  member: Member,
  session: ClientSession,
) {
  const assigned = await WorkItem.find(unfinishedAssigned(projectId, member))
    .select("parentId sprintId")
    .session(session)
    .lean();
  const parentIds = assigned.flatMap(({ parentId }) =>
    parentId ? [parentId] : [],
  );
  const parents = parentIds.length
    ? await WorkItem.find({
        projectId,
        _id: { $in: parentIds },
        parentId: null,
        deletedAt: null,
      })
        .select("sprintId")
        .session(session)
        .lean()
    : [];
  const parentsById = new Map(
    parents.map((parent) => [String(parent._id), parent]),
  );
  return assigned.flatMap((item) => {
    if (!item.parentId) return [{ id: item._id, sprintId: item.sprintId }];
    const parent = parentsById.get(String(item.parentId));
    return parent ? [{ id: item._id, sprintId: parent.sprintId }] : [];
  });
}

async function requireNoUnfinishedSprintWork(
  projectId: string,
  member: Member,
  session: ClientSession,
) {
  const assigned = await listUnfinishedAssigned(projectId, member, session);
  const sprintIds = assigned.flatMap(({ sprintId }) =>
    sprintId ? [sprintId] : [],
  );
  if (
    sprintIds.length &&
    (await Sprint.exists({
      projectId,
      _id: { $in: sprintIds },
      status: { $in: ["DRAFT", "ACTIVE"] },
      deletedAt: null,
    }).session(session))
  ) {
    throw new AppError("CONFLICT", {
      message:
        "Reassign this member’s unfinished Sprint work before removing them.",
    });
  }
}

async function endMembership(
  actor: Member,
  member: Member,
  status: "LEFT" | "REMOVED",
  session: ClientSession,
) {
  const oldRole = member.scrumRole;
  member.set({ status, endedAt: new Date(), scrumRole: null });
  await member.save({ session });
  await recordMembership(
    actor,
    member,
    status === "LEFT" ? "PROJECT_MEMBER_LEFT" : "PROJECT_MEMBER_REMOVED",
    { status: "ACTIVE", scrumAccountability: oldRole },
    { status },
    session,
  );
}

const removeMember = (
  projectId: string,
  userId: string,
  membershipId: string,
) =>
  writeMembership(projectId, userId, true, async (actor, session) => {
    const target = await Membership.findOne({
      _id: membershipId,
      projectId,
      status: "ACTIVE",
    }).session(session);
    if (!target)
      throw new AppError("NOT_FOUND", { message: "Project member not found." });
    if (target.accessRole === "OWNER") {
      throw new AppError("CONFLICT", {
        message: "Transfer ownership before removing the Project Owner.",
      });
    }
    await requireNoUnfinishedSprintWork(projectId, target, session);
    await endMembership(actor, target, "REMOVED", session);
  });

const removeSelf = (projectId: string, userId: string) =>
  writeMembership(projectId, userId, false, async (actor, session) => {
    if (actor.accessRole === "OWNER") {
      throw new AppError("CONFLICT", {
        message: "Transfer ownership before leaving the project.",
      });
    }
    const unfinished = await listUnfinishedAssigned(projectId, actor, session);
    if (unfinished.length)
      await WorkItem.updateMany(
        {
          ...unfinishedAssigned(projectId, actor),
          _id: { $in: unfinished.map(({ id }) => id) },
        },
        { $set: { assigneeId: null } },
        { session },
      );
    await endMembership(actor, actor, "LEFT", session);
  });

async function saveRole(
  actor: Member,
  member: Member,
  role: ScrumRole,
  session: ClientSession,
) {
  const previous = member.scrumRole;
  if (previous === role) return;
  member.scrumRole = role;
  await member.save({ session });
  await recordMembership(
    actor,
    member,
    "PROJECT_MEMBER_ROLE_CHANGED",
    { scrumAccountability: previous },
    { scrumAccountability: role },
    session,
  );
}

const changeMembership = (
  projectId: string,
  userId: string,
  membershipId: string,
  body: unknown,
) => {
  const payload = readPayload(body, [
    "scrumAccountability",
    "previousUserMembershipId",
    "previousUserNewAccountability",
  ]);
  const role = requireRole(payload.scrumAccountability, "scrumAccountability");
  const previousId = payload.previousUserMembershipId;
  const previousRole = payload.previousUserNewAccountability;
  const replacing = previousId !== undefined || previousRole !== undefined;
  if (
    replacing &&
    (typeof previousId !== "string" || !isObjectIdOrHexString(previousId))
  ) {
    throw new AppError("INVALID_ID", { field: "previousUserMembershipId" });
  }
  const replacementRole = replacing
    ? requireRole(previousRole, "previousUserNewAccountability")
    : null;

  return writeMembership(projectId, userId, true, async (actor, session) => {
    const target = await Membership.findOne({
      _id: membershipId,
      projectId,
      status: "ACTIVE",
    }).session(session);
    if (!target)
      throw new AppError("NOT_FOUND", { message: "Project member not found." });
    const account = await User.findOne({ _id: target.userId, status: "ACTIVE" })
      .select("fullName email")
      .session(session)
      .lean();
    if (!account)
      throw new AppError("CONFLICT", {
        message: "This member's account is no longer active.",
      });
    const incumbent = exclusiveRoles.includes(role)
      ? await Membership.findOne({
          projectId,
          status: "ACTIVE",
          scrumRole: role,
          _id: { $ne: target._id },
        }).session(session)
      : null;
    if (
      (!incumbent && replacing) ||
      (incumbent && incumbent.id !== String(previousId).toLowerCase())
    ) {
      throw new AppError("CONFLICT", {
        message:
          "The Scrum role assignment changed. Refresh the member list and try again.",
      });
    }
    if (
      target.scrumRole === "DEVELOPER" &&
      role !== "DEVELOPER" &&
      (await listUnfinishedAssigned(projectId, target, session)).length
    ) {
      throw new AppError("CONFLICT", {
        message:
          "Reassign this Developer’s unfinished work before changing their role.",
      });
    }

    const updated = [];
    if (incumbent && replacementRole) {
      if (
        exclusiveRoles.includes(replacementRole) &&
        (await Membership.exists({
          projectId,
          status: "ACTIVE",
          scrumRole: replacementRole,
        }).session(session))
      ) {
        throw new AppError("CONFLICT", {
          message: "The replacement role is already assigned.",
        });
      }
      const previousAccount = await User.findById(incumbent.userId)
        .select("fullName email")
        .session(session)
        .lean();
      if (!previousAccount)
        throw new AppError("NOT_FOUND", {
          message: "The current role holder’s account was not found.",
        });
      await saveRole(actor, incumbent, replacementRole, session);
      updated.push(memberResponse(incumbent, previousAccount));
    }

    await saveRole(actor, target, role, session);
    updated.unshift(memberResponse(target, account));
    return updated;
  });
};

export default {
  getMembers,
  addMember,
  removeMember,
  removeSelf,
  changeMembership,
};
