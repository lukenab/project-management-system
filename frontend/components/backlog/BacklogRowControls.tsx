"use client";

import { UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type {
  UpdateWorkItemInput,
  WorkItem,
  WorkItemMember,
} from "@/lib/work-items";

import {
  isWorkItemAssignee,
  workItemMemberName,
  workItemStatusLabels,
} from "@/lib/work-items";

import styles from "./backlog.module.css";
import { BacklogItemActions } from "./BacklogItemActions";
import { ChoiceList, ChoicePopover, SearchInput } from "./BacklogItemMetadata";
import { BacklogStatusBadge } from "./BacklogItemStatus";
import { BacklogPriority } from "./BacklogPriority";

type Field = "status" | "priority" | "assignee";
const priorities = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" } as const;
const statusOptions = Object.entries(workItemStatusLabels).map(
  ([id, name]) => ({ id, name }),
);
const priorityOptions = Object.entries(priorities).map(([id, name]) => ({
  id,
  name,
}));

export function BacklogRowControls({
  item,
  members,
  canEditDelivery,
  canEditPriority,
  onSave,
  onDelete,
}: {
  item: WorkItem;
  members: WorkItemMember[];
  canEditDelivery: boolean;
  canEditPriority: boolean;
  onSave: (changes: UpdateWorkItemInput) => void;
  onDelete?: () => void;
}) {
  const [field, setField] = useState<Field | null>(null);
  const [query, setQuery] = useState("");
  const group = useRef<HTMLDivElement>(null);
  const triggers = useRef<Partial<Record<Field, HTMLButtonElement | null>>>({});
  const pickerId = useId();
  const assignee = members.find(
    (member) => member.membershipId === item.assigneeId,
  );
  const assigneeName = assignee ? workItemMemberName(assignee) : "Unassigned";

  useEffect(() => {
    if (!field) return;
    function dismiss(event: PointerEvent) {
      if (!group.current?.contains(event.target as Node)) setField(null);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [field]);

  function open(next: Field) {
    setQuery("");
    setField((current) => (current === next ? null : next));
  }

  function close() {
    if (field) triggers.current[field]?.focus({ preventScroll: true });
    setField(null);
  }

  function pickerTrigger(name: Field, label: string) {
    return {
      ref: (element: HTMLButtonElement | null) => {
        triggers.current[name] = element;
      },
      type: "button" as const,
      className: styles.rowPicker,
      "aria-label": label,
      "aria-haspopup": "listbox" as const,
      "aria-expanded": field === name,
      "aria-controls": field === name ? pickerId : undefined,
      onClick: () => open(name),
    };
  }

  const search = query.trim().toLowerCase();
  const assigneeOptions = [
    { id: "", name: "Unassigned" },
    ...members
      .filter(isWorkItemAssignee)
      .map(({ membershipId, fullName, email, initials }) => ({
        id: membershipId,
        name: fullName,
        subtitle: email,
        initials,
      })),
  ].filter((option) =>
    `${option.name} ${"subtitle" in option ? option.subtitle : ""}`
      .toLowerCase()
      .includes(search),
  );

  const avatar = (
    <span
      className={styles.avatar}
      data-unassigned={!assignee || undefined}
      aria-hidden="true"
    >
      {assignee ? assignee.initials : <UserRound size={14} />}
    </span>
  );

  return (
    <div
      ref={group}
      className={styles.itemIndicators}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setField(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !field) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      {canEditDelivery ? (
        <button
          {...pickerTrigger(
            "status",
            `Change status for ${item.key}: ${workItemStatusLabels[item.status]}`,
          )}
        >
          <BacklogStatusBadge status={item.status} dropdown />
        </button>
      ) : (
        <BacklogStatusBadge status={item.status} />
      )}
      {canEditPriority ? (
        <button
          {...pickerTrigger(
            "priority",
            `Change priority for ${item.key}: ${item.priority ? priorities[item.priority] : "None"}`,
          )}
        >
          <BacklogPriority priority={item.priority} dropdown />
        </button>
      ) : (
        <span>
          <BacklogPriority priority={item.priority} />
        </span>
      )}
      {canEditDelivery ? (
        <button
          {...pickerTrigger(
            "assignee",
            `Change assignee for ${item.key}: ${assigneeName}`,
          )}
          title={assigneeName}
        >
          {avatar}
        </button>
      ) : (
        <span role="img" aria-label={assigneeName} title={assigneeName}>
          {avatar}
        </span>
      )}
      <div className={styles.rowActions}>
        {(canEditDelivery || canEditPriority || onDelete) && (
          <BacklogItemActions
            itemKey={item.key}
            onAssignee={canEditDelivery ? () => open("assignee") : undefined}
            onPriority={canEditPriority ? () => open("priority") : undefined}
            onDelete={onDelete}
          />
        )}
      </div>
      {field && (
        <ChoicePopover section={field} triggers={triggers}>
          {field === "assignee" && (
            <SearchInput
              label="Search assignees"
              value={query}
              onChange={setQuery}
            />
          )}
          <ChoiceList
            id={pickerId}
            label={`Select ${field}`}
            options={
              field === "status"
                ? statusOptions
                : field === "priority"
                  ? priorityOptions
                  : assigneeOptions
            }
            selected={
              (field === "assignee" ? item.assigneeId : item[field]) ?? ""
            }
            onSelect={(id) => {
              close();
              if (field === "status" && id !== item.status) {
                onSave({ status: id as WorkItem["status"] });
              } else if (field === "priority" && id !== item.priority) {
                onSave({ priority: id as keyof typeof priorities });
              } else if (
                field === "assignee" &&
                (id || null) !== item.assigneeId
              ) {
                onSave({ assigneeId: id || null });
              }
            }}
          />
        </ChoicePopover>
      )}
    </div>
  );
}
