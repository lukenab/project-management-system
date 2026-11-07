import type { Request, Response, NextFunction } from "express";

import { Router } from "express";

import SprintModel from "../models/sprint.ts";
import WorkItemModel, { type WorkItemDocument } from "../models/workitem.ts";
import {
  createWorkItem,
  deleteWorkItem,
  getWorkItemDetail,
  getWorkItems,
  reorderWorkItems,
  updateWorkItem,
} from "../services/workitem.ts";
import { getWorkItemActivity } from "../services/workItemActivity.ts";
import { createError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router({ mergeParams: true });

type SprintSummary = { _id: unknown; name?: string | null };

function workItemResponse(
  item: WorkItemDocument,
  sprint?: SprintSummary | null,
) {
  const {
    deletedAt: _deletedAt,
    parentId,
    sprintId,
    description,
    assigneeId,
    priority,
    startDate,
    dueDate,
    ...fields
  } = item.toJSON();
  return {
    ...fields,
    parentId: parentId ?? null,
    sprintId: sprintId ?? null,
    description: description ?? null,
    assigneeId: assigneeId ?? null,
    priority: priority ?? null,
    startDate: startDate ?? null,
    dueDate: dueDate ?? null,
    sprint: sprint
      ? { id: String(sprint._id), name: sprint.name ?? null }
      : null,
  };
}

async function workItemListResponse(
  projectId: string,
  items: WorkItemDocument[],
) {
  // A list contains independent items or children of a single parent.
  const parentId = items[0]?.parentId;
  const parent = parentId
    ? await WorkItemModel.findOne({ _id: parentId, projectId, deletedAt: null })
        .select("sprintId")
        .lean()
    : null;
  if (parentId && !parent) throw createError(404, "Parent work item not found");
  const sprintIds = new Set(
    items.flatMap((item) => {
      const sprintId = parent ? parent.sprintId : item.sprintId;
      return sprintId ? [String(sprintId)] : [];
    }),
  );
  const sprints = sprintIds.size
    ? await SprintModel.find({
        _id: { $in: [...sprintIds] },
        projectId,
        deletedAt: null,
      })
        .select("name")
        .lean()
    : [];
  const summaries = new Map(
    sprints.map((sprint) => [String(sprint._id), sprint]),
  );
  return items.map((item) =>
    workItemResponse(
      item,
      summaries.get(String(parent ? parent.sprintId : item.sprintId)),
    ),
  );
}

// Các trường client không được phép gửi khi PATCH
const FORBIDDEN_PATCH_FIELDS = new Set([
  "projectId",
  "parentId",
  "key",
  "createdBy",
  "orderIndex",
  "deletedAt",
  "createdAt",
  "updatedAt",
  "_id",
  "id",
]);

// GET /api/projects/:projectId/work-items
router.get(
  "/",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        throw createError(400, "Missing projectId or projectId invalid");
      }
      if (!userId || typeof userId !== "string") {
        throw createError(401, "Unauthorized");
      }

      const rawParentId = req.query.parentId;
      if (rawParentId !== undefined && typeof rawParentId !== "string") {
        throw createError(400, "Invalid parentId query parameter");
      }

      const result = await getWorkItems(projectId, userId, rawParentId);
      return res
        .status(200)
        .json(await workItemListResponse(projectId, result));
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/projects/:projectId/work-items/order
router.put(
  "/order",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        throw createError(400, "Missing projectId or projectId invalid");
      }
      if (!userId || typeof userId !== "string") {
        throw createError(401, "Unauthorized");
      }

      const result = await reorderWorkItems(projectId, userId, req.body);
      return res
        .status(200)
        .json(await workItemListResponse(projectId, result));
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/projects/:projectId/work-items/:itemId/activity
router.get(
  "/:itemId/activity",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        throw createError(400, "Missing projectId or projectId invalid");
      }
      if (!itemId || typeof itemId !== "string") {
        throw createError(400, "Missing itemId or itemId invalid");
      }
      if (!userId || typeof userId !== "string") {
        throw createError(401, "Unauthorized");
      }
      const result = await getWorkItemActivity(projectId, itemId, userId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/projects/:projectId/work-items/:itemId
router.get(
  "/:itemId",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        throw createError(400, "Missing projectId or projectId invalid");
      }
      if (!itemId || typeof itemId !== "string") {
        throw createError(400, "Missing itemId or itemId invalid");
      }
      if (!userId || typeof userId !== "string") {
        throw createError(401, "Unauthorized");
      }
      const { workItem, sprint } = await getWorkItemDetail(
        projectId,
        itemId,
        userId,
      );
      return res.status(200).json(workItemResponse(workItem, sprint));
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:projectId/work-items
router.post(
  "/",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        throw createError(400, "Missing projectId or projectId invalid");
      }
      if (!userId || typeof userId !== "string") {
        throw createError(401, "Unauthorized");
      }

      const result = await createWorkItem(projectId, userId, req.body);
      const [item] = await workItemListResponse(projectId, [result]);
      return res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/projects/:projectId/work-items/:itemId
router.patch(
  "/:itemId",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        throw createError(400, "Missing projectId or projectId invalid");
      }
      if (!itemId || typeof itemId !== "string") {
        throw createError(400, "Missing itemId or itemId invalid");
      }
      if (!userId || typeof userId !== "string") {
        throw createError(401, "Unauthorized");
      }

      const updates = req.body;

      // 1. Kiểm tra Body không được rỗng
      if (
        !updates ||
        typeof updates !== "object" ||
        Object.keys(updates).length === 0
      ) {
        throw createError(400, "Request body cannot be empty");
      }

      // 2. Chặn các trường bất biến
      for (const key of Object.keys(updates)) {
        if (FORBIDDEN_PATCH_FIELDS.has(key)) {
          throw createError(
            400,
            `Field '${key}' is immutable, cannot be patched`,
          );
        }
      }

      // 3. Gọi service thông qua dispatcher (Tự phân loại Independent vs Child)
      const result = await updateWorkItem(projectId, itemId, userId, updates);

      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/projects/:projectId/work-items/:itemId
router.delete(
  "/:itemId",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        throw createError(400, "Missing or invalid projectId");
      }
      if (!itemId || typeof itemId !== "string") {
        throw createError(400, "Missing itemId or itemId invalid");
      }
      if (!userId || typeof userId !== "string") {
        throw createError(401, "Unauthorized");
      }
      await deleteWorkItem(projectId, itemId, userId);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
