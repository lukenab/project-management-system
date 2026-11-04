import type { WorkItem } from "./work-items";

import { previewCollaborationRepository } from "./preview-collaboration";
import { previewWorkItemRepository } from "./preview-work-items";

export type ProjectActivityEntry = {
  id: string;
  kind: "COMMENT" | "HISTORY";
  actor: { id: string; fullName: string };
  workItem: { id: string; key: string; title: string };
  /** Comment text, or a server-written summary of the change. */
  text: string;
  occurredAt: string;
};

export async function getPreviewProjectSummary(projectId: string) {
  const [items, members] = await Promise.all([
    previewWorkItemRepository.list(projectId),
    previewWorkItemRepository.listMembers(projectId),
  ]);
  const calculatedAt = new Date().toISOString();
  const today = calculatedAt.slice(0, 10);
  const counts = { total: items.length, toDo: 0, inProgress: 0, done: 0 };
  const workload = new Map<string | null, number>();
  const overdueItems: (Pick<WorkItem, "id" | "key" | "title"> & {
    dueDate: string;
  })[] = [];
  for (const { id, key, title, status, assigneeId, dueDate } of items) {
    if (status === "DONE") {
      counts.done++;
      continue;
    }
    if (status === "TODO") counts.toDo++;
    else counts.inProgress++;
    workload.set(assigneeId, (workload.get(assigneeId) ?? 0) + 1);
    if (dueDate && dueDate < today)
      overdueItems.push({ id, key, title, dueDate });
  }
  return {
    calculatedAt,
    counts,
    overdueItems: overdueItems.sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate),
    ),
    memberWorkload: [...workload].map(([assigneeId, itemCount]) => ({
      assigneeId,
      itemCount,
    })),
    members,
    activity: await getProjectActivity(projectId, items),
  };
}

async function getProjectActivity(projectId: string, items: WorkItem[]) {
  const entries = await Promise.all(
    items.map(async (item) => {
      const workItem = { id: item.id, key: item.key, title: item.title };
      const [comments, events] = await Promise.all([
        previewCollaborationRepository.listComments(projectId, item.id),
        previewCollaborationRepository.listActivity(projectId, item.id),
      ]);
      return [
        ...comments.map((comment): ProjectActivityEntry => ({
          id: comment.id,
          kind: "COMMENT",
          actor: comment.author,
          workItem,
          text: comment.content,
          occurredAt: comment.createdAt,
        })),
        ...events.map((event): ProjectActivityEntry => ({
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
