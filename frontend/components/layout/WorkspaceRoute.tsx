"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { getPreviewProject } from "@/lib/preview-data";

import { AppSidebar } from "./AppSidebar";
import { ProjectNavigation } from "./ProjectNavigation";

function getActiveProject(pathname: string) {
  const [resource, projectId] = pathname.split("/").filter(Boolean);
  return resource === "projects" && projectId
    ? getPreviewProject(projectId)
    : undefined;
}

// Keep pathname-dependent components inside local Suspense boundaries.
export function WorkspaceSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <AppSidebar project={getActiveProject(pathname)} onNavigate={onNavigate} />
  );
}

export function WorkspaceContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const project = getActiveProject(pathname);

  return (
    <>
      {project && <ProjectNavigation project={project} pathname={pathname} />}
      <div className="page-container">{children}</div>
    </>
  );
}
