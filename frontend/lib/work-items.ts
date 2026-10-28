export type WorkItemStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type WorkItemPriority = "LOW" | "MEDIUM" | "HIGH";
export type WorkItemType = "STORY" | "TASK" | "BUG";

export type WorkItem = {
  id: string;
  projectId: string;
  key: string;
  parentId: string | null;
  title: string;
  description: string | null;
  workType: WorkItemType;
  status: WorkItemStatus;
  /** Project Membership ID of the assigned Developer, or null. */
  assigneeId: string | null;
  priority: WorkItemPriority | null;
  startDate: string | null;
  dueDate: string | null;
  orderIndex: number;
  /** User Account ID of the creator; assigned by the server. */
  createdBy: string;
  /** Read-only participation summary; children inherit their parent’s Sprint. */
  sprint: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkItemInput = Pick<WorkItem, "title"> &
  Partial<
    Pick<
      WorkItem,
      "parentId" | "description" | "workType" | "priority" | "assigneeId"
    >
  >;
export type UpdateWorkItemInput = Partial<
  Pick<
    WorkItem,
    | "title"
    | "description"
    | "workType"
    | "priority"
    | "status"
    | "assigneeId"
    | "startDate"
    | "dueDate"
  >
>;

export type WorkItemMember = {
  membershipId: string;
  fullName: string;
  email: string;
  initials: string;
  scrumAccountability: "PRODUCT_OWNER" | "SCRUM_MASTER" | "DEVELOPER" | null;
};

export interface WorkItemRepository {
  list(
    projectId: string,
    filter?: { parentId: string | null },
  ): Promise<WorkItem[]>;
  listMembers(projectId: string): Promise<WorkItemMember[]>;
  get(projectId: string, itemId: string): Promise<WorkItem>;
  create(projectId: string, input: CreateWorkItemInput): Promise<WorkItem>;
  update(
    projectId: string,
    itemId: string,
    input: UpdateWorkItemInput,
  ): Promise<WorkItem>;
  remove(projectId: string, itemId: string): Promise<void>;
}

export const workItemStatusLabels: Record<WorkItemStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};
export function isWorkItemAssignee(member: WorkItemMember) {
  return member.scrumAccountability === "DEVELOPER";
}
export class WorkItemDataError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "ARCHIVED",
    message: string,
  ) {
    super(message);
    this.name = "WorkItemDataError";
  }
}
export function workItemErrorMessage(error: unknown, fallback: string) {
  return error instanceof WorkItemDataError ? error.message : fallback;
}
