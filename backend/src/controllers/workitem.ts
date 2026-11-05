import type { Request, Response, NextFunction } from "express";

import { Router } from "express";

import {
  createWorkItem,
  deleteWorkItem,
  getWorkItemDetail,
  getWorkItems,
  reorderWorkItems,
  updateWorkItem,
} from "../services/workitem.ts";
import { createError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router({ mergeParams: true });

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
      return res.status(200).json(result);
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
      const result = await getWorkItemDetail(projectId, itemId, userId);
      return res.status(200).json(result);
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
      return res.status(201).json(result);
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
