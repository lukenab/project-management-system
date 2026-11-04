"use client";

import { useMemo, useSyncExternalStore } from "react";

import { previewUser } from "./preview-data";

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

export const systemRoleLabels: Record<PreviewProfile["systemRole"], string> = {
  STAFF: "Staff",
  SYSTEM_ADMINISTRATOR: "System Administrator",
};

const storageKey = "pms-preview-profile-v1";
const eventName = "preview-profile-changed";
const baseProfile: PreviewProfile = {
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

function parseProfile(stored: string): PreviewProfile {
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

function readStored() {
  try {
    return localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
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
  const stored = useSyncExternalStore(subscribe, readStored, serverSnapshot);
  return useMemo(() => parseProfile(stored), [stored]);
}

// Browser-only preview persistence; no API requests or server authorization.
export async function updatePreviewProfile(input: { fullName: string }) {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Enter your full name.");
  await new Promise((resolve) => setTimeout(resolve, 350));
  const current = parseProfile(readStored());
  const updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(
      storageKey,
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
