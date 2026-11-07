import { ApiError, request } from "./api";
import {
  SprintDataError,
  type SprintDetail,
  type SprintInput,
  type SprintRepository,
  type SprintSummary,
} from "./sprints";

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/sprints`;
const one = (projectId: string, sprintId: string) =>
  `${base(projectId)}/${encodeURIComponent(sprintId)}`;

/** Turns a backend error into the `SprintDataError` the Sprint screens already handle. */
function toSprintError(error: unknown): never {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NOT_FOUND":
      case "INVALID_ID":
        throw new SprintDataError("NOT_FOUND", error.message);
      case "FORBIDDEN":
      case "NOT_PROJECT_MEMBER":
        throw new SprintDataError("FORBIDDEN", error.message);
      case "VALIDATION_FAILED":
        throw new SprintDataError("VALIDATION", error.message);
      case "CONFLICT":
      case "DUPLICATE_VALUE":
        throw new SprintDataError("CONFLICT", error.message);
      case "PROJECT_ARCHIVED":
        throw new SprintDataError("ARCHIVED", error.message);
    }
  }
  throw error;
}

const call = <T>(run: () => Promise<T>) => run().catch(toSprintError);

/** Sprint endpoints of the backend (docs/api/sprints.md). */
export const apiSprintRepository: SprintRepository = {
  list: (projectId) =>
    call(() => request<SprintSummary[]>("GET", base(projectId))),
  get: (projectId, sprintId) =>
    call(() => request<SprintDetail>("GET", one(projectId, sprintId))),
  create: (projectId, input: SprintInput) =>
    call(() => request<SprintDetail>("POST", base(projectId), input)),
  update: (projectId, sprintId, input) =>
    call(() => request<SprintDetail>("PATCH", one(projectId, sprintId), input)),
  start: (projectId, sprintId, input) =>
    call(() =>
      request<SprintDetail>("POST", `${one(projectId, sprintId)}/start`, input),
    ),
  complete: (projectId, sprintId) =>
    call(() =>
      request<SprintDetail>("POST", `${one(projectId, sprintId)}/complete`),
    ),
  remove: (projectId, sprintId) =>
    call(() => request<void>("DELETE", one(projectId, sprintId))),
};
