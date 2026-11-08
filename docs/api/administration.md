# Administration API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/admin/users | Search/filter user accounts | Admin | 200, {users: AdminUser[], pagination} |
| GET | /api/admin/users/:userId | View administrative account details | Admin | 200, AdminUser |
| POST | /api/admin/users/:userId/suspend | Suspend active account | Admin | 200, AdminUser |
| POST | /api/admin/users/:userId/reactivate | Reactivate suspended account | Admin | 200, AdminUser |
| POST | /api/admin/users/:userId/delete | Soft-delete account with reason | Admin | 204 |
| GET | /api/admin/audit-events | Review/filter system audit | Admin | 200, AuditEvent[] |

## User queries and actions

Queries for GET /api/admin/users:

| Query | Type | Rule |
|---|---|---|
| search | string | Optional, case-insensitive substring of name/email |
| status | string | Optional, ACTIVE/SUSPENDED/DELETED |
| role | string | Optional, STAFF/SYSTEM_ADMINISTRATOR |
| page | integer | Optional, starts at 1; default 1 |
| limit | integer | Optional, 1–100; default 10 |

Sort by createdAt descending, then id ascending. Pagination contains page, limit,
total (matching accounts), and totalPages. Empty matches return users=[].

| Action | Body | Allowed state / result |
|---|---|---|
| Suspend | reason: non-blank string, required | ACTIVE to SUSPENDED |
| Reactivate | None | SUSPENDED to ACTIVE; deleted accounts cannot reactivate |
| Delete | reason: non-blank string, required | Soft-delete |

Suspend and delete revoke all target sessions. Account status changes and their audit events are saved in one transaction. These writes require transaction-capable MongoDB.

~~~json
{"reason":"Account no longer required."}
~~~

Block suspend/delete for the last active Admin or Owner of an ACTIVE project, and
for the caller's own account.
Suspension keeps memberships and assigned work. Suspended and deleted accounts cannot receive new assignments. Deletion keeps the email reserved, retains referenced history, and clears the account's unfinished independent Work Item and Subtask assignments.
Deleted accounts cannot log in; reactivation does not restore removed memberships.

## AdminUser response

| Field | Type |
|---|---|
| id | ID |
| fullName | string |
| email | string |
| systemRole | STAFF or SYSTEM_ADMINISTRATOR |
| status | ACTIVE, SUSPENDED or DELETED |
| emailVerifiedAt | datetime or null |
| hasPassword | boolean; whether a password is configured |
| suspendedAt | null until suspension timestamps are recorded |
| deletedAt | datetime or null |
| createdAt | datetime |
| updatedAt | datetime |

Admin role grants no project access. Never return password hashes, provider credentials or tokens.

## Audit query and response

Optional queries: from/to (UTC datetime, from <= to), actorId (ID), action (string),
targetType (USER_ACCOUNT or PROJECT), targetId (ID). **Proposed:** targetId requires
targetType; match actor/target/action exactly, time range inclusive, newest first.
Reject unknown filters. Empty matches return data=[].

| AuditEvent field | Type |
|---|---|
| id | ID |
| actorId | User Account ID |
| action | string |
| targetType | USER_ACCOUNT or PROJECT |
| targetId | ID |
| reason | string or null |
| occurredAt | datetime |

## Rules & errors

**Proposed:** return only the listed audit fields. Events are read-only;
store failure returns 500, not an empty success.
409: Owner/last-Admin/own-account protection, invalid account state or deleted reactivation.
