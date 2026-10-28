# Collaboration API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/work-items/:itemId/comments | List comments | Member | 200, Comment[] |
| POST | /api/projects/:projectId/work-items/:itemId/comments | Add comment | Member | 201, Comment |
| GET | /api/projects/:projectId/work-items/:itemId/activity | View work-item history | Member | 200, ActivityEvent[] |

itemId identifies a Work Item. Comments target independent items only in this slice. Activity may reference a child Work Item;
its parent history can include child actions using parentId lookup.
Require access to the target's project; Admin alone grants no project access.

## Comments

POST body:

| Field | Type | Required | Rule |
|---|---|---|---|
| content | string | Yes | Non-blank plain text |
| mentionedMemberIds | Project Membership ID[] | No, default [] | Unique active same-project memberships |

~~~json
{"content":"Please review the item description.","mentionedMemberIds":[]}
~~~

**Proposed:** comments sort by createdAt then id; closed Sprint work accepts comments
while the Project is ACTIVE. Archived Projects are read-only. Email failure does not
undo a saved comment/notification. Content is plain text, not trusted HTML.

| Comment field | Type |
|---|---|
| id | ID |
| author | {id: ID, fullName: string} |
| content | string |
| mentionedMemberIds | Project Membership ID[] |
| createdAt | datetime |

## Activity response

Sort by occurredAt descending, then id. History is read-only and server-generated.

| ActivityEvent field | Type |
|---|---|
| id | ID |
| actor | {id: ID, fullName: string} |
| action | string, server-controlled action name |
| workItemId | ID of the affected independent or child Work Item |
| summary | string |
| changes | Array of {field: string, before: JSON value, after: JSON value}, or null |
| occurredAt | datetime |

## Rules & errors

**Proposed:** use a neutral author label if the name is unavailable. Never expose credentials/private fields.
400: invalid content/mentions. 409: ineligible mention or archived project.
404: inaccessible/deleted target. Retained history does not bypass target access.
