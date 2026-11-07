"use client";

import type { ReactNode } from "react";

import { notFound, usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { PreviewProject } from "@/lib/preview-data";

import { ProjectNavigation } from "@/components/layout/ProjectNavigation";
import { projectNavigation } from "@/config/navigation";
import { ApiError } from "@/lib/api";
import { usePreviewProjects } from "@/lib/preview-projects";
import { getProject, isApiProjectId } from "@/lib/projects";
import { addStoredProject, storedProjectsLoaded } from "@/lib/projects-store";

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
  const loadDetails = navigation && isApiProjectId(projectId);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    projectId: string;
    attempt: number;
    error?: unknown;
  }>();
  useEffect(() => {
    if (!loadDetails) return;
    let active = true;
    getProject(projectId).then(
      (loaded) => {
        if (!active) return;
        addStoredProject(loaded);
        setResult({ projectId, attempt });
      },
      (error: unknown) => {
        if (active) setResult({ projectId, attempt, error });
      },
    );
    return () => {
      active = false;
    };
  }, [loadDetails, projectId, attempt]);
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
  if (loadDetails) {
    if (result?.projectId !== projectId || result.attempt !== attempt) {
      return <p role="status">Loading project…</p>;
    }
    if (
      result.error instanceof ApiError &&
      [403, 404].includes(result.error.status)
    ) {
      notFound();
    }
    if (result.error) {
      return (
        <>
          <p role="alert">Couldn’t load the project.</p>
          <button
            className="button"
            type="button"
            onClick={() => setAttempt(attempt + 1)}
          >
            Retry
          </button>
        </>
      );
    }
  }
  if (!project) {
    if (!hydrated || !storedProjectsLoaded())
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
