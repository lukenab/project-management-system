import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE, backendUrl } from "@/lib/session";

// Forwards every other /api/... request to the backend and adds the access token from
// the cookie as `Authorization: Bearer`. Requests without a cookie go out without it,
// which is how the public registration endpoints keep working.
const TOKEN_ERRORS = ["INVALID_TOKEN", "TOKEN_EXPIRED", "UNAUTHENTICATED"];

async function forward(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = `${backendUrl()}/api/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;

  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      signal: AbortSignal.timeout(30_000),
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

  const body = response.status === 204 ? null : await response.arrayBuffer();
  // The backend no longer accepts this token (expired, signed out elsewhere): drop the cookie.
  if (response.status === 401 && token && body) {
    try {
      const { code } = JSON.parse(new TextDecoder().decode(body));
      if (TOKEN_ERRORS.includes(code)) cookieStore.delete(ACCESS_TOKEN_COOKIE);
    } catch {
      // not JSON: leave the cookie alone
    }
  }

  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}

export {
  forward as DELETE,
  forward as GET,
  forward as PATCH,
  forward as POST,
  forward as PUT,
};
