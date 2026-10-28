import type { Metadata } from "next";
import type { ReactNode } from "react";

import { notFound } from "next/navigation";

import { ProjectNavigation } from "@/components/layout/ProjectNavigation";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const name = getPreviewProject(projectId)?.name;
  // Drop the app-wide suffix inside projects to keep browser tab labels short.
  return name ? { title: { absolute: name, template: `%s · ${name}` } } : {};
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getPreviewProject(projectId);
  if (!project) notFound();

  return (
    <>
      <ProjectNavigation project={project} />
      {children}
    </>
  );
}
