import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/PageHeader";
import { getPreviewProject, previewProjects } from "@/lib/preview-data";

const sections = {
  members: "Members",
  backlog: "Product Backlog",
  sprints: "Sprints",
  board: "Sprint Board",
  progress: "Sprint Progress",
};

export function generateStaticParams() {
  return previewProjects.flatMap(({ id }) =>
    Object.keys(sections).map((section) => ({ projectId: id, section })),
  );
}

export default async function ProjectSectionPage({
  params,
}: {
  params: Promise<{ projectId: string; section: string }>;
}) {
  const { projectId, section } = await params;
  const project = getPreviewProject(projectId);
  if (!project || !Object.hasOwn(sections, section)) notFound();

  return (
    <div className="project-section-heading">
      <PageHeader
        eyebrow={project.name}
        title={sections[section as keyof typeof sections]}
      />
    </div>
  );
}
