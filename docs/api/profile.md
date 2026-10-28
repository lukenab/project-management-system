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
| fullName | string | Yes | Non-blank |

**Proposed:** only fullName is editable. Email preference uses [Notifications](notifications.md).

PUT /api/me/password:

| Field | Type | Required | Rule |
|---|---|---|---|
| currentPassword | string | Yes | Must match the local password |
| newPassword | string | Yes | Authentication password policy |

## Profile response

| Field | Type |
|---|---|
| id | ID |
| fullName | string |
| email | string |
| emailVerifiedAt | datetime |
| systemRole | STAFF or SYSTEM_ADMINISTRATOR |
| hasLocalPassword | boolean |
| createdAt | datetime |
| updatedAt | datetime |

## Rules & errors

400: incorrect current password or invalid new password. 409: Google-only account.
Never return password hashes or provider credentials.
**Proposed:** password change/reset revokes all sessions and requires login again.
