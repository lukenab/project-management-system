// Shape follows docs/api/reporting.md so the preview can be replaced by the API.
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

export type SprintActivityEntry = {
  id: string;
  kind: "COMMENT" | "HISTORY";
  actor: { id: string; fullName: string };
  workItem: { id: string; key: string; title: string };
  /** Comment text, or a server-written summary of the change. */
  text: string;
  occurredAt: string;
};
