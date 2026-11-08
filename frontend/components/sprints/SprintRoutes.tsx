"use client";

import { ProjectRoute } from "@/components/projects/ProjectRoute";

import { SprintDetailView } from "./SprintDetailView";
import { SprintForm } from "./SprintForm";

// The Sprint pages resolve their project in the browser (the projects come from the API),
// so the project lookup lives here instead of in the server page.
export function SprintFormRoute({
  projectId,
  sprintId,
}: {
  projectId: string;
  sprintId?: string;
}) {
  return (
    <ProjectRoute projectId={projectId}>
      {(project) => (
        <SprintForm
          key={`${project.id}:${sprintId ?? "new"}`}
          project={project}
          sprintId={sprintId}
        />
      )}
    </ProjectRoute>
  );
}

export function SprintDetailRoute({
  projectId,
  sprintId,
}: {
  projectId: string;
  sprintId: string;
}) {
  return (
    <ProjectRoute projectId={projectId}>
      {(project) => (
        <SprintDetailView
          key={`${project.id}:${sprintId}`}
          project={project}
          sprintId={sprintId}
        />
      )}
    </ProjectRoute>
  );
}
