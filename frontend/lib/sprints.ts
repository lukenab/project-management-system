import type { WorkItem } from "./work-items";

import { WorkItemDataError } from "./work-items";

export type SprintStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export type Sprint = {
  id: string;
  projectId: string;
  /** Required and unique within the project, case-insensitive. */
  name: string;
  goal: string | null;
  /** ISO datetime at 00:00 UTC, or null until planned; required to start. */
  plannedStartAt: string | null;
  /** Exclusive end, ISO datetime at 00:00 UTC, or null until planned. */
  plannedEndAt: string | null;
  status: SprintStatus;
  startedAt: string | null;
  closedAt: string | null;
  /** Optional note recorded when the Sprint is completed, e.g. why it closed early. */
  closeNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SprintSummary = Sprint & { itemCount: number; doneCount: number };

export type SprintDetail = Sprint & { items: WorkItem[] };

/** Work Items join a Sprint through Work Items PATCH sprintId, not this input. */
export type SprintInput = {
  name: string;
  goal?: string | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
};

export interface SprintRepository {
  list(projectId: string): Promise<SprintSummary[]>;
  get(projectId: string, sprintId: string): Promise<SprintDetail>;
  create(projectId: string, input: SprintInput): Promise<SprintDetail>;
  update(
    projectId: string,
    sprintId: string,
    input: Partial<SprintInput>,
  ): Promise<SprintDetail>;
  /** Saves the reviewed name, dates and goal and starts the Sprint in one step. */
  start(
    projectId: string,
    sprintId: string,
    input?: Partial<SprintInput>,
  ): Promise<SprintDetail>;
  /** Closes the Sprint; also covers ending it early when its goal is obsolete. */
  complete(
    projectId: string,
    sprintId: string,
    closeNote?: string | null,
  ): Promise<SprintDetail>;
  /** Permanently removes a Sprint in any state; its Work Items return to the backlog. */
  remove(projectId: string, sprintId: string): Promise<void>;
}

export class SprintDataError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "VALIDATION"
      | "CONFLICT"
      | "ARCHIVED",
    message: string,
  ) {
    super(message);
    this.name = "SprintDataError";
  }
}

export function sprintErrorMessage(error: unknown, fallback: string) {
  return error instanceof SprintDataError || error instanceof WorkItemDataError
    ? error.message
    : fallback;
}

export const sprintStatusLabels: Record<SprintStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

export const openSprintStatuses: SprintStatus[] = ["DRAFT", "ACTIVE"];

export function toDateInput(value: string) {
  return value.slice(0, 10);
}

export function fromDateInput(value: string) {
  return `${value}T00:00:00.000Z`;
}

export function formatSprintDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(value));
}

export function sprintLabel(sprint: Pick<Sprint, "name">) {
  return sprint.name;
}

/** Prefills "Sprint N" from the highest existing "Sprint <number>" name. */
export function suggestSprintName(sprints: Pick<Sprint, "name">[]) {
  const numbers = sprints.map(
    (sprint) => Number(/^Sprint (\d+)$/.exec(sprint.name)?.[1]) || 0,
  );
  return `Sprint ${Math.max(sprints.length, ...numbers) + 1}`;
}

/** Calendar-month limit, clamped to the last day of a shorter month. */
export function latestSprintEnd(start: string) {
  const date = new Date(start);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

/** Dates are optional until Start; when both are set they must form a valid range. */
export function sprintDateError(start: string | null, end: string | null) {
  if (!start || !end) return null;
  if (end <= start) return "End date must be after the start date.";
  if (end > latestSprintEnd(start))
    return "A Sprint can last at most one month.";
  return null;
}

export function formatSprintRange(
  sprint: Pick<Sprint, "plannedStartAt" | "plannedEndAt">,
) {
  const { plannedStartAt: start, plannedEndAt: end } = sprint;
  if (start && end)
    return `${formatSprintDate(start)} – ${formatSprintDate(end, true)}`;
  if (start) return `From ${formatSprintDate(start, true)}`;
  if (end) return `Until ${formatSprintDate(end, true)}`;
  return "No dates";
}

/** Dated Sprints sort by start; undated Drafts sort as the latest plans. */
export function compareSprintStart(
  a: Pick<Sprint, "plannedStartAt" | "id">,
  b: Pick<Sprint, "plannedStartAt" | "id">,
) {
  if (a.plannedStartAt === b.plannedStartAt) return a.id.localeCompare(b.id);
  if (a.plannedStartAt === null) return 1;
  if (b.plannedStartAt === null) return -1;
  return a.plannedStartAt.localeCompare(b.plannedStartAt);
}

/** The earliest dated Draft: the one planned to start after the running Sprint. */
export function nextDraft<T extends Sprint>(sprints: T[]) {
  return sprints
    .filter((sprint) => sprint.status === "DRAFT" && sprint.plannedStartAt)
    .sort(compareSprintStart)[0];
}

/** The planned end has passed while the Sprint is still running. */
export function isPastEnd(sprint: Sprint, now = new Date()) {
  return (
    sprint.status === "ACTIVE" &&
    sprint.plannedEndAt !== null &&
    new Date(sprint.plannedEndAt) <= now
  );
}
