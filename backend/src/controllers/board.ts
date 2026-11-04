import type { Request, Response, NextFunction } from "express";

import { Router } from "express";

import { getSprintBoard } from "../services/board.ts";
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
      const boardData = await getSprintBoard(projectId, userId);
      return res.status(200).json(boardData);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
