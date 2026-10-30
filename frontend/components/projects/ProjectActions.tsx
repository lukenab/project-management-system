"use client";
import { Ellipsis } from "lucide-react";

import {
  DropdownMenu,
  type DropdownItem,
} from "@/components/shared/DropdownMenu";
import { projectHref } from "@/config/navigation";
import { isProjectOwner, type PreviewProject } from "@/lib/preview-data";

function projectActions(
  project: PreviewProject,
  onArchive: () => void,
): DropdownItem[][] {
  const navigation: DropdownItem[] = [
    { label: "Open project", href: projectHref(project.id) },
    { label: "View members", href: projectHref(project.id, "members") },
  ];
  if (project.status === "ARCHIVED") return [navigation];
  if (isProjectOwner(project))
    return [
      navigation,
      [
        {
          label: "Project settings",
          href: projectHref(project.id, "settings"),
        },
      ],
      [{ label: "Archive project", tone: "danger", onSelect: onArchive }],
    ];
  return [navigation, [{ label: "Leave project", tone: "danger" }]];
}

export function ProjectActions({
  project,
  onArchive,
}: {
  project: PreviewProject;
  onArchive: () => void;
}) {
  return (
    <DropdownMenu
      label={`${project.name} actions`}
      triggerLabel={`Actions for ${project.name}`}
      triggerClassName="icon-button row-actions-trigger"
      trigger={<Ellipsis size={18} aria-hidden="true" />}
      groups={projectActions(project, onArchive)}
    />
  );
}
