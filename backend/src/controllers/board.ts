import type { Request, Response, NextFunction } from "express";

import { Router } from "express";

import { getSprintBoard, type BoardFilterOptions } from "../services/board.ts";
import { createError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router({ mergeParams: true });

// GET /api/projects/:projectId/board
router.get(
  "/:projectId/board",
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

      // Get query params
      const { search, assigneeId, status, workType, priority } = req.query;

      const filters: BoardFilterOptions = {
        search: typeof search === "string" ? search.trim() : undefined,
        assigneeId: typeof assigneeId === "string" ? assigneeId : undefined,
        status: typeof status === "string" ? status : undefined,
        workType: typeof workType === "string" ? workType : undefined,
        priority: typeof priority === "string" ? priority : undefined,
      };

      const boardData = await getSprintBoard(projectId, userId, filters);
      return res.status(200).json(boardData);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
