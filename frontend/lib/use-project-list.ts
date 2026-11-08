"use client";

import { useSyncExternalStore } from "react";

import {
  getInitialProjectList,
  getProjectList,
  subscribeStoredProjects,
} from "./projects-store";

export function useProjectList() {
  return useSyncExternalStore(
    subscribeStoredProjects,
    getProjectList,
    getInitialProjectList,
  );
}
