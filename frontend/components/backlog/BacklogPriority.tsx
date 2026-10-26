import { ChevronDown, ChevronsUp, Equal } from "lucide-react";

import type { BacklogPriority as Priority } from "@/lib/backlog-items";

import styles from "./backlog.module.css";

export function BacklogPriority({ priority }: { priority: Priority }) {
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
