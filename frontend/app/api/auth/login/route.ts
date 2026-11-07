import { cookies } from "next/headers";

import {
  ACCESS_TOKEN_COOKIE,
  SESSION_MAX_AGE,
  backendUrl,
} from "@/lib/session";

// Signs in through the backend and keeps the access token in an httpOnly cookie,
// so page JavaScript never sees it. Only the user is returned to the browser.
export async function POST(request: Request) {
  let response: Response;
  try {
    response = await fetch(`${backendUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json(
      {
        error: "We couldn’t reach the server. Please try again.",
        code: "NETWORK_ERROR",
      },
      { status: 502 },
    );
  }

  const text = await response.text();
  if (!response.ok) {
    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { accessToken, user } = JSON.parse(text) as {
    accessToken: string;
    user: unknown;
  };
  (await cookies()).set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json({ user });
}
