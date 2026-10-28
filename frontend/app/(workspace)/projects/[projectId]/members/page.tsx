import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { ProjectMembers } from "@/components/members/ProjectMembers";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export const metadata: Metadata = { title: "Members" };

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

  return <ProjectMembers key={project.id} project={project} />;
}
