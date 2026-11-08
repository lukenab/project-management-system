import type {
  AccountStatus,
  AdminUser,
  AuditEvent,
  AuditQuery,
  SystemRole,
} from "./admin-users";

import { request } from "./api";

const usersPath = "/api/admin/users";

export type AdminUserPage = {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export function listAdminUsers(query: {
  search: string;
  role: SystemRole | "ALL";
  status: AccountStatus | "ALL";
  page: number;
  limit: number;
}) {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });
  if (query.search) params.set("search", query.search);
  if (query.role !== "ALL") params.set("role", query.role);
  if (query.status !== "ALL") params.set("status", query.status);
  return request<AdminUserPage>("GET", usersPath + "?" + params);
}

export function getAdminUser(userId: string) {
  return request<AdminUser>(
    "GET",
    usersPath + "/" + encodeURIComponent(userId),
  );
}
const userAction = (userId: string, action: string) =>
  `${usersPath}/${encodeURIComponent(userId)}/${action}`;

export const suspendAdminUser = (userId: string, reason: string) =>
  request<AdminUser>("POST", userAction(userId, "suspend"), { reason });

export const reactivateAdminUser = (userId: string) =>
  request<AdminUser>("POST", userAction(userId, "reactivate"));

export const deleteAdminUser = (userId: string, reason: string) =>
  request<void>("POST", userAction(userId, "delete"), { reason });

export function listAuditEvents(query: AuditQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.size ? `?${params}` : "";
  return request<AuditEvent[]>("GET", "/api/admin/audit-events" + suffix);
}
