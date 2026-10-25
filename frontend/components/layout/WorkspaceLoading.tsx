import styles from "./workspace-loading.module.css";

export function WorkspaceLoading() {
  return (
    <div className={styles.loading} role="status">
      <span className="sr-only">Loading page…</span>
      <div aria-hidden="true">
        <div className={`${styles.block} ${styles.eyebrow}`} />
        <div className={`${styles.block} ${styles.title}`} />
        <div className={`${styles.block} ${styles.description}`} />
        <div className={`${styles.block} ${styles.toolbar}`} />
        <div className={styles.list}>
          {[0, 1, 2, 3].map((row) => (
            <div className={styles.row} key={row}>
              <div className={`${styles.block} ${styles.avatar}`} />
              <div className={styles.details}>
                <div className={`${styles.block} ${styles.name}`} />
                <div className={`${styles.block} ${styles.description}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
