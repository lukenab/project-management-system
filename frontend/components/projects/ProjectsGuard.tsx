"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCurrentUser } from "@/lib/current-user";

export function ProjectsGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.systemRole === "SYSTEM_ADMINISTRATOR") {
      router.replace("/admin/users");
    }
  }, [user, loading, router]);

  if (loading) {
    return <p role="status">Loading…</p>;
  }

  if (user?.systemRole === "SYSTEM_ADMINISTRATOR") {
    return null;
  }

  return <>{children}</>;
}
