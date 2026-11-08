# Project members API

| Method | Endpoint                                                            | Description                    | Permission | Success       |
| ------ | ------------------------------------------------------------------- | ------------------------------ | ---------- | ------------- |
| GET    | /api/projects/:projectId/members                                    | List active members            | Member     | 200, Member[] |
| POST   | /api/projects/:projectId/members                                    | Add an existing active account | Owner      | 201, Member   |
| DELETE | /api/projects/:projectId/members/:membershipId                      | Remove a member                | Owner      | 204           |
| POST   | /api/projects/:projectId/leave                                      | Leave the project              | Member     | 204           |
| PATCH  | /api/projects/:projectId/members/:membershipId/scrum-accountability | Assign/change accountability   | Owner      | 200, Member[] |

All writes require an ACTIVE project and transaction-capable MongoDB (replica set or sharded cluster). Member IDs are membership IDs, not user IDs.

## Add member

| Field               | Type   | Required | Rule                                                    |
| ------------------- | ------ | -------- | ------------------------------------------------------- |
| email               | string | Yes      | Existing active Staff account; server resolves the user |
| scrumAccountability | string | Yes      | PRODUCT_OWNER, SCRUM_MASTER or DEVELOPER                |

Identify the account by exact email after normalization. Rejoin reactivates the same membership and clears its end time. An already-active membership or an occupied PO/SM role returns 409.

```json
{ "email": "member@example.com", "scrumAccountability": "DEVELOPER" }
```

## Change accountability

| Field                         | Type   | Required    | Rule                                                                     |
| ----------------------------- | ------ | ----------- | ------------------------------------------------------------------------ |
| scrumAccountability           | string | Yes         | PRODUCT_OWNER, SCRUM_MASTER or DEVELOPER                                 |
| previousUserMembershipId      | string | Conditional | The membershipId of the old PRODUCT_OWNER or SCRUM_MASTER                |
| previousUserNewAccountability | string | Conditional | DEVELOPER or one of PRODUCT_OWNER and SCRUM_MASTER that is not yet taken |

Replace both assignments together. An occupied PRODUCT_OWNER or SCRUM_MASTER role requires the current holder’s membership ID and a valid replacement role.
Return one or two affected members. Project ownership stays unchanged.

## Remove and leave

| Operation | Body | Conditions / result                                                                         |
| --------- | ---- | ------------------------------------------------------------------------------------------- |
| Remove    | None | Cannot remove Owner; clear/reassign unfinished Sprint work first                            |
| Leave     | None | Owner transfers first; unfinished independent Work Item and Subtask assignments are cleared |

Remove sets the membership to REMOVED and checks unfinished work in Draft or Active Sprints, including Subtasks. Leave sets the membership to LEFT. Both record an end time and release the Scrum role. Changing a Developer’s accountability requires reassigning their unfinished Work Items and Subtasks first. Preserve historical contributions.

## Member response

| Field               | Type                                           |
| ------------------- | ---------------------------------------------- |
| id                  | ID                                             |
| userId              | ID                                             |
| projectId           | ID                                             |
| fullName            | string                                         |
| email               | string                                         |
| accessRole          | OWNER or MEMBER                                |
| scrumAccountability | PRODUCT_OWNER, SCRUM_MASTER, DEVELOPER or null |
| status              | ACTIVE                                         |
| joinedAt            | datetime                                       |

## Rules & errors

List by fullName, then id. System role is not a project role.
409: duplicate membership, role conflict, unfinished work, Owner removal or leave, or archived project.
404: no eligible account for the supplied email.
