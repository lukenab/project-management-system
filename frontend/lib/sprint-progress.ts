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
