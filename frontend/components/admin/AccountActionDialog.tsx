"use client";

import { useRef, useState, type FormEvent } from "react";

import type { AdminUser } from "@/lib/admin-users";

import { MemberDialog } from "@/components/members/MemberDialog";
import {
  previewAccountBlockReason,
  previewAdminUserRepository as repository,
} from "@/lib/preview-admin-users";

import styles from "./admin.module.css";

export type AccountAction = "suspend" | "reactivate" | "delete";

const copy: Record<
  AccountAction,
  {
    verb: string;
    confirm: string;
    busy: string;
    placeholder?: string;
    done: string;
  }
> = {
  suspend: {
    verb: "Suspend",
    confirm: "Suspend account",
    busy: "Suspending…",
    placeholder: "Why is this account being suspended?",
    done: "suspended",
  },
  reactivate: {
    verb: "Reactivate",
    confirm: "Reactivate account",
    busy: "Reactivating…",
    done: "reactivated",
  },
  delete: {
    verb: "Delete",
    confirm: "Delete account",
    busy: "Deleting…",
    placeholder: "Why is this account being deleted?",
    done: "deleted",
  },
};

export function accountActionDone(action: AccountAction, user: AdminUser) {
  return `${user.fullName}'s account ${copy[action].done}.`;
}

export function AccountActionDialog({
  action,
  user,
  onClose,
  onDone,
}: {
  action: AccountAction;
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const needsReason = action !== "reactivate";
  const blocked = needsReason ? previewAccountBlockReason(user) : "";
  const missing = needsReason && attempted && !reason.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || blocked) return;
    setAttempted(true);
    setError("");
    if (needsReason && !reason.trim()) {
      reasonRef.current?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      if (action === "suspend") await repository.suspend(user.id, reason);
      else if (action === "reactivate") await repository.reactivate(user.id);
      else await repository.remove(user.id, reason);
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't update the account. Please try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <MemberDialog
      title={`${copy[action].verb} ${user.fullName}?`}
      description={
        action === "suspend" ? (
          "They'll be signed out on all devices and can't sign in until an administrator reactivates the account. Their project memberships and assigned work stay in place."
        ) : action === "reactivate" ? (
          "They'll be able to sign in again. Memberships removed while the account was suspended are not restored."
        ) : (
          <>
            <strong>{user.email}</strong> will no longer be able to sign in and
            their unfinished work will become unassigned. This can&apos;t be
            undone, and the email address can&apos;t be used again.
          </>
        )
      }
      busy={busy}
      error={error}
      confirmLabel={copy[action].confirm}
      busyLabel={copy[action].busy}
      cancelLabel={blocked ? "Close" : "Cancel"}
      destructive={action !== "reactivate"}
      hideConfirm={!!blocked}
      onSubmit={(event) => void submit(event)}
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      {blocked ? (
        <p className={styles.blocked} role="alert">
          {blocked}
        </p>
      ) : (
        needsReason && (
          <div className={styles.reason}>
            <label htmlFor="account-action-reason">
              Reason
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              ref={reasonRef}
              id="account-action-reason"
              aria-required="true"
              value={reason}
              disabled={busy}
              placeholder={copy[action].placeholder}
              aria-invalid={missing}
              aria-describedby="account-action-reason-help"
              data-initial-focus
              onChange={(event) => setReason(event.target.value)}
            />
            <p
              id="account-action-reason-help"
              className={missing ? styles.error : styles.help}
            >
              {missing ? "Enter a reason." : "Saved to the audit log."}
            </p>
          </div>
        )
      )}
    </MemberDialog>
  );
}
