"use client";

import { useSyncExternalStore } from "react";

import type { Profile } from "./auth";

import { request } from "./api";

export type CurrentUser = Profile & { initials: string };
type State = { user: CurrentUser | null; loading: boolean };

function initialsOf(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

// One shared copy for the whole page: the header, sidebar and route guards read the
// same user and `GET /api/me` is requested once, not once per component.
const serverState: State = { user: null, loading: true };
let state: State = serverState;
let started = false;
const listeners = new Set<() => void>();

const publish = (next: State) => {
  state = next;
  listeners.forEach((listener) => listener());
};

const withInitials = (profile: Profile): CurrentUser => ({
  ...profile,
  initials: initialsOf(profile.fullName),
});

function load() {
  started = true;
  request<Profile>("GET", "/api/me")
    .then((profile) => publish({ user: withInitials(profile), loading: false }))
    .catch(() => publish({ user: null, loading: false }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) load();
  return () => {
    listeners.delete(listener);
  };
}

/** The signed-in user from `GET /api/me`. `loading` is true until the first answer. */
export function useCurrentUser() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState,
  );
}

/** Replace the shared user with a fresh profile (after the name changes) so the header updates too. */
export function setCurrentUser(profile: Profile) {
  started = true;
  publish({ user: withInitials(profile), loading: false });
}

/** Forget the user so the next reader loads it again (after signing out or changing the profile). */
export function resetCurrentUser() {
  started = false;
  publish(serverState);
  if (listeners.size > 0) load();
}

/** Ends the session on the server (which clears the cookie); the caller then goes to /login. */
export const signOut = () =>
  request<void>("POST", "/api/auth/logout").finally(() => {
    started = false;
    state = serverState;
  });
