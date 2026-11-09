"use client";

import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api";
import { googleSignIn } from "@/lib/auth";

// A first-time Google user confirms their details on the sign-up page. The registration
// token waits in sessionStorage (not the URL) and is gone when the tab closes.
const PENDING_KEY = "pms-google-registration";

export type PendingGoogle = {
  registrationToken: string;
  expiresAt: string;
  profile: { fullName: string; email: string };
};

export function readPendingGoogle(): PendingGoogle | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    const pending = raw ? (JSON.parse(raw) as PendingGoogle) : null;
    if (pending && Date.parse(pending.expiresAt) > Date.now()) return pending;
  } catch {}
  clearPendingGoogle();
  return null;
}

export function clearPendingGoogle() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

/** The page to open after signing in: `?next=` when it is a path on this site. */
export function afterSignInPath(systemRole?: string) {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return systemRole === "SYSTEM_ADMINISTRATOR" ? "/admin/users" : "/projects";
}

/** The message to show for a failed Google sign-in. */
export const googleErrorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "Something went wrong. Please try again.";

/**
 * Returns the function to call with the ID token from Google. It signs in, or sends a new
 * user to the sign-up page to confirm; failures are thrown for the page to show.
 */
export function useGoogleSignIn(
  onRegistration?: (pending: PendingGoogle) => void,
) {
  const router = useRouter();

  return async function signInWithGoogle(credential: string) {
    const result = await googleSignIn(credential);
    if (result.outcome === "AUTHENTICATED") {
      router.replace(afterSignInPath(result.user.systemRole));
      router.refresh();
      return;
    }
    const pending: PendingGoogle = {
      registrationToken: result.registrationToken,
      expiresAt: result.expiresAt,
      profile: result.profile,
    };
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {}
    if (onRegistration) onRegistration(pending);
    else router.push("/sign-up");
  };
}
