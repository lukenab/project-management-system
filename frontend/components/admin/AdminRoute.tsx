"use client";

import type { ReactNode } from "react";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/EmptyState";
import { useCurrentUser } from "@/lib/current-user";

/** UI guard only; the server enforces the Admin role on every admin API. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useCurrentUser();
  // The role comes from the server, so wait instead of flashing a denial.
  if (loading) return <p role="status">Loading…</p>;
  if (user?.systemRole !== "SYSTEM_ADMINISTRATOR")
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
