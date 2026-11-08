"use client";

import { ScrollText, UsersRound } from "lucide-react";
import Link from "next/link";

import { useCurrentUser } from "@/lib/current-user";
import { type PreviewProject } from "@/lib/preview-data";
import { useProjectList } from "@/lib/use-project-list";

import { AppBrand } from "./AppBrand";
import { ProjectSwitcher } from "./ProjectSwitcher";
import "./sidebar.css";

export function AppSidebar({
  project,
  adminSection = null,
  onNavigate,
}: {
  project?: PreviewProject;
  adminSection?: "users" | "audit" | null;
  onNavigate?: () => void;
}) {
  const { user, loading } = useCurrentUser();
  const { projects } = useProjectList();
  const shortcuts = projects
    .filter((item) => item.status === "ACTIVE")
    .slice(0, 5);
  return (
    <div className="cp-sidebar-container">
      <AppBrand className="cp-sidebar-brand" onNavigate={onNavigate} />
      <nav className="cp-sidebar-navigation" aria-label="Workspace navigation">
        {loading ? null : user?.systemRole === "SYSTEM_ADMINISTRATOR" ? (
          <>
            <p className="cp-sidebar-section-heading">Administration</p>
            <Link
              href="/admin/users"
              onClick={onNavigate}
              className={`cp-sidebar-item ${adminSection === "users" ? "cp-sidebar-active" : ""}`}
              aria-current={adminSection === "users" ? "true" : undefined}
            >
              <UsersRound size={16} aria-hidden="true" />
              <span className="cp-sidebar-item-label">User accounts</span>
            </Link>
            <Link
              href="/admin/audit-events"
              onClick={onNavigate}
              className={`cp-sidebar-item ${adminSection === "audit" ? "cp-sidebar-active" : ""}`}
              aria-current={adminSection === "audit" ? "true" : undefined}
            >
              <ScrollText size={16} aria-hidden="true" />
              <span className="cp-sidebar-item-label">Audit log</span>
            </Link>
          </>
        ) : (
          <>
            {shortcuts.length > 0 && (
              <p className="cp-sidebar-section-heading">Projects</p>
            )}
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
