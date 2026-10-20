"use client";
import { ArrowRight, Check, ChevronRight, List, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { previewProjects, type PreviewProject } from "@/lib/preview-data";

const GAP = 8;
const VIEWPORT_MARGIN = 12;
const DRAWER_QUERY = "(max-width: 900px)";

export function ProjectSwitcher({
  project,
  onNavigate,
}: {
  project?: PreviewProject;
  onNavigate?: () => void;
}) {
  const popoverId = `${useId()}-projects`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Desktop: flyout to the right of the sidebar, aligned with the trigger.
  // Mobile drawer: drop down below the trigger, inside the drawer width.
  function position() {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const rect = trigger.getBoundingClientRect();
    const inDrawer = window.matchMedia(DRAWER_QUERY).matches;
    const sidebar = trigger.closest(".cp-sidebar-container");
    const left = inDrawer
      ? rect.left
      : (sidebar?.getBoundingClientRect().right ?? rect.right) + GAP;
    const height = popover.offsetHeight;
    const preferredTop = inDrawer ? rect.bottom + 4 : rect.top;
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(preferredTop, window.innerHeight - height - VIEWPORT_MARGIN),
    );
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.width = inDrawer ? `${rect.width}px` : "";
  }

  useEffect(() => {
    if (!open) return;
    const reposition = () => position();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function navigate() {
    popoverRef.current?.hidePopover();
    onNavigate?.();
  }

  const matching = previewProjects.filter((item) =>
    `${item.name} ${item.key}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cp-sidebar-item global-project-link more-projects-trigger"
        popoverTarget={popoverId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
      >
        <span className="more-projects-icon" aria-hidden="true">
          <List size={16} />
        </span>
        <span className="cp-sidebar-item-label">More projects</span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-label="Projects"
        className="switcher-popover"
        onKeyDown={(event) => {
          // A non-empty search field would otherwise swallow the first Escape.
          if (event.key !== "Escape") return;
          event.preventDefault();
          popoverRef.current?.hidePopover();
          triggerRef.current?.focus();
        }}
        onBeforeToggle={(event) => {
          if (event.newState === "open") position();
        }}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          if (isOpen) {
            position();
            searchRef.current?.focus();
          } else {
            setQuery("");
          }
        }}
      >
        <label className="project-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
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
    </>
  );
}
