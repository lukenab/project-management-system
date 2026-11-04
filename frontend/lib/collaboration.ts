// Shapes follow docs/api/collaboration.md so the preview can be replaced by the API.
export type WorkItemComment = {
  id: string;
  author: { id: string; fullName: string };
  content: string;
  mentionedMemberIds: string[];
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  actor: { id: string; fullName: string };
  action: string;
  workItemId: string;
  summary: string;
  changes: { field: string; before: unknown; after: unknown }[] | null;
  occurredAt: string;
};

export type AddCommentInput = {
  content: string;
  mentionedMemberIds: string[];
};

export type CollaborationRepository = {
  listComments(projectId: string, itemId: string): Promise<WorkItemComment[]>;
  addComment(
    projectId: string,
    itemId: string,
    input: AddCommentInput,
  ): Promise<WorkItemComment>;
  listActivity(projectId: string, itemId: string): Promise<ActivityEvent[]>;
};
