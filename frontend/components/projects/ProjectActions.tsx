"use client";
import { Ellipsis } from "lucide-react";

import {
  DropdownMenu,
  type DropdownItem,
} from "@/components/shared/DropdownMenu";
import { projectHref } from "@/config/navigation";
import { isProjectOwner, type PreviewProject } from "@/lib/preview-data";

// Actions follow the Use Case specification, not Jira:
// UC-06.2 Open, UC-07.1 Members, UC-06.3 Update information, UC-06.5 Transfer
// ownership and UC-06.4 Archive (Project Owner, Active project only), and
// UC-07.4 Leave (Active project; the current Project Owner must transfer
// ownership first). Deletion is not specified and restoration is outside
// Iteration 1, so neither is offered. Items without `href` have no screen yet.
function projectActions(project: PreviewProject): DropdownItem[][] {
  const navigation: DropdownItem[] = [
    { label: "Open project", href: projectHref(project.id) },
    { label: "View members", href: projectHref(project.id, "members") },
  ];
  if (project.status === "ARCHIVED") return [navigation];
  if (isProjectOwner(project))
    return [
      navigation,
      [{ label: "Project settings" }, { label: "Transfer ownership" }],
      [{ label: "Archive project", tone: "danger" }],
    ];
  return [navigation, [{ label: "Leave project", tone: "danger" }]];
}

export function ProjectActions({ project }: { project: PreviewProject }) {
  return (
    <DropdownMenu
      label={`${project.name} actions`}
      triggerLabel={`Actions for ${project.name}`}
      triggerClassName="icon-button row-actions-trigger"
      trigger={<Ellipsis size={18} aria-hidden="true" />}
      groups={projectActions(project)}
    />
  );
}
