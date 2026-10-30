"use client";

import { ProductBacklog } from "@/components/backlog/ProductBacklog";
import { SprintBoard } from "@/components/board/SprintBoard";
import { ProjectMembers } from "@/components/members/ProjectMembers";
import { SprintList } from "@/components/sprints/SprintList";

import { PreviewProjectRoute } from "./PreviewProjectRoute";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectSettings } from "./ProjectSettings";

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
          case "settings":
            return <ProjectSettings key={project.id} project={project} />;
          case "members":
            return <ProjectMembers key={project.id} project={project} />;
          case "backlog":
            return <ProductBacklog key={project.id} project={project} />;
          case "sprints":
            return <SprintList key={project.id} project={project} />;
          case "board":
            return <SprintBoard key={project.id} project={project} />;
          case "progress":
            return <h1 className="sr-only">Sprint Progress</h1>;
          default:
            return <ProjectOverview project={project} />;
        }
      }}
    </PreviewProjectRoute>
  );
}
