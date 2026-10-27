# Product Backlog API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/backlog-items | List backlog items | Member | 200, BacklogItem[] |
| POST | /api/projects/:projectId/backlog-items | Create backlog item | PO | 201, BacklogItem |
| GET | /api/projects/:projectId/backlog-items/:itemId | View backlog item | Member | 200, BacklogItem |
| PATCH | /api/projects/:projectId/backlog-items/:itemId | Update content or status | PO / Dev, by field | 200, BacklogItem |
| DELETE | /api/projects/:projectId/backlog-items/:itemId | Soft-delete backlog item | PO | 204 |
| PUT | /api/projects/:projectId/backlog-items/order | Replace full backlog order | PO | 200, BacklogItem[] |

List includes all non-deleted items, including selected/completed ones, ordered by
orderIndex then id. All writes require an ACTIVE project.

## Create and update fields

| Field | Type | Create | PATCH permission | Rule |
|---|---|---|---|---|
| title | string | Required | PO | Non-blank |
| description | string or null | Optional, default null | PO | Null/blank clears |
| priority | string | Optional, default MEDIUM | PO | LOW, MEDIUM, HIGH |
| itemType | string or null | Optional, default null | Not editable | Free-text label |
| status | string | Not accepted; starts TODO | Dev | TODO, IN_PROGRESS, DONE; independent of Sprint membership |

Reject disallowed field updates as a whole. Past closed Sprint participation alone
does not lock the item.

**Proposed:** ACTIVE Sprint selection permits only title/priority/status PATCH; other fields return 409.

~~~json
{"title":"Show delivery cost","description":"Display the cost before payment."}
~~~

Status changes use PATCH with `{"status":"IN_PROGRESS"}`. Dropdown and Board changes
use this same operation. DONE means the item meets the team’s Definition of Done.
Changing status does not change Task status or closed Sprint results.

## Order and remove

PUT body:

~~~json
{"itemIds":["507f1f77bcf86cd799439013","507f1f77bcf86cd799439012"]}
~~~

Send every live ID exactly once, including selected/completed items; minimum two.
Normalize ID casing before duplicate checks. Only orderIndex changes, to 0..N-1.

DELETE: no body; soft-delete only, blocked by ACTIVE Sprint selection.
**Proposed:** withdraw any OPEN DRAFT selection on removal. Preserve history.

## BacklogItem response

| Field | Type |
|---|---|
| id, projectId | ID |
| key | string, read-only; e.g. COM-19 |
| title | string |
| description, itemType | string or null |
| priority | LOW, MEDIUM or HIGH |
| status | TODO, IN_PROGRESS or DONE |
| orderIndex | nonnegative integer, server-controlled |
| createdAt, updatedAt | datetime |

The server assigns `key` as `<Project.key>-<sequence>` using a positive per-project
sequence. It remains stable when the backlog is reordered and is never reused
after deletion. Clients do not submit it on creation.

## Rules & errors

**Proposed:** related Sprint context uses [Sprints](sprints.md), not this DTO.
400: invalid input/duplicate order IDs. 403: disallowed field/action.
404: missing, deleted or cross-project item. 409: active-Sprint lock, fewer than two
items, or order IDs not matching the live set.
