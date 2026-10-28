"use client";

import { ProductBacklog } from "@/components/backlog/ProductBacklog";
import { ProjectMembers } from "@/components/members/ProjectMembers";
import { PageHeader } from "@/components/shared/PageHeader";
import { SprintList } from "@/components/sprints/SprintList";

import { PreviewProjectRoute } from "./PreviewProjectRoute";
import { ProjectOverview } from "./ProjectOverview";

export function ProjectSection({
  projectId,
  section,
}: {
  projectId: string;
  section: string;
}) {
  return (
    <PreviewProjectRoute projectId={projectId}>
      {(project) => {
        switch (section) {
          case "members":
            return <ProjectMembers key={project.id} project={project} />;
          case "backlog":
            return <ProductBacklog key={project.id} project={project} />;
          case "sprints":
            return <SprintList key={project.id} project={project} />;
          case "board":
          case "progress":
            return (
              <PageHeader
                eyebrow={project.name}
                title={section === "board" ? "Sprint Board" : "Sprint Progress"}
              />
            );
          default:
            return <ProjectOverview project={project} />;
        }
      }}
    </PreviewProjectRoute>
  );
}
