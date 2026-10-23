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

**Proposed defaults:**

| Setting | Value |
|---|---|
| Email | Trim + lowercase; no dot/plus rewriting |
| Password | 8-128 characters; never trim |
| Verification code | 10 minutes, five failed attempts per request |
| Resend | Three resends, 60-second cooldown; old code invalidated, attempts not reset |
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
{"data":{"message":"If the account is eligible, password reset instructions will be sent."}}
~~~

**Proposed:** reset revokes all sessions; login is required again. Invalid new passwords
do not consume a valid reset token. Google passwords cannot be reset here.

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
