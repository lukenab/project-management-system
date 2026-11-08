import type { Metadata } from "next";
import type { ReactNode } from "react";

import { notFound } from "next/navigation";
import { Suspense } from "react";

import { WorkspaceLoading } from "@/components/layout/WorkspaceLoading";
import { ProjectRoute } from "@/components/projects/ProjectRoute";
import { isApiProjectId } from "@/lib/projects";

export const metadata: Metadata = { title: "Project" };
async function ProjectContent({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!isApiProjectId(projectId)) notFound();
  return (
    <ProjectRoute projectId={projectId} navigation>
      {children}
    </ProjectRoute>
  );
}

export default function ProjectLayout(props: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ProjectContent {...props} />
    </Suspense>
  );
}
