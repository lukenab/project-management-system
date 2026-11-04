import type { PreviewProject } from "./preview-data";
import type { ProjectMember } from "./preview-project-members";

export const projectOverridesKey = "pms-preview-project-overrides-v1";
export const projectsChangedEvent = "preview-projects-changed";
export const leftProjectsKey = "pms-preview-left-projects-v1";
export const personaKey = "pms-preview-persona-v1";
export type PreviewPersona = "staff" | "admin";
/** Which sample account the preview is signed in as; not authentication. */
export function readPreviewPersona(): PreviewPersona {
  if (typeof window === "undefined") return "staff";
  try {
    return localStorage.getItem(personaKey) === "admin" ? "admin" : "staff";
  } catch {
    return "staff";
  }
}
export function readLeftProjects(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(leftProjectsKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
export function saveLeftProject(projectId: string) {
  try {
    localStorage.setItem(
      leftProjectsKey,
      JSON.stringify([...readLeftProjects(), projectId]),
    );
  } catch {
    throw new Error(
      "Couldn't save your changes in this browser. Please try again.",
    );
  }
  window.dispatchEvent(new Event(projectsChangedEvent));
}
type Override = { project: PreviewProject; members?: ProjectMember[] };
export function readProjectOverrides(): Record<string, Override> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(projectOverridesKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((pair): pair is [string, Override] => {
        const [id, entry] = pair;
        const candidate = entry as Override;
        return (
          candidate?.project?.id === id &&
          typeof candidate.project.name === "string" &&
          typeof candidate.project.description === "string" &&
          typeof candidate.project.key === "string" &&
          typeof candidate.project.owner?.email === "string"
        );
      }),
    );
  } catch {
    return {};
  }
}
// One browser-storage write commits project details and the ownership snapshot together.
export function saveProjectOverride(
  project: PreviewProject,
  members?: ProjectMember[],
) {
  const overrides = readProjectOverrides();
  const previous = overrides[project.id];
  const next: Override = {
    project,
    ...(previous?.members ? { members: previous.members } : {}),
    ...(members ? { members } : {}),
  };
  try {
    localStorage.setItem(
      projectOverridesKey,
      JSON.stringify({ ...overrides, [project.id]: next }),
    );
  } catch {
    throw new Error(
      "Couldn't save your changes in this browser. Please try again.",
    );
  }
  window.dispatchEvent(new Event(projectsChangedEvent));
}
