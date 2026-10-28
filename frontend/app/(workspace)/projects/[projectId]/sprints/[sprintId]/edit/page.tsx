import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { SprintForm } from "@/components/sprints/SprintForm";
import { getPreviewProject } from "@/lib/preview-data";

export const metadata: Metadata = { title: "Edit Sprint" };

export default async function EditSprintPage({
  params,
}: {
  params: Promise<{ projectId: string; sprintId: string }>;
}) {
  const { projectId, sprintId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return (
    <SprintForm
      key={`${project.id}:${sprintId}`}
      project={project}
      sprintId={sprintId}
    />
  );
}
