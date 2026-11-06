import type { NextFunction, Request, Response } from "express";

import { Router } from "express";

import membershipService from "../services/memberships.ts";
import { createError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router({ mergeParams: true });

router.use(userExtractor);

const getUserId = (req: Request) => {
  const userId = req.user?.id;
  if (!userId || typeof userId !== "string") {
    throw createError(401, "Unauthorized");
  }
  return userId;
};

const getParam = (req: Request, name: "projectId" | "membershipId") => {
  const value = req.params[name];
  if (!value || typeof value !== "string") {
    throw createError(400, `Missing ${name} or ${name} invalid`);
  }
  return value;
};

// GET /api/projects/:projectId/members
router.get(
  "/members",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const userId = getUserId(req);
      const result = await membershipService.getMembers(projectId, userId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:projectId/members
router.post(
  "/members",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const userId = getUserId(req);
      const result = await membershipService.addMember(
        projectId,
        userId,
        req.body,
      );
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/projects/:projectId/members/:membershipId
router.delete(
  "/members/:membershipId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const membershipId = getParam(req, "membershipId");
      const userId = getUserId(req);
      await membershipService.removeMember(projectId, userId, membershipId);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:projectId/leave
router.post(
  "/leave",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const userId = getUserId(req);
      await membershipService.removeSelf(projectId, userId);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/projects/:projectId/members/:membershipId/scrum-accountability
router.patch(
  "/members/:membershipId/scrum-accountability",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const membershipId = getParam(req, "membershipId");
      const userId = getUserId(req);
      const { previousUserMembershipId, previousUserNewAccountability } =
        req.body ?? {};
      const result = await membershipService.changeMembership(
        projectId,
        userId,
        {
          ...req.body,
          membershipId,
          previousUserMembershipId,
          previousUserNewAccountability,
        },
      );
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
