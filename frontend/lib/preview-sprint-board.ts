import type { WorkItemMember, WorkItemStatus } from "./work-items";

import { getPreviewProject } from "./preview-data";
import { previewSprintRepository } from "./preview-sprints";
import { previewWorkItemRepository } from "./preview-work-items";
import { boardStatuses, type SprintBoardData } from "./sprint-board";
import { WorkItemDataError } from "./work-items";

export async function getPreviewSprintBoard(
  projectId: string,
): Promise<SprintBoardData> {
  const sprints = await previewSprintRepository.list(projectId);
  const active = sprints.find((sprint) => sprint.status === "ACTIVE");
  const items = active
    ? (await previewSprintRepository.get(projectId, active.id)).items
    : [];
  return {
    sprint: active
      ? {
          id: active.id,
          name: active.name,
          startDate: active.startDate,
          endDate: active.endDate,
        }
      : null,
    columns: boardStatuses.map((status) => ({
      status,
      cards: items.filter(
        (item) => item.parentId === null && item.status === status,
      ),
    })),
  };
}

export function listBoardMembers(projectId: string): Promise<WorkItemMember[]> {
  return previewWorkItemRepository.listMembers(projectId);
}

export async function updateBoardStatus(
  projectId: string,
  itemId: string,
  status: WorkItemStatus,
) {
  const project = getPreviewProject(projectId);
  if (
    !project ||
    project.status !== "ACTIVE" ||
    project.scrumRole !== "Developer"
  ) {
    throw new WorkItemDataError(
      "FORBIDDEN",
      "You cannot change this item's status.",
    );
  }
  const board = await getPreviewSprintBoard(projectId);
  if (
    !board.sprint ||
    !board.columns.some((column) =>
      column.cards.some((item) => item.id === itemId),
    )
  ) {
    throw new WorkItemDataError(
      "NOT_FOUND",
      "This item is no longer on the active Sprint Board. Refresh the board and try again.",
    );
  }
  return previewWorkItemRepository.update(projectId, itemId, { status });
}
