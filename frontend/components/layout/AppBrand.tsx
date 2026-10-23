import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";

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
      <BrandMark />
      <span className="app-brand-wordmark">
        Project<span>Management</span>
      </span>
    </Link>
  );
}
