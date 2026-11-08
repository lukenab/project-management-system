"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AccountStatus, SystemRole } from "@/lib/admin-users";

import {
  accountInitials,
  accountStatusLabels,
  formatAccountDate,
  systemRoleLabels,
} from "@/lib/admin-users";
import { listAdminUsers, type AdminUserPage } from "@/lib/admin-users-api";
import { useCurrentUser } from "@/lib/current-user";

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

export function AdminUserList() {
  const { user: currentUser } = useCurrentUser();
  const [result, setResult] = useState<{
    key: string;
    data: AdminUserPage | null;
  } | null>(null);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<AccountStatus | "ALL">("ALL");
  const [role, setRole] = useState<SystemRole | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = query.trim();
  const key = JSON.stringify([search, role, status, page, reload]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(
      () => {
        void listAdminUsers({
          search,
          role,
          status,
          page,
          limit: PAGE_SIZE,
        }).then(
          (data) => {
            if (active) setResult({ key, data });
          },
          () => {
            if (active) setResult({ key, data: null });
          },
        );
      },
      search ? 250 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, page, role, search, status]);

  const current = result?.key === key ? result : null;
  const visible = current?.data?.users ?? [];
  const total = current?.data?.pagination.total ?? 0;
  const pageCount = Math.max(1, current?.data?.pagination.totalPages ?? 0);
  const firstIndex = (page - 1) * PAGE_SIZE;

  return (
    <section aria-label="User accounts">
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
                        {user.id === currentUser?.id && (
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
              </tr>
            ))}
          </tbody>
        </table>
        {current && !current.data ? (
          <div className="directory-empty" role="alert">
            <h2>Couldn&apos;t load accounts</h2>
            <button
              className="button"
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : !current ? (
          <div className="directory-empty" role="status">
            <p>Loading accounts…</p>
          </div>
        ) : (
          !visible.length && (
            <div className="directory-empty" role="status">
              <h2>No matching accounts</h2>
              <p>Try another name or email, or clear the filters.</p>
            </div>
          )
        )}
      </div>
      {current?.data && (pageCount > 1 || page > 1) && (
        <div className="directory-footer">
          <span aria-live="polite">
            {visible.length > 0 && (
              <>
                Showing {firstIndex + 1}–{firstIndex + visible.length} of{" "}
                {total}
              </>
            )}
          </span>
          <nav aria-label="Account pages">
            <button
              type="button"
              className="button"
              disabled={page === 1}
              onClick={() => setPage(Math.min(page - 1, pageCount))}
            >
              Previous
            </button>
            <span>
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="button"
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
