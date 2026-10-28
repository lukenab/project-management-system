import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { SprintForm } from "@/components/sprints/SprintForm";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export const metadata: Metadata = { title: "New Sprint" };

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export default async function CreateSprintPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return <SprintForm key={project.id} project={project} />;
}
