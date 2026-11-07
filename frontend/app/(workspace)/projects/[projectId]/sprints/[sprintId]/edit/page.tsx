import type { Metadata } from "next";

import { SprintFormRoute } from "@/components/sprints/SprintRoutes";

export const metadata: Metadata = { title: "Edit Sprint" };

export default async function EditSprintPage({
  params,
}: {
  params: Promise<{ projectId: string; sprintId: string }>;
}) {
  const { projectId, sprintId } = await params;
  return <SprintFormRoute projectId={projectId} sprintId={sprintId} />;
}
