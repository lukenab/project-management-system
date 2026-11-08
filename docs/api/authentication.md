# Authentication API

| Method | Endpoint | Description | Permission | Success |
|---|---|---|---|---|
| POST | /api/auth/registration-requests | Request email verification | Public | 201, RegistrationRequest |
| POST | /api/auth/registration-requests/:requestId/verify | Verify registration code | Public | 200, RegistrationProof |
| POST | /api/auth/registration-requests/:requestId/resend | Resend verification code | Public | 200, RegistrationRequest |
| POST | /api/auth/register | Finish email/password registration | Public + registration proof | 201, Profile |
| POST | /api/auth/google | Validate Google identity and choose login/registration | Public + Google credential | 200, GoogleResult |
| POST | /api/auth/google/confirm | Confirm first-time Google registration | Public + registration proof | 201, Session |
| POST | /api/auth/login | Log in with email/password | Public | 200, Session |
| POST | /api/auth/logout | Revoke current session | Current session | 204 |
| POST | /api/auth/password-reset-requests | Request reset email | Public | 202, generic message |
| POST | /api/auth/password-resets | Set a new password using reset token | Public + reset token | 204 |

## Request bodies

All listed fields are required. Resend and logout have no body.

| Operation | Fields |
|---|---|
| Request registration | email: string |
| Verify code | code: string, exactly six digits (preserve leading zeros) |
| Finish registration | registrationToken: string, fullName: non-blank string, password: string |
| Google identity | credential: string (Google ID token) |
| Confirm Google registration | registrationToken: string |
| Login | email: string, password: string |
| Request reset | email: string |
| Finish reset | token: string, newPassword: string |

~~~json
{"email":"student@example.com","password":"example-password"}
~~~

**Defaults:**

| Setting | Value |
|---|---|
| Email | Trim + lowercase; no dot/plus rewriting |
| Password | 8-128 characters; never trim |
| Verification code | 10 minutes, five failed attempts per request |
| Resend | Three resends, 60-second cooldown per email; old code invalidated, attempts not reset |
| Registration proof | 10 minutes, single-use, bound to email/identity and request |
| Reset token | 30 minutes, single-use |

## Response types

| Type | Fields |
|---|---|
| RegistrationRequest | requestId: ID, expiresAt: datetime (current code expiry) |
| RegistrationProof | registrationToken: string, expiresAt: datetime |
| Session | accessToken: string, user: Profile |
| GoogleResult, linked account | outcome: AUTHENTICATED, accessToken: string, user: Profile |
| GoogleResult, new identity | outcome: REGISTRATION_REQUIRED, registrationToken: string, expiresAt: datetime, profile: {fullName: string, email: string} |

