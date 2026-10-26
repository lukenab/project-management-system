import { notFound } from "next/navigation";

import { ProductBacklog } from "@/components/backlog/ProductBacklog";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export default async function ProductBacklogPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return <ProductBacklog key={project.id} project={project} />;
}
