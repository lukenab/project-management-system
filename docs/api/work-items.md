# Work Items API

Work Items share one model. `parentId=null` identifies an independent item;
a child item is displayed as a Subtask. Only one child level is supported.
Contracts describe intended backend behavior; the current UI uses preview data.

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/work-items | List items at one level | Member | 200, WorkItem[] |
| POST | /api/projects/:projectId/work-items | Create independent or child item | PO / Dev, by level | 201, WorkItem |
| GET | /api/projects/:projectId/work-items/:itemId | View item | Member | 200, WorkItem |
| PATCH | /api/projects/:projectId/work-items/:itemId | Update allowed fields | PO / Dev, by field and level | 200, WorkItem |
| DELETE | /api/projects/:projectId/work-items/:itemId | Soft-delete item | PO for independent; Dev for child | 204 |
| PUT | /api/projects/:projectId/work-items/order | Replace independent-item order | PO | 200, WorkItem[] |

GET list defaults to `parentId=null`, returning independent items only. Query
`?parentId=:itemId` returns that parent's live children. The parent must be live,
independent and in this project. Sort by orderIndex then id within each level.
All writes require an ACTIVE, undeleted project and active eligible membership.

## Create

| Field | Independent item | Child item |
|---|---|---|
| parentId | Omitted or null | Required same-project independent item ID |
| title | Required non-blank string | Required non-blank string |
| description | Optional string/null; default null | Optional string/null; default null |
| workType | STORY, TASK, BUG; default TASK | Only TASK; default TASK |
| priority | LOW, MEDIUM, HIGH; default MEDIUM | Not accepted; null |
| assigneeId | Not accepted; starts null | Optional ID/null; default null |

PO creates independent items; Dev creates children. Server sets status=TODO,
dates=null, key, order, creator and timestamps. Assignment never defaults to actor.
Client-supplied projectId, key, status, actor and timestamps are rejected.

## PATCH permissions

| Fields | Independent item | Child item |
|---|---|---|
| title | PO | Dev |
| description | PO | Dev |
| workType | PO | Not editable |
| priority | PO | Not editable |
| status | Dev | Dev |
| assigneeId | Dev | Dev |
| startDate | Dev | Not editable; remain null |
| dueDate | Dev | Not editable; remain null |

Only submit changed fields. Omitted fields remain unchanged; null clears nullable
fields. Reject empty PATCH, unknown/server-controlled fields and mixed requests
containing a disallowed field as a whole. parentId and projectId are immutable.
Status: TODO, IN_PROGRESS, DONE. Description is plain text; blank clears to null.
Dates are calendar strings YYYY-MM-DD, with dueDate >= startDate when both exist.
Assignments reference an active same-project Developer membership.
**Proposed:** while selected into an ACTIVE Sprint, independent-item description
and workType changes return 409; other field permissions continue to apply.

## WorkItem response

| Field | Type |
|---|---|
| id | ID |
| projectId | ID |
| key | Server-generated string, e.g. COM-19 |
| parentId | ID or null |
| title | string |
| description | string or null |
| workType | STORY, TASK or BUG; child is TASK |
| status | TODO, IN_PROGRESS or DONE |
| assigneeId | Project Membership ID or null |
| priority | LOW, MEDIUM, HIGH or null; child is null |
| startDate | YYYY-MM-DD or null; child dates are null |
| dueDate | YYYY-MM-DD or null; child dates are null |
| orderIndex | Nonnegative integer, server-controlled |
| createdBy | User Account ID, server-controlled |
| sprint | {id: ID, name: string} or null; read-only |
| createdAt | datetime |
| updatedAt | datetime |

One per-project key sequence covers independent and child items. Keys are stable,
concurrency-safe and never reused after deletion. Count/list order is independent
of the key sequence. `deletedAt` is persistence-only; deleted items are unavailable.

## Parent, Sprint and deletion

- Reject self-parenting, cross-project parenting, deleted parents and children of
  children. A child has no separate Sprint selection; sprint comes from
  its parent's current participation. Clients never PATCH a sprintId here.
- Use [Sprint planning](sprints.md) to select independent Work Items. Preserve
  participation and closure snapshots; later item changes never rewrite results.
- Parent/child status never cascades. Independent-item DONE means the team's
  Definition of Done is met. Completing every child does not automatically finish
  the parent. Independent Sprint progress never counts children as extra items.
- DELETE has no body and requires UI confirmation; no typed confirmation or
  restore. A child can be deleted in any status. Deleting a parent hides all its
  children from normal access, including direct child IDs; preserve their records.
  **Proposed:** independent-item deletion is blocked by ACTIVE Sprint selection,
  and withdraws an OPEN DRAFT selection. Retain activity and reserved keys.
- PUT order receives `{itemIds: ID[]}` with every live independent item exactly
  once, including selected/completed items; minimum two. It changes orderIndex
  only. Child ordering/reparenting is outside this slice.

## Errors

400: invalid fields, work type, dates, parent level or order IDs. 403: disallowed
field/action. 404: missing/deleted/cross-project item or parent. 409: archived
project, invalid assignment, active-Sprint lock or order-set conflict. Failed
writes leave saved data unchanged. Preview fixtures do not implement production
authorization, persistence or Sprint lifecycle guards.
