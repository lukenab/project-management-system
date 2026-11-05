"use client";

import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  type DropdownItem,
} from "@/components/shared/DropdownMenu";

export function BacklogItemActions({
  itemKey,
  onAssignee,
  onPriority,
  onDelete,
}: {
  itemKey: string;
  onAssignee?: () => void;
  onPriority?: () => void;
  onDelete?: () => void;
}) {
  const fields: DropdownItem[] = [];
  if (onAssignee) fields.push({ label: "Assignee", onSelect: onAssignee });
  if (onPriority) fields.push({ label: "Priority", onSelect: onPriority });
  const groups = fields.length ? [fields] : [];
  if (onDelete)
    groups.push([{ label: "Delete", tone: "danger", onSelect: onDelete }]);

  return (
    <DropdownMenu
      label={`Actions for ${itemKey}`}
      triggerLabel={`Actions for ${itemKey}`}
      triggerClassName="icon-button"
      trigger={<MoreHorizontal size={17} aria-hidden="true" />}
      groups={groups}
    />
  );
}
