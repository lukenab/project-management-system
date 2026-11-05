import { ChevronDown, ChevronsUp, Equal } from "lucide-react";

import type { WorkItemPriority as Priority } from "@/lib/work-items";

import styles from "./backlog.module.css";

export function BacklogPriority({
  priority,
  iconOnly = false,
}: {
  priority: Priority | null;
  iconOnly?: boolean;
}) {
  if (!priority) return null;
  const Icon =
    priority === "HIGH" ? ChevronsUp : priority === "LOW" ? ChevronDown : Equal;
  const label = priority[0] + priority.slice(1).toLowerCase();
  return (
    <span
      className={
        iconOnly
          ? `${styles.priority} ${styles.priorityIconOnly}`
          : styles.priority
      }
      data-priority={priority}
      title={iconOnly ? label : undefined}
    >
      <Icon size={14} aria-hidden="true" />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
