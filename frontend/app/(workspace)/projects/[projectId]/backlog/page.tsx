import type { Metadata } from "next";

import { Suspense } from "react";

import { WorkspaceLoading } from "@/components/layout/WorkspaceLoading";
import { ProjectSection } from "@/components/projects/ProjectSection";
export const metadata: Metadata = { title: "Work Items" };
async function ProjectContent({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectSection projectId={projectId} section="backlog" />;
}

export default function ProjectPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ProjectContent {...props} />
    </Suspense>
  );
}
