export type BacklogStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type BacklogPriority = "LOW" | "MEDIUM" | "HIGH";

export type BacklogItem = {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string | null;
  priority: BacklogPriority;
  status: BacklogStatus;
  itemType: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateBacklogItemInput = Pick<BacklogItem, "title">;

export type UpdateBacklogItemInput = Partial<
  Pick<BacklogItem, "title" | "description" | "priority" | "status">
>;

export interface BacklogRepository {
  update(
    projectId: string,
    itemId: string,
    input: UpdateBacklogItemInput,
  ): Promise<BacklogItem>;
  remove(projectId: string, itemId: string): Promise<void>;
  list(projectId: string): Promise<BacklogItem[]>;
  get(projectId: string, itemId: string): Promise<BacklogItem>;
  create(
    projectId: string,
    input: CreateBacklogItemInput,
  ): Promise<BacklogItem>;
}

export class BacklogDataError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "ARCHIVED",
    message: string,
  ) {
    super(message);
    this.name = "BacklogDataError";
  }
}

export function backlogErrorMessage(error: unknown, fallback: string) {
  return error instanceof BacklogDataError ? error.message : fallback;
}
