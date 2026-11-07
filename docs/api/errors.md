# Errors

Every error response has an HTTP status and this JSON body:

~~~json
{ "error": "Human readable message", "code": "VALIDATION_FAILED", "field": "name" }
~~~

| Field | Meaning |
|---|---|
| error | English message for developers and as a fallback for users. It may be reworded; clients must not branch on it |
| code | Stable identifier from the table below. Clients branch on it, for example to choose a screen or a form field |
| field | Optional name of the request field that caused the error. Any code may carry it |

The HTTP status is fixed by the code. A code is never renamed or reused;
new codes are only added. Unexpected failures return `INTERNAL_ERROR` with a
generic message, and the details stay in the server log.

| Code | Status | Meaning | Suggested client reaction |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Invalid body, parameter or field; `field` names it when known | Show the message next to the field |
| `INVALID_ID` | 400 | An ID in the path is not a valid ObjectId | Treat as not found |
| `UNAUTHENTICATED` | 401 | Missing credentials or the account of the token no longer exists | Send the user to sign in |
| `INVALID_TOKEN` | 401 | Token is malformed, badly signed, uses another algorithm, or its session has ended (for example after sign-out) | Send the user to sign in |
| `TOKEN_EXPIRED` | 401 | Token has expired | Send the user to sign in and return to the page |
| `INVALID_CREDENTIALS` | 401 | Email or password is wrong; the message does not say which | Show the message on the sign-in form without leaving the page |
| `FORBIDDEN` | 403 | Account, membership, action or field permission denied | Hide the action or show a read-only state |
| `NOT_PROJECT_MEMBER` | 403 | The account is not an active member of the project in the path | Leave the project and go to the project list |
| `NOT_FOUND` | 404 | Resource missing, deleted or outside the requested parent; also an unknown path | Go back to the parent list |
| `CONFLICT` | 409 | State, assignment or other business conflict; `field` names the field when known | Show the message, next to the field when there is one |
| `PROJECT_ARCHIVED` | 409 | The project is archived and rejects every write | Switch the screen to read-only |
| `DUPLICATE_VALUE` | 409 | A value that must be unique already exists; `field` names it when known | Show the message next to the field |
| `INVALID_VERIFICATION_CODE` | 400 | The email verification code is wrong or has expired; the message says which | Let the user retype the code, or offer to resend it |
| `INVALID_FLOW_TOKEN` | 400 | The registration step is no longer valid: unknown, expired, already used or replaced by a newer request | Restart registration |
| `EMAIL_ALREADY_REGISTERED` | 409 | An account with this email already exists | Offer to sign in |
| `RATE_LIMITED` | 429 | Too many attempts or requests; the message says how long to wait or that registration must restart | Disable the action and show the message |
| `INTERNAL_ERROR` | 500 | Unexpected failure; no partial business changes should be saved | Show a generic retry message |
| `NOT_IMPLEMENTED` | 501 | The endpoint exists in the contract but is not available yet | Hide the feature |

Domain documents may define more specific codes for the same statuses, for
example for a conflict that needs its own screen; they are added to this table.

## Handling codes in clients

A client reacts only to the codes it cares about and treats any other code by
its status: 401 sends the user to sign in, 403 shows that the action is not
allowed, 404 shows that the resource is gone, any other 4xx shows `error`
(next to `field` when present) and 5xx shows a generic retry message.
Adding a code is therefore never a breaking change.

## Adding a code

Add a code only when a client must do something different: another screen, state
or action, such as switching to read-only mode or leaving the project. Different
wording is not a reason. Use `field` to point at a form field and `message` to
word a variant of an existing code, for example `CONFLICT` with `field: "name"`
for a name that is already taken.

A new code goes in this table and in `backend/src/utils/errorCodes.ts`; a test
checks that both match. Codes are never renamed or reused.
