import type { Metadata } from "next";

import { SprintFormRoute } from "@/components/sprints/SprintRoutes";

export const metadata: Metadata = { title: "New Sprint" };

export default async function CreateSprintPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <SprintFormRoute projectId={projectId} />;
}
