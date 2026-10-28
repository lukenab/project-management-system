# Sprints API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprints | List Sprints | Member | 200, Sprint[] |
| POST | /api/projects/:projectId/sprints | Create a Draft Sprint | PO | 201, SprintDetail |
| GET | /api/projects/:projectId/sprints/:sprintId | View Sprint and linked items | Member | 200, SprintDetail |
| PATCH | /api/projects/:projectId/sprints/:sprintId | Edit a Draft or Active Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/start | Start Draft Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/complete | Complete (close) active Sprint | PO | 200, SprintDetail |
| DELETE | /api/projects/:projectId/sprints/:sprintId | Delete a Sprint in any state | PO | 204 |
| GET | /api/projects/:projectId/board | View active Sprint Board | Member | 200, Board |

All writes require an ACTIVE project. List excludes deleted Sprints and includes
CLOSED Sprints with their lifecycle information.
**Proposed:** order by plannedStartAt descending (undated Sprints first), then id.

## Create and edit

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| name | string | Required | Optional | Non-blank; unique among the project's live Sprints, case-insensitive |
| goal | string or null | Optional, default null | Optional | Blank clears to null |
| plannedStartAt | datetime or null | Optional, default null | Optional | Earlier than plannedEndAt when both exist |
| plannedEndAt | datetime or null | Optional, default null | Optional | Duration no more than one month when both exist |

Create and PATCH do not accept Work Items. A Draft may have no items; Start
requires at least one. Date range: at most one UTC
calendar month (clamp end-of-month); fully dated non-deleted DRAFT/ACTIVE ranges
cannot overlap. Dates may stay empty until Start, which requires both.
An ACTIVE Sprint stays editable: name, goal and plannedEndAt may change (end
stays required and within one month of the fixed plannedStartAt); plannedStartAt
cannot change. CLOSED Sprints are read-only apart from Delete.
A project may have any number of DRAFT Sprints; the overlap rule keeps them in sequence.
Use [start,end), so adjacent Sprints are allowed; closed Sprints do not block planning.

~~~json
{
  "name":"Sprint 5",
  "goal":"Customers can track order delivery",
  "plannedStartAt":"2026-11-02T00:00:00Z",
  "plannedEndAt":"2026-11-09T00:00:00Z"
}
~~~

Items join a Sprint only through [Work Items PATCH](work-items.md) `sprintId`
(PO or Developer, DRAFT or ACTIVE Sprint). Eligible items are live, independent, not DONE and
have a non-blank description. An item links to at most one Sprint through
WorkItem.sprintId; a new value replaces the old link, including a link to another
open Sprint or a reopened item's closed Sprint. Child items inherit their parent's
Sprint. Assigning an item to the ACTIVE Sprint changes the running Sprint's scope.
Developers review capacity during Sprint Planning.

## Lifecycle and status requests

| Operation | Body | Allowed state / result |
|---|---|---|
| Start | Optional name, goal, plannedStartAt, plannedEndAt (reviewed values) | DRAFT; saves the values and starts in one step; both dates set and valid, at least one item, no other ACTIVE Sprint; a goal is not required |
| Complete | closeNote: string or null, optional | ACTIVE to CLOSED, including an early close when the Sprint Goal is obsolete; DONE items keep sprintId; unfinished items get sprintId=null |
| Delete | None | Any state; requires confirmation; clears every linked item's sprintId (status unchanged) and soft-deletes the Sprint; cannot be undone in the app |

Starting a DRAFT other than the earliest is allowed; the UI warns because it changes
the planned order. Closed Sprint metadata is read-only.
Complete allows unfinished work and keeps the Sprint's dates and optional
close note; it does not store per-item closure snapshots or a list
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
| goal | string or null |
| plannedStartAt | datetime or null |
| plannedEndAt | datetime or null |
| status | DRAFT, ACTIVE or CLOSED |
| startedAt | datetime or null |
| closedAt | datetime or null |
| closeNote | string or null |
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

409: another ACTIVE Sprint, overlapping date range, unready item, item linked to
another DRAFT/ACTIVE Sprint, invalid lifecycle or changed item eligibility.
