import type { Request, Response, NextFunction } from "express";

import { Router } from "express";

import { getSprintBoard } from "../services/board.ts";
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
        return res.status(400).json({ error: "Missing projectId" });
      }
      if (!userId || typeof userId !== "string") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const boardData = await getSprintBoard(projectId, userId);
      return res.status(200).json(boardData);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
