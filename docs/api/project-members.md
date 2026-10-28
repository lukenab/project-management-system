# Project members API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/projects/:projectId/members | List active members | Member | 200, Member[] |
| POST | /api/projects/:projectId/members | Add an existing active account | Owner | 201, Member |
| DELETE | /api/projects/:projectId/members/:membershipId | Remove a member | Owner | 204 |
| POST | /api/projects/:projectId/leave | Leave the project | Member | 204 |
| PATCH | /api/projects/:projectId/members/:membershipId/scrum-accountability | Assign/change accountability | Owner | 200, Member[] |

All writes require an ACTIVE project. Member IDs are membership IDs, not user IDs.

## Add member

| Field | Type | Required | Rule |
|---|---|---|---|
| email | string | Yes | Existing active Staff account; server resolves the user |
| scrumAccountability | string | Yes | PRODUCT_OWNER, SCRUM_MASTER or DEVELOPER |

**Proposed:** identify the account by exact email. Rejoin reactivates membership;
already-active membership returns 409. Add cannot replace the current PO.

~~~json
{"email":"member@example.com","scrumAccountability":"DEVELOPER"}
~~~

## Change accountability

| Field | Type | Required | Rule |
|---|---|---|---|
| scrumAccountability | string | Yes | PRODUCT_OWNER, SCRUM_MASTER or DEVELOPER |
| replaceCurrentProductOwner | boolean | Conditional | Proposed: true only when replacing another PO |
| previousProductOwnerId | Project Membership ID | Conditional | Proposed: must match current PO when replacing |
| previousProductOwnerNewAccountability | string | Conditional | Proposed: DEVELOPER or SCRUM_MASTER when replacing |

Replace both assignments together; changed previous PO returns 409.
Return one or two affected members. Project ownership stays unchanged.

## Remove and leave

| Operation | Body | Conditions / result |
|---|---|---|
| Remove | None | Cannot remove Owner; clear/reassign unfinished Sprint work first |
| Leave | None | Owner transfers first; unfinished independent Work Item and Subtask assignments are cleared |

**Proposed:** leave clears unfinished independent Work Item and Subtask assignments; changing Dev
accountability requires unfinished assignments (independent Work Item and Subtask) cleared first.
Preserve historical contributions.

## Member response

| Field | Type |
|---|---|
| id | ID |
| userId | ID |
| projectId | ID |
| fullName | string |
| email | string |
| accessRole | OWNER or MEMBER |
| scrumAccountability | PRODUCT_OWNER, SCRUM_MASTER, DEVELOPER or null |
| status | ACTIVE |
| joinedAt | datetime |

## Rules & errors

**Proposed:** list by fullName, then id. System role is not a project role.
409: duplicate membership, PO conflict, unfinished work, Owner self-removal or ineligible member.
404: no eligible account for the supplied email.
