import styles from "./sprints.module.css";

export function SprintProgress({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className={styles.progress}>
      <span>
        {done}/{total} complete
      </span>
      <span
        className={styles.bar}
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </span>
      <span>{percent}%</span>
    </span>
  );
}
