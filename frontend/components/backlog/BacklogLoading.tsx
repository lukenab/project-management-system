import styles from "./backlog.module.css";

export function BacklogLoading({
  label = "Loading work items…",
  rows = 4,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {[...Array.from({ length: rows }).keys()].map((index) => (
          <div className={styles.skeletonRow} key={index}>
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
