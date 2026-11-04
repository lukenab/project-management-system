import type { Request, Response, NextFunction } from "express";

import { Router } from "express";

import {
  updateWorkItem,
  createChildWorkItem,
  getWorkItemDetail,
  deleteWorkItem,
} from "../services/workitem.ts";
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

// GET /api/projects/:projectId/work-items/:itemId
router.get(
  "/:itemId",
  userExtractor,
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        return res
          .status(400)
          .json({ error: "Missing projectId or projectId invalid" });
      }
      if (!itemId || typeof itemId !== "string") {
        return res
          .status(400)
          .json({ error: "Missing itemId or itemId invalid" });
      }
      if (!userId || typeof userId !== "string") {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }
      const result = await getWorkItemDetail(projectId, itemId, userId);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message,
        });
      }
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }
  },
);

// POST /api/projets/:projectId/work-items
router.post(
  "/",
  userExtractor,
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        return res
          .status(400)
          .json({ error: "Missing projectId or projectId invalid" });
      }
      if (!userId || typeof userId !== "string") {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      let result;
      // Nếu có parentId -> Gọi hàm tạo subtask
      if (req.body.parentId) {
        result = await createChildWorkItem(projectId, userId, req.body);
      } else {
        // TODO: Nếu KHÔNG có parentId -> gọi hàm tạo independent work item
      }

      return res.status(201).json(result);
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message,
        });
      }
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }
  },
);

// PATCH /api/projects/:projectId/work-items/:itemId
router.patch(
  "/:itemId",
  userExtractor,
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        return res
          .status(400)
          .json({ error: "Missing projectId or projectId invalid" });
      }
      if (!itemId || typeof itemId !== "string") {
        return res
          .status(400)
          .json({ error: "Missing itemId or itemId invalid" });
      }
      if (!userId || typeof userId !== "string") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const updates = req.body;

      // 1. Kiểm tra Body không được rỗng
      if (
        !updates ||
        typeof updates !== "object" ||
        Object.keys(updates).length === 0
      ) {
        return res.status(400).json({ error: "Request body cannot be empty" });
      }

      // 2. Chặn các trường bất biến
      for (const key of Object.keys(updates)) {
        if (FORBIDDEN_PATCH_FIELDS.has(key)) {
          return res.status(400).json({
            error: `Field '${key}' is immutable, cannot be patched`,
          });
        }
      }

      // 3. Gọi service thông qua dispatcher (Tự phân loại Independent vs Child)
      const result = await updateWorkItem(projectId, itemId, userId, updates);

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message,
        });
      }
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }
  },
);

// DELETE /api/projects/:projectId/work-items/:itemId
router.delete(
  "/:itemId",
  userExtractor,
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({
          error: "Missing or invalid projectId",
        });
      }
      if (!itemId || typeof itemId !== "string") {
        return res
          .status(400)
          .json({ error: "Missing itemId or itemId invalid" });
      }
      if (!userId || typeof userId !== "string") {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }
      await deleteWorkItem(projectId, itemId, userId);
      return res.status(204).send();
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message,
        });
      }
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }
  },
);

export default router;
