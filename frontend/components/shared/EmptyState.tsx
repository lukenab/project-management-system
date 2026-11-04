import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="empty-icon">
        <Icon size={25} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </section>
  );
}