Use [Profile](profile.md#profile-response) for user fields. Email registration returns no session;
Google registration requires explicit confirmation and returns a session. Neither grants membership.
Google name/email come from the verified credential; confirmation accepts only registrationToken.

Reset requests always return this 202 response for well-formed email, including
unknown/Google-only/ineligible accounts and delivery failures:

~~~json
{"message":"If the account is eligible, password reset instructions will be sent."}
~~~

Reset revokes all sessions; login is required again. Invalid new passwords do not consume a
valid reset token. Google passwords cannot be reset here.

## Email registration

1. `POST /registration-requests` sends a six-digit code to the email. It fails with
   `EMAIL_ALREADY_REGISTERED` if the email has an account. Each email keeps one
   request: a new request replaces the earlier one, and is refused with `RATE_LIMITED`
   until 60 seconds have passed since the last code was sent.
2. `POST /registration-requests/:requestId/verify` checks the code. Success returns a
   single-use `registrationToken`, valid for 10 minutes. Each code entered counts as an
   attempt, and the request accepts five attempts in total.
3. `POST /register` takes `registrationToken`, `fullName` (trimmed, 1-100 characters)
   and `password`, creates the account with a verified email and returns
   [Profile](profile.md#profile-response). It returns no session and grants no membership.
   The registration request is deleted, so the token works once.

Resend issues a new code, valid for 10 minutes, and invalidates the old one. It is
available after the 60-second wait, up to three times, and only while attempts remain.

| Situation | Status | Code |
|---|---|---|
| Missing or non-string field; invalid email, code format, name or password | 400 | `VALIDATION_FAILED` with `field` |
| `requestId` is not an ObjectId | 400 | `INVALID_ID` |
| Wrong or expired code | 400 | `INVALID_VERIFICATION_CODE` |
| Unknown, replaced or finished request; unknown, expired or used token | 400 | `INVALID_FLOW_TOKEN` |
| Email already has an account (also if it was taken during registration) | 409 | `EMAIL_ALREADY_REGISTERED` |
| Waiting period, five attempts or three resends reached | 429 | `RATE_LIMITED` |
| Verification email could not be sent | 500 | `INTERNAL_ERROR`; wait 60 seconds, then send again |

If the account cannot be created because of an unexpected failure, the token is already
spent and the user starts registration again.

Verification codes and tokens are stored only as SHA-256 digests, and passwords as bcrypt hashes of the SHA-256 of the password.
Registration requests are removed automatically an hour after they expire.

### Configuration

| Variable | Meaning |
|---|---|
| `RESEND_API_KEY` | API key of Resend. When set, verification emails are sent through Resend. When empty outside production, the email (including the code) is printed to the server log instead, so development needs no key. Production refuses to send without it |
| `MAIL_FROM` | Required with `RESEND_API_KEY`: the sender, for example `Project Management <no-reply@yourdomain.com>`, on a domain verified in Resend |

The verification email carries the code in its subject and body (HTML with a plain-text part) and states that it expires in 10 minutes.

## Login and sessions

1. `POST /login` takes `email` and `password` and returns [Session](#response-types):
   `accessToken` and the user's [Profile](profile.md#profile-response).
2. `accessToken` is a JWT signed with the server secret (HS256), valid for 7 days. It carries
   `id` (the account) and `sid` (the session). Send it as `Authorization: Bearer <token>`.
3. Each login creates a session in `auth_sessions`; one account can have several at once.
4. Every protected request is checked in three steps: the signature, the algorithm and the
   expiry of the token; then the session must still exist; then the account must be active.
5. `POST /logout` deletes the current session and returns 204. The token stops working at
   once and the account's other sessions are unaffected.
6. Five wrong passwords in a row lock login for that account for 15 minutes. A correct
   login resets the counter.

| Situation | Status | Code |
|---|---|---|
| Missing or non-string field; invalid email | 400 | `VALIDATION_FAILED` with `field` |
| Wrong password, unknown email, or an account without a password | 401 | `INVALID_CREDENTIALS` (the same message for all three) |
| Correct password but the account is suspended or deleted | 403 | `FORBIDDEN` |
| Five failed attempts | 429 | `RATE_LIMITED` |
| Authorization header missing or not `Bearer`; the account no longer exists | 401 | `UNAUTHENTICATED` |
| Token malformed, badly signed, signed with another algorithm, or its session has ended | 401 | `INVALID_TOKEN` |
| Token expired | 401 | `TOKEN_EXPIRED` |
| Account suspended or deleted after login | 403 | `FORBIDDEN` |

| Variable | Meaning |
|---|---|
| `SECRET` | Required. Secret that signs the access tokens; use a random string of at least 32 characters, for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Changing it signs everyone out |

## Password recovery

1. `POST /password-reset-requests` takes `email`. For a well-formed email it always returns
   202 with the same message, whether or not the account exists or is eligible, so it cannot
   be used to find out which emails are registered. An invalid email returns 400.
2. An active account that has a password gets an email with a link to
   `{APP_URL}/reset-password?token=...`. Accounts that only sign in with Google, and
   suspended or deleted accounts, get no email. A failure to send is logged and still
   returns 202.
3. The token is valid for 30 minutes and works once; a new request replaces the earlier
   link. An account that just received a link (within 60 seconds) is not sent another, with
   the same 202 answer.
4. `POST /password-resets` takes `token` and `newPassword` and returns 204. The password
   follows the same policy as registration (8-128 characters). A password that breaks the
   policy does not use up the token.
5. A successful reset deletes **all** sessions of the account, so every device must sign in
   again, and clears the failed-login counter and lock, so a locked account can sign in
   with the new password.

| Situation | Status | Code |
|---|---|---|
| Missing, non-string or malformed `email`; missing `token`; `newPassword` missing or outside 8-128 characters | 400 | `VALIDATION_FAILED` with `field` |
| Token unknown, expired, already used or replaced | 400 | `INVALID_FLOW_TOKEN` |

| Variable | Meaning |
|---|---|
| `APP_URL` | Address of the frontend used in the email link, default `http://localhost:3000`. Set it to the real address in production |

## Google sign-in

1. The browser shows the Google button and receives an ID token (`credential`) from Google.
2. `POST /google` takes `credential`. The server checks the token with Google (signature,
   expiry, issuer, and that the audience is this application's client ID) and requires a
   verified Google email. The account is identified by Google's `sub`, never by email.
3. Result:
   - An account is already linked to this `sub`: `outcome: AUTHENTICATED` with `accessToken`
     and `user`, as for a password login (a new session).
   - No account is linked and the email is free: `outcome: REGISTRATION_REQUIRED` with
     `registrationToken`, `expiresAt` (10 minutes) and `profile {fullName, email}` taken from
     Google. Nothing is created yet.
4. `POST /google/confirm` takes `registrationToken`, creates the account (no password, email
   verified, role STAFF) and returns 201 with a session. An account without a password cannot
   sign in with a password and has no password to change or reset.

| Situation | Status | Code |
|---|---|---|
| `credential` or `registrationToken` missing or not a string | 400 | `VALIDATION_FAILED` with `field` |
| Google credential invalid, expired, for another application or with an unverified email | 401 | `INVALID_CREDENTIALS` |
| The linked account is suspended or deleted | 403 | `FORBIDDEN` |
| The email already belongs to an account that is not linked to this Google account | 409 | `CONFLICT` with `field: "email"` |
| `registrationToken` invalid, expired or not a Google sign-up token | 400 | `INVALID_FLOW_TOKEN` |
| The account or email was registered meanwhile, or the token is used again | 409 | `CONFLICT` |

| Variable | Meaning |
|---|---|
| `GOOGLE_CLIENT_ID` | Required for Google sign-in: the OAuth client ID (type Web application) of this application. It is not a secret |

## Rules & errors

- Server verifies the Google credential (signature, audience, issuer, expiry and current
  email control); use sub for identity, never auto-link by email. Login creates no accounts.
- Never return verification codes, passwords, provider subjects or token digests.
- 400: invalid code/proof/reset token or invalid password/input. 401: generic invalid
  login credentials/Google credential. 403: inactive linked account. 409: duplicate
  account or unlinked Google subject whose email conflicts with an existing account.
- 429: attempt/resend limit. Registration delivery failure returns 500 without creating
  an account. Reset-request delivery failure keeps the generic 202 response.
- Logout revokes only the current session; expired/invalid sessions may return 401.
  A failure does not confirm remote revocation.
