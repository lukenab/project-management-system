"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { AdminUser, AuditEvent } from "@/lib/admin-users";

import { Toast } from "@/components/shared/Toast";
import {
  accountInitials,
  formatAccountDate,
  systemRoleLabels,
} from "@/lib/admin-users";
import {
  previewAccountName,
  previewAdminId,
  previewAdminUserRepository as repository,
} from "@/lib/preview-admin-users";

import {
  AccountActionDialog,
  accountActionDone,
  type AccountAction,
} from "./AccountActionDialog";
import styles from "./admin.module.css";
import { AccountStatusBadge } from "./AdminUserList";

const auditLabels: Record<string, string> = {
  USER_SUSPENDED: "suspended this account",
  USER_REACTIVATED: "reactivated this account",
  USER_DELETED: "deleted this account",
};

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
    | { status: "ready"; user: AdminUser; events: AuditEvent[] }
  >({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState<AccountAction | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      repository.get(userId),
      repository.listAudit({ targetType: "USER_ACCOUNT", targetId: userId }),
    ]).then(
      ([user, events]) => {
        if (active) setState({ status: "ready", user, events });
      },
      () => {
        if (active) setState({ status: "missing" });
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

  const { user, events } = state;
  const self = user.id === previewAdminId;
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
      <div className={styles.detail}>
        <div className={styles.stack}>
          <section className={styles.section} aria-labelledby="account-info">
            <div className={styles.sectionHead}>
              <h2 id="account-info">Account information</h2>
            </div>
            <div className={styles.infoRows}>
              <InfoRow label="System role">
                {systemRoleLabels[user.systemRole]}
              </InfoRow>
              <InfoRow label="Sign-in method">
                {user.hasPassword ? "Email and password" : "Google"}
              </InfoRow>
              <InfoRow label="Email verified">
                {formatAccountDate(user.emailVerifiedAt)}
              </InfoRow>
              <InfoRow label="Created">
                {formatAccountDate(user.createdAt)}
              </InfoRow>
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
          <section className={styles.section} aria-labelledby="account-history">
            <div className={styles.sectionHead}>
              <h2 id="account-history">Administrative history</h2>
              <p>Suspensions, reactivations and deletions, newest first.</p>
            </div>
            {events.length ? (
              <ol className={styles.history}>
                {events.map((event) => (
                  <li key={event.id}>
                    <span className={styles.dot} aria-hidden="true" />
                    <div>
                      <strong>{previewAccountName(event.actorId)}</strong>{" "}
                      {auditLabels[event.action] ?? event.action}{" "}
                      <time className={styles.time} dateTime={event.occurredAt}>
                        · {formatAccountDate(event.occurredAt)}
                      </time>
                      {event.reason && <blockquote>{event.reason}</blockquote>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.notice}>No administrative actions yet.</p>
            )}
          </section>
        </div>
        <div className={styles.stack}>
          {self || deleted ? (
            <section className={styles.section} aria-labelledby="account-acts">
              <div className={styles.sectionHead}>
                <h2 id="account-acts">Account actions</h2>
              </div>
              <p className={styles.notice}>
                {self
                  ? "You can't suspend or delete your own account. Ask another System Administrator."
                  : "This account is deleted and can't be reactivated."}
              </p>
            </section>
          ) : (
            <>
              {user.status === "SUSPENDED" && (
                <section
                  className={styles.section}
                  aria-labelledby="account-access"
                >
                  <div className={styles.sectionHead}>
                    <h2 id="account-access">Account access</h2>
                  </div>
                  <div className={styles.actionBody}>
                    <strong>Reactivate account</strong>
                    <p>Lets the user sign in again.</p>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setAction("reactivate")}
                    >
                      Reactivate account
                    </button>
                  </div>
                </section>
              )}
              <section
                className={`${styles.section} ${styles.danger}`}
                aria-labelledby="account-danger"
              >
                <div className={styles.sectionHead}>
                  <h2 id="account-danger">Danger zone</h2>
                </div>
                {user.status === "ACTIVE" && (
                  <div className={styles.actionBody}>
                    <strong>Suspend account</strong>
                    <p>
                      Signs the user out everywhere and blocks sign-in until
                      reactivated.
                    </p>
                    <button
                      type="button"
                      className={`button ${styles.dangerButton}`}
                      onClick={() => setAction("suspend")}
                    >
                      Suspend account
                    </button>
                  </div>
                )}
                <div className={styles.actionBody}>
                  <strong>Delete account</strong>
                  <p>Permanently blocks sign-in. This can&apos;t be undone.</p>
                  <button
                    type="button"
                    className={`button ${styles.dangerButton}`}
                    onClick={() => setAction("delete")}
                  >
                    Delete account
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      {action && (
        <AccountActionDialog
          action={action}
          user={user}
          onClose={() => setAction(null)}
          onDone={() => {
            setNotice(accountActionDone(action, user));
            setAction(null);
            setReload((value) => value + 1);
          }}
        />
      )}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
    </>
  );
}
