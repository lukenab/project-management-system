"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { previewProjects, previewUser } from "@/lib/preview-data";
import {
  resolveWorkspaceProject,
  workspacePreferenceKey,
} from "@/lib/workspace-entry";

export function WorkspaceEntry() {
  const router = useRouter();

  useEffect(() => {
    let rememberedId: string | null = null;
    try {
      rememberedId = localStorage.getItem(
        workspacePreferenceKey(previewUser.email),
      );
    } catch {
      // Storage may be unavailable; use the first accessible Active project.
    }
    const project = resolveWorkspaceProject(previewProjects, rememberedId);
    router.replace(project ? `/projects/${project.id}` : "/projects");
  }, [router]);

  return (
    <div className="workspace-entry" role="status">
      <p>Opening workspace…</p>
      <Link href="/projects">View all projects</Link>
    </div>
  );
}
