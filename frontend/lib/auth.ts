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

type ErrorBody = { error?: string; code?: string; field?: string };

/** Error response of the backend: `{ error, code, field? }` */
export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "We couldn’t reach the server. Check your connection and try again.",
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = (data ?? {}) as ErrorBody;
    throw new ApiError(
      response.status,
      failure.code ?? "UNKNOWN",
      failure.error ?? "Something went wrong. Please try again.",
      failure.field,
    );
  }
  return data as T;
}

type Expiry = { expiresAt: string };

/** Step 1: sends a six-digit code to the email. */
export const requestRegistration = (email: string) =>
  post<Expiry & { requestId: string }>("/registration-requests", { email });

/** Step 2: checks the code; returns the single-use token for step 3. */
export const verifyRegistration = (requestId: string, code: string) =>
  post<Expiry & { registrationToken: string }>(
    `/registration-requests/${encodeURIComponent(requestId)}/verify`,
    { code },
  );

/** Sends a new code (60 seconds after the last one, at most three times). */
export const resendRegistration = (requestId: string) =>
  post<Expiry & { requestId: string }>(
    `/registration-requests/${encodeURIComponent(requestId)}/resend`,
  );

/** Step 3: creates the account. It returns the profile and no session. */
export const registerAccount = (input: {
  registrationToken: string;
  fullName: string;
  password: string;
}) => post<Profile>("/register", input);
