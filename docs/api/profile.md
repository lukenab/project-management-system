# Profile API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/me | View own profile | Active account | 200, Profile |
| PATCH | /api/me | Update own profile | Active account | 200, Profile |
| PUT | /api/me/password | Change local password | Active account | 204 |

## Requests

PATCH /api/me accepts only:

| Field | Type | Required | Rule |
|---|---|---|---|
| fullName | string | Yes | Trimmed, 1-100 characters |

Only fullName is editable; other fields in the body are ignored. Email preference uses [Notifications](notifications.md).

PUT /api/me/password:

| Field | Type | Required | Rule |
|---|---|---|---|
| currentPassword | string | Yes | Must match the local password |
| newPassword | string | Yes | 8-128 characters, never trimmed ([Authentication](authentication.md#email-registration)) |

## Profile response

| Field | Type |
|---|---|
| id | ID |
| fullName | string |
| email | string |
| emailVerifiedAt | datetime |
| systemRole | STAFF or SYSTEM_ADMINISTRATOR |
| hasPassword | boolean; whether a password is configured |
| createdAt | datetime |
| updatedAt | datetime |

## Rules & errors

All three endpoints need `Authorization: Bearer <token>` of an active account.

| Situation | Status | Code |
|---|---|---|
| Missing or invalid token | 401 | `UNAUTHENTICATED`, `INVALID_TOKEN` or `TOKEN_EXPIRED` |
| `fullName` blank, longer than 100 characters, missing or not a string | 400 | `VALIDATION_FAILED` with `field: "fullName"` |
| `currentPassword` or `newPassword` missing or not a string | 400 | `VALIDATION_FAILED` with the field name |
| `currentPassword` does not match | 400 | `VALIDATION_FAILED` with `field: "currentPassword"` |
| `newPassword` outside 8-128 characters | 400 | `VALIDATION_FAILED` with `field: "newPassword"` |
| The account has no password (Google-only) | 409 | `CONFLICT` |

A password change keeps the current session and deletes all other sessions of the account,
so other devices must sign in again. Password reset deletes all sessions and requires login again.
Never return password hashes or provider credentials.
