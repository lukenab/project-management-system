"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";

import { DropdownMenu } from "@/components/shared/DropdownMenu";

export function BacklogItemActions({
  itemKey,
  onDelete,
}: {
  itemKey: string;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu
      label={`Actions for ${itemKey}`}
      triggerLabel={`Actions for ${itemKey}`}
      triggerClassName="icon-button"
      trigger={<MoreHorizontal size={17} aria-hidden="true" />}
      groups={[
        [{ label: "Delete", icon: Trash2, tone: "danger", onSelect: onDelete }],
      ]}
    />
  );
}
