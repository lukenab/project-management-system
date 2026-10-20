"use client";

import Link from "next/link";

import { previewProjects, type PreviewProject } from "@/lib/preview-data";

import { AppBrand } from "./AppBrand";
import { ProjectSwitcher } from "./ProjectSwitcher";
import "./sidebar.css";

export function AppSidebar({
  project,
  onNavigate,
}: {
  project?: PreviewProject;
  onNavigate?: () => void;
}) {
  const shortcuts = previewProjects
    .filter((item) => item.status === "ACTIVE")
    .slice(0, 5);
  return (
    <div className="cp-sidebar-container">
      <AppBrand className="cp-sidebar-brand" onNavigate={onNavigate} />
      <nav className="cp-sidebar-navigation" aria-label="Workspace navigation">
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
      </nav>
    </div>
  );
}
