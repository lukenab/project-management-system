import { isObjectIdOrHexString, Types } from "mongoose";

import Membership from "../models/membership.ts";
import Project from "../models/project.ts";
import Sprint from "../models/sprint.ts";
import WorkItem from "../models/workitem.ts";

const memberRoles = ["PRODUCT_OWNER", "SCRUM_MASTER", "DEVELOPER"] as const;
const sprintFields = new Set(["name", "startDate", "endDate"]);

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

async function requireProductOwner(projectId: string, userId: string) {
  const project = await Project.findById(projectId).select("status").lean();
  if (!project) throw new SprintServiceError(404, "Project not found.");
  if (project.status !== "ACTIVE")
    throw new SprintServiceError(409, "Archived projects are read-only.");

  const membership = await Membership.collection.findOne({
    projectId: new Types.ObjectId(projectId),
    userId: new Types.ObjectId(userId),
    status: "ACTIVE",
    scrumRole: "PRODUCT_OWNER",
  });
  if (!membership)
    throw new SprintServiceError(
      403,
      "Only the Product Owner can create Sprints.",
    );
}

function parseUtcDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    throw new SprintServiceError(
      400,
      `${field} must be an ISO-8601 UTC date-time or null.`,
    );
  }

  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== value.slice(0, 19)
  ) {
    throw new SprintServiceError(400, `${field} is not a valid date-time.`);
  }
  return date;
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
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

export async function createProjectSprint(
  projectId: string,
  userId: string,
  input: unknown,
) {
  validateIds(projectId);
  await requireProductOwner(projectId, userId);

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SprintServiceError(400, "Request body must be a JSON object.");
  }

  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((field) => !sprintFields.has(field))) {
    throw new SprintServiceError(400, "Request contains unsupported fields.");
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    throw new SprintServiceError(400, "Sprint name is required.");
  }

  const name = body.name.trim();
  const startDate = parseUtcDate(body.startDate, "startDate");
  const endDate = parseUtcDate(body.endDate, "endDate");

  if (startDate && endDate) {
    if (endDate <= startDate)
      throw new SprintServiceError(400, "endDate must be after startDate.");

    const maximumEnd = latestAllowedEnd(startDate);
    if (endDate > maximumEnd)
      throw new SprintServiceError(
        400,
        "A Sprint can last at most one UTC calendar month.",
      );
  }

  const duplicate = await Sprint.findOne({
    projectId,
    deletedAt: null,
    name,
  })
    .collation({ locale: "en", strength: 2 })
    .select("_id")
    .lean()
    .exec();
  if (duplicate)
    throw new SprintServiceError(
      409,
      "A Sprint with this name already exists in the project.",
    );

  if (startDate && endDate) {
    const overlap = await Sprint.findOne({
      projectId,
      deletedAt: null,
      status: { $in: ["DRAFT", "ACTIVE"] },
      startDate: { $lt: endDate },
      endDate: { $gt: startDate },
    })
      .select("_id")
      .lean()
      .exec();
    if (overlap)
      throw new SprintServiceError(
        409,
        "Sprint date range overlaps another Draft or Active Sprint.",
      );
  }

  try {
    const sprint = await Sprint.create({
      projectId,
      name,
      startDate,
      endDate,
      status: "DRAFT",
    });
    const { deletedAt: _deletedAt, ...data } = sprint.toJSON();
    return { ...data, items: [] };
  } catch (error) {
    if (isDuplicateKeyError(error))
      throw new SprintServiceError(
        409,
        "A Sprint with this name or status already exists in the project.",
      );
    throw error;
  }
}

export async function updateProjectSprint(
  projectId: string,
  sprintId: string,
  userId: string,
  input: unknown,
) {
  validateIds(projectId, sprintId);
  await requireProductOwner(projectId, userId);

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SprintServiceError(400, "Request body must be a JSON object.");
  }

  const body = input as Record<string, unknown>;
  const fields = Object.keys(body);
  if (!fields.length)
    throw new SprintServiceError(400, "Choose a field to update.");
  if (fields.some((field) => !sprintFields.has(field))) {
    throw new SprintServiceError(400, "Request contains unsupported fields.");
  }

  const sprint = await Sprint.findOne({
    _id: sprintId,
    projectId,
    deletedAt: null,
  }).exec();
  if (!sprint) throw new SprintServiceError(404, "Sprint not found.");
  if (sprint.status === "CLOSED")
    throw new SprintServiceError(409, "Closed Sprints are read-only.");

  if (Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      throw new SprintServiceError(400, "Sprint name cannot be blank.");
    }
    sprint.name = body.name.trim();
  }

  const requestedStart = Object.hasOwn(body, "startDate")
    ? parseUtcDate(body.startDate, "startDate")
    : sprint.startDate;
  const requestedEnd = Object.hasOwn(body, "endDate")
    ? parseUtcDate(body.endDate, "endDate")
    : sprint.endDate;

  if (
    sprint.status === "ACTIVE" &&
    Object.hasOwn(body, "startDate") &&
    requestedStart?.getTime() !== sprint.startDate?.getTime()
  ) {
    throw new SprintServiceError(
      409,
      "The start date cannot change after a Sprint has started.",
    );
  }
  if (sprint.status === "ACTIVE" && !requestedEnd) {
    throw new SprintServiceError(
      400,
      "An Active Sprint must have an end date.",
    );
  }

  if (requestedStart && requestedEnd) {
    if (requestedEnd <= requestedStart)
      throw new SprintServiceError(400, "endDate must be after startDate.");

    if (requestedEnd > latestAllowedEnd(requestedStart))
      throw new SprintServiceError(
        400,
        "A Sprint can last at most one UTC calendar month.",
      );
  }

  const duplicate = await Sprint.findOne({
    _id: { $ne: sprint._id },
    projectId,
    deletedAt: null,
    name: sprint.name,
  })
    .collation({ locale: "en", strength: 2 })
    .select("_id")
    .lean()
    .exec();
  if (duplicate)
    throw new SprintServiceError(
      409,
      "A Sprint with this name already exists in the project.",
    );

  if (requestedStart && requestedEnd) {
    const overlap = await Sprint.findOne({
      _id: { $ne: sprint._id },
      projectId,
      deletedAt: null,
      status: { $in: ["DRAFT", "ACTIVE"] },
      startDate: { $lt: requestedEnd },
      endDate: { $gt: requestedStart },
    })
      .select("_id")
      .lean()
      .exec();
    if (overlap)
      throw new SprintServiceError(
        409,
        "Sprint date range overlaps another Draft or Active Sprint.",
      );
  }

  sprint.startDate = requestedStart;
  sprint.endDate = requestedEnd;

  try {
    await sprint.save();
  } catch (error) {
    if (isDuplicateKeyError(error))
      throw new SprintServiceError(
        409,
        "A Sprint with this name or status already exists in the project.",
      );
    throw error;
  }

  return getProjectSprint(projectId, sprintId, userId);
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

function latestAllowedEnd(start: Date) {
  const maxEnd = new Date(start);
  const day = start.getUTCDate();
  maxEnd.setUTCDate(1);
  maxEnd.setUTCMonth(maxEnd.getUTCMonth() + 1);
  const lastDayOfMonth = new Date(
    Date.UTC(maxEnd.getUTCFullYear(), maxEnd.getUTCMonth() + 1, 0),
  ).getUTCDate();
  maxEnd.setUTCDate(Math.min(day, lastDayOfMonth));
  return maxEnd;
}
