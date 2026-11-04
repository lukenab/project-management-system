import type { SprintActivityEntry, SprintProgress } from "./sprint-progress";
import type { Sprint } from "./sprints";

import { previewCollaborationRepository } from "./preview-collaboration";
import { previewSprintRepository } from "./preview-sprints";

/**
 * Preview only; a future GET /projects/:projectId/sprint-progress replaces this.
 * The API answers 409 when no Sprint is ACTIVE; the preview returns null instead.
 */
export async function getPreviewSprintProgress(
  projectId: string,
): Promise<{ sprint: Sprint; progress: SprintProgress } | null> {
  const sprints = await previewSprintRepository.list(projectId);
  const active = sprints.find((sprint) => sprint.status === "ACTIVE");
  if (!active) return null;
  const detail = await previewSprintRepository.get(projectId, active.id);
  const items = detail.items.filter((item) => item.parentId === null);
  const count = (status: (typeof items)[number]["status"]) =>
    items.filter((item) => item.status === status).length;
  const done = count("DONE");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const remaining = items.filter((item) => item.status !== "DONE");
  const workload = new Map<string | null, number>();
  for (const item of items)
    workload.set(item.assigneeId, (workload.get(item.assigneeId) ?? 0) + 1);
  return {
    sprint: active,
    progress: {
      sprintId: active.id,
      calculatedAt: now.toISOString(),
      sprintItems: {
        total: items.length,
        toDo: count("TODO"),
        inProgress: count("IN_PROGRESS"),
        done,
      },
      completionPercent: items.length
        ? Math.round((done / items.length) * 10000) / 100
        : 0,
      overdueItems: remaining
        .filter((item) => item.dueDate !== null && item.dueDate < today)
        .map((item) => ({
          id: item.id,
          key: item.key,
          title: item.title,
          dueDate: item.dueDate as string,
        }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      memberWorkload: [...workload].map(([assigneeId, itemCount]) => ({
        assigneeId,
        itemCount,
      })),
    },
  };
}

/** Preview only; a future GET /projects/:projectId/sprint-activity replaces this. */
export async function getPreviewSprintActivity(
  projectId: string,
  sprintId: string,
): Promise<SprintActivityEntry[]> {
  const detail = await previewSprintRepository.get(projectId, sprintId);
  const items = detail.items.filter((item) => item.parentId === null);
  const entries = await Promise.all(
    items.map(async (item) => {
      const workItem = { id: item.id, key: item.key, title: item.title };
      const [comments, events] = await Promise.all([
        previewCollaborationRepository.listComments(projectId, item.id),
        previewCollaborationRepository.listActivity(projectId, item.id),
      ]);
      return [
        ...comments.map((comment): SprintActivityEntry => ({
          id: comment.id,
          kind: "COMMENT",
          actor: comment.author,
          workItem,
          text: comment.content,
          occurredAt: comment.createdAt,
        })),
        ...events.map((event): SprintActivityEntry => ({
          id: event.id,
          kind: "HISTORY",
          actor: event.actor,
          workItem,
          text: event.summary,
          occurredAt: event.occurredAt,
        })),
      ];
    }),
  );
  return entries
    .flat()
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        b.id.localeCompare(a.id, undefined, { numeric: true }),
    );
}
