import type { Metadata } from "next";

import { Suspense } from "react";

import { WorkspaceLoading } from "@/components/layout/WorkspaceLoading";
import { ProjectSection } from "@/components/projects/ProjectSection";
export const metadata: Metadata = { title: "Settings" };
async function SettingsContent({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectSection projectId={projectId} section="settings" />;
}
export default function SettingsPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <SettingsContent {...props} />
    </Suspense>
  );
}
