"use client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FolderKanban,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { previewProjects, type PreviewProject } from "@/lib/preview-data";

export function ProjectSwitcher({
  project,
  onNavigate,
}: {
  project?: PreviewProject;
  onNavigate?: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current?.open) {
        event.stopPropagation();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    const element = ref.current;
    element?.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      element?.removeEventListener("keydown", escape);
    };
  }, []);
  function navigate() {
    if (ref.current) ref.current.open = false;
    setQuery("");
    onNavigate?.();
  }
  const matching = previewProjects.filter((item) =>
    `${item.name} ${item.key}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <details
      ref={ref}
      className="project-switcher"
      onToggle={(event) => {
        if (!event.currentTarget.open) setQuery("");
      }}
    >
      <summary
        aria-label={
          project
            ? `Switch project, current project: ${project.name}`
            : "Choose a project"
        }
      >
        <span
          className={`project-avatar ${project?.tone ?? "blue"}`}
          aria-hidden="true"
        >
          {project?.initials ?? <FolderKanban size={16} />}
        </span>
        <span className="switcher-current">
          <strong>{project?.name ?? "Projects"}</strong>
          <span>{project ? "Project" : "Choose a project"}</span>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="switcher-popover">
        <label className="project-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="Find a project"
            placeholder="Search projects…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="switcher-list">
          {matching.map((item) => (
            <Link
              key={item.id}
              href={`/projects/${item.id}`}
              onClick={navigate}
              aria-current={item.id === project?.id ? "true" : undefined}
            >
              <span
                className={`project-avatar ${item.tone}`}
                aria-hidden="true"
              >
                {item.initials}
              </span>
              <span className="switcher-name">{item.name}</span>
              {item.id === project?.id && (
                <Check size={15} aria-label="Current project" />
              )}
            </Link>
          ))}
          {!matching.length && (
            <p className="switcher-empty" role="status">
              No matching projects
            </p>
          )}
        </div>
        <div className="switcher-footer">
          <Link className="switcher-all" href="/projects" onClick={navigate}>
            <span>View all projects</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </details>
  );
}
