"use client";

import { Ellipsis, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { DropdownItem } from "@/components/shared/DropdownMenu";
import type { AccountStatus, AdminUser, SystemRole } from "@/lib/admin-users";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { Toast } from "@/components/shared/Toast";
import {
  accountInitials,
  accountStatusLabels,
  formatAccountDate,
  systemRoleLabels,
} from "@/lib/admin-users";
import {
  previewAdminId,
  previewAdminUserRepository as repository,
} from "@/lib/preview-admin-users";

import {
  AccountActionDialog,
  accountActionDone,
  type AccountAction,
} from "./AccountActionDialog";
import styles from "./admin.module.css";

const PAGE_SIZE = 10;
const statusTabs: { value: AccountStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "DELETED", label: "Deleted" },
];

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      {accountStatusLabels[status]}
    </span>
  );
}

function accountMenu(
  user: AdminUser,
  onAction: (action: AccountAction) => void,
): DropdownItem[][] {
  const groups: DropdownItem[][] = [
    [{ label: "View details", href: `/admin/users/${user.id}` }],
  ];
  if (user.id === previewAdminId || user.status === "DELETED") return groups;
  groups[0].push(
    user.status === "ACTIVE"
      ? { label: "Suspend account", onSelect: () => onAction("suspend") }
      : { label: "Reactivate account", onSelect: () => onAction("reactivate") },
  );
  groups.push([
    {
      label: "Delete account",
      tone: "danger",
      onSelect: () => onAction("delete"),
    },
  ]);
  return groups;
}

export function AdminUserList() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<AccountStatus | "ALL">("ALL");
  const [role, setRole] = useState<SystemRole | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [request, setRequest] = useState<{
    action: AccountAction;
    user: AdminUser;
  } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    repository.list().then(
      (list) => {
        if (active) setUsers(list);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [reload]);

  const search = query.trim().toLowerCase();
  const matching = (users ?? []).filter(
    (user) =>
      (role === "ALL" || user.systemRole === role) &&
      `${user.fullName} ${user.email}`.toLowerCase().includes(search),
  );
  const filtered = matching.filter(
    (user) => status === "ALL" || user.status === status,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);

  return (
    <section aria-label="User accounts">
      {request && (
        <AccountActionDialog
          action={request.action}
          user={request.user}
          onClose={() => setRequest(null)}
          onDone={() => {
            setNotice(accountActionDone(request.action, request.user));
            setRequest(null);
            setReload((value) => value + 1);
          }}
        />
      )}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
      <div className="directory-toolbar">
        <div
          className="project-filters"
          role="group"
          aria-label="Account status"
        >
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
            >
              {tab.label}
              <span className="count-badge">
                {
                  matching.filter(
                    (user) => tab.value === "ALL" || user.status === tab.value,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <label className="project-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search accounts"
              placeholder="Search name or email"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            className={styles.select}
            aria-label="System role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as SystemRole | "ALL");
              setPage(1);
            }}
          >
            <option value="ALL">All roles</option>
            {Object.entries(systemRoleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="surface directory-surface">
        <table className="project-table">
          <caption className="sr-only">User accounts</caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">System role</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col" className="project-actions-cell">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((user) => (
              <tr key={user.id}>
                <td data-label="Account">
                  <Link
                    className="directory-project"
                    href={`/admin/users/${user.id}`}
                  >
                    <span
                      className={styles.avatar}
                      data-gone={user.status === "DELETED" || undefined}
                      aria-hidden="true"
                    >
                      {accountInitials(user.fullName)}
                    </span>
                    <span className="directory-project-copy">
                      <strong>
                        {user.fullName}
                        {user.id === previewAdminId && (
                          <span className={styles.you}>You</span>
                        )}
                      </strong>
                      <span>{user.email}</span>
                    </span>
                  </Link>
                </td>
                <td data-label="System role">
                  {systemRoleLabels[user.systemRole]}
                </td>
                <td data-label="Status">
                  <AccountStatusBadge status={user.status} />
                </td>
                <td data-label="Created">
                  {formatAccountDate(user.createdAt)}
                </td>
                <td className="project-actions-cell">
                  <DropdownMenu
                    label={`${user.fullName} actions`}
                    triggerLabel={`Actions for ${user.fullName}`}
                    triggerClassName="icon-button row-actions-trigger"
                    trigger={<Ellipsis size={18} aria-hidden="true" />}
                    groups={accountMenu(user, (action) =>
                      setRequest({ action, user }),
                    )}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {failed ? (
          <div className="directory-empty" role="alert">
            <h2>Couldn&apos;t load accounts</h2>
            <p>Reload the page and try again.</p>
          </div>
        ) : !users ? (
          <div className="directory-empty" role="status">
            <p>Loading accounts…</p>
          </div>
        ) : (
          !filtered.length && (
            <div className="directory-empty" role="status">
              <h2>No matching accounts</h2>
              <p>Try another name or email, or clear the filters.</p>
            </div>
          )
        )}
      </div>
      {pageCount > 1 && (
        <div className="directory-footer">
          <span aria-live="polite">
            Showing {firstIndex + 1}–{firstIndex + visible.length} of{" "}
            {filtered.length}
          </span>
          <nav aria-label="Account pages">
            <button
              type="button"
              className="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              className="button"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
