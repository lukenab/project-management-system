import { ChevronDown, ChevronsUp, Equal } from "lucide-react";

import type { WorkItemPriority as Priority } from "@/lib/work-items";

import styles from "./backlog.module.css";

export function BacklogPriority({ priority }: { priority: Priority | null }) {
  if (!priority) return null;
  const Icon =
    priority === "HIGH" ? ChevronsUp : priority === "LOW" ? ChevronDown : Equal;
  const label = priority[0] + priority.slice(1).toLowerCase();
  return (
    <span className={styles.priority} data-priority={priority}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
