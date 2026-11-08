import { isObjectIdOrHexString, type ClientSession } from "mongoose";

import CommentModel from "../models/comment.ts";
import UserModel from "../models/user.ts";
import WorkItemModel from "../models/workitem.ts";
import { createError } from "../utils/error.ts";
import {
  requireProjectMember,
  validateActiveProject,
} from "./projectAccess.ts";
import { recordActivityEvent } from "./workItemActivity.ts";

async function requireCommentTarget(
  projectId: string,
  itemId: string,
  userId: string,
  session?: ClientSession,
) {
  if (!isObjectIdOrHexString(projectId) || !isObjectIdOrHexString(itemId))
    throw createError(400, "Invalid project or work item ID");
  await requireProjectMember(userId, projectId, session);
  const item = await WorkItemModel.exists({
    _id: itemId,
    projectId,
    parentId: null,
    deletedAt: null,
  }).session(session ?? null);
  if (!item) throw createError(404, "Work item not found");
}

function response(
  comment: {
    _id: unknown;
    authorId: unknown;
    content: string;
    createdAt: Date;
  },
  fullName: string,
) {
  return {
    id: String(comment._id),
    author: { id: String(comment.authorId), fullName },
    content: comment.content,
    mentionedMemberIds: [],
    createdAt: comment.createdAt,
  };
}

export async function listComments(
  projectId: string,
  itemId: string,
  userId: string,
) {
  await requireCommentTarget(projectId, itemId, userId);
  const comments = await CommentModel.find({ workItemId: itemId })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  if (!comments.length) return [];
  const authors = await UserModel.find({
    _id: { $in: comments.map(({ authorId }) => authorId) },
  })
    .select("fullName")
    .lean();
  const names = new Map(
    authors.map(({ _id, fullName }) => [String(_id), fullName]),
  );
  return comments.map((comment) =>
    response(comment, names.get(String(comment.authorId)) ?? "Unknown user"),
  );
}

export async function addComment(
  projectId: string,
  itemId: string,
  author: { id: string; fullName: string },
  body: unknown,
) {
  return CommentModel.db.transaction(async (session) => {
    await requireCommentTarget(projectId, itemId, author.id, session);
    await validateActiveProject(projectId, session);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw createError(400, "Invalid comment body");
    const { content, mentionedMemberIds } = body as Record<string, unknown>;
    if (
      Object.keys(body).some(
        (field) => field !== "content" && field !== "mentionedMemberIds",
      )
    )
      throw createError(400, "Unexpected comment field");
    if (
      mentionedMemberIds !== undefined &&
      (!Array.isArray(mentionedMemberIds) || mentionedMemberIds.length)
    )
      throw createError(400, "Only plain-text comments are supported");
    if (typeof content !== "string" || !content.trim())
      throw createError(400, "Enter a comment");
    const [comment] = await CommentModel.create(
      [
        {
          workItemId: itemId,
          authorId: author.id,
          content: content.trim(),
        },
      ],
      { session },
    );
    await recordActivityEvent(
      {
        projectId,
        actorId: author.id,
        workItemId: itemId,
        actionType: "COMMENT_CREATED",
      },
      session,
    );
    return response(comment, author.fullName);
  });
}
