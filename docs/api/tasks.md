# Tasks API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprints/:sprintId/tasks | List Sprint tasks | Member | 200, Task[] |
| POST | /api/projects/:projectId/sprints/:sprintId/tasks | Create task under selected PBI | Dev | 201, Task |
| GET | /api/projects/:projectId/tasks/:taskId | View task | Member | 200, TaskDetail |
| PATCH | /api/projects/:projectId/tasks/:taskId | Update work details | Dev | 200, Task |
| DELETE | /api/projects/:projectId/tasks/:taskId | Soft-delete unstarted task | Dev | 204 |
| PATCH | /api/projects/:projectId/tasks/:taskId/assignee | Assign/reassign/clear assignee | Dev | 200, Task |
| POST | /api/projects/:projectId/tasks/:taskId/claim | Claim unassigned task | Dev | 200, Task |
| PATCH | /api/projects/:projectId/tasks/:taskId/status | Change workflow status | Dev | 200, Task |
| POST | /api/projects/:projectId/tasks/:taskId/dependencies | Add prerequisite | Dev | 201, Dependency |
| DELETE | /api/projects/:projectId/tasks/:taskId/dependencies/:prerequisiteTaskId | Remove prerequisite | Dev | 204 |

Writes require an ACTIVE project and the dependent/owning task's ACTIVE Sprint.
Read can show accessible closed history. **Proposed:** list order is createdAt then id;
optional sprintBacklogItemId query restricts the list to a selection in that Sprint.

## Create and edit

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| sprintBacklogItemId | ID | Required | Not editable | OPEN selection in the Sprint from the path |
| title | string | Required | Optional | Non-blank |
| description | string or null | Optional, default null | Optional | Plain text |
| priority | string or null | Optional, default null | Optional | Proposed: LOW/MEDIUM/HIGH or null |
| estimatedHours | number or null | Optional, default null | Optional | Proposed unit: hours, nonnegative |
| plannedStartAt | datetime or null | Optional, default null | Optional | Not later than dueAt when both exist |
| dueAt | datetime or null | Optional, default null | Optional | Not earlier than plannedStartAt |
| assigneeMembershipId | ID or null | Optional, default null | Separate endpoint | Active same-project Developer |

Initial status: TODO. sprintBacklogItemId is a selection ID, not a PBI ID.
Details PATCH cannot move the task, assign it or change status.

~~~json
{
  "sprintBacklogItemId":"507f1f77bcf86cd799439016",
  "title":"Build order tracking page",
  "estimatedHours":4,
  "assigneeMembershipId":null
}
~~~

## Assignment, status and dependencies

| Operation | Body | Rule |
|---|---|---|
| Assign | assigneeMembershipId: ID or null | Null clears; validate active account and Developer membership |
| Claim | No body | Server actor becomes assignee only if still unassigned |
| Status | status: TODO, IN_PROGRESS or DONE | Active Sprint only; no automatic parent/subtask status changes |
| Add dependency | prerequisiteTaskId: ID | Task in same project; taskId depends on prerequisiteTaskId |
| Remove dependency | No body | Remove relationship only, not either task |

Dependencies: same project, no self-reference or direct/indirect cycle; different Sprints allowed.
**Proposed:** prerequisite must be live/accessible. One assignee; claim fails if already assigned.

**Proposed:** Done requires valid title/date/estimate values, without an extra checklist.
Task status and subtask completion do not automatically change each other.

## Delete

No body; soft-delete only if never started and no incoming dependencies.
**Proposed:** live subtasks/outgoing dependencies also block deletion. History is retained.

## Response types

| Task field | Type |
|---|---|
| id, projectId, sprintId, sprintBacklogItemId | ID |
| title | string |
| description | string or null |
| priority | LOW/MEDIUM/HIGH or null (Proposed) |
| estimatedHours | nonnegative number or null (Proposed hours) |
| plannedStartAt, dueAt, firstStartedAt | datetime or null |
| status | TODO, IN_PROGRESS or DONE |
| assigneeMembershipId | ID or null |
| createdAt, updatedAt | datetime |

TaskDetail is Task plus dependsOnTaskIds: ID[], dependentTaskIds: ID[] and
subtaskProgress: {completed: integer, total: integer}. List only live accessible links/subtasks.
History: [Collaboration](collaboration.md). firstStartedAt records the first execution start.
Dependency is {taskId: ID, prerequisiteTaskId: ID, createdAt: datetime}.

## Rules & errors

409: task no longer in active Sprint, invalid assignee, task already claimed,
already-started deletion, blocking subtasks/dependencies, duplicate edge or cycle.
400: invalid fields or self-dependency. Cross-project/missing target returns 404.
Missing dependency on removal returns 404.
