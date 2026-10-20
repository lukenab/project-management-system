import type { PreviewProject } from "./preview-data";

// UI preference only. Neither a session nor an authorization source.
export function workspacePreferenceKey(account: string) {
  return `project-management:last-project:${account}`;
}

export function resolveWorkspaceProject(
  projects: readonly PreviewProject[],
  rememberedId: string | null,
) {
  const active = projects.filter((project) => project.status === "ACTIVE");
  return active.find((project) => project.id === rememberedId) ?? active[0];
}
