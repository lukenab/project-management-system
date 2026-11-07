import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE, SESSION_MAX_AGE, backendUrl } from "./session";

// Helpers for the route handlers that sign a user in. They run on the server only.

/** Keeps the access token in an httpOnly cookie so page JavaScript never sees it. */
export async function setSessionCookie(accessToken: string) {
  (await cookies()).set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Sends a JSON body to the backend; null when the backend cannot be reached. */
export async function postToBackend(path: string, body: string) {
  try {
    const response = await fetch(`${backendUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } catch {
    return null;
  }
}
type BackendResult = NonNullable<Awaited<ReturnType<typeof postToBackend>>>;

/** The answer to give the browser when the backend cannot be reached. */
export const backendUnreachable = () =>
  Response.json(
    {
      error: "We couldn’t reach the server. Please try again.",
      code: "NETWORK_ERROR",
    },
    { status: 502 },
  );

/** Hands the backend's answer to the browser unchanged. */
export const passThrough = (result: BackendResult) =>
  new Response(result.text, {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
