"use client";

import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";
import { useCurrentUser } from "@/lib/current-user";

import "./brand.css";

export function AppBrand({
  className = "",
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const { user } = useCurrentUser();
  const href =
    user?.systemRole === "SYSTEM_ADMINISTRATOR" ? "/admin/users" : "/projects";

  return (
    <Link
      href={href}
      className={`app-brand ${className}`}
      onClick={onNavigate}
      aria-label="Project Management"
    >
      <BrandMark />
      <span className="app-brand-wordmark">
        Project<span>Management</span>
      </span>
    </Link>
  );
}
