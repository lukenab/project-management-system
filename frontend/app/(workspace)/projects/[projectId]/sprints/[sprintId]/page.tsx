import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { SprintDetailView } from "@/components/sprints/SprintDetailView";
import { getPreviewProject } from "@/lib/preview-data";

// Preview Sprints live in browser memory, so the server cannot name them yet.
export const metadata: Metadata = { title: "Sprint details" };

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; sprintId: string }>;
}) {
  const { projectId, sprintId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return (
    <SprintDetailView
      key={`${project.id}:${sprintId}`}
      project={project}
      sprintId={sprintId}
    />
  );
}
