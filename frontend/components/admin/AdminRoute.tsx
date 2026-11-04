"use client";

import type { ReactNode } from "react";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { usePreviewProfile } from "@/lib/preview-profile";

const subscribe = () => () => {};

/** UI guard for the preview only; the server must enforce the Admin role. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const profile = usePreviewProfile();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  // The preview role lives in the browser, so wait instead of flashing a denial.
  if (!hydrated) return <p role="status">Loading…</p>;
  if (profile.systemRole !== "SYSTEM_ADMINISTRATOR")
    return (
      <EmptyState
        icon={LockKeyhole}
        title="You don't have access to this page"
        description="Only System Administrators can manage user accounts."
        action={
          <Link className="button" href="/projects">
            Back to projects
          </Link>
        }
      />
    );
  return <>{children}</>;
}
