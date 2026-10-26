import type { BacklogItem, BacklogRepository } from "./backlog-items";
import type { PreviewProject } from "./preview-data";

import { BacklogDataError } from "./backlog-items";
import { initializePreviewBacklogMetadata } from "./preview-backlog-metadata";
import { getPreviewProject, previewUser } from "./preview-data";

type SeedItem = {
  sequence: number;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: BacklogItem["priority"];
  itemType?: string;
  storyPoints?: number;
};

const commerceItems: SeedItem[] = [
  {
    sequence: 1,
    title: "Let customers save products for later",
    itemType: "Story",
    priority: "HIGH",
    description:
      "Customers can save products to a personal wishlist and return to them when they are ready to buy.",
    acceptanceCriteria:
      "• A signed-in customer can save a product from its details page.\n• Saved products appear in the customer’s wishlist.\n• Saving the same product twice does not create duplicates.",
  },
  {
    sequence: 2,
    title: "Show delivery cost before checkout",
    itemType: "Story",
    priority: "HIGH",
    description:
      "Show an estimated delivery cost before the customer proceeds to payment.",
    acceptanceCriteria:
      "• Delivery cost is visible in the order summary.\n• Updating the address refreshes the estimate.",
    storyPoints: 5,
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
    acceptanceCriteria:
      "• The overview shows the customer’s saved name and email.\n• Empty optional fields are clearly indicated.",
  },
  {
    sequence: 2,
    title: "Make service requests easier to find",
    itemType: "Story",
  },
];

type PreviewStore = { items: BacklogItem[]; nextSequence: number };

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
        acceptanceCriteria: item.acceptanceCriteria ?? null,
        priority: item.priority ?? "MEDIUM",
        itemType: item.itemType ?? null,
        storyPoints: item.storyPoints ?? null,
        isSprintSized: false,
        orderIndex: index,
        createdAt: "2026-10-26T02:00:00.000Z",
        updatedAt: "2026-10-26T02:00:00.000Z",
      })),
    };
    stores.set(project.id, store);
  }
  return store;
}

export const previewBacklogRepository: BacklogRepository & {
  updateDescription(
    projectId: string,
    itemId: string,
    description: string,
  ): Promise<BacklogItem>;
} = {
  async updateDescription(projectId, itemId, description) {
    const project = requireProject(projectId);
    if (project.status !== "ACTIVE")
      throw new BacklogDataError("ARCHIVED", "This project is read-only.");
    if (project.scrumRole !== "Product Owner")
      throw new BacklogDataError(
        "FORBIDDEN",
        "Only the Product Owner can edit the description.",
      );
    if (typeof description !== "string")
      throw new BacklogDataError("VALIDATION", "Enter a valid description.");
    const store = getStore(project);
    const index = store.items.findIndex((item) => item.id === itemId);
    if (index === -1)
      throw new BacklogDataError("NOT_FOUND", "Item not found.");
    const item = {
      ...store.items[index],
      description: description.trim() || null,
      updatedAt: new Date().toISOString(),
    };
    store.items[index] = item;
    return { ...item };
  },
  async list(projectId) {
    const store = getStore(requireProject(projectId));
    return store.items
      .map((item) => ({ ...item }))
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
  },

  async get(projectId, itemId) {
    const item = getStore(requireProject(projectId)).items.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) throw new BacklogDataError("NOT_FOUND", "Item not found.");
    return { ...item };
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
      acceptanceCriteria: null,
      priority: "MEDIUM",
      itemType: null,
      storyPoints: null,
      isSprintSized: false,
      orderIndex:
        Math.max(-1, ...store.items.map((existing) => existing.orderIndex)) + 1,
      createdAt: now,
      updatedAt: now,
    };

    // Allocate once per create, independently of list position or sort order.
    initializePreviewBacklogMetadata(item, previewUser);
    store.items.push(item);
    store.nextSequence += 1;
    return { ...item };
  },
};
