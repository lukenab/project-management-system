import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/PageHeader";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export const metadata: Metadata = { title: "Sprint Board" };

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export default async function SprintBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return (
    <div className="project-section-heading">
      <PageHeader eyebrow={project.name} title="Sprint Board" />
    </div>
  );
}
