import type { ReactNode } from "react";

import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";

import styles from "./login.module.css";

export function AuthCard({
  title,
  description,
  children,
  compact = false,
  footer,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  compact?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.wrapper}>
        <section
          className={`${styles.card} ${compact ? styles.compactCard : ""} ${className}`}
          aria-labelledby="auth-title"
        >
          <header
            className={`${styles.heading} ${compact ? styles.compactHeading : ""}`}
          >
            <div
              className={`${styles.mark} ${compact ? styles.compactMark : ""}`}
            >
              <BrandMark size={compact ? 40 : 48} />
            </div>
            <h1 id="auth-title">{title}</h1>
            <p>{description}</p>
          </header>
          {children}
          <p className={styles.signup}>
            {footer ?? (
              <Link href="/login" className={styles.textButton}>
                Back to sign in
              </Link>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
