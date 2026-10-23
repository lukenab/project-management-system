import Link from "next/link";

import type { PreviewProject } from "@/lib/preview-data";

import { projectHref, projectNavigation } from "@/config/navigation";

export function ProjectNavigation({
  project,
  pathname,
}: {
  project: PreviewProject;
  pathname: string;
}) {
  return (
    <nav className="project-workspace-nav" aria-label={`${project.name} views`}>
      {projectNavigation.map(({ label, segment, icon: Icon }) => {
        const href = projectHref(project.id, segment);
        const active =
          pathname === href ||
          (segment !== "" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
