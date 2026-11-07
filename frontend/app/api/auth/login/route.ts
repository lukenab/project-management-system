import {
  backendUnreachable,
  passThrough,
  postToBackend,
  setSessionCookie,
} from "@/lib/session-server";

// Signs in through the backend and keeps the access token in an httpOnly cookie,
// so page JavaScript never sees it. Only the user is returned to the browser.
export async function POST(request: Request) {
  const result = await postToBackend("/api/auth/login", await request.text());
  if (!result) return backendUnreachable();
  if (!result.ok) return passThrough(result);

  const { accessToken, user } = JSON.parse(result.text) as {
    accessToken: string;
    user: unknown;
  };
  await setSessionCookie(accessToken);
  return Response.json({ user });
}
