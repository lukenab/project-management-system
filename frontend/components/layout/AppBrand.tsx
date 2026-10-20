import Link from "next/link";

import { SidebarBrandMark } from "./SidebarBrandMark";
import "./brand.css";

export function AppBrand({
  className = "",
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/projects"
      className={`app-brand ${className}`}
      onClick={onNavigate}
      aria-label="Project Management"
    >
      <SidebarBrandMark />
      <span className="app-brand-wordmark">
        Project<span>Management</span>
      </span>
    </Link>
  );
}
