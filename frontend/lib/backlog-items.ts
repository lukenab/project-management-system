export type BacklogPriority = "LOW" | "MEDIUM" | "HIGH";

export type BacklogItem = {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  priority: BacklogPriority;
  itemType: string | null;
  storyPoints: number | null;
  isSprintSized: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateBacklogItemInput = Pick<BacklogItem, "title">;

export interface BacklogRepository {
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
