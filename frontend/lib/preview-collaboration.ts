import type {
  ActivityEvent,
  CollaborationRepository,
  WorkItemComment,
} from "./collaboration";

import { getPreviewProject, previewUser } from "./preview-data";
import { addPreviewNotification } from "./preview-notifications";
import { listPreviewProjectMembers } from "./preview-project-members";
import { previewWorkItemRepository } from "./preview-work-items";

type Person = { id: string; fullName: string };
type StoredEvent = ActivityEvent & {
  projectId: string;
  parentId: string | null;
};
type StoredComment = WorkItemComment & {
  projectId: string;
  workItemId: string;
};

const currentUser: Person = { id: "alex", fullName: previewUser.fullName };
const jordan: Person = { id: "jordan", fullName: "Jordan Lee" };
const priya: Person = { id: "priya", fullName: "Priya Nair" };
const sam: Person = { id: "sam", fullName: "Sam Taylor" };

const events: StoredEvent[] = [];
const comments: StoredComment[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  listeners.forEach((listener) => listener());
}

/** Lets an open drawer refresh after a preview write; the API will not need this. */
export function subscribePreviewCollaboration(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recordPreviewActivity(input: {
  projectId: string;
  workItemId: string;
  parentId: string | null;
  action: string;
  summary: string;
  actor?: Person;
  changes?: ActivityEvent["changes"];
  occurredAt?: string;
}) {
  events.push({
    id: `activity-${nextId++}`,
    projectId: input.projectId,
    workItemId: input.workItemId,
    parentId: input.parentId,
    actor: input.actor ?? currentUser,
    action: input.action,
    summary: input.summary,
    changes: input.changes ?? null,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
  emit();
}

type SeedEntry =
  | { at: string; actor: Person; action: string; summary: string }
  | { at: string; actor: Person; content: string; mentions?: string[] };

// Keyed by `${projectId}:${itemId}`. Mentions use the Members page's membership IDs.
const seeds: Record<string, SeedEntry[]> = {
  "team-workspace:c00000000000000000000001": [
    {
      at: "2026-10-26T03:00:00.000Z",
      actor: jordan,
      action: "SPRINT_CHANGED",
      summary: "added this item to Sprint 2",
    },
    {
      at: "2026-10-27T08:30:00.000Z",
      actor: priya,
      content:
        "@Alex Morgan can you confirm whether saved products should sync between devices?",
      mentions: ["team-workspace-alex"],
    },
    {
      at: "2026-10-28T02:15:00.000Z",
      actor: sam,
      content:
        "The account service already stores preferences, so we can reuse it for the wishlist.",
    },
  ],
  "team-workspace:c00000000000000000000005": [
    {
      at: "2026-11-03T02:40:00.000Z",
      actor: sam,
      action: "STATUS_CHANGED",
      summary: "changed status from To do to In progress",
    },
    {
      at: "2026-11-03T09:10:00.000Z",
      actor: priya,
      content: "The coupon service is ready to test on staging.",
    },
  ],
  "team-workspace:c00000000000000000000006": [
    {
      at: "2026-11-02T04:20:00.000Z",
      actor: priya,
      action: "STATUS_CHANGED",
      summary: "changed status from To do to In progress",
    },
  ],
  "team-workspace:c00000000000000000000008": [
    {
      at: "2026-10-31T07:30:00.000Z",
      actor: sam,
      action: "STATUS_CHANGED",
      summary: "changed status from In progress to Done",
    },
  ],
  "customer-portal:a00000000000000000000001": [
    {
      at: "2026-10-27T04:00:00.000Z",
      actor: jordan,
      content: "Please check the account summary against the latest design.",
    },
  ],
  "mobile-app:a00000000000000000000001": [
    {
      at: "2026-10-28T06:00:00.000Z",
      actor: jordan,
      content:
        "@Alex Morgan please start with the sign-in screen so we can demo it this Sprint.",
      mentions: ["mobile-app-alex"],
    },
  ],
};

const seeded = new Set<string>();

function ensureSeeded(projectId: string, itemId: string) {
  const key = `${projectId}:${itemId}`;
  if (seeded.has(key)) return;
  seeded.add(key);
  for (const entry of seeds[key] ?? []) {
    if ("content" in entry) {
      comments.push({
        id: `comment-${nextId++}`,
        projectId,
        workItemId: itemId,
        author: entry.actor,
        content: entry.content,
        mentionedMemberIds: entry.mentions ?? [],
        createdAt: entry.at,
      });
    } else {
      events.push({
        id: `activity-${nextId++}`,
        projectId,
        workItemId: itemId,
        parentId: null,
        actor: entry.actor,
        action: entry.action,
        summary: entry.summary,
        changes: null,
        occurredAt: entry.at,
      });
    }
  }
}

function publicComment(comment: StoredComment): WorkItemComment {
  const { id, author, content, mentionedMemberIds, createdAt } = comment;
  return { id, author, content, mentionedMemberIds, createdAt };
}

function publicEvent(event: StoredEvent): ActivityEvent {
  const { id, actor, action, workItemId, summary, changes, occurredAt } = event;
  return { id, actor, action, workItemId, summary, changes, occurredAt };
}

// Browser-memory preview only; refresh resets data. No server authorization is implemented here.
export const previewCollaborationRepository: CollaborationRepository = {
  async listComments(projectId, itemId) {
    await previewWorkItemRepository.get(projectId, itemId);
    ensureSeeded(projectId, itemId);
    return comments
      .filter(
        (comment) =>
          comment.projectId === projectId && comment.workItemId === itemId,
      )
      .map(publicComment)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
  },
  async addComment(projectId, itemId, input) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const project = getPreviewProject(projectId);
    if (project?.status !== "ACTIVE")
      throw new Error("This project is archived. Comments are read-only.");
    const item = await previewWorkItemRepository.get(projectId, itemId);
    if (item.parentId !== null)
      throw new Error("Comments are available on the parent work item.");
    const content = input.content.trim();
    if (!content) throw new Error("Write a comment first.");
    const members = listPreviewProjectMembers(projectId);
    const mentionedMemberIds = [...new Set(input.mentionedMemberIds)];
    if (mentionedMemberIds.some((id) => !members.some((m) => m.id === id)))
      throw new Error("Mention active members of this project only.");
    ensureSeeded(projectId, itemId);
    const comment: StoredComment = {
      id: `comment-${nextId++}`,
      projectId,
      workItemId: itemId,
      author: currentUser,
      content,
      mentionedMemberIds,
      createdAt: new Date().toISOString(),
    };
    comments.push(comment);
    for (const member of members) {
      if (
        mentionedMemberIds.includes(member.id) &&
        member.userId !== currentUser.id
      )
        addPreviewNotification({
          recipientId: member.userId,
          title: "You were mentioned",
          message: `${currentUser.fullName} mentioned you on ${item.key}: “${content}”`,
          project: project.name,
          initials: previewUser.initials,
        });
    }
    emit();
    return publicComment(comment);
  },
  async listActivity(projectId, itemId) {
    await previewWorkItemRepository.get(projectId, itemId);
    ensureSeeded(projectId, itemId);
    return events
      .filter(
        (event) =>
          event.projectId === projectId &&
          (event.workItemId === itemId || event.parentId === itemId),
      )
      .map(publicEvent)
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
      );
  },
};
