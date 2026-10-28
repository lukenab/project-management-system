import styles from "./workspace-loading.module.css";

export function ProjectPageLoading() {
  return (
    <div className={styles.loading} role="status">
      <span className="sr-only">Loading page…</span>
      <div aria-hidden="true">
        <div className={`${styles.block} ${styles.eyebrow}`} />
        <div className={`${styles.block} ${styles.title}`} />
      </div>
    </div>
  );
}
