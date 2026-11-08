"use client";

import { ArrowLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { AdminUser } from "@/lib/admin-users";

import {
  DropdownMenu,
  type DropdownItem,
} from "@/components/shared/DropdownMenu";
import { Toast } from "@/components/shared/Toast";
import {
  accountInitials,
  formatAccountDate,
  systemRoleLabels,
} from "@/lib/admin-users";
import { getAdminUser } from "@/lib/admin-users-api";
import { ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";

import {
  AccountActionDialog,
  accountActionDone,
  type AccountAction,
} from "./AccountActionDialog";
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
  const [action, setAction] = useState<AccountAction | null>(null);
  const [notice, setNotice] = useState("");
  const { user: currentUser } = useCurrentUser();

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
  const actions: DropdownItem[] = [];
  if (!deleted && currentUser && currentUser.id !== user.id) {
    actions.push(
      user.status === "ACTIVE"
        ? {
            label: "Suspend account",
            tone: "danger",
            onSelect: () => setAction("suspend"),
          }
        : {
            label: "Reactivate account",
            onSelect: () => setAction("reactivate"),
          },
      {
        label: "Delete account",
        tone: "danger",
        onSelect: () => setAction("delete"),
      },
    );
  }

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
        <div className={`${styles.sectionHead} ${styles.accountActions}`}>
          <h2 id="account-info">Account information</h2>
          {actions.length > 0 && (
            <DropdownMenu
              label="Account actions"
              triggerLabel="Account actions"
              triggerClassName="button"
              trigger={<MoreHorizontal size={18} aria-hidden="true" />}
              groups={[actions]}
            />
          )}
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
      {action && (
        <AccountActionDialog
          action={action}
          user={user}
          onClose={() => setAction(null)}
          onDone={(updated) => {
            setNotice(accountActionDone(action, user));
            setAction(null);
            if (updated) setState({ status: "ready", user: updated });
            else {
              setState({
                status: "ready",
                user: { ...user, status: "DELETED" },
              });
              setReload((value) => value + 1);
            }
          }}
        />
      )}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
    </>
  );
}
