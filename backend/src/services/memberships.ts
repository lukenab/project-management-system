import { MongoServerError } from "mongodb";

import Membership from "../models/membership.ts";
import Project from "../models/project.ts";
import User from "../models/user.ts";
import { createError } from "../utils/error.ts";

interface AddMembershipPayload {
  email: string;
  scrumAccountability: string;
}

interface ChangeAccountabilityPayload {
  membershipId: string;
  scrumAccountability: string;
  previousUserMembershipId?: string;
  previousUserNewAccountability?: string;
}

const requireOwnership = async (projectId: string, userId: string) => {
  const ownership = await Membership.findOne({
    userId,
    projectId,
    accessRole: "OWNER",
  }).lean();

  if (!ownership) {
    throw createError(403, "User is not authenticated to perform this action");
  }
};

const getMembers = async (projectId: string, userId: string) => {
  const membership = await Membership.findOne({ userId, projectId }).lean();
  if (!membership) {
    throw createError(403, "User is not authenticated to perform this action");
  }

  const members = await Membership.find({ projectId });
  return members;
};

const addMember = async (
  projectId: string,
  userId: string,
  payload: AddMembershipPayload,
) => {
  await requireOwnership(projectId, userId);

  const { email, scrumAccountability: scrumRole } = payload;
  const account = await User.findOne({ email }).lean();
  if (!account || account.status !== "ACTIVE") {
    throw createError(404, "Account does not exist");
  }

  const project = await Project.findById(projectId).lean();
  if (!project || project.status !== "ACTIVE") {
    throw createError(404, "Project does not exist");
  }

  const existingMembership = await Membership.findOne({
    userId: account._id,
    projectId,
  }).lean();
  if (existingMembership) {
    throw createError(409, "Account already joined the project");
  }

  const membership = new Membership({
    userId: account._id,
    projectId,
    accessRole: "MEMBER",
    scrumRole,
    joinedAt: new Date(),
  });

  try {
    const savedMembership = await membership.save();
    return savedMembership;
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      throw createError(409, `${scrumRole} is not allowed to be duplicated`);
    }
    throw err;
  }
};

const removeMember = async (
  projectId: string,
  userId: string,
  membershipId: string,
) => {
  await requireOwnership(projectId, userId);

  // Preventing an owner from removing themselves
  const targetMembership = await Membership.findOne({
    _id: membershipId,
    projectId,
  }).lean();
  if (
    targetMembership?.accessRole === "OWNER" &&
    targetMembership.userId.toString() === userId
  ) {
    throw createError(
      409,
      "Owner cannot leave the project. Please transfer ownership first.",
    );
  }

  // TODO: Clear unfinished sprint

  await Membership.findOneAndDelete({
    _id: membershipId,
    projectId,
    accessRole: { $ne: "OWNER" },
  });
};

const removeSelf = async (projectId: string, userId: string) => {
  const ownership = await Membership.findOne({
    userId,
    projectId,
    accessRole: "OWNER",
  }).lean();
  if (ownership) {
    throw createError(
      409,
      "Owner cannot leave the project. Please transfer ownership first.",
    );
  }

  await Membership.findOneAndDelete({ userId, projectId });
};

const changeMembership = async (
  projectId: string,
  userId: string,
  payload: ChangeAccountabilityPayload,
) => {
  await requireOwnership(projectId, userId);

  const project = await Project.findById(projectId).lean();
  if (!project || project.status !== "ACTIVE") {
    throw createError(404, "Project does not exist");
  }

  const {
    membershipId,
    scrumAccountability: scrumRole,
    previousUserMembershipId: otherId,
    previousUserNewAccountability: otherScrumRole,
  } = payload;

  const changedMembership = [];

  if (otherId && otherScrumRole) {
    try {
      const otherNewMembership = await Membership.findOneAndUpdate(
        { _id: otherId, projectId },
        { scrumRole: otherScrumRole },
        { returnDocument: "after" },
      );

      changedMembership.push(otherNewMembership);
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        throw createError(
          409,
          `${otherScrumRole} is not allowed to be duplicated`,
        );
      }
      throw err;
    }
  }

  try {
    const newMembership = await Membership.findOneAndUpdate(
      { _id: membershipId, projectId },
      { scrumRole },
      { returnDocument: "after" },
    );

    changedMembership.push(newMembership);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      throw createError(409, `${scrumRole} is not allowed to be duplicated`);
    }
    throw err;
  }

  return changedMembership;
};

export default {
  getMembers,
  addMember,
  removeMember,
  removeSelf,
  changeMembership,
};
