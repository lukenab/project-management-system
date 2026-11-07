import type { WorkItem, WorkItemStatus } from "./work-items";

import { request } from "./api";

export const boardStatuses: WorkItemStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

export type SprintBoardData = {
  sprint: {
    id: string;
    name: string | null;
    startDate: string | null;
    endDate: string | null;
  } | null;
  columns: { status: WorkItemStatus; cards: WorkItem[] }[];
};

export function getSprintBoard(
  projectId: string,
  search: string,
): Promise<SprintBoardData> {
  const query = search ? "?" + new URLSearchParams({ search }) : "";
  return request<SprintBoardData>(
    "GET",
    "/api/projects/" + encodeURIComponent(projectId) + "/board" + query,
  );
}
