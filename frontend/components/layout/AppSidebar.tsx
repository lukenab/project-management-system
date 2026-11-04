"use client";

import { UsersRound } from "lucide-react";
import Link from "next/link";

import { type PreviewProject } from "@/lib/preview-data";
import { usePreviewProfile } from "@/lib/preview-profile";
import { usePreviewProjects } from "@/lib/preview-projects";

import { AppBrand } from "./AppBrand";
import { ProjectSwitcher } from "./ProjectSwitcher";
import "./sidebar.css";

export function AppSidebar({
  project,
  adminActive = false,
  onNavigate,
}: {
  project?: PreviewProject;
  adminActive?: boolean;
  onNavigate?: () => void;
}) {
  const profile = usePreviewProfile();
  const previewProjects = usePreviewProjects();
  const shortcuts = previewProjects
    .filter((item) => item.status === "ACTIVE")
    .slice(0, 5);
  return (
    <div className="cp-sidebar-container">
      <AppBrand className="cp-sidebar-brand" onNavigate={onNavigate} />
      <nav className="cp-sidebar-navigation" aria-label="Workspace navigation">
        {profile.systemRole === "SYSTEM_ADMINISTRATOR" ? (
          <>
            <p className="cp-sidebar-section-heading">Administration</p>
            <Link
              href="/admin/users"
              onClick={onNavigate}
              className={`cp-sidebar-item ${adminActive ? "cp-sidebar-active" : ""}`}
              aria-current={adminActive ? "true" : undefined}
            >
              <UsersRound size={16} aria-hidden="true" />
              <span className="cp-sidebar-item-label">User accounts</span>
            </Link>
          </>
        ) : (
          <>
            <p className="cp-sidebar-section-heading">Projects</p>
            <div className="global-project-links">
              {shortcuts.map((item) => (
                <Link
                  key={item.id}
                  href={`/projects/${item.id}`}
                  onClick={onNavigate}
                  className={`cp-sidebar-item global-project-link ${project?.id === item.id ? "cp-sidebar-active" : ""}`}
                  aria-current={project?.id === item.id ? "true" : undefined}
                  title={item.name}
                >
                  <span
                    className={`project-avatar ${item.tone}`}
                    aria-hidden="true"
                  >
                    {item.initials}
                  </span>
                  <span className="cp-sidebar-item-label">{item.name}</span>
                </Link>
              ))}
              {!shortcuts.length && (
                <p className="sidebar-projects-empty">No active projects yet</p>
              )}
              <ProjectSwitcher
                key={project?.id ?? "directory"}
                project={project}
                onNavigate={onNavigate}
              />
            </div>
          </>
        )}
      </nav>
    </div>
  );
}
