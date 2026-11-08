"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { AdminUser } from "@/lib/admin-users";

import {
  accountInitials,
  formatAccountDate,
  systemRoleLabels,
} from "@/lib/admin-users";
import { getAdminUser } from "@/lib/admin-users-api";
import { ApiError } from "@/lib/api";

import styles from "./admin.module.css";
import { AccountStatusBadge } from "./AdminUserList";

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function AdminUserDetail({ userId }: { userId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "error" }
    | { status: "ready"; user: AdminUser }
  >({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void getAdminUser(userId).then(
      (user) => {
        if (active) setState({ status: "ready", user });
      },
      (cause) => {
        if (!active) return;
        const missing =
          cause instanceof ApiError &&
          (cause.status === 404 || cause.code === "INVALID_ID");
        setState({ status: missing ? "missing" : "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [userId, reload]);

  const back = (
    <Link className={styles.back} href="/admin/users">
      <ArrowLeft size={16} aria-hidden="true" />
      User accounts
    </Link>
  );
  if (state.status === "loading")
    return (
      <>
        {back}
        <p role="status">Loading account…</p>
      </>
    );
  if (state.status === "missing")
    return (
      <>
        {back}
        <div className="directory-empty" role="alert">
          <h2>Account not found</h2>
          <p>This account could not be loaded.</p>
        </div>
      </>
    );

  if (state.status === "error")
    return (
      <>
        {back}
        <div className="directory-empty" role="alert">
          <h2>Couldn’t load account</h2>
          <button
            className="button"
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setReload((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      </>
    );

  const { user } = state;
  const deleted = user.status === "DELETED";

  return (
    <>
      {back}
      <div className={styles.identity}>
        <span
          className={`${styles.avatar} ${styles.avatarLarge}`}
          data-gone={deleted || undefined}
          aria-hidden="true"
        >
          {accountInitials(user.fullName)}
        </span>
        <div>
          <h1>
            {user.fullName} <AccountStatusBadge status={user.status} />
          </h1>
          <p>{user.email}</p>
        </div>
      </div>
      <section className={styles.section} aria-labelledby="account-info">
        <div className={styles.sectionHead}>
          <h2 id="account-info">Account information</h2>
        </div>
        <div className={styles.infoRows}>
          <InfoRow label="System role">
            {systemRoleLabels[user.systemRole]}
          </InfoRow>
          <InfoRow label="Password configured">
            {user.hasPassword ? "Yes" : "No"}
          </InfoRow>
          <InfoRow label="Email verified">
            {user.emailVerifiedAt
              ? formatAccountDate(user.emailVerifiedAt)
              : "Not verified"}
          </InfoRow>
          <InfoRow label="Created">{formatAccountDate(user.createdAt)}</InfoRow>
          {user.suspendedAt && (
            <InfoRow label="Suspended">
              {formatAccountDate(user.suspendedAt)}
            </InfoRow>
          )}
          {user.deletedAt && (
            <InfoRow label="Deleted">
              {formatAccountDate(user.deletedAt)}
            </InfoRow>
          )}
        </div>
      </section>
    </>
  );
}
