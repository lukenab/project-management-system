"use client";
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";

const statuses = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
] as const;
export function ProjectDirectory({ projects }: { projects: PreviewProject[] }) {
  const [status, setStatus] = useState<PreviewProject["status"]>("ACTIVE");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = query.trim().toLocaleLowerCase();
  const filtered = projects.filter(
    (project) =>
      project.status === status &&
      `${project.name} ${project.key}`.toLocaleLowerCase().includes(search),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  return (
    <section aria-label="Project directory">
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
              <th scope="col">Your access</th>
              <th scope="col">Scrum accountability</th>
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
                <td data-label="Your access">{project.accessRole}</td>
                <td data-label="Scrum accountability">{project.scrumRole}</td>
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
      <div className="directory-footer">
        <span aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "project" : "projects"}
        </span>
        {pageCount > 1 && (
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
        )}
      </div>
    </section>
  );
}
