import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/PageHeader";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export default async function ProjectMembersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return (
    <div className="project-section-heading">
      <PageHeader eyebrow={project.name} title="Members" />
    </div>
  );
}
