import { isObjectIdOrHexString, Types } from "mongoose";

import Membership from "../models/membership.ts";
import Project from "../models/project.ts";
import Sprint from "../models/sprint.ts";
import WorkItem from "../models/workitem.ts";

const memberRoles = ["PRODUCT_OWNER", "SCRUM_MASTER", "DEVELOPER"] as const;

export class SprintServiceError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SprintServiceError";
    this.status = status;
  }
}

function validateIds(projectId: string, sprintId?: string) {
  if (
    !isObjectIdOrHexString(projectId) ||
    (sprintId !== undefined && !isObjectIdOrHexString(sprintId))
  ) {
    throw new SprintServiceError(400, "Invalid project or sprint ID.");
  }
}

async function requireProjectMember(projectId: string, userId: string) {
  const project = await Project.findById(projectId).select("_id").lean();
  if (!project) throw new SprintServiceError(404, "Project not found.");

  const membership = await Membership.collection.findOne({
    projectId: new Types.ObjectId(projectId),
    userId: new Types.ObjectId(userId),
    status: "ACTIVE",
    $or: [{ accessRole: "OWNER" }, { scrumRole: { $in: [...memberRoles] } }],
  });
  if (!membership)
    throw new SprintServiceError(403, "You are not an active project member.");
}

function compareSprintDateDescending(
  left: {
    startDate?: Date | null;
    _id: { toString(): string };
  },
  right: {
    startDate?: Date | null;
    _id: { toString(): string };
  },
) {
  if (left.startDate == null && right.startDate == null)
    return left._id.toString().localeCompare(right._id.toString());
  if (left.startDate == null) return -1;
  if (right.startDate == null) return 1;
  return (
    right.startDate.getTime() - left.startDate.getTime() ||
    left._id.toString().localeCompare(right._id.toString())
  );
}

export async function listProjectSprints(projectId: string, userId: string) {
  validateIds(projectId);
  await requireProjectMember(projectId, userId);

  const sprints = await Sprint.find({ projectId, deletedAt: null }).exec();
  return sprints
    .sort(compareSprintDateDescending)
    .map((sprint) => sprint.toJSON());
}

export async function getProjectSprint(
  projectId: string,
  sprintId: string,
  userId: string,
) {
  validateIds(projectId, sprintId);
  await requireProjectMember(projectId, userId);

  const sprint = await Sprint.findOne({
    _id: sprintId,
    projectId,
    deletedAt: null,
  }).exec();
  if (!sprint) throw new SprintServiceError(404, "Sprint not found.");

  const items = await WorkItem.find({
    projectId,
    sprintId: sprint._id,
    parentId: null,
    deletedAt: null,
  })
    .sort({ orderIndex: 1, _id: 1 })
    .exec();

  return {
    ...sprint.toJSON(),
    items: items.map((item) => ({
      ...item.toJSON(),
      sprint: { id: sprint.id, name: sprint.name },
    })),
  };
}
