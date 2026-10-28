import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { SprintList } from "@/components/sprints/SprintList";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export const metadata: Metadata = { title: "Sprints" };

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export default async function ProjectSprintsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return <SprintList key={project.id} project={project} />;
}
