import { Bookmark, Bug, Square, SquareCheck } from "lucide-react";

import styles from "./backlog.module.css";

export function WorkTypeIcon({ workType }: { workType: string | null }) {
  const type = workType?.trim().toLowerCase();
  const kind = ["story", "task", "bug"].includes(type ?? "") ? type : "other";
  const Icon =
    kind === "story"
      ? Bookmark
      : kind === "task"
        ? SquareCheck
        : kind === "bug"
          ? Bug
          : Square;

  return (
    <span
      className={styles.workTypeIcon}
      data-type={kind}
      title={workType || "Work item"}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="sr-only">{workType || "Work item"}</span>
    </span>
  );
}
