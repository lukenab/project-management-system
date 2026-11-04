"use client";

import { useMemo, useSyncExternalStore } from "react";

import { systemRoleLabels } from "./admin-users";
import { previewUser } from "./preview-data";
import {
  personaKey,
  projectsChangedEvent,
  readPreviewPersona,
  type PreviewPersona,
} from "./preview-project-storage";

export { systemRoleLabels };

export type PreviewProfile = {
  id: string;
  fullName: string;
  email: string;
  initials: string;
  emailVerifiedAt: string;
  systemRole: "STAFF" | "SYSTEM_ADMINISTRATOR";
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
};

const storageKey = "pms-preview-profile-v1";
const eventName = "preview-profile-changed";
const adminProfile: PreviewProfile = {
  id: "dana",
  fullName: "Dana Reyes",
  email: "dana@example.test",
  initials: "DR",
  emailVerifiedAt: "2026-08-20T02:00:00.000Z",
  systemRole: "SYSTEM_ADMINISTRATOR",
  hasPassword: true,
  createdAt: "2026-08-20T02:00:00.000Z",
  updatedAt: "2026-08-20T02:00:00.000Z",
};
const staffProfile: PreviewProfile = {
  ...previewUser,
  id: "alex",
  emailVerifiedAt: "2026-09-01T02:00:00.000Z",
  systemRole: "STAFF",
  hasPassword: true,
  createdAt: "2026-09-01T02:00:00.000Z",
  updatedAt: "2026-09-01T02:00:00.000Z",
};
// Test value for the preview form only; it is not an account credential or
// authentication. It lasts until the page reloads and is never stored.
let previewPassword = "preview-password";

function initialsOf(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function storageKeyFor(persona: PreviewPersona) {
  return persona === "admin" ? `${storageKey}-admin` : storageKey;
}

function parseProfile(snapshot: string): PreviewProfile {
  const persona = snapshot.startsWith("admin:") ? "admin" : "staff";
  const baseProfile = persona === "admin" ? adminProfile : staffProfile;
  const stored = snapshot.slice(snapshot.indexOf(":") + 1);
  try {
    const value = JSON.parse(stored || "{}");
    const fullName =
      typeof value?.fullName === "string" && value.fullName.trim()
        ? value.fullName
        : baseProfile.fullName;
    return {
      ...baseProfile,
      fullName,
      initials: initialsOf(fullName),
      hasPassword:
        typeof value?.hasPassword === "boolean"
          ? value.hasPassword
          : baseProfile.hasPassword,
      updatedAt:
        typeof value?.updatedAt === "string"
          ? value.updatedAt
          : baseProfile.updatedAt,
    };
  } catch {
    return baseProfile;
  }
}

function readSnapshot() {
  const persona = readPreviewPersona();
  try {
    return `${persona}:${localStorage.getItem(storageKeyFor(persona)) ?? ""}`;
  } catch {
    return `${persona}:`;
  }
}

/** Switches the sample account the preview is signed in as. */
export function setPreviewPersona(persona: PreviewPersona) {
  try {
    localStorage.setItem(personaKey, persona);
  } catch {
    /* Without storage the preview stays on the default account. */
  }
  window.dispatchEvent(new Event(eventName));
  window.dispatchEvent(new Event(projectsChangedEvent));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}

const serverSnapshot = () => "";

export function usePreviewProfile() {
  const stored = useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);
  return useMemo(() => parseProfile(stored), [stored]);
}

// Browser-only preview persistence; no API requests or server authorization.
export async function updatePreviewProfile(input: { fullName: string }) {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Enter your full name.");
  await new Promise((resolve) => setTimeout(resolve, 350));
  const current = parseProfile(readSnapshot());
  const updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(
      storageKeyFor(readPreviewPersona()),
      JSON.stringify({
        fullName,
        hasPassword: current.hasPassword,
        updatedAt,
      }),
    );
  } catch {
    throw new Error(
      "Couldn't save your changes in this browser. Please try again.",
    );
  }
  window.dispatchEvent(new Event(eventName));
}

export class IncorrectPasswordError extends Error {}

export async function changePreviewPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (input.currentPassword !== previewPassword)
    throw new IncorrectPasswordError("Your current password is incorrect.");
  previewPassword = input.newPassword;
}
