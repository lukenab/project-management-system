# Administration API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/admin/users | Search/filter user accounts | Admin | 200, AdminUser[] |
| GET | /api/admin/users/:userId | View administrative account details | Admin | 200, AdminUser |
| POST | /api/admin/users/:userId/suspend | Suspend active account | Admin | 200, AdminUser |
| POST | /api/admin/users/:userId/reactivate | Reactivate suspended account | Admin | 200, AdminUser |
| POST | /api/admin/users/:userId/delete | Soft-delete account with reason | Admin | 204 |
| GET | /api/admin/audit-events | Review/filter system audit | Admin | 200, AuditEvent[] |

## User queries and actions

**Proposed queries** for GET /api/admin/users:

| Query | Type | Rule |
|---|---|---|
| q | string | Optional, case-insensitive substring of name/email |
| status | string | Optional, ACTIVE/SUSPENDED/DELETED |
| systemRole | string | Optional, STAFF/SYSTEM_ADMINISTRATOR |

Omitting filters returns the unfiltered list, sorted by createdAt descending then id.
Empty matches return data=[].

| Action | Body | Allowed state / result |
|---|---|---|
| Suspend | reason: non-blank string, required | ACTIVE to SUSPENDED |
| Reactivate | None | SUSPENDED to ACTIVE; deleted accounts cannot reactivate |
| Delete | reason: non-blank string, required | Soft-delete |

**Proposed:** deletion uses POST; suspend/delete revoke all target sessions.

~~~json
{"reason":"Account no longer required."}
~~~

Block suspend/delete for the last active Admin or Owner of an ACTIVE project.
Deleted accounts cannot log in; reactivation does not restore removed memberships.

## AdminUser response

| Field | Type |
|---|---|
| id | ID |
| fullName | string |
| email | string |
| systemRole | STAFF or SYSTEM_ADMINISTRATOR |
| status | ACTIVE, SUSPENDED or DELETED |
| emailVerifiedAt | datetime |
| hasPassword | boolean; whether a password is configured |
| suspendedAt | datetime or null |
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
409: Owner/last-Admin protection, invalid account state or deleted reactivation.
