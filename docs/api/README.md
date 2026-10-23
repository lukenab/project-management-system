# API contracts

API contracts for frontend/backend integration. Items marked **Proposed** need review.

| Domain | Contract |
|---|---|
| Registration, login, logout, password recovery | [Authentication](authentication.md) |
| Own profile and password | [Profile](profile.md) |
| Project information and lifecycle | [Projects](projects.md) |
| Membership and Scrum accountability | [Project members](project-members.md) |
| Product-level backlog items and order | [Product Backlog](product-backlog.md) |
| Planning, selection, lifecycle and board | [Sprints](sprints.md) |
| Task details, assignment, status and dependencies | [Tasks](tasks.md) |
| Subtask details and completion | [Subtasks](subtasks.md) |
| Comments and work-item history | [Collaboration](collaboration.md) |
| Own notifications and email preference | [Notifications](notifications.md) |
| Active Sprint indicators | [Reporting](reporting.md) |
| Account administration and audit | [Administration](administration.md) |

## Common conventions

- Paths include `/api`; replace `:id` placeholders with actual IDs.
- Use JSON and `Authorization: Bearer <token>` for protected endpoints.
- Success: `{data: ...}`. Errors: `{error: "Message"}`. `204` has no body.
- PATCH updates only submitted fields; `null` clears nullable fields.
- IDs are ObjectId strings; dates use ISO-8601 UTC.
- Validate input and permissions on the server; reject unsupported fields.

**Roles:** Owner = Project Owner, PO = Product Owner,
Dev = Developer, Admin = System Administrator.
**Member:** active account + active project membership with Owner access or a Scrum accountability.

## Errors

| Status | Meaning |
|---|---|
| 400 | Invalid body, parameter, field or token/challenge input |
| 401 | Missing/invalid authentication or invalid login credentials |
| 403 | Account, membership, action or field permission denied |
| 404 | Resource missing, deleted or outside the requested parent |
| 409 | State, uniqueness, assignment or other business conflict |
| 429 | Authentication verification attempt/resend limit reached |
| 500 | Unexpected failure; no partial business changes should be saved |

