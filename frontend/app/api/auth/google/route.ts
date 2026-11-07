import {
  backendUnreachable,
  passThrough,
  postToBackend,
  setSessionCookie,
} from "@/lib/session-server";

// Google sign-in. An existing account gets its session cookie here; a new account only
// receives the registration token and profile, to be confirmed in the next step.
export async function POST(request: Request) {
  const result = await postToBackend("/api/auth/google", await request.text());
  if (!result) return backendUnreachable();
  if (!result.ok) return passThrough(result);

  const data = JSON.parse(result.text) as {
    outcome: string;
    accessToken?: string;
    user?: unknown;
  };
  if (data.outcome === "AUTHENTICATED" && data.accessToken) {
    await setSessionCookie(data.accessToken);
    return Response.json({ outcome: data.outcome, user: data.user });
  }
  return passThrough(result);
}
