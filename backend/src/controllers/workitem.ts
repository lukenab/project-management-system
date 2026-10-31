import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { userExtractor } from "../utils/middleware.ts";
import { updateIndependentWorkItem } from "../services/workitem.ts";

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

// PATCH /api/projects/:projectId/work-items/:itemId
router.patch(
  "/:itemId",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, itemId } = req.params;
      const userId = req.user?.id;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ error: "Missing projectId" });
      }
      if (!itemId || typeof itemId !== "string") {
        return res.status(400).json({ error: "Missing itemId" });
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

      // 2. Chặn cấc trường bất biến
      for (const key of Object.keys(updates)) {
        if (FORBIDDEN_PATCH_FIELDS.has(key)) {
          return res.status(400).json({
            error: `Field '${key}' is immutable, cannot be patched`,
          });
        }
      }

      // 3. Gọi service thực thi
      const updatedItem = await updateIndependentWorkItem(
        projectId,
        itemId,
        userId,
        updates,
      );

      return res.status(200).json(updatedItem);
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message,
        });
      }
      next(error);
    }
  },
);

export default router;
