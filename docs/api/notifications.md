# Notifications API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/notifications | View own notifications | Active account | 200, NotificationCenter |
| PATCH | /api/notifications/:notificationId/read | Mark one notification read | Recipient | 200, Notification |
| POST | /api/notifications/read-all | Mark displayed notifications read | Active account | 204 |

All operations are scoped to the server actor, never a client-supplied recipient.
GET sorts by createdAt then id, both descending. NotificationCenter is
{items: Notification[], emailNotificationsEnabled: boolean}; empty items is [].

## Requests

- Mark one read: no body. Repeating it leaves the original readAt unchanged.
- Read all: {notificationIds: ID[]} containing displayed IDs only;
  required, non-empty, unique and owned by the actor.

~~~json
{"notificationIds":["507f1f77bcf86cd799439018"]}
~~~

## Responses

| Notification field | Type |
|---|---|
| id | ID |
| type | string, server-controlled category |
| title | string |
| body | string or null |
| context | {projectId: ID, targetType: string or null, targetId: ID or null}, or null |
| contextAccessible | boolean |
| readAt | datetime or null |
| createdAt | datetime |

Inaccessible context returns a generic title, body=null, context=null and
contextAccessible=false. Notification ownership grants no project access.
Email delivery and preferences are deferred. emailNotificationsEnabled is false.

## Rules & errors

Assigning a Work Item or Subtask to another member creates an in-app notification
linked to its activity event. Repeating the same assignment or assigning yourself
does not create a notification. Notification delivery is best effort after saving work.

400: invalid IDs. 404: unknown or another recipient's notification.
