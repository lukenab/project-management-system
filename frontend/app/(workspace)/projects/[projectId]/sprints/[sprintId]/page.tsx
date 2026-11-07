import type { Metadata } from "next";

import { SprintDetailRoute } from "@/components/sprints/SprintRoutes";

export const metadata: Metadata = { title: "Sprint details" };

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; sprintId: string }>;
}) {
  const { projectId, sprintId } = await params;
  return <SprintDetailRoute projectId={projectId} sprintId={sprintId} />;
}
