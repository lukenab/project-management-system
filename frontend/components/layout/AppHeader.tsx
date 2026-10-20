"use client";

import { ChevronDown, ChevronRight, Menu, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { previewUser, type PreviewProject } from "@/lib/preview-data";

import { AppBrand } from "./AppBrand";
import { NotificationDropdown } from "./NotificationDropdown";

type AppHeaderProps = {
  title: string;
  project?: PreviewProject;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenNavigation: () => void;
};

export function AppHeader({
  title,
  project,
  theme,
  onToggleTheme,
  onOpenNavigation,
}: AppHeaderProps) {
  const profileRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      )
        profileRef.current.open = false;
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && profileRef.current?.open) {
        profileRef.current.open = false;
        profileRef.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="icon-button mobile-menu"
          aria-label="Open navigation"
          onClick={onOpenNavigation}
        >
          <Menu size={19} aria-hidden="true" />
        </button>
        <span className="mobile-header-brand">
          <AppBrand />
        </span>
        <nav aria-label="Breadcrumb" className="breadcrumb">
          {project && (
            <>
              <Link href="/projects">All Projects</Link>
              <ChevronRight size={14} aria-hidden="true" />
              <Link
                href={`/projects/${project.id}`}
                className="breadcrumb-project"
              >
                {project.name}
              </Link>
              <ChevronRight size={14} aria-hidden="true" />
            </>
          )}
          <span aria-current="page">{title}</span>
        </nav>
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="icon-button header-control theme-control"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? (
            <Sun size={15} aria-hidden="true" />
          ) : (
            <Moon size={15} aria-hidden="true" />
          )}
        </button>
        <NotificationDropdown />
        <div className="header-separator" />
        <details className="profile-menu" ref={profileRef}>
          <summary aria-label="Account options">
            <span className="user-avatar">{previewUser.initials}</span>
            <span className="profile-name">{previewUser.fullName}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="profile-popover">
            <div className="profile-popover-summary">
              <strong>{previewUser.fullName}</strong>
              <span>{previewUser.email}</span>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
