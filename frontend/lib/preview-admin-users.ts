import type {
  AccountStatus,
  AdminUser,
  AdminUserRepository,
  AuditEvent,
} from "./admin-users";

import { allPreviewProjects } from "./preview-data";
import { readPreviewPersona } from "./preview-project-storage";
import { clearPreviewAssignmentsFor } from "./preview-work-items";

/** The signed-in preview administrator. */
export const previewAdminId = "dana";

function seedUser(
  id: string,
  fullName: string,
  createdAt: string,
  overrides: Partial<AdminUser> = {},
): AdminUser {
  return {
    id,
    fullName,
    email: `${id}@example.test`,
    systemRole: "STAFF",
    status: "ACTIVE",
    emailVerifiedAt: createdAt,
    hasPassword: true,
    suspendedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

// Browser-memory preview only; refresh resets data. No server authorization is implemented here.
const users: AdminUser[] = [
  seedUser("dana", "Dana Reyes", "2026-08-20T02:00:00.000Z", {
    systemRole: "SYSTEM_ADMINISTRATOR",
  }),
  seedUser("alex", "Alex Morgan", "2026-09-01T02:00:00.000Z"),
  seedUser("jordan", "Jordan Lee", "2026-09-06T02:00:00.000Z"),
  seedUser("sam", "Sam Taylor", "2026-09-09T02:00:00.000Z"),
  seedUser("priya", "Priya Nair", "2026-09-12T02:00:00.000Z", {
    hasPassword: false,
  }),
  seedUser("taylor", "Taylor Chen", "2026-09-15T02:00:00.000Z", {
    systemRole: "SYSTEM_ADMINISTRATOR",
  }),
  seedUser("morgan", "Morgan Reed", "2026-09-20T02:00:00.000Z", {
    status: "SUSPENDED",
    suspendedAt: "2026-10-28T03:00:00.000Z",
    updatedAt: "2026-10-28T03:00:00.000Z",
  }),
  seedUser("jamie", "Jamie Park", "2026-10-01T02:00:00.000Z", {
    status: "DELETED",
    deletedAt: "2026-10-30T03:00:00.000Z",
    updatedAt: "2026-10-30T03:00:00.000Z",
  }),
];

const audit: AuditEvent[] = [
  {
    id: "audit-1",
    actorId: "taylor",
    action: "USER_SUSPENDED",
    targetType: "USER_ACCOUNT",
    targetId: "morgan",
    reason: "Repeated sign-ins from an unrecognised location.",
    occurredAt: "2026-10-28T03:00:00.000Z",
  },
  {
    id: "audit-2",
    actorId: "taylor",
    action: "USER_DELETED",
    targetType: "USER_ACCOUNT",
    targetId: "jamie",
    reason: "Account no longer required.",
    occurredAt: "2026-10-30T03:00:00.000Z",
  },
];
let nextAuditId = audit.length + 1;

function requireAdmin() {
  if (readPreviewPersona() !== "admin")
    throw new Error("Only System Administrators can manage user accounts.");
}

function requireUser(userId: string) {
  const user = users.find((entry) => entry.id === userId);
  if (!user) throw new Error("This account could not be found.");
  return user;
}

function recordAudit(action: string, targetId: string, reason: string | null) {
  audit.push({
    id: `audit-${nextAuditId++}`,
    actorId: previewAdminId,
    action,
    targetType: "USER_ACCOUNT",
    targetId,
    reason,
    occurredAt: new Date().toISOString(),
  });
}

/**
 * Why an account can't be suspended or deleted, if any. The API reports these
 * as 409 on submit; the preview can also explain them before the admin confirms.
 */
export function previewAccountBlockReason(user: AdminUser) {
  if (user.id === previewAdminId)
    return "You can't suspend or delete your own account. Ask another System Administrator.";
  const owned = allPreviewProjects().filter(
    (project) =>
      project.status === "ACTIVE" && project.owner.email === user.email,
  );
  if (owned.length)
    return `${user.fullName} owns ${owned.map((project) => project.name).join(", ")}. Ownership must be transferred first.`;
  const activeAdmins = users.filter(
    (entry) =>
      entry.systemRole === "SYSTEM_ADMINISTRATOR" && entry.status === "ACTIVE",
  );
  if (activeAdmins.length === 1 && activeAdmins[0].id === user.id)
    return "This is the last active System Administrator.";
  return "";
}

function requireAllowed(user: AdminUser) {
  const blocked = previewAccountBlockReason(user);
  if (blocked) throw new Error(blocked);
}

function reasonValue(reason: string) {
  const value = reason.trim();
  if (!value) throw new Error("Enter a reason.");
  return value;
}

/** Non-active status for an email, so project screens can label their assignees. */
export function previewAccountStatus(
  email: string,
): Exclude<AccountStatus, "ACTIVE"> | undefined {
  const status = users.find((user) => user.email === email)?.status;
  return status && status !== "ACTIVE" ? status : undefined;
}

export function previewAccountName(userId: string) {
  return (
    users.find((user) => user.id === userId)?.fullName ?? "Unknown account"
  );
}

export const previewAdminUserRepository: AdminUserRepository = {
  async list(query = {}) {
    requireAdmin();
    const term = query.q?.trim().toLowerCase() ?? "";
    return users
      .filter(
        (user) =>
          (!query.status || user.status === query.status) &&
          (!query.systemRole || user.systemRole === query.systemRole) &&
          `${user.fullName} ${user.email}`.toLowerCase().includes(term),
      )
      .map((user) => ({ ...user }))
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      );
  },
  async get(userId) {
    requireAdmin();
    return { ...requireUser(userId) };
  },
  async suspend(userId, reason) {
    requireAdmin();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const user = requireUser(userId);
    const value = reasonValue(reason);
    if (user.status !== "ACTIVE")
      throw new Error("Only active accounts can be suspended.");
    requireAllowed(user);
    const now = new Date().toISOString();
    Object.assign(user, {
      status: "SUSPENDED",
      suspendedAt: now,
      updatedAt: now,
    });
    recordAudit("USER_SUSPENDED", user.id, value);
    return { ...user };
  },
  async reactivate(userId) {
    requireAdmin();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const user = requireUser(userId);
    if (user.status !== "SUSPENDED")
      throw new Error("Only suspended accounts can be reactivated.");
    const now = new Date().toISOString();
    Object.assign(user, {
      status: "ACTIVE",
      suspendedAt: null,
      updatedAt: now,
    });
    recordAudit("USER_REACTIVATED", user.id, null);
    return { ...user };
  },
  async remove(userId, reason) {
    requireAdmin();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const user = requireUser(userId);
    const value = reasonValue(reason);
    if (user.status === "DELETED")
      throw new Error("This account is already deleted.");
    requireAllowed(user);
    const now = new Date().toISOString();
    Object.assign(user, {
      status: "DELETED",
      suspendedAt: null,
      deletedAt: now,
      updatedAt: now,
    });
    recordAudit("USER_DELETED", user.id, value);
    clearPreviewAssignmentsFor(user.email, {
      id: previewAdminId,
      fullName: previewAccountName(previewAdminId),
    });
  },
  async listAudit({ targetType, targetId }) {
    requireAdmin();
    return audit
      .filter(
        (event) =>
          event.targetType === targetType && event.targetId === targetId,
      )
      .map((event) => ({ ...event }))
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) ||
          b.id.localeCompare(a.id, undefined, { numeric: true }),
      );
  },
};
