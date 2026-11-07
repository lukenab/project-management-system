import {
  backendUnreachable,
  passThrough,
  postToBackend,
  setSessionCookie,
} from "@/lib/session-server";

// Confirms a first-time Google sign-up: the account is created and signed in.
export async function POST(request: Request) {
  const result = await postToBackend(
    "/api/auth/google/confirm",
    await request.text(),
  );
  if (!result) return backendUnreachable();
  if (!result.ok) return passThrough(result);

  const { accessToken, user } = JSON.parse(result.text) as {
    accessToken: string;
    user: unknown;
  };
  await setSessionCookie(accessToken);
  return Response.json({ user }, { status: 201 });
}
