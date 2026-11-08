import type { ActivityEvent, WorkItemComment } from "./collaboration";
import type { WorkItem, WorkItemRepository } from "./work-items";

import { request } from "./api";

const itemsPath = (projectId: string) =>
  "/api/projects/" + encodeURIComponent(projectId) + "/work-items";
const itemPath = (projectId: string, itemId: string) =>
  itemsPath(projectId) + "/" + encodeURIComponent(itemId);

export const listWorkItemComments = (projectId: string, itemId: string) =>
  request<WorkItemComment[]>("GET", itemPath(projectId, itemId) + "/comments");

export const addWorkItemComment = (
  projectId: string,
  itemId: string,
  content: string,
) =>
  request<WorkItemComment>("POST", itemPath(projectId, itemId) + "/comments", {
    content,
  });

export const listWorkItemActivity = (projectId: string, itemId: string) =>
  request<ActivityEvent[]>("GET", itemPath(projectId, itemId) + "/activity");

export const apiWorkItemRepository: Pick<
  WorkItemRepository,
  "list" | "get" | "create" | "update" | "remove" | "reorder"
> = {
  list(projectId, filter) {
    const query = filter?.parentId
      ? "?parentId=" + encodeURIComponent(filter.parentId)
      : "";
    return request<WorkItem[]>("GET", itemsPath(projectId) + query);
  },
  get: (projectId, itemId) =>
    request<WorkItem>("GET", itemPath(projectId, itemId)),
  create: (projectId, input) =>
    request<WorkItem>("POST", itemsPath(projectId), input),
  update: (projectId, itemId, input) =>
    request<WorkItem>("PATCH", itemPath(projectId, itemId), input),
  remove: (projectId, itemId) =>
    request<void>("DELETE", itemPath(projectId, itemId)),
  reorder: (projectId, itemIds) =>
    request<WorkItem[]>("PUT", itemsPath(projectId) + "/order", { itemIds }),
};
