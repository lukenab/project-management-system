import type { SprintRepository } from "./sprints";

import { previewSprintRepository } from "./preview-sprints";
import { apiSprintRepository } from "./sprints-api";

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// The project pages still list preview projects (ids such as "customer-portal"), but the
// Sprint API needs a real project. Until Projects is connected, setting
// NEXT_PUBLIC_SPRINT_API_PROJECT_ID in frontend/.env.local sends every Sprint call of the
// preview projects to that real project. Remove this variable and the check below once the
// project pages use real project ids.
const bridgeProjectId = process.env.NEXT_PUBLIC_SPRINT_API_PROJECT_ID ?? "";

/** The project id the Sprint API should receive, or null when the preview data is used. */
const realProjectId = (projectId: string) =>
  OBJECT_ID.test(projectId)
    ? projectId
    : OBJECT_ID.test(bridgeProjectId)
      ? bridgeProjectId
      : null;

const route =
  <A extends unknown[], R>(
    call: (repository: SprintRepository, projectId: string, ...args: A) => R,
  ) =>
  (projectId: string, ...args: A) => {
    const realId = realProjectId(projectId);
    return realId
      ? call(apiSprintRepository, realId, ...args)
      : call(previewSprintRepository, projectId, ...args);
  };

/** What the Sprint screens use: the backend for real projects, preview data otherwise. */
export const sprintRepository: SprintRepository = {
  list: route((repository, projectId) => repository.list(projectId)),
  get: route((repository, projectId, sprintId: string) =>
    repository.get(projectId, sprintId),
  ),
  create: route(
    (repository, projectId, input: Parameters<SprintRepository["create"]>[1]) =>
      repository.create(projectId, input),
  ),
  update: route(
    (
      repository,
      projectId,
      sprintId: string,
      input: Parameters<SprintRepository["update"]>[2],
    ) => repository.update(projectId, sprintId, input),
  ),
  start: route(
    (
      repository,
      projectId,
      sprintId: string,
      input?: Parameters<SprintRepository["start"]>[2],
    ) => repository.start(projectId, sprintId, input),
  ),
  complete: route((repository, projectId, sprintId: string) =>
    repository.complete(projectId, sprintId),
  ),
  remove: route((repository, projectId, sprintId: string) =>
    repository.remove(projectId, sprintId),
  ),
};
