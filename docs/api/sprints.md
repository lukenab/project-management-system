# Sprints API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprints | List Sprints | Member | 200, SprintSummary[] |
| POST | /api/projects/:projectId/sprints | Create a Draft Sprint | PO | 201, SprintDetail |
| GET | /api/projects/:projectId/sprints/:sprintId | View Sprint and linked items | Member | 200, SprintDetail |
| PATCH | /api/projects/:projectId/sprints/:sprintId | Edit a Draft or Active Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/start | Start Draft Sprint | PO | 200, SprintDetail |
| POST | /api/projects/:projectId/sprints/:sprintId/complete | Complete (close) active Sprint | PO | 200, SprintDetail |
| DELETE | /api/projects/:projectId/sprints/:sprintId | Delete a Sprint in any state | PO | 204 |
| GET | /api/projects/:projectId/board | View active Sprint Board | Member | 200, Board |

All writes require an ACTIVE project. List excludes deleted Sprints and includes
CLOSED Sprints with their lifecycle information.
Order by startDate descending (undated Sprints last), then id ascending.

## Create and edit

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| name | string | Required | Optional | Non-blank; unique among the project's live Sprints, case-insensitive |
| goal | string or null | Optional, default null | Optional | Sprint Goal; trimmed, an empty value becomes null |
| startDate | datetime or null | Optional, default null | Optional | Earlier than endDate when both exist |
| endDate | datetime or null | Optional, default null | Optional | Duration no more than one month when both exist |

Create and PATCH do not accept Work Items. A Draft may have no items; Start
requires at least one. Date range: at most one UTC
calendar month (clamp end-of-month); fully dated non-deleted DRAFT/ACTIVE ranges
cannot overlap. Dates may stay empty until Start, which requires both.
An ACTIVE Sprint stays editable: name, goal and endDate may change (end
stays required and within one month of the fixed startDate); startDate
cannot change. CLOSED Sprints are read-only apart from Delete.
A project may have any number of DRAFT Sprints; the overlap rule keeps them in sequence.
Use [start,end), so adjacent Sprints are allowed; closed Sprints do not block planning.
Dates are UTC: YYYY-MM-DD or an ISO 8601 date-time ending in Z.

~~~json
{
  "name":"Sprint 5",
  "startDate":"2026-11-02T00:00:00Z",
  "endDate":"2026-11-09T00:00:00Z"
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
| Start | Optional name, goal, startDate, endDate (reviewed values) | DRAFT; saves the values and starts in one step; both dates set and valid, at least one item, no other ACTIVE Sprint |
| Complete | None | ACTIVE to CLOSED, including an early close; DONE items keep sprintId; unfinished items get sprintId=null |
| Delete | None | Any state; requires confirmation; clears every linked item's sprintId (status unchanged) and soft-deletes the Sprint; cannot be undone in the app |

Starting a DRAFT other than the earliest is allowed; the UI warns because it changes
the planned order. Closed Sprint metadata is read-only.
Complete allows unfinished work and keeps the Sprint's dates; it does not store
per-item closure snapshots or a list
of previous Sprint assignments. Cleared items return to the backlog with their
status unchanged. No operation automatically assigns the next Sprint or changes
parent/child status.

Start takes the body fields with the same rules as PATCH; an empty body starts the Sprint
as planned. Every linked item must still be eligible (not DONE, non-blank description).
Complete clears the link of every unfinished independent item, deleted ones included, and
then closes the Sprint only if it is still ACTIVE. If Complete fails halfway, the Sprint
stays ACTIVE and Complete can be repeated.
Delete clears the link of every item to the Sprint (any status, deleted items included, item
status unchanged) and then marks the Sprint deleted. If Delete fails halfway, the Sprint stays
and Delete can be repeated. Deleting a Sprint that is already deleted returns 404.

Work Item status changes use [Work Items PATCH](work-items.md). Parent and child
statuses remain independent.

## Response types

| Sprint field | Type |
|---|---|
| id | ID |
| projectId | ID |
| name | string or null |
| goal | string or null |
| startDate | datetime or null |
| endDate | datetime or null |
| status | DRAFT, ACTIVE or CLOSED |
| startedAt | datetime or null |
| closedAt | datetime or null |
| createdAt | datetime |
| updatedAt | datetime |

SprintSummary is Sprint plus itemCount and doneCount: the number of live independent
items linked to the Sprint and how many of them are DONE.

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

400: unknown or malformed field, blank name, a date that is not UTC, end not after
start, or a range longer than one month.
409: another ACTIVE Sprint, overlapping date range, duplicate Sprint name, unready item, item linked to
another DRAFT/ACTIVE Sprint, invalid lifecycle (including editing a CLOSED Sprint or changing
the start date of an ACTIVE Sprint) or changed item eligibility.

Sprint failures use the [error format](errors.md):

| Failure | Status | Code | field |
|---|---|---|---|
| Not an active member of the project | 403 | `NOT_PROJECT_MEMBER` | |
| Not the Product Owner | 403 | `FORBIDDEN` | |
| Archived project (any write) | 409 | `PROJECT_ARCHIVED` | |
| Project or Sprint missing, deleted or in another project | 404 | `NOT_FOUND` | |
| Malformed ID | 400 | `INVALID_ID` | |
| Unknown or mistyped field, blank name, invalid date | 400 | `VALIDATION_FAILED` | the field |
| End not after start, range over one month | 400 | `VALIDATION_FAILED` | `endDate` |
| ACTIVE Sprint without both dates | 400 | `VALIDATION_FAILED` | `status` |
| Duplicate name | 409 | `CONFLICT` | `name` |
| Overlapping dates | 409 | `CONFLICT` | `startDate`, or `endDate` when only the end changes |
| Editing a CLOSED Sprint | 409 | `CONFLICT` | |
| Changing the start date of an ACTIVE Sprint | 409 | `CONFLICT` | `startDate` |
| Start or Complete in the wrong state | 409 | `CONFLICT` | |
| Start without a start or end date | 400 | `VALIDATION_FAILED` | `startDate` or `endDate` |
| Start while another Sprint is ACTIVE | 409 | `CONFLICT` | |
| Start with no items, or with items that are not eligible | 409 | `CONFLICT` | |
| Complete when the Sprint is no longer ACTIVE | 409 | `CONFLICT` | |
