import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE, backendUrl } from "@/lib/session";

// Ends the session on the backend and always clears the cookie, even when the
// backend cannot be reached or the session is already gone.
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (token) {
    await fetch(`${backendUrl()}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
  }
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  return new Response(null, { status: 204 });
}
