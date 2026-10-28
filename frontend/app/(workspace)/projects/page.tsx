import { Plus } from "lucide-react";
import Link from "next/link";

import { ProjectDirectory } from "@/components/projects/ProjectDirectory";
import { PageHeader } from "@/components/shared/PageHeader";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="All Projects"
        description="Browse the projects you belong to. Pick a project to continue."
        action={
          <Link href="/projects/new" className="button button-primary">
            <Plus size={16} aria-hidden="true" />
            Create project
          </Link>
        }
      />
      <ProjectDirectory />
    </>
  );
}
