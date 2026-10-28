import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Suspense } from "react";

import { WorkspaceLoading } from "@/components/layout/WorkspaceLoading";
import { PreviewProjectRoute } from "@/components/projects/PreviewProjectRoute";
import { previewProjects } from "@/lib/preview-data";

export const metadata: Metadata = { title: "Project" };
export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}
async function ProjectContent({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <PreviewProjectRoute projectId={projectId} navigation>
      {children}
    </PreviewProjectRoute>
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
