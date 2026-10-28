"use client";

import type { ReactNode } from "react";

import { notFound, usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import type { PreviewProject } from "@/lib/preview-data";

import { ProjectNavigation } from "@/components/layout/ProjectNavigation";
import { projectNavigation } from "@/config/navigation";
import { usePreviewProjects } from "@/lib/preview-projects";

const subscribe = () => () => {};
export function PreviewProjectRoute({
  projectId,
  navigation = false,
  children,
}: {
  projectId: string;
  navigation?: boolean;
  children: ReactNode | ((project: PreviewProject) => ReactNode);
}) {
  const projects = usePreviewProjects();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const project = projects.find((p) => p.id === projectId);
  const projectName = project?.name;
  // New preview projects exist only in the browser; derive their tab title here.
  useEffect(() => {
    if (!navigation || !projectName) return;
    const segment = pathname.split("/")[3] ?? "";
    const section = projectNavigation.find(
      (item) => item.segment === segment,
    )?.label;
    document.title =
      section && section !== "Overview"
        ? `${section} · ${projectName}`
        : projectName;
  }, [navigation, projectName, pathname]);
  if (!project) {
    if (!hydrated)
      return navigation && typeof children !== "function" ? (
        <>{children}</>
      ) : (
        <p role="status">Loading project…</p>
      );
    notFound();
  }
  return (
    <>
      {navigation && <ProjectNavigation project={project} />}
      {typeof children === "function" ? children(project) : children}
    </>
  );
}
