# Projects API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects | List my accessible projects | Active account | 200, Project[] |
| POST | /api/projects | Create project and Owner membership | Active account | 201, Project |
| GET | /api/projects/:projectId | View project overview | Member | 200, ProjectOverview |
| PATCH | /api/projects/:projectId | Update project information | Owner | 200, Project |
| POST | /api/projects/:projectId/archive | Archive a project | Owner | 200, Project |
| POST | /api/projects/:projectId/ownership-transfer | Transfer ownership | Owner | 200, Project |
| DELETE | /api/projects/:projectId | Soft-delete a project | Owner | 204 |

GET list includes ACTIVE/ARCHIVED projects with eligible membership, never deleted
ones. **Proposed:** order by updatedAt descending, then id; no query filters.

## Create and update

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| name | string | Required | Optional | Non-blank |
| key | string | Required | Not editable | `^[A-Z][A-Z0-9]{1,9}$`; unique across the system |
| description | string or null | Optional, default null | Optional | Plain text |
| plannedStartAt | datetime or null | Optional, default null | Optional | Earlier than plannedEndAt when both exist |
| plannedEndAt | datetime or null | Optional, default null | Optional | Later than plannedStartAt when both exist |

Create assigns the caller an ACTIVE OWNER membership with scrumAccountability=null;
no Sprint is created. PATCH accepts only name, description and planned dates, not key,
ownership or status.

key prefixes Work Item keys (for example COM-19). Clients may suggest it from the
name, but the server validates it as submitted and never derives or changes it.
Keys of deleted projects stay reserved.

~~~json
{
  "name":"Customer portal",
  "key":"CP",
  "description":"Help customers manage their orders.",
  "plannedStartAt":"2026-11-01T00:00:00Z",
  "plannedEndAt":"2026-11-30T00:00:00Z"
}
~~~

## Lifecycle requests

| Operation | Body | Conditions / result |
|---|---|---|
| Archive | None | ACTIVE, no ACTIVE Sprint; becomes read-only |
| Transfer | newOwnerId: Project Membership ID, required | ACTIVE; different active member/account; old Owner becomes MEMBER; Scrum accountabilities unchanged |
| Delete | None | ACTIVE/ARCHIVED, no ACTIVE Sprint; soft-delete without changing status; normal access blocked |

~~~json
{"newOwnerId":"507f1f77bcf86cd799439015"}
~~~

## Responses

| Project field | Type |
|---|---|
| id | ID |
| name | string |
| key | string |
| description | string or null |
| plannedStartAt | datetime or null |
| plannedEndAt | datetime or null |
| status | ACTIVE or ARCHIVED |
| ownerId | Project Membership ID; current owner, not historical creator |
| archivedAt | datetime or null |
| createdAt | datetime |
| updatedAt | datetime |

ProjectOverview contains {project: Project, memberCount: integer,
currentSprint: {id, name, goal, status, plannedStartAt, plannedEndAt} or null}.
Sprint name can be null. Count only active eligible memberships.

## Rules & errors

Owner access does not grant PO accountability. Reject archived-project writes except deletion.
400: invalid key format. 409: key already in use, active Sprint blocks
archive/delete, ineligible transfer or changed ownership.
Create/transfer must not leave the project without its sole Owner. Deletion retains data/history.
