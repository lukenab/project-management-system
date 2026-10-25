"use client";

import { X } from "lucide-react";
import { Suspense, useEffect, useRef, type ReactNode } from "react";

import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { useTheme } from "./use-theme";
import { WorkspaceLoading } from "./WorkspaceLoading";
import { WorkspaceContent, WorkspaceSidebar } from "./WorkspaceRoute";

export function AppShell({ children }: { children: ReactNode }) {
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
        <Suspense fallback={<AppSidebar />}>
          <WorkspaceSidebar />
        </Suspense>
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
        <Suspense fallback={<AppSidebar onNavigate={closeNavigation} />}>
          <WorkspaceSidebar onNavigate={closeNavigation} />
        </Suspense>
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
          <Suspense fallback={<WorkspaceLoading />}>
            <WorkspaceContent>{children}</WorkspaceContent>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
