import type { Request, Response } from "express";

import { Router } from "express";

import {
  createProjectSprint,
  getProjectSprint,
  listProjectSprints,
  SprintServiceError,
  updateProjectSprint,
} from "../services/sprint.ts";
import logger from "../utils/logger.ts";
import { userExtractor } from "../utils/middleware.ts";

const sprintController = Router({ mergeParams: true });

function routeParam(value: string | string[]) {
  return typeof value === "string" ? value : "";
}

function authenticatedUserId(req: Request) {
  if (!req.user) throw new SprintServiceError(401, "Authentication required.");
  return req.user.id;
}

function handleError(res: Response, error: unknown) {
  if (error instanceof SprintServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  logger.error("Sprint request failed:", error);
  res.status(500).json({ error: "An unexpected error occurred." });
}

sprintController.get("/", userExtractor, async (req, res) => {
  try {
    const data = await listProjectSprints(
      routeParam(req.params.projectId),
      authenticatedUserId(req),
    );
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

sprintController.get("/:sprintId", userExtractor, async (req, res) => {
  try {
    const data = await getProjectSprint(
      routeParam(req.params.projectId),
      routeParam(req.params.sprintId),
      authenticatedUserId(req),
    );
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

sprintController.post("/", userExtractor, async (req, res) => {
  try {
    const data = await createProjectSprint(
      routeParam(req.params.projectId),
      authenticatedUserId(req),
      req.body,
    );
    res.status(201).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

sprintController.patch("/:sprintId", userExtractor, async (req, res) => {
  try {
    const data = await updateProjectSprint(
      routeParam(req.params.projectId),
      routeParam(req.params.sprintId),
      authenticatedUserId(req),
      req.body,
    );
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

export default sprintController;
