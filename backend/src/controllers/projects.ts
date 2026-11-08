import type { Request } from "express";

import { Router } from "express";

import projectService from "../services/projects.ts";
import {
  getSprintActivity,
  getSprintProgress,
} from "../services/sprintReporting.ts";
import { AppError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router();

function getUser(req: Request) {
  if (!req.user) throw new AppError("UNAUTHENTICATED");
  return req.user;
}

function getProjectId(req: Request) {
  const id = req.params.projectId;
  if (typeof id !== "string") throw new AppError("INVALID_ID");
  return id;
}

router.get("/", userExtractor, async (req, res) => {
  res.json(await projectService.getMyProjects(getUser(req).id));
});

router.post("/", userExtractor, async (req, res) => {
  res
    .status(201)
    .json(await projectService.creatProject(getUser(req), req.body));
});

router.get("/:projectId", userExtractor, async (req, res) => {
  res.json(await projectService.getProject(getUser(req).id, getProjectId(req)));
});

router.patch("/:projectId", userExtractor, async (req, res) => {
  res.json(
    await projectService.updateProject(
      getUser(req),
      getProjectId(req),
      req.body,
    ),
  );
});

router.post("/:projectId/archive", userExtractor, async (req, res) => {
  res.json(
    await projectService.archiveProject(getUser(req), getProjectId(req)),
  );
});

router.post(
  "/:projectId/ownership-transfer",
  userExtractor,
  async (req, res) => {
    res.json(
      await projectService.transferOwnership(
        getUser(req),
        getProjectId(req),
        req.body,
      ),
    );
  },
);

router.get("/:projectId/sprint-progress", userExtractor, async (req, res) => {
  res.json(await getSprintProgress(getProjectId(req), getUser(req).id));
});

router.get("/:projectId/sprint-activity", userExtractor, async (req, res) => {
  res.json(await getSprintActivity(getProjectId(req), getUser(req).id));
});

export default router;
