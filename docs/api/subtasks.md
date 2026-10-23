# Subtasks API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/tasks/:taskId/subtasks | View subtasks | Member | 200, Subtask[] |
| POST | /api/projects/:projectId/tasks/:taskId/subtasks | Create subtask | Dev | 201, Subtask |
| PATCH | /api/projects/:projectId/subtasks/:subtaskId | Update details/assignee | Dev | 200, Subtask |
| PATCH | /api/projects/:projectId/subtasks/:subtaskId/completion | Complete or reopen | Dev | 200, Subtask |
| DELETE | /api/projects/:projectId/subtasks/:subtaskId | Soft-delete incomplete subtask | Dev | 204 |

All writes require the parent task in the ACTIVE Sprint of an ACTIVE project.
A subtask cannot contain subtasks. **Proposed:** list order is createdAt then id.

## Detail fields

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| title | string | Required | Optional | Non-blank |
| description | string or null | Optional, default null | Optional | Plain text |
| assigneeMembershipId | ID or null | Optional, default null | Optional | Active same-project Developer; null clears |

Assignee is independent from the parent task. Parent IDs, dates/estimates and completion
are not accepted in detail PATCH. Default isCompleted=false and completedAt=null.

Completion body (required boolean, true=complete, false=reopen):

~~~json
{"isCompleted":true}
~~~

Complete sets completedAt; reopen clears it. Recalculate progress without changing parent status.
DELETE: no body; incomplete only, soft-delete and recalculate progress; retain history.

## Subtask response

| Field | Type |
|---|---|
| id, projectId, taskId | ID |
| title | string |
| description | string or null |
| assigneeMembershipId | ID or null |
| isCompleted | boolean |
| completedAt | datetime or null, server-controlled |
| createdAt, updatedAt | datetime |

## Rules & errors

409: parent Sprint ended, subtask completed before deletion, or assignee became
ineligible. 404: parent/subtask missing, deleted or outside this project.
