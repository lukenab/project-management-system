# Projects API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects | List my accessible projects | Active account | 200, Project[] |
| POST | /api/projects | Create project and Owner membership | Active account | 201, Project |
| GET | /api/projects/:projectId | View project overview | Member | 200, ProjectOverview |
| PATCH | /api/projects/:projectId | Update project information | Owner | 200, Project |
| POST | /api/projects/:projectId/archive | Archive a project | Owner | 200, Project |
| POST | /api/projects/:projectId/ownership-transfer | Transfer ownership | Owner | 200, Project |

GET list includes ACTIVE/ARCHIVED projects with eligible membership.
**Proposed:** order by updatedAt descending, then id; no query filters.

## Create and update

| Field | Type | Create | PATCH | Rule |
|---|---|---|---|---|
| name | string | Required | Optional | Non-blank |
| key | string | Required | Not editable | `^[A-Z][A-Z0-9]{1,9}$`; unique across the system |
| description | string or null | Optional, default null | Optional | Plain text, at most 500 characters |

Create assigns the caller an ACTIVE OWNER membership with scrumAccountability=null;
no Sprint is created. PATCH accepts only name and description, not key, ownership
or status. createdAt and updatedAt are server-managed.

key prefixes Work Item keys (for example COM-19). Clients may suggest it from the
name, but the server validates it as submitted and never derives or changes it.
Archived projects retain their keys.

~~~json
{
  "name":"Customer portal",
  "key":"CP",
  "description":"Help customers manage their orders."
}
~~~

## Lifecycle requests

| Operation | Body | Conditions / result |
|---|---|---|
| Archive | None | ACTIVE, no ACTIVE Sprint; requires confirmation; sets status=ARCHIVED and archivedAt; becomes read-only |
| Transfer | newOwnerId: Project Membership ID, required | ACTIVE; different active member/account; old Owner becomes MEMBER; Scrum accountabilities unchanged |

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
| status | ACTIVE or ARCHIVED |
| ownerId | Project Membership ID; current owner, not historical creator |
| archivedAt | datetime or null |
| createdAt | datetime |
| updatedAt | datetime |

ProjectOverview contains {project: Project, memberCount: integer,
currentSprint: {id, name, status, startDate, endDate} or null}.
Sprint name can be null. Count only active eligible memberships.

## Rules & errors

Owner access does not grant PO accountability. Archived projects remain readable
by eligible members; reject all project and child-resource writes.
400: invalid key format or description longer than 500 characters. 409: key already in use, active Sprint blocks
archiving, ineligible transfer or changed ownership.
Create/transfer must not leave the project without its sole Owner.
Archiving preserves project data, relationships and history; it does not change
Work Item or Sprint statuses. No unarchive operation is provided.
