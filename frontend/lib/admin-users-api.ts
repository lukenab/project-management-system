import type { AccountStatus, AdminUser, SystemRole } from "./admin-users";

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
