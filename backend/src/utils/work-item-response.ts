import type { WorkItemDocument } from "../models/workitem.ts";

type SprintSummary = { _id: unknown; name?: string | null };

export function workItemResponse(
  item: WorkItemDocument,
  sprint?: SprintSummary | null,
) {
  const {
    deletedAt: _deletedAt,
    parentId,
    sprintId,
    description,
    assigneeId,
    priority,
    startDate,
    dueDate,
    ...fields
  } = item.toJSON();
  return {
    ...fields,
    parentId: parentId ?? null,
    sprintId: sprintId ?? null,
    description: description ?? null,
    assigneeId: assigneeId ?? null,
    priority: priority ?? null,
    startDate: startDate ?? null,
    dueDate: dueDate ?? null,
    sprint: sprint
      ? { id: String(sprint._id), name: sprint.name ?? null }
      : null,
  };
}
