import type { NextFunction, Request, Response } from "express";

import { Router } from "express";

import { getSystemAuditEvents } from "../services/audit.ts";
import { AppError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router();

// GET /api/admin/audit-events
router.get(
  "/audit-events",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId || typeof userId !== "string") {
        throw new AppError("UNAUTHENTICATED");
      }

      const result = await getSystemAuditEvents(
        userId,
        req.query as Record<string, unknown>,
      );
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
