import type { PreviewProject } from "./preview-data";
import type { StoredItem } from "./preview-work-items";
import type {
  Sprint,
  SprintInput,
  SprintDetail,
  SprintRepository,
  SprintStatus,
} from "./sprints";

import { getPreviewProject } from "./preview-data";
import {
  previewPublicWorkItem,
  previewTopLevelItems,
} from "./preview-work-items";
import {
  SprintDataError,
  compareSprintStart,
  openSprintStatuses,
  sprintDateError,
  sprintLabel,
} from "./sprints";

type StoredSprint = Sprint & { deletedAt: string | null };

type SeedSprint = Pick<Sprint, "id" | "name" | "goal" | "status"> & {
  start: string;
  end: string;
};

// Commerce (Product Owner view) covers every lifecycle state; Atlas is the
// read-only Developer view. Item links are seeded on the Work Items side.
const seeds: Record<string, SeedSprint[]> = {
  "team-workspace": [
    {
      id: "com-sprint-1",
      name: "Sprint 1",
      goal: "Customers can browse products and save them for later",
      status: "CLOSED",
      start: "2026-09-21",
      end: "2026-10-05",
    },
    {
      id: "com-sprint-2",
      name: "Sprint 2",
      goal: "Customers see the full cost before they pay",
      status: "ACTIVE",
      start: "2026-10-19",
      end: "2026-11-02",
    },
    {
      id: "com-sprint-3",
      name: "Sprint 3",
      goal: "Signed-in customers never lose their basket",
      status: "DRAFT",
      start: "2026-11-02",
      end: "2026-11-16",
    },
    {
      id: "com-sprint-4",
      name: "Sprint 4",
      goal: null,
      status: "DRAFT",
      start: "2026-11-16",
      end: "2026-11-30",
    },
  ],
  "customer-portal": [
    {
      id: "atl-sprint-1",
      name: "Sprint 1",
      goal: "Customers can review their account in one place",
      status: "ACTIVE",
      start: "2026-10-19",
      end: "2026-11-02",
    },
  ],
};

// Browser memory only; refresh resets it. These checks are not server authorization.
const stores = new Map<string, StoredSprint[]>();

function sprintsFor(projectId: string) {
  let store = stores.get(projectId);
  if (!store) {
    const created = "2026-09-14T02:00:00.000Z";
    store = (seeds[projectId] ?? []).map((seed) => ({
      id: seed.id,
      projectId,
      name: seed.name,
      goal: seed.goal,
      plannedStartAt: `${seed.start}T00:00:00.000Z`,
      plannedEndAt: `${seed.end}T00:00:00.000Z`,
      status: seed.status,
      startedAt: seed.status === "DRAFT" ? null : `${seed.start}T02:00:00.000Z`,
      closedAt: seed.status === "CLOSED" ? `${seed.end}T02:00:00.000Z` : null,
      closeNote: null,
      createdAt: created,
      updatedAt: created,
      deletedAt: null,
    }));
    stores.set(projectId, store);
  }
  return store;
}

function projectById(projectId: string) {
  const project = getPreviewProject(projectId);
  if (!project) throw new SprintDataError("NOT_FOUND", "Project not found.");
  return project;
}

function productOwnerProject(projectId: string): PreviewProject {
  const project = projectById(projectId);
  if (project.status !== "ACTIVE")
    throw new SprintDataError("ARCHIVED", "This project is read-only.");
  if (project.scrumRole !== "Product Owner")
    throw new SprintDataError(
      "FORBIDDEN",
      "Only the Product Owner can manage Sprints.",
    );
  return project;
}

function findSprint(projectId: string, sprintId: string) {
  const sprint = sprintsFor(projectId).find(
    (candidate) => candidate.id === sprintId && !candidate.deletedAt,
  );
  if (!sprint) throw new SprintDataError("NOT_FOUND", "Sprint not found.");
  return sprint;
}

function liveSprints(projectId: string) {
  return sprintsFor(projectId).filter((sprint) => !sprint.deletedAt);
}

function publicSprint(sprint: StoredSprint): Sprint {
  const { deletedAt, ...fields } = sprint;
  void deletedAt;
  return { ...fields };
}

function detail(sprint: StoredSprint): SprintDetail {
  return {
    ...publicSprint(sprint),
    items: previewTopLevelItems(sprint.projectId)
      .filter((item) => item.sprintId === sprint.id)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id))
      .map(previewPublicWorkItem),
  };
}

function isOpen(status: SprintStatus) {
  return openSprintStatuses.includes(status);
}

function readinessReason(item: StoredItem) {
  if (item.status === "DONE") return "Done";
  if (!item.description?.trim()) return "Needs a description";
  return null;
}

