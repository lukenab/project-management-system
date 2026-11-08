import type { WorkItem } from "./work-items";

import { listProjectMembers } from "./projects";
import { apiWorkItemRepository } from "./work-items-api";

export async function getProjectSummary(projectId: string) {
  const [items, members] = await Promise.all([
    apiWorkItemRepository.list(projectId),
    listProjectMembers(projectId),
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
  };
}
