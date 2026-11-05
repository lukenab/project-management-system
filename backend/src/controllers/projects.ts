import { Router } from "express";

import projectService from "../services/projects.ts";

const router = Router();

router.get("/", async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401);
  }

  const userProjects = await projectService.getMyProjects(user.id);

  res.status(200).json(userProjects);
});

router.get("/:projectId", async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401);
  }

  const project = await projectService.getProject(
    user.id,
    req.params.projectId,
  );
  if (!project) {
    return res.status(403);
  }

  res.status(200).json(project);
});

router.patch("/:projectId", async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401);
  }

  const project = req.body;
  if (
    typeof project !== "object" ||
    !project ||
    !Object.hasOwn(project, "name")
  ) {
    return res.status(400);
  }

  const updatedProject = await projectService.updateProject(
    user.id,
    req.params.projectId,
    project,
  );
  if (!updatedProject) {
    return res.status(403);
  }

  res.status(200).json(updatedProject);
});

router.post("/", async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401);
  }

  const project = req.body;
  if (
    typeof project !== "object" ||
    !project ||
    !Object.hasOwn(project, "name")
  ) {
    return res.status(400);
  }

  const createdProject = await projectService.creatProject(user.id, project);

  res.status(201).json(createdProject);
});

router.post("/:projectId/archive", async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401);
  }

  const archivedProject = await projectService.archiveProject(
    user.id,
    req.params.projectId,
  );
  if (!archivedProject) {
    return res.status(403);
  }

  res.status(200).json(archivedProject);
});
