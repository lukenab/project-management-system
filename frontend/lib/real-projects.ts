import type { PreviewProject } from "./preview-data";

import { listProjects } from "./projects";

// The projects of the signed-in user, loaded once from the backend and shared by the
// directory, sidebar and project pages. There is deliberately no "use client" here: the
// state is only ever filled in the browser, so the server just sees an empty list.
let projects: PreviewProject[] = [];
let loaded = false;
let started = false;
let version = 0;
const listeners = new Set<() => void>();

function publish() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export const getRealProjects = () => projects;
/** False until the first answer from the backend, so a project page can wait instead of a 404. */
export const realProjectsLoaded = () => loaded;
/** Changes whenever the list changes; lets a store snapshot notice it. */
export const realProjectsVersion = () => version;

export async function refreshRealProjects() {
  started = true;
  try {
    projects = await listProjects();
  } catch {
    // Keep what we have; a 401 already sends the browser to /login.
  }
  loaded = true;
  publish();
}

export function subscribeRealProjects(listener: () => void) {
  listeners.add(listener);
  if (!started) void refreshRealProjects();
  return () => {
    listeners.delete(listener);
  };
}

/** Adds a project the user just created without waiting for another request. */
export function addRealProject(project: PreviewProject) {
  projects = [project, ...projects.filter((p) => p.id !== project.id)];
  publish();
}

/** Forget everything (after signing out) so the next user starts clean. */
export function resetRealProjects() {
  projects = [];
  loaded = false;
  started = false;
  publish();
}
