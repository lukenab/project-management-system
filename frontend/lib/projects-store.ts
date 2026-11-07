import type { PreviewProject } from "./preview-data";

import { listProjects } from "./projects";

// The projects of the signed-in user, loaded once from the backend and shared by the
// directory, sidebar and project pages. There is deliberately no "use client" here: the
// state is only ever filled in the browser, so the server just sees an empty list.
let projects: PreviewProject[] = [];
let loaded = false;
let started = false;
let version = 0;
let requestId = 0;
const listeners = new Set<() => void>();

function publish() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export const getStoredProjects = () => projects;
/** False until the first answer from the backend, so a project page can wait instead of a 404. */
export const storedProjectsLoaded = () => loaded;
/** Changes whenever the list changes; lets a store snapshot notice it. */
export const storedProjectsVersion = () => version;

export async function refreshStoredProjects() {
  started = true;
  const id = ++requestId;
  const before = projects;
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
    // Keep what we have; a 401 already sends the browser to /login.
  }
  if (id !== requestId) return;
  loaded = true;
  publish();
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

/** Forget everything (after signing out) so the next user starts clean. */
export function resetStoredProjects() {
  requestId += 1;
  projects = [];
  loaded = false;
  started = false;
  publish();
}
