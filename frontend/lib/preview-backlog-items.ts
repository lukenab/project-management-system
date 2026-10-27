import type {
  BacklogItem,
  BacklogRepository,
  UpdateBacklogItemInput,
} from "./backlog-items";
import type { PreviewProject } from "./preview-data";

import { BacklogDataError } from "./backlog-items";
import { initializePreviewBacklogMetadata } from "./preview-backlog-metadata";
import { getPreviewProject, previewUser } from "./preview-data";

type SeedItem = {
  sequence: number;
  title: string;
  description?: string;
  priority?: BacklogItem["priority"];
  itemType?: string;
};

const commerceItems: SeedItem[] = [
  {
    sequence: 1,
    title: "Let customers save products for later",
    itemType: "Story",
    priority: "HIGH",
    description:
      "Customers can save products to a personal wishlist and return to them when they are ready to buy.",
  },
  {
    sequence: 2,
    title: "Show delivery cost before checkout",
    itemType: "Story",
    priority: "HIGH",
    description:
      "Show an estimated delivery cost before the customer proceeds to payment.",
  },
  {
    sequence: 3,
    title: "Keep basket items after signing in",
    itemType: "Bug",
    description:
      "Items added as a guest should still be available after signing in.",
  },
  {
    sequence: 4,
    title: "Provide a clear empty order history",
    priority: "LOW",
  },
];

const atlasItems: SeedItem[] = [
  {
    sequence: 1,
    title: "Show account information in one place",
    itemType: "Story",
    priority: "HIGH",
    description:
      "Customers can review their saved account information from the account overview.",
  },
  {
    sequence: 2,
    title: "Make service requests easier to find",
    itemType: "Story",
  },
];

type StoredItem = BacklogItem & { deletedAt?: string };
type PreviewStore = { items: StoredItem[]; nextSequence: number };

// Browser memory only. The UI calls this adapter after mounting; refresh resets it.
// These fixture checks are not server-side authentication or authorization.
const stores = new Map<string, PreviewStore>();

function requireProject(projectId: string) {
  const project = getPreviewProject(projectId);
  if (!project) throw new BacklogDataError("NOT_FOUND", "Project not found.");
  return project;
}

function getStore(project: PreviewProject) {
  let store = stores.get(project.id);
  if (!store) {
    const seeds = project.id === "team-workspace" ? commerceItems : atlasItems;
    store = {
      nextSequence: Math.max(0, ...seeds.map((item) => item.sequence)) + 1,
      items: seeds.map((item, index) => ({
        id: `${project.key === "COM" ? "c" : "a"}${item.sequence.toString(16).padStart(23, "0")}`,
        projectId: project.id,
        key: `${project.key}-${item.sequence}`,
        title: item.title,
        description: item.description ?? null,
        priority: item.priority ?? "MEDIUM",
        status: "TODO",
        itemType: item.itemType ?? null,

        orderIndex: index,
        createdAt: "2026-10-26T02:00:00.000Z",
        updatedAt: "2026-10-26T02:00:00.000Z",
      })),
    };
    stores.set(project.id, store);
  }
  return store;
}

function writableProject(projectId: string) {
  const project = requireProject(projectId);
  if (project.status !== "ACTIVE")
    throw new BacklogDataError("ARCHIVED", "This project is read-only.");
  return project;
}

function publicItem(item: StoredItem): BacklogItem {
  const result = { ...item };
  delete result.deletedAt;
  return result;
}

