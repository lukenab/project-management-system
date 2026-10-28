"use client";

import { useSyncExternalStore } from "react";

import {
  previewProjects,
  previewUser,
  type PreviewProject,
} from "./preview-data";

export const projectStorageKey = "pms-preview-projects-v1";
const eventName = "preview-projects-changed";
const serverSnapshot = () => "";
function snapshot() {
  try {
    return localStorage.getItem(projectStorageKey) ?? "";
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
export function usePreviewProjects() {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [...previewProjects, ...readCreatedProjects(stored)];
}
export function readCreatedProjects(stored: string): PreviewProject[] {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PreviewProject =>
        p &&
        typeof p.id === "string" &&
        p.id.startsWith("preview-") &&
        typeof p.name === "string" &&
        typeof p.description === "string" &&
        typeof p.key === "string" &&
        /^[A-Z][A-Z0-9]{1,9}$/.test(p.key) &&
        p.owner?.email === previewUser.email &&
        typeof p.initials === "string" &&
        p.status === "ACTIVE" &&
        p.scrumRole === "None" &&
        p.tone === "blue",
    );
  } catch {
    return [];
  }
}
export function suggestProjectKey(name: string) {
  const words =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "D")
      .toUpperCase()
      .match(/[A-Z0-9]+/g) ?? [];
  let key = (
    words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "")
  ).slice(0, 10);
  key = key.replace(/^[^A-Z]+/, "");
  return key.length === 1 ? `${key}P` : key;
}
// Browser-only preview persistence; no API requests or server authorization.
export async function createPreviewProject(input: {
  name: string;
  key: string;
  description: string;
}) {
  const name = input.name.trim();
  const key = input.key.trim();
  if (!name) throw new Error("Enter a project name.");
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key))
    throw new Error(
      "Use 2–10 uppercase letters or numbers, starting with a letter.",
    );
  await new Promise((resolve) => setTimeout(resolve, 450));
  const created = readCreatedProjects(snapshot());
  if ([...previewProjects, ...created].some((p) => p.key === key))
    throw new Error("This project key is already in use. Choose another key.");
  const project: PreviewProject = {
    id: `preview-${crypto.randomUUID()}`,
    name,
    key,
    description: input.description.trim(),
    productGoal: "",
    owner: { ...previewUser },
    scrumRole: "None",
    initials: name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    tone: "blue",
    status: "ACTIVE",
  };
  try {
    localStorage.setItem(
      projectStorageKey,
      JSON.stringify([...created, project]),
    );
  } catch {
    throw new Error(
      "Couldn't save your project in this browser. Please try again.",
    );
  }
  window.dispatchEvent(new Event(eventName));
  return project;
}
