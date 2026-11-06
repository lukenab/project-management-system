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
