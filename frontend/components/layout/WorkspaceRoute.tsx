"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { getPreviewProject } from "@/lib/preview-data";
import { usePreviewProjects } from "@/lib/preview-projects";

import { AppSidebar } from "./AppSidebar";

function getActiveProject(pathname: string) {
  const [resource, projectId] = pathname.split("/").filter(Boolean);
  return resource === "projects" && projectId
    ? getPreviewProject(projectId)
    : undefined;
}

// Keep pathname-dependent components inside local Suspense boundaries.
export function WorkspaceSidebar({ onNavigate }: { onNavigate?: () => void }) {
  usePreviewProjects();
  const pathname = usePathname();
  return (
    <AppSidebar project={getActiveProject(pathname)} onNavigate={onNavigate} />
  );
}

export function WorkspaceContent({ children }: { children: ReactNode }) {
  return <div className="page-container">{children}</div>;
}
