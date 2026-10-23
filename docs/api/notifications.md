# Notifications API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| GET | /api/notifications | View own notifications and preference | Active account | 200, NotificationCenter |
| PATCH | /api/notifications/:notificationId/read | Mark one notification read | Recipient | 200, Notification |
| POST | /api/notifications/read-all | Mark displayed notifications read | Active account | 204 |
| PATCH | /api/me/notification-preferences | Enable/disable email notifications | Active account | 200, EmailPreference |

All operations are scoped to the server actor, never a client-supplied recipient.
GET sorts by createdAt descending then id. NotificationCenter is
{items: Notification[], emailNotificationsEnabled: boolean}; empty items is [].

## Requests

- Mark one read: no body. Repeating it leaves the original readAt unchanged.
- **Proposed read-all:** {notificationIds: ID[]} containing displayed IDs only;
  required, non-empty, unique and owned by the actor.
- Preference: {emailNotificationsEnabled: boolean}, required; enabling requires verified email.

~~~json
{"notificationIds":["507f1f77bcf86cd799439018"]}
~~~

~~~json
{"emailNotificationsEnabled":true}
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

EmailPreference is {emailNotificationsEnabled: boolean}.
**Proposed:** email defaults to false. Inaccessible context returns generic title,
body=null, context=null and contextAccessible=false; notification ownership grants no project access.

## Rules & errors

Email failures do not undo saved work; preferences do not affect verification/reset emails.
**Proposed:** assignment/mention/status notifications first; deadline/overdue generation still needs review.

400: invalid IDs/boolean. 404: unknown or another recipient's notification.
409: enabling email without a verified address. Mark-read failure preserves prior state.