export const previewBacklogRepository: BacklogRepository = {
  async update(projectId, itemId, input) {
    const project = writableProject(projectId);
    const allowed =
      project.scrumRole === "Product Owner"
        ? ["title", "description", "priority"]
        : project.scrumRole === "Developer"
          ? ["status"]
          : [];
    const fields = Object.keys(input);
    if (!fields.length)
      throw new BacklogDataError("VALIDATION", "Choose a field to update.");
    if (fields.some((field) => !allowed.includes(field)))
      throw new BacklogDataError(
        "FORBIDDEN",
        "You cannot update these fields.",
      );
    const changes: UpdateBacklogItemInput = {};
    for (const field of fields) {
      const value = input[field as keyof UpdateBacklogItemInput];
      if (field === "title") {
        if (typeof value !== "string" || !value.trim())
          throw new BacklogDataError("VALIDATION", "Enter a title.");
        changes.title = value.trim();
      } else if (field === "description") {
        if (value !== null && typeof value !== "string")
          throw new BacklogDataError("VALIDATION", "Enter valid text.");
        changes[field] =
          typeof value === "string" ? value.trim() || null : null;
      } else if (field === "priority") {
        if (!["LOW", "MEDIUM", "HIGH"].includes(value as string))
          throw new BacklogDataError("VALIDATION", "Choose a valid priority.");
        changes.priority = value as BacklogItem["priority"];
      } else if (field === "status") {
        if (!["TODO", "IN_PROGRESS", "DONE"].includes(value as string))
          throw new BacklogDataError("VALIDATION", "Choose a valid status.");
        changes.status = value as BacklogItem["status"];
      }
    }
    const store = getStore(project);
    const index = store.items.findIndex(
      (item) => item.id === itemId && !item.deletedAt,
    );
    if (index === -1)
      throw new BacklogDataError("NOT_FOUND", "Item not found.");
    const item = {
      ...store.items[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    store.items[index] = item;
    return publicItem(item);
  },
  async remove(projectId, itemId) {
    const project = writableProject(projectId);
    if (project.scrumRole !== "Product Owner")
      throw new BacklogDataError(
        "FORBIDDEN",
        "Only the Product Owner can delete backlog items.",
      );
    const store = getStore(project);
    const index = store.items.findIndex(
      (item) => item.id === itemId && !item.deletedAt,
    );
    if (index === -1)
      throw new BacklogDataError("NOT_FOUND", "Item not found.");
    // Retain the record and its metadata; normal reads exclude it. No restore UI.
    const now = new Date().toISOString();
    store.items[index] = {
      ...store.items[index],
      deletedAt: now,
      updatedAt: now,
    };
  },
  async list(projectId) {
    const store = getStore(requireProject(projectId));
    return store.items
      .filter((item) => !item.deletedAt)
      .map(publicItem)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
  },

  async get(projectId, itemId) {
    const item = getStore(requireProject(projectId)).items.find(
      (candidate) => candidate.id === itemId && !candidate.deletedAt,
    );
    if (!item) throw new BacklogDataError("NOT_FOUND", "Item not found.");
    return publicItem(item);
  },

  async create(projectId, input) {
    const project = requireProject(projectId);
    if (project.status !== "ACTIVE") {
      throw new BacklogDataError("ARCHIVED", "This project is read-only.");
    }
    if (project.scrumRole !== "Product Owner") {
      throw new BacklogDataError(
        "FORBIDDEN",
        "Only the Product Owner can create backlog items.",
      );
    }
    if (
      Object.keys(input).some((field) => field !== "title") ||
      typeof input.title !== "string" ||
      !input.title.trim()
    ) {
      throw new BacklogDataError("VALIDATION", "Enter a title.");
    }

    const store = getStore(project);
    const now = new Date().toISOString();
    const item: BacklogItem = {
      // Preview IDs resemble the API's ObjectIds; backend allocation comes later.
      id: crypto.randomUUID().replaceAll("-", "").slice(0, 24),
      projectId,
      key: `${project.key}-${store.nextSequence}`,
      title: input.title.trim(),
      description: null,
      priority: "MEDIUM",
      status: "TODO",
      itemType: null,

      orderIndex:
        Math.max(-1, ...store.items.map((existing) => existing.orderIndex)) + 1,
      createdAt: now,
      updatedAt: now,
    };

    // Allocate once per create, independently of list position or sort order.
    initializePreviewBacklogMetadata(item, previewUser);
    store.items.push(item);
    store.nextSequence += 1;
    return publicItem(item);
  },
};
