import { Plus } from "lucide-react";

import { ProjectDirectory } from "@/components/projects/ProjectDirectory";
import { PageHeader } from "@/components/shared/PageHeader";
import { previewProjects } from "@/lib/preview-data";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="All Projects"
        description="Browse the projects you belong to. Pick a project to continue."
        action={
          <button type="button" className="button button-primary" disabled>
            <Plus size={16} aria-hidden="true" />
            Create project
          </button>
        }
      />
      <ProjectDirectory projects={previewProjects} />
    </>
  );
}
