import { request } from "./api";
export type SprintProgress = {
  sprintId: string;
  calculatedAt: string;
  sprintItems: {
    total: number;
    toDo: number;
    inProgress: number;
    done: number;
  };
  completionPercent: number;
  overdueItems: { id: string; key: string; title: string; dueDate: string }[];
  memberWorkload: { assigneeId: string | null; itemCount: number }[];
};

type SprintActivity = {
  id: string;
  kind: "COMMENT" | "HISTORY";
  actor: { id: string; fullName: string };
  workItem: { id: string; key: string; title: string };
  text: string;
  occurredAt: string;
};

export async function loadSprintReport(projectId: string) {
  const project = `/api/projects/${encodeURIComponent(projectId)}`;
  const [progress, activity] = await Promise.all([
    request<SprintProgress>("GET", `${project}/sprint-progress`),
    request<SprintActivity[]>("GET", `${project}/sprint-activity`),
  ]);
  return { progress, activity };
}
