"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { useProjectList } from "@/lib/use-project-list";

import { AppSidebar } from "./AppSidebar";

// Keep pathname-dependent components inside local Suspense boundaries.
export function WorkspaceSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { projects } = useProjectList();
  const pathname = usePathname();
  const [, resource, projectId] = pathname.split("/");
  return (
    <AppSidebar
      project={
        resource === "projects"
          ? projects.find((item) => item.id === projectId)
          : undefined
      }
      adminSection={
        pathname.startsWith("/admin/audit-events")
          ? "audit"
          : pathname.startsWith("/admin")
            ? "users"
            : null
      }
      onNavigate={onNavigate}
    />
  );
}

export function WorkspaceContent({ children }: { children: ReactNode }) {
  return <div className="page-container">{children}</div>;
}
