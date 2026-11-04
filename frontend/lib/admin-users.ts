// Shapes follow docs/api/administration.md so the preview can be replaced by the API.
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type SystemRole = "STAFF" | "SYSTEM_ADMINISTRATOR";

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  systemRole: SystemRole;
  status: AccountStatus;
  emailVerifiedAt: string;
  hasPassword: boolean;
  suspendedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserQuery = {
  q?: string;
  status?: AccountStatus;
  systemRole?: SystemRole;
};

export type AuditEvent = {
  id: string;
  actorId: string;
  action: string;
  targetType: "USER_ACCOUNT" | "PROJECT";
  targetId: string;
  reason: string | null;
  occurredAt: string;
};

export type AdminUserRepository = {
  list(query?: AdminUserQuery): Promise<AdminUser[]>;
  get(userId: string): Promise<AdminUser>;
  suspend(userId: string, reason: string): Promise<AdminUser>;
  reactivate(userId: string): Promise<AdminUser>;
  remove(userId: string, reason: string): Promise<void>;
  listAudit(query: {
    targetType: AuditEvent["targetType"];
    targetId: string;
  }): Promise<AuditEvent[]>;
};

export const accountStatusLabels: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  DELETED: "Deleted",
};

export const systemRoleLabels: Record<SystemRole, string> = {
  STAFF: "Staff",
  SYSTEM_ADMINISTRATOR: "System Administrator",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatAccountDate(value: string) {
  return dateFormat.format(new Date(value));
}

export function accountInitials(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
