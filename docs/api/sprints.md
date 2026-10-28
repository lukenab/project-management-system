# Sprints API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprints | List Sprints | Member | 200, Sprint[] |
| POST | /api/projects/:projectId/sprints | Plan a Draft Sprint | PO | 201, SprintDetail |
| GET | /api/projects/:projectId/sprints/:sprintId | View Sprint and linked items | Member | 200, SprintDetail |
| PATCH | /api/projects/:projectId/sprints/:sprintId | Edit Draft planning and items | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/start | Start Draft Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/complete | Complete active Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/cancel | Cancel active Sprint | PO | 200, SprintDetail |
| DELETE | /api/projects/:projectId/sprints/:sprintId | Soft-delete unstarted Draft | PO | 204 |
| GET | /api/projects/:projectId/board | View active Sprint Board | Member | 200, Board |

All writes require an ACTIVE project. List excludes deleted Sprints and includes
COMPLETED/CANCELLED Sprints with their lifecycle information.
**Proposed:** order by plannedStartAt descending, then id.

## Plan and edit Draft

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| name | string or null | Optional, default null | Optional | Label, not a mandatory input |
| goal | string | Required | Optional | Non-blank |
| plannedStartAt | datetime | Required | Optional | Earlier than plannedEndAt |
| plannedEndAt | datetime | Required | Optional | Duration no more than one month |
| workItemIds | ID[] | Required, at least one | Optional, replaces the Draft's linked items | Unique independent item IDs in this project |

**Proposed:** Draft PATCH may have an empty item list. Date range: at most one UTC
calendar month (clamp end-of-month); non-deleted DRAFT/ACTIVE ranges cannot overlap.
Use [start,end), so adjacent Sprints are allowed; closed Sprints do not block planning.

~~~json
{
  "goal":"Customers can track order delivery",
  "plannedStartAt":"2026-11-02T00:00:00Z",
  "plannedEndAt":"2026-11-09T00:00:00Z",
  "workItemIds":["507f1f77bcf86cd799439012"]
}
~~~

Eligible items are live, independent, not DONE and have a non-blank description.
Developers review capacity during Planning. An item may link to only one Sprint
through WorkItem.sprintId. Reject an item linked to another DRAFT/ACTIVE Sprint.
A reopened item linked to a closed Sprint may be planned again; assigning the new
sprintId replaces the old link. Child items inherit their parent's Sprint.

PO edits Sprint assignment through Draft planning, not Work Items PATCH. Set
sprintId on added items and clear it on removed items in one consistent save.
An omitted workItemIds field keeps the Draft's items unchanged.

## Lifecycle and status requests

| Operation | Body | Allowed state / result |
|---|---|---|
| Start | None | DRAFT; valid goal/dates, at least one ready item, no other ACTIVE Sprint |
| Complete | None | ACTIVE to COMPLETED; DONE items keep sprintId; unfinished items get sprintId=null |
| Cancel | reason: non-blank string, required | ACTIVE to CANCELLED when goal is obsolete; DONE items keep sprintId; unfinished items get sprintId=null |
| Delete | None | Never-started DRAFT; clear linked items' sprintId and soft-delete the Sprint |

Only one non-deleted DRAFT is allowed. Closed Sprint metadata is read-only.
Complete allows unfinished work. Complete/cancel retains the Sprint's lifecycle
status, dates and reason; it does not store per-item closure snapshots or a list
of previous Sprint assignments. Cleared items return to the backlog with their
status unchanged. No operation automatically assigns the next Sprint or changes
parent/child status. Apply Sprint state and item links consistently.

Work Item status changes use [Work Items PATCH](work-items.md). Parent and child
statuses remain independent.

## Response types

| Sprint field | Type |
|---|---|
| id | ID |
| projectId | ID |
| name | string or null |
| goal | string |
| plannedStartAt | datetime |
| plannedEndAt | datetime |
| status | DRAFT, ACTIVE, COMPLETED or CANCELLED |
| startedAt | datetime or null |
| closedAt | datetime or null |
| cancellationReason | string or null |
| createdAt | datetime |
| updatedAt | datetime |

SprintDetail is Sprint plus items: [WorkItem](work-items.md)[], containing live
independent items whose sprintId matches this Sprint. Sort by orderIndex then id.
For a closed Sprint, the list shows items still linked to it and their current
values. Later item edits, deletion or replanning can change this list; it is not
a historical result or a frozen report.

**Proposed Board shape:** {sprint: Sprint or null, columns: BoardColumn[]}.
BoardColumn has status and cards: WorkItem[]. Always return the three status
columns; without an active Sprint, sprint=null and all cards are empty.
Each card's id is the Work Item ID used for mutations. Only live independent
items with sprintId matching the active Sprint appear; children are not cards.

## Rules & errors

409: conflicting Draft/active Sprint/date range, unready item, item linked to
another DRAFT/ACTIVE Sprint, invalid lifecycle or changed item eligibility.
