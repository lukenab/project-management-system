"use client";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Toast } from "@/components/shared/Toast";
import { isProjectOwner, type PreviewProject } from "@/lib/preview-data";
import { usePreviewProjects } from "@/lib/preview-projects";

import { ArchiveProjectDialog } from "./ArchiveProjectDialog";
import { ProjectActions } from "./ProjectActions";

const PAGE_SIZE = 10;
const statuses = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
] as const;
export function ProjectDirectory() {
  const projects = usePreviewProjects();
  const router = useRouter();
  const directoryRef = useRef<HTMLElement>(null);
  const [archiving, setArchiving] = useState<PreviewProject | null>(null);
  const [archived, setArchived] = useState<PreviewProject | null>(null);
  const [status, setStatus] = useState<PreviewProject["status"]>("ACTIVE");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = query.trim().toLocaleLowerCase();
  const filtered = projects.filter(
    (project) =>
      project.status === status &&
      `${project.name} ${project.key}`.toLocaleLowerCase().includes(search),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);
  return (
    <section ref={directoryRef} aria-label="Project directory">
      {archiving && (
        <ArchiveProjectDialog
          project={archiving}
          onClose={() => setArchiving(null)}
          onArchived={(project) => {
            setArchiving(null);
            setArchived(project);
            requestAnimationFrame(() =>
              directoryRef.current
                ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
                ?.focus(),
            );
          }}
        />
      )}
      {archived && (
        <Toast
          key={archived.id}
          message="Project archived."
          actionLabel="View project"
          onAction={() => router.push(`/projects/${archived.id}`)}
          onDismiss={() => setArchived(null)}
          onRestoreFocus={() =>
            directoryRef.current
              ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
              ?.focus()
          }
        />
      )}
      <div className="directory-toolbar">
        <div
          className="project-filters"
          role="group"
          aria-label="Project status"
        >
          {statuses.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={status === item.value}
              onClick={() => {
                setStatus(item.value);
                setPage(1);
              }}
            >
              {item.label}
              <span className="count-badge">
                {projects.filter((p) => p.status === item.value).length}
              </span>
            </button>
          ))}
        </div>
        <label className="project-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <div className="surface directory-surface">
        <table className="project-table">
          <caption className="sr-only">
            {status === "ACTIVE" ? "Active" : "Archived"} projects you belong to
          </caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Key</th>
              <th scope="col">Project Owner</th>
              <th scope="col">Your role</th>
              <th scope="col" className="project-actions-cell">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((project) => (
              <tr key={project.id}>
                <td data-label="Project">
                  <Link
                    className="directory-project"
                    href={`/projects/${project.id}`}
                  >
                    <span
                      className={`project-avatar ${project.tone}`}
                      aria-hidden="true"
                    >
                      {project.initials}
                    </span>
                    <span className="directory-project-copy">
                      <strong>{project.name}</strong>
                      <span>{project.description}</span>
                    </span>
                  </Link>
                </td>
                <td data-label="Key">
                  <span className="directory-key">{project.key}</span>
                </td>
                <td data-label="Project Owner">
                  <span className="directory-owner">
                    <span className="owner-avatar" aria-hidden="true">
                      {project.owner.initials}
                    </span>
                    <span>
                      {isProjectOwner(project) ? "You" : project.owner.fullName}
                    </span>
                  </span>
                </td>
                <td data-label="Your role">{project.scrumRole}</td>
                <td className="project-actions-cell">
                  <ProjectActions
                    project={project}
                    onArchive={() => setArchiving(project)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="directory-empty" role="status">
            <h2>
              {search
                ? "No matching projects"
                : status === "ARCHIVED"
                  ? "No archived projects"
                  : "No active projects"}
            </h2>
            <p>
              {search
                ? "Try a different project name or key."
                : status === "ARCHIVED"
                  ? "Archived projects will appear here."
                  : "Projects you join will appear here."}
            </p>
          </div>
        )}
      </div>
      {pageCount > 1 && (
        <div className="directory-footer">
          <span aria-live="polite">
            Showing {firstIndex + 1}–{firstIndex + visible.length} of{" "}
            {filtered.length}
          </span>
          <nav aria-label="Project pages">
            <button
              type="button"
              className="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              className="button"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
