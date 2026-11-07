import type { Metadata } from "next";

import { SprintFormRoute } from "@/components/sprints/SprintRoutes";
import { previewProjects } from "@/lib/preview-data";

export const metadata: Metadata = { title: "New Sprint" };

export function generateStaticParams() {
  return previewProjects.map(({ id }) => ({ projectId: id }));
}

export default async function CreateSprintPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <SprintFormRoute projectId={projectId} />;
}
