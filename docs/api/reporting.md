# Reporting API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprint-progress | Monitor active Sprint progress | Member | 200, SprintProgress |
| GET | /api/projects/:projectId/sprint-activity | Recent activity in the active Sprint | Member | 200, SprintActivityEntry[] |

No body/query. Return current saved data for the ACTIVE Sprint; 409 if none exists.

| SprintProgress field | Type |
|---|---|
| sprintId | ID |
| calculatedAt | datetime |
| sprintItems | {total: integer, toDo: integer, inProgress: integer, done: integer} |
| completionPercent | number, 0-100 |
| overdueItems | Array of {id: ID, key: string, title: string, dueDate: date} |
| memberWorkload | Array of {assigneeId: ID or null, itemCount: integer} |

Count live independent Work Items whose sprintId matches the ACTIVE Sprint once.
completionPercent = DONE / total *
100, rounded to two decimals; no linked items returns 0. Overdue means not-DONE
with dueDate before the current UTC calendar date. Workload groups all independent Work Items
in the Sprint, including DONE ones, by assignee, including an unassigned group. Subtasks do not count as extra items
or a separate workload. Exclude deleted work. No hour or point estimates.

Progress is available for the ACTIVE Sprint only; no historical per-item closure
results or closed-Sprint progress reports are returned.

## Sprint activity

**Proposed:** returns comments and history for the active Sprint's independent Work
Items, including history of their child Work Items, newest first; 409 if no Sprint is ACTIVE.

| SprintActivityEntry field | Type |
|---|---|
| id | ID |
| kind | COMMENT or HISTORY |
| actor | {id: ID, fullName: string} |
| workItem | {id: ID, key: string, title: string}; the independent Work Item |
| text | string; comment content or history summary |
| occurredAt | datetime |
