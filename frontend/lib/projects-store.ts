import type { PreviewProject } from "./preview-data";

import { listProjects } from "./projects";

// The projects of the signed-in user, loaded once from the backend and shared by the
// directory, sidebar and project pages. There is deliberately no "use client" here: the
// state is only ever filled in the browser, so the server just sees an empty list.
type ProjectList = {
  projects: PreviewProject[];
  status: "loading" | "ready" | "error";
};

const initialList: ProjectList = { projects: [], status: "loading" };
let projectList = initialList;
let projects = initialList.projects;
let started = false;
let requestId = 0;
const listeners = new Set<() => void>();

function publish(status = projectList.status) {
  projectList = { projects, status };
  listeners.forEach((listener) => listener());
}

export const getStoredProjects = () => projects;
export const getProjectList = () => projectList;
export const getInitialProjectList = () => initialList;
export async function refreshStoredProjects() {
  started = true;
  const id = ++requestId;
  const before = projects;
  if (projectList.status === "error") publish("loading");
  try {
    const listed = await listProjects();
    if (id !== requestId) return;
    // Preserve details and mutations received while the list request was in flight.
    const recent = projects.filter((project) => !before.includes(project));
    const recentById = new Map(recent.map((project) => [project.id, project]));
    const listedIds = new Set(listed.map((project) => project.id));
    projects = [
      ...recent.filter((project) => !listedIds.has(project.id)),
      ...listed.map((project) => recentById.get(project.id) ?? project),
    ];
  } catch {
    if (id !== requestId) return;
    publish("error");
    return;
  }
  publish("ready");
}

export function subscribeStoredProjects(listener: () => void) {
  listeners.add(listener);
  if (!started) void refreshStoredProjects();
  return () => {
    listeners.delete(listener);
  };
}

/** Adds a project the user just created without waiting for another request. */
export function addStoredProject(project: PreviewProject) {
  projects = projects.some((p) => p.id === project.id)
    ? projects.map((p) => (p.id === project.id ? project : p))
    : [project, ...projects];
  publish();
}

/** Remove a project immediately after the server confirms that the user left. */
export function removeStoredProject(projectId: string) {
  projects = projects.filter((project) => project.id !== projectId);
  void refreshStoredProjects();
  publish();
}

/** Forget everything (after signing out) so the next user starts clean. */
export function resetStoredProjects() {
  requestId += 1;
  projects = initialList.projects;
  started = false;
  publish("loading");
}
