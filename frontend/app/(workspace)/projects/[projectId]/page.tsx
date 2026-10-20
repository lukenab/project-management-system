import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/PageHeader";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export default async function ProjectOverview({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        eyebrow={`${project.key} / Project overview`}
        title={project.name}
        description={project.description}
      />
    </>
  );
}
