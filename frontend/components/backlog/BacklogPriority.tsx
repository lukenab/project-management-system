import { ChevronDown, ChevronsUp, Equal } from "lucide-react";

import type { WorkItemPriority as Priority } from "@/lib/work-items";

import styles from "./backlog.module.css";

export function BacklogPriority({
  priority,
  dropdown = false,
  iconOnly = false,
}: {
  priority: Priority | null;
  dropdown?: boolean;
  iconOnly?: boolean;
}) {
  if (!priority && !dropdown) return null;
  const Icon =
    priority === "HIGH" ? ChevronsUp : priority === "LOW" ? ChevronDown : Equal;
  const label = priority
    ? priority[0] + priority.slice(1).toLowerCase()
    : "None";
  return (
    <span
      className={
        iconOnly
          ? `${styles.priority} ${styles.priorityIconOnly}`
          : styles.priority
      }
      data-priority={priority ?? undefined}
      title={iconOnly ? label : undefined}
    >
      {priority && <Icon size={14} aria-hidden="true" />}
      {iconOnly ? <span className="sr-only">{label}</span> : label}
      {dropdown && <ChevronDown size={12} aria-hidden="true" />}
    </span>
  );
}
