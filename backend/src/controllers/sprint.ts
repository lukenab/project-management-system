import type { Request } from "express";

import { Router } from "express";

import {
  completeProjectSprint,
  createProjectSprint,
  deleteProjectSprint,
  getProjectSprint,
  listProjectSprints,
  startProjectSprint,
  updateProjectSprint,
} from "../services/sprint.ts";
import { createError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const sprintController = Router({ mergeParams: true });

function routeParam(value: string | string[]) {
  return typeof value === "string" ? value : "";
}

function authenticatedUserId(req: Request) {
  if (!req.user) throw createError(401, "Authentication required.");
  return req.user.id;
}

sprintController.get("/", userExtractor, async (req, res) => {
  const data = await listProjectSprints(
    routeParam(req.params.projectId),
    authenticatedUserId(req),
  );
  res.status(200).json({ data });
});

sprintController.get("/:sprintId", userExtractor, async (req, res) => {
  const data = await getProjectSprint(
    routeParam(req.params.projectId),
    routeParam(req.params.sprintId),
    authenticatedUserId(req),
  );
  res.status(200).json({ data });
});

sprintController.post("/", userExtractor, async (req, res) => {
  const data = await createProjectSprint(
    routeParam(req.params.projectId),
    authenticatedUserId(req),
    req.body,
  );
  res.status(201).json({ data });
});

sprintController.patch("/:sprintId", userExtractor, async (req, res) => {
  const data = await updateProjectSprint(
    routeParam(req.params.projectId),
    routeParam(req.params.sprintId),
    authenticatedUserId(req),
    req.body,
  );
  res.status(200).json({ data });
});

sprintController.post("/:sprintId/start", userExtractor, async (req, res) => {
  const data = await startProjectSprint(
    routeParam(req.params.projectId),
    routeParam(req.params.sprintId),
    authenticatedUserId(req),
    req.body,
  );
  res.status(200).json({ data });
});

sprintController.post(
  "/:sprintId/complete",
  userExtractor,
  async (req, res) => {
    const data = await completeProjectSprint(
      routeParam(req.params.projectId),
      routeParam(req.params.sprintId),
      authenticatedUserId(req),
      req.body,
    );
    res.status(200).json({ data });
  },
);

sprintController.delete("/:sprintId", userExtractor, async (req, res) => {
  await deleteProjectSprint(
    routeParam(req.params.projectId),
    routeParam(req.params.sprintId),
    authenticatedUserId(req),
  );
  res.status(204).end();
});

export default sprintController;