function dateValue(
  value: string | null | undefined,
  current: string | null | undefined,
) {
  if (value === undefined) return current ?? null;
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new SprintDataError("VALIDATION", "Enter valid dates.");
  return value;
}

function validateSprint(
  projectId: string,
  input: Partial<SprintInput>,
  current: StoredSprint | null,
) {
  const allowed = ["name", "goal", "plannedStartAt", "plannedEndAt"];
  if (Object.keys(input).some((field) => !allowed.includes(field)))
    throw new SprintDataError("VALIDATION", "Unsupported field.");
  if (input.name !== undefined && typeof input.name !== "string")
    throw new SprintDataError("VALIDATION", "Enter a Sprint name.");
  const name = (input.name ?? current?.name ?? "").trim();
  if (!name) throw new SprintDataError("VALIDATION", "Enter a Sprint name.");
  const duplicate = liveSprints(projectId).find(
    (sprint) =>
      sprint.id !== current?.id &&
      sprint.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (duplicate)
    throw new SprintDataError(
      "CONFLICT",
      `${duplicate.name} already exists in this project.`,
    );
  if (
    input.goal !== undefined &&
    input.goal !== null &&
    typeof input.goal !== "string"
  )
    throw new SprintDataError("VALIDATION", "Enter a valid Sprint Goal.");
  const goal =
    input.goal === undefined
      ? (current?.goal ?? null)
      : input.goal?.trim() || null;
  const start = dateValue(input.plannedStartAt, current?.plannedStartAt);
  const end = dateValue(input.plannedEndAt, current?.plannedEndAt);
  const dateError = sprintDateError(start, end);
  if (dateError) throw new SprintDataError("VALIDATION", dateError);
  // Only fully dated Sprints can collide; undated Drafts are checked at Start.
  const overlap =
    start && end
      ? liveSprints(projectId).find(
          (sprint) =>
            sprint.id !== current?.id &&
            isOpen(sprint.status) &&
            sprint.plannedStartAt !== null &&
            sprint.plannedEndAt !== null &&
            start < sprint.plannedEndAt &&
            sprint.plannedStartAt < end,
        )
      : undefined;
  if (overlap)
    throw new SprintDataError(
      "CONFLICT",
      `These dates overlap ${sprintLabel(overlap)}.`,
    );
  return { goal, name, start, end };
}

function unlinkAll(sprint: StoredSprint) {
  for (const item of previewTopLevelItems(sprint.projectId)) {
    if (item.sprintId === sprint.id) item.sprintId = null;
  }
}

function close(sprint: StoredSprint, note: string | null) {
  const now = new Date().toISOString();
  for (const item of previewTopLevelItems(sprint.projectId)) {
    if (item.sprintId === sprint.id && item.status !== "DONE")
      item.sprintId = null;
  }
  Object.assign(sprint, {
    status: "CLOSED",
    closedAt: now,
    closeNote: note,
    updatedAt: now,
  });
}

function requireStatus(
  sprint: StoredSprint,
  status: SprintStatus,
  action: string,
) {
  if (sprint.status !== status)
    throw new SprintDataError(
      "CONFLICT",
      `Only ${status === "DRAFT" ? "a Draft" : "an Active"} Sprint can be ${action}.`,
    );
}

export const previewSprintRepository: SprintRepository = {
  async list(projectId) {
    projectById(projectId);
    const items = previewTopLevelItems(projectId);
    return liveSprints(projectId)
      .map((sprint) => {
        const linked = items.filter((item) => item.sprintId === sprint.id);
        return {
          ...publicSprint(sprint),
          itemCount: linked.length,
          doneCount: linked.filter((item) => item.status === "DONE").length,
        };
      })
      .sort((a, b) => compareSprintStart(b, a));
  },
  async get(projectId, sprintId) {
    projectById(projectId);
    return detail(findSprint(projectId, sprintId));
  },
  async create(projectId, input) {
    productOwnerProject(projectId);
    // Any number of Drafts; the overlap check keeps open Sprints sequential.
    const plan = validateSprint(projectId, input, null);
    const now = new Date().toISOString();
    const sprint: StoredSprint = {
      // Preview IDs resemble ObjectIds; the backend allocates real IDs.
      id: crypto.randomUUID().replaceAll("-", "").slice(0, 24),
      projectId,
      name: plan.name,
      goal: plan.goal,
      plannedStartAt: plan.start,
      plannedEndAt: plan.end,
      status: "DRAFT",
      startedAt: null,
      closedAt: null,
      closeNote: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    sprintsFor(projectId).push(sprint);
    return detail(sprint);
  },
  async update(projectId, sprintId, input) {
    productOwnerProject(projectId);
    const sprint = findSprint(projectId, sprintId);
    if (!isOpen(sprint.status))
      throw new SprintDataError("CONFLICT", "Closed Sprints are read-only.");
    if (!Object.keys(input).length)
      throw new SprintDataError("VALIDATION", "Choose a field to update.");
    if (sprint.status === "ACTIVE") {
      // A running Sprint keeps its start; only the end can move (to extend or shorten it).
      if (
        input.plannedStartAt !== undefined &&
        input.plannedStartAt !== sprint.plannedStartAt
      )
        throw new SprintDataError(
          "CONFLICT",
          "The start date is fixed once the Sprint has started.",
        );
      if (input.plannedEndAt === null)
        throw new SprintDataError(
          "VALIDATION",
          "An active Sprint needs an end date.",
        );
    }
    const plan = validateSprint(projectId, input, sprint);
    Object.assign(sprint, {
      name: plan.name,
      goal: plan.goal,
      plannedStartAt: plan.start,
      plannedEndAt: plan.end,
      updatedAt: new Date().toISOString(),
    });
    return detail(sprint);
  },
  async start(projectId, sprintId, input = {}) {
    productOwnerProject(projectId);
    const sprint = findSprint(projectId, sprintId);
    requireStatus(sprint, "DRAFT", "started");
    const active = liveSprints(projectId).find(
      (candidate) => candidate.status === "ACTIVE",
    );
    if (active)
      throw new SprintDataError(
        "CONFLICT",
        `Complete or cancel ${sprintLabel(active)} first.`,
      );
    if (!detail(sprint).items.length)
      throw new SprintDataError(
        "CONFLICT",
        "Add at least one Work Item first: choose this Sprint in a Work Item’s details.",
      );
    const plan = validateSprint(projectId, input, sprint);
    if (!plan.start || !plan.end)
      throw new SprintDataError("VALIDATION", "Enter a start and end date.");
    const now = new Date().toISOString();
    Object.assign(sprint, {
      name: plan.name,
      goal: plan.goal,
      plannedStartAt: plan.start,
      plannedEndAt: plan.end,
      status: "ACTIVE",
      startedAt: now,
      updatedAt: now,
    });
    return detail(sprint);
  },
  async complete(projectId, sprintId, closeNote = null) {
    productOwnerProject(projectId);
    const sprint = findSprint(projectId, sprintId);
    requireStatus(sprint, "ACTIVE", "completed");
    if (closeNote !== null && typeof closeNote !== "string")
      throw new SprintDataError("VALIDATION", "Enter a valid note.");
    close(sprint, closeNote?.trim() || null);
    return detail(sprint);
  },
  async remove(projectId, sprintId) {
    productOwnerProject(projectId);
    const sprint = findSprint(projectId, sprintId);
    // Any state can be deleted; every linked item returns to the backlog unchanged.
    unlinkAll(sprint);
    const now = new Date().toISOString();
    Object.assign(sprint, { deletedAt: now, updatedAt: now });
  },
};

/** Summary shown on a Work Item; resolves names without touching item data. */
export function previewSprintRef(projectId: string, sprintId: string) {
  const sprint = sprintsFor(projectId).find((entry) => entry.id === sprintId);
  return sprint ? { id: sprint.id, name: sprintLabel(sprint) } : null;
}

export type PreviewSprintOption = {
  id: string;
  name: string;
  status: SprintStatus;
};

/** Sprints a Work Item can be assigned to from its drawer, plus its current one. */
export function previewSprintOptions(
  projectId: string,
  currentSprintId: string | null,
): PreviewSprintOption[] {
  return liveSprints(projectId)
    .filter((sprint) => isOpen(sprint.status) || sprint.id === currentSprintId)
    .sort(compareSprintStart)
    .map((sprint) => ({
      id: sprint.id,
      name: sprintLabel(sprint),
      status: sprint.status,
    }));
}

/** Drawer assignment; callers already checked the Product Owner role. */
export function assignPreviewSprint(item: StoredItem, sprintId: string | null) {
  if (item.sprintId === sprintId) return;
  const current = item.sprintId
    ? liveSprints(item.projectId).find((sprint) => sprint.id === item.sprintId)
    : undefined;
  if (sprintId === null) {
    if (current && !isOpen(current.status))
      throw new SprintDataError(
        "CONFLICT",
        "Items stay with a closed Sprint. Plan it into a Draft or Active Sprint instead.",
      );
  } else {
    const target = findSprint(item.projectId, sprintId);
    if (!isOpen(target.status))
      throw new SprintDataError("CONFLICT", "Choose a Draft or Active Sprint.");
    // Moving between open Sprints is allowed; readiness still applies.
    const reason = readinessReason(item);
    if (reason)
      throw new SprintDataError(
        "CONFLICT",
        `This item cannot join a Sprint: ${reason.toLowerCase()}.`,
      );
  }
  item.sprintId = sprintId;
  item.updatedAt = new Date().toISOString();
}
