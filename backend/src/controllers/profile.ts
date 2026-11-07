import type { NextFunction, Request, Response } from "express";

import { Router } from "express";

import { toProfile } from "../services/auth.ts";
import { changePassword, updateProfile } from "../services/profile.ts";
import { AppError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router();

// userExtractor đã bảo đảm có req.user và req.sessionId
const current = (req: Request) => {
  if (!req.user || !req.sessionId) throw new AppError("UNAUTHENTICATED");
  return { user: req.user, sessionId: req.sessionId };
};

// GET /api/me
router.get(
  "/",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.status(200).json(toProfile(current(req).user));
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/me
router.patch(
  "/",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await updateProfile(current(req).user, req.body);
      return res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/me/password
router.put(
  "/password",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user, sessionId } = current(req);
      await changePassword(user, sessionId, req.body);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
