import type { Request } from "express";

import { Router } from "express";

import projectService from "../services/projects.ts";
import { createError } from "../utils/error.ts";

const router = Router();

const getUserId = (req: Request) => {
  const userId = req.user?.id;
  if (!userId || typeof userId !== "string") {
    throw createError(401, "Unauthorized");
  }
  return userId;
};

router.get("/", async (req, res) => {
  const userProjects = await projectService.getMyProjects(getUserId(req));

  res.status(200).json(userProjects);
});

router.get("/:projectId", async (req, res) => {
  const project = await projectService.getProject(
    getUserId(req),
    req.params.projectId,
  );
  if (!project) {
    return res.status(403);
  }

  res.status(200).json(project);
});

router.patch("/:projectId", async (req, res) => {
  const project = req.body;
  if (
    typeof project !== "object" ||
    !project ||
    !Object.hasOwn(project, "name")
  ) {
    return res.status(400);
  }

  const updatedProject = await projectService.updateProject(
    getUserId(req),
    req.params.projectId,
    project,
  );
  if (!updatedProject) {
    return res.status(403);
  }

  res.status(200).json(updatedProject);
});

router.post("/", async (req, res) => {
  const project = req.body;
  if (
    typeof project !== "object" ||
    !project ||
    !Object.hasOwn(project, "name")
  ) {
    return res.status(400);
  }

  const createdProject = await projectService.creatProject(
    getUserId(req),
    project,
  );

  res.status(201).json(createdProject);
});

router.post("/:projectId/archive", async (req, res) => {
  const archivedProject = await projectService.archiveProject(
    getUserId(req),
    req.params.projectId,
  );
  if (!archivedProject) {
    return res.status(403);
  }

  res.status(200).json(archivedProject);
});
