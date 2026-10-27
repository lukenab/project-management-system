# Reporting API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/sprint-progress | Monitor active Sprint progress | Member | 200, SprintProgress |

No body/query. Return current saved data for the ACTIVE Sprint; 409 if none exists.

## SprintProgress response

| Field | Type |
|---|---|
| sprintId | ID |
| calculatedAt | datetime |
| sprintItems | StatusCounts |
| tasks | StatusCounts |
| subtasks | {total: integer, completed: integer} |
| completionPercent | number, 0-100 |
| remainingTaskHours | nonnegative number or null |
| estimatesIncomplete | boolean |
| overdueTasks | Array of {id: ID, title: string, dueAt: datetime} |
| memberWorkload | Workload[] |

StatusCounts is {total: integer, toDo: integer, inProgress: integer, done: integer}.
Workload is {assigneeMembershipId: ID or null, taskCount: integer,
remainingTaskHours: number or null, unestimatedTaskCount: integer}.

**Proposed calculation defaults:**

- completionPercent = DONE selected items / total selected items * 100, rounded to
  two decimals; return 0 for an empty selection. Use OPEN selections in the active Sprint
  and read each selected PBI’s current status from ProductBacklogItem.
- Remaining task hours sum not-DONE tasks' estimatedHours.
- If a remaining task is unestimated, remainingTaskHours is null and
  estimatesIncomplete=true; count-based progress remains available. Zero is an
  estimate, not missing.
- Overdue means a live, not-DONE task with dueAt earlier than calculatedAt.
  Subtasks have no due date in this scope.
- Workload groups not-DONE tasks by assignee, including an unassigned group; report
  hours as null for any group with missing estimates. Do not count a subtask as a second task.
- Exclude deleted work.
