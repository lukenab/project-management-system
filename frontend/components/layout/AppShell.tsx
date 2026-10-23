"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { getPreviewProject } from "@/lib/preview-data";

import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { ProjectNavigation } from "./ProjectNavigation";
import { useTheme } from "./use-theme";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const project =
    segments[0] === "projects" && segments[1]
      ? getPreviewProject(segments[1])
      : undefined;
  const { theme, toggleTheme } = useTheme();
  const drawerRef = useRef<HTMLDialogElement>(null);

  function closeNavigation() {
    drawerRef.current?.close();
    document.body.style.removeProperty("overflow");
  }

  useEffect(() => {
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) {
        drawerRef.current?.close();
        document.body.style.removeProperty("overflow");
      }
    }
    const query = window.matchMedia("(min-width: 901px)");
    query.addEventListener("change", closeOnDesktop);
    return () => {
      query.removeEventListener("change", closeOnDesktop);
      document.body.style.removeProperty("overflow");
    };
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <AppSidebar project={project} />
      </aside>
      <dialog
        ref={drawerRef}
        className="mobile-drawer"
        aria-label="Navigation"
        onClose={() => document.body.style.removeProperty("overflow")}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeNavigation();
        }}
      >
        <button
          type="button"
          className="icon-button drawer-close"
          onClick={closeNavigation}
          aria-label="Close navigation"
        >
          <X size={19} aria-hidden="true" />
        </button>
        <AppSidebar project={project} onNavigate={closeNavigation} />
      </dialog>
      <div className="app-body">
        <AppHeader
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenNavigation={() => {
            drawerRef.current?.showModal();
            document.body.style.overflow = "hidden";
          }}
        />
        <main id="main-content" className="main-content">
          {project && (
            <ProjectNavigation project={project} pathname={pathname} />
          )}
          <div key={pathname} className="page-container">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
