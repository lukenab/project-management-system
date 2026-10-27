# Sprints API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprints | List Sprints | Member | 200, Sprint[] |
| POST | /api/projects/:projectId/sprints | Plan a Draft Sprint | PO | 201, SprintDetail |
| GET | /api/projects/:projectId/sprints/:sprintId | View Sprint and selections | Member | 200, SprintDetail |
| PATCH | /api/projects/:projectId/sprints/:sprintId | Edit Draft planning and selection | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/start | Start Draft Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/complete | Complete active Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/cancel | Cancel active Sprint | PO | 200, SprintDetail |
| DELETE | /api/projects/:projectId/sprints/:sprintId | Soft-delete unstarted Draft | PO | 204 |
| GET | /api/projects/:projectId/board | View active Sprint Board | Member | 200, Board |

All writes require an ACTIVE project. List excludes deleted Sprints and includes
closed history. **Proposed:** order by plannedStartAt descending, then id.

## Plan and edit Draft

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| name | string or null | Optional, default null | Optional | Label, not a mandatory input |
| goal | string | Required | Optional | Non-blank |
| plannedStartAt | datetime | Required | Optional | Earlier than plannedEndAt |
| plannedEndAt | datetime | Required | Optional | Duration no more than one month |
| backlogItemIds | ID[] | Required, at least one | Optional, replaces current open selection | Unique IDs in this project |

**Proposed:** Draft PATCH may have an empty selection. Date range: at most one UTC
calendar month (clamp end-of-month); non-deleted DRAFT/ACTIVE ranges cannot overlap.
Use [start,end), so adjacent Sprints are allowed; closed history does not block planning.

~~~json
{
  "goal":"Customers can track order delivery",
  "plannedStartAt":"2026-11-02T00:00:00Z",
  "plannedEndAt":"2026-11-09T00:00:00Z",
  "backlogItemIds":["507f1f77bcf86cd799439012"]
}
~~~

Selection: live, not-completed PBI with a non-blank description. Developers review
capacity during Planning. At most one OPEN selection per PBI; edit selection only in DRAFT.

## Lifecycle and status requests

| Operation | Body | Allowed state / result |
|---|---|---|
| Start | None | DRAFT; valid goal/dates, at least one ready item, no other ACTIVE Sprint |
| Complete | None | ACTIVE to COMPLETED; retain completed work, return unfinished items to backlog |
| Cancel | reason: non-blank string, required | ACTIVE to CANCELLED when goal is obsolete; retain history, return unfinished items |
| Delete | None | Never-started DRAFT with no Task records under any selection; soft-delete and withdraw OPEN selections |

Only one non-deleted DRAFT is allowed. Closed Sprints are read-only; Complete allows
unfinished work. Closure freezes each selection’s statusAtClosure and result. Returning
unfinished items to the backlog preserves their current status. Later PBI edits do not
change closed Sprint results. Close/delete never deletes PBIs, changes their workflow status or automatically selects another Sprint.
PBI status changes use [Product Backlog PATCH](product-backlog.md); Task status changes
use the Task status endpoint. Neither automatically changes the other.

## Response types

| Sprint field | Type |
|---|---|
| id, projectId | ID |
| name | string or null |
| goal | string |
| plannedStartAt, plannedEndAt | datetime |
| status | DRAFT, ACTIVE, COMPLETED or CANCELLED |
| startedAt, closedAt | datetime or null |
| cancellationReason | string or null |
| createdAt, updatedAt | datetime |

SprintDetail is Sprint plus items: SprintItem[].
**Proposed:** items includes selection history, sorted by selectedAt then id; only OPEN entries are editable.

| SprintItem field | Type |
|---|---|
| id, sprintId, productBacklogItemId | ID; id is selectionId, not PBI ID |
| selectionState | OPEN, COMPLETED, RETURNED or WITHDRAWN |
| status | TODO, IN_PROGRESS or DONE; read from the PBI while selection is open, otherwise statusAtClosure |
| statusAtClosure | TODO, IN_PROGRESS, DONE or null; frozen when selection closes |
| titleSnapshot, descriptionSnapshot | string |
| selectedAt | datetime |
| closedAt | datetime or null |

**Proposed Board shape:** {sprint: Sprint or null, columns: BoardColumn[]}.
BoardColumn has status and cards: BoardCard[]. Always return the three status columns;
without an active Sprint, sprint=null and all cards are empty.

BoardCard fields: id (ID), type (SPRINT_ITEM or TASK), title (string), status,
priority (LOW/MEDIUM/HIGH or null), assigneeMembershipId (ID or null),
estimatedHours (number or null).
For a selected PBI, id is selectionId, productBacklogItemId is the PBI ID used for status PATCH,
status is read from that PBI, assigneeMembershipId=null and estimatedHours=null.
For a task, use task id/assignee/hours.

## Rules & errors

409: conflicting Draft/active Sprint/date range, unready/already-selected item, invalid
lifecycle, deleted/changed selection eligibility, or Task records blocking deletion.
