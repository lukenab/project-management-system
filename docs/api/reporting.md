# Reporting API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprint-progress | Monitor active Sprint progress | Member | 200, SprintProgress |

No body/query. Return current saved data for the ACTIVE Sprint; 409 if none exists.

| SprintProgress field | Type |
|---|---|
| sprintId | ID |
| calculatedAt | datetime |
| sprintItems | {total: integer, toDo: integer, inProgress: integer, done: integer} |
| completionPercent | number, 0-100 |
| overdueItems | Array of {id: ID, title: string, dueDate: date} |
| memberWorkload | Array of {assigneeId: ID or null, itemCount: integer} |

Count OPEN selections and their live independent Work Items once. completionPercent = DONE / total *
100, rounded to two decimals; empty selection returns 0. Overdue means not-DONE
with dueDate before the current UTC calendar date. Workload groups not-DONE independent Work Items
by assignee, including an unassigned group. Subtasks do not count as extra items
or a separate workload. Exclude deleted work. No hour or point estimates.
