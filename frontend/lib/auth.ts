import { request } from "./api";

export type Profile = {
  id: string;
  fullName: string;
  email: string;
  emailVerifiedAt: string | null;
  systemRole: "STAFF" | "SYSTEM_ADMINISTRATOR";
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
};

type Expiry = { expiresAt: string };

/** Step 1: sends a six-digit code to the email. */
export const requestRegistration = (email: string) =>
  request<Expiry & { requestId: string }>(
    "POST",
    "/api/auth/registration-requests",
    { email },
  );

/** Step 2: checks the code; returns the single-use token for step 3. */
export const verifyRegistration = (requestId: string, code: string) =>
  request<Expiry & { registrationToken: string }>(
    "POST",
    `/api/auth/registration-requests/${encodeURIComponent(requestId)}/verify`,
    { code },
  );

/** Sends a new code (60 seconds after the last one, at most three times). */
export const resendRegistration = (requestId: string) =>
  request<Expiry & { requestId: string }>(
    "POST",
    `/api/auth/registration-requests/${encodeURIComponent(requestId)}/resend`,
  );

/** Step 3: creates the account. It returns the profile and no session. */
export const registerAccount = (input: {
  registrationToken: string;
  fullName: string;
  password: string;
}) => request<Profile>("POST", "/api/auth/register", input);

/** What the backend answers to a Google ID token: a session, or a profile to confirm. */
export type GoogleResult =
  | { outcome: "AUTHENTICATED"; user: Profile }
  | ({
      outcome: "REGISTRATION_REQUIRED";
      registrationToken: string;
      profile: { fullName: string; email: string };
    } & Expiry);

/** Signs in with the ID token from Google. An existing account gets its session cookie. */
export const googleSignIn = (credential: string) =>
  request<GoogleResult>("POST", "/api/auth/google", { credential });

/** Creates the account for a first-time Google user, and signs them in. */
export const googleConfirm = (registrationToken: string) =>
  request<{ user: Profile }>("POST", "/api/auth/google/confirm", {
    registrationToken,
  });

/** Asks for a password reset link. The answer is the same whether or not the account exists. */
export const requestPasswordReset = (email: string) =>
  request<{ message: string }>("POST", "/api/auth/password-reset-requests", {
    email,
  });

/** Sets a new password with the token from the reset email (signs out every device). */
export const resetPassword = (input: { token: string; newPassword: string }) =>
  request<void>("POST", "/api/auth/password-resets", input);
