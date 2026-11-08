"use client";

import type { ReactNode } from "react";

import { notFound, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";

import { ProjectNavigation } from "@/components/layout/ProjectNavigation";
import { projectNavigation } from "@/config/navigation";
import { ApiError } from "@/lib/api";
import { getProject } from "@/lib/projects";
import { addStoredProject } from "@/lib/projects-store";
import { useProjectList } from "@/lib/use-project-list";

export function ProjectRoute({
  projectId,
  navigation = false,
  children,
}: {
  projectId: string;
  navigation?: boolean;
  children: ReactNode | ((project: PreviewProject) => ReactNode);
}) {
  const { projects, status } = useProjectList();
  const pathname = usePathname();
  const project = projects.find((p) => p.id === projectId);
  const projectName = project?.name;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    projectId: string;
    attempt: number;
    error?: unknown;
  }>();
  useEffect(() => {
    if (!navigation) return;
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
  }, [navigation, projectId, attempt]);
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
  if (navigation) {
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
    if (status === "loading") return <p role="status">Loading project…</p>;
    notFound();
  }
  return (
    <>
      {navigation && <ProjectNavigation project={project} />}
      {typeof children === "function" ? children(project) : children}
    </>
  );
}
