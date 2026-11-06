import type { NextFunction, Request, Response } from "express";

import { Router } from "express";

import {
  completeSprint,
  createSprint,
  deleteSprint,
  getSprintDetail,
  getSprints,
  startSprint,
  updateSprint,
} from "../services/sprints.ts";
import { createError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router({ mergeParams: true });

const getUserId = (req: Request) => {
  const userId = req.user?.id;
  if (!userId || typeof userId !== "string") {
    throw createError(401, "Unauthorized");
  }
  return userId;
};

const getParam = (req: Request, name: "projectId" | "sprintId") => {
  const value = req.params[name];
  if (!value || typeof value !== "string") {
    throw createError(400, `Missing ${name} or ${name} invalid`);
  }
  return value;
};

// GET /api/projects/:projectId/sprints
router.get(
  "/",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const userId = getUserId(req);
      const result = await getSprints(projectId, userId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/projects/:projectId/sprints/:sprintId
router.get(
  "/:sprintId",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const sprintId = getParam(req, "sprintId");
      const userId = getUserId(req);
      const result = await getSprintDetail(projectId, sprintId, userId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:projectId/sprints
router.post(
  "/",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const userId = getUserId(req);
      const result = await createSprint(projectId, userId, req.body);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/projects/:projectId/sprints/:sprintId
router.patch(
  "/:sprintId",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const sprintId = getParam(req, "sprintId");
      const userId = getUserId(req);
      const result = await updateSprint(projectId, sprintId, userId, req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:projectId/sprints/:sprintId/start
router.post(
  "/:sprintId/start",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const sprintId = getParam(req, "sprintId");
      const userId = getUserId(req);
      const result = await startSprint(projectId, sprintId, userId, req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:projectId/sprints/:sprintId/complete
router.post(
  "/:sprintId/complete",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const sprintId = getParam(req, "sprintId");
      const userId = getUserId(req);
      const result = await completeSprint(projectId, sprintId, userId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/projects/:projectId/sprints/:sprintId
router.delete(
  "/:sprintId",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = getParam(req, "projectId");
      const sprintId = getParam(req, "sprintId");
      const userId = getUserId(req);
      await deleteSprint(projectId, sprintId, userId);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
