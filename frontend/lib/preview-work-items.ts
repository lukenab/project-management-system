import type { PreviewProject, PreviewPerson } from "./preview-data";
import type {
  WorkItem,
  WorkItemRepository,
  WorkItemMember,
  UpdateWorkItemInput,
} from "./work-items";

import { getPreviewProject, previewUser } from "./preview-data";
import { assignPreviewSprint, previewSprintRef } from "./preview-sprints";
import { WorkItemDataError, isWorkItemAssignee } from "./work-items";

type SeedItem = {
  sequence: number;
  title: string;
  description?: string;
  priority?: WorkItem["priority"];
  workType?: WorkItem["workType"];
  status?: WorkItem["status"];
  sprintId?: string;
};

const commerceItems: SeedItem[] = [
  {
    sequence: 1,
    title: "Let customers save products for later",
    workType: "STORY",
    priority: "HIGH",
    description:
      "Customers can save products to a personal wishlist and return to them when they are ready to buy.",
    sprintId: "com-sprint-2",
  },
  {
    sequence: 2,
    title: "Show delivery cost before checkout",
    workType: "STORY",
    priority: "HIGH",
    description:
      "Show an estimated delivery cost before the customer proceeds to payment.",
    status: "DONE",
    sprintId: "com-sprint-2",
  },
  {
    sequence: 3,
    title: "Keep basket items after signing in",
    workType: "BUG",
    description:
      "Items added as a guest should still be available after signing in.",
    sprintId: "com-sprint-3",
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
    workType: "STORY",
    priority: "HIGH",
    description:
      "Customers can review their saved account information from the account overview.",
    sprintId: "atl-sprint-1",
  },
  {
    sequence: 2,
    title: "Make service requests easier to find",
    workType: "STORY",
  },
];

type MembershipSeed = {
  id: string;
  fullName: string;
  email: string;
  initials: string;
  scrumAccountability: WorkItemMember["scrumAccountability"];
};

// One Developer and one Scrum Master per project, so the assignee dropdown
// filter has something to exclude. Alex Morgan is the signed-in preview user.
const membershipSeeds: Record<string, MembershipSeed[]> = {
  "customer-portal": [
    {
      id: "atl-member-alex",
      fullName: "Alex Morgan",
      email: "alex@example.test",
      initials: "AM",
      scrumAccountability: "DEVELOPER",
    },
    {
      id: "atl-member-priya",
      fullName: "Priya Nair",
      email: "priya@example.test",
      initials: "PN",
      scrumAccountability: "DEVELOPER",
    },
    {
      id: "atl-member-jamie",
      fullName: "Jamie Chen",
      email: "jamie@example.test",
      initials: "JC",
      scrumAccountability: "SCRUM_MASTER",
    },
  ],
  "team-workspace": [
    {
      id: "com-member-jordan",
      fullName: "Jordan Lee",
      email: "jordan@example.test",
      initials: "JL",
      scrumAccountability: "SCRUM_MASTER",
    },
    {
      id: "com-member-alex",
      fullName: "Alex Morgan",
      email: "alex@example.test",
      initials: "AM",
      scrumAccountability: "PRODUCT_OWNER",
    },
    {
      id: "com-member-sam",
      fullName: "Sam Taylor",
      email: "sam@example.test",
      initials: "ST",
      scrumAccountability: "DEVELOPER",
    },
  ],
};

function membersFor(projectId: string): WorkItemMember[] {
  return (membershipSeeds[projectId] ?? [])
    .map(({ id, ...rest }) => ({ membershipId: id, ...rest }))
    .sort(
      (a, b) =>
        a.fullName.localeCompare(b.fullName) ||
        a.membershipId.localeCompare(b.membershipId),
    );
}

type SeedChild = {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  status: WorkItem["status"];
};

// Keyed by `${projectId}:${productBacklogItemId}`. ATL-1 covers all three
// statuses plus an unassigned entry; COM-1 exercises the read-only PO view.
const seedChildren: Record<string, SeedChild[]> = {
  "customer-portal:a00000000000000000000001": [
    {
      id: "d00000000000000000000001",
      title: "Draft onboarding checklist copy",
      description: "Write the step copy shown during first-time setup.",
      assigneeId: "atl-member-alex",
      status: "TODO",
    },
    {
      id: "d00000000000000000000002",
      title: "Wire account summary API call",
      assigneeId: "atl-member-priya",
      status: "IN_PROGRESS",
    },
    {
      id: "d00000000000000000000003",
      title: "Add loading skeleton to account page",
      assigneeId: "atl-member-alex",
      status: "DONE",
    },
    {
      id: "d00000000000000000000004",
      title: "Investigate intermittent session timeout",
      assigneeId: null,
      status: "TODO",
    },
  ],
  "team-workspace:c00000000000000000000001": [
    {
      id: "e00000000000000000000001",
      title: "Confirm shipping rate API contract",
      description: "Check the carrier response shape before building the UI.",
      assigneeId: "com-member-sam",
      status: "IN_PROGRESS",
    },
  ],
};

export type StoredItem = Omit<WorkItem, "sprint"> & {
  /** Only top-level items store a link; children inherit their parent's. */
  sprintId: string | null;
  deletedAt: string | null;
};
type Store = { items: StoredItem[]; nextSequence: number };
const stores = new Map<string, Store>();
const creators: Record<string, string> = {
  "COM-1": "jordan",
  "COM-2": "alex",
  "COM-3": "sam",
  "COM-4": "jordan",
  "ATL-1": "alex",
  "ATL-2": "sam",
};
const people: Record<string, PreviewPerson> = {
  alex: previewUser,
  jordan: {
    fullName: "Jordan Lee",
    email: "jordan@example.test",
    initials: "JL",
  },
  sam: { fullName: "Sam Taylor", email: "sam@example.test", initials: "ST" },
};

function projectById(projectId: string) {
  const project = getPreviewProject(projectId);
  if (!project) throw new WorkItemDataError("NOT_FOUND", "Project not found.");
  return project;
}
function writable(projectId: string) {
  const project = projectById(projectId);
  if (project.status !== "ACTIVE")
    throw new WorkItemDataError("ARCHIVED", "This project is read-only.");
  return project;
}
function requireRole(project: PreviewProject, role: string) {
  if (project.scrumRole !== role)
    throw new WorkItemDataError(
      "FORBIDDEN",
      `Only a ${role} can perform this action.`,
    );
}
function storeFor(project: PreviewProject): Store {
  let store = stores.get(project.id);
  if (!store) {
    const seeds = project.id === "team-workspace" ? commerceItems : atlasItems;
    const now = "2026-10-26T02:00:00.000Z";
    const items: StoredItem[] = seeds.map((seed, index) => ({
      id: `${project.key === "COM" ? "c" : "a"}${seed.sequence.toString(16).padStart(23, "0")}`,
      projectId: project.id,
      key: `${project.key}-${seed.sequence}`,
      parentId: null,
      title: seed.title,
      description: seed.description ?? null,
      workType: seed.workType ?? "TASK",
      status: seed.status ?? "TODO",
      sprintId: seed.sprintId ?? null,
      priority: seed.priority ?? "MEDIUM",
      assigneeId: null,
      startDate: null,
      dueDate: null,
      orderIndex: index,
      createdBy: creators[`${project.key}-${seed.sequence}`] ?? "alex",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    let nextSequence = Math.max(0, ...seeds.map((seed) => seed.sequence)) + 1;
    for (const root of [...items]) {
      for (const [index, seed] of (
        seedChildren[`${project.id}:${root.id}`] ?? []
      ).entries()) {
        items.push({
          id: seed.id,
          projectId: project.id,
          key: `${project.key}-${nextSequence++}`,
          parentId: root.id,
          title: seed.title,
          description: seed.description ?? null,
          workType: "TASK",
          status: seed.status,
          sprintId: null,
          priority: null,
          assigneeId: seed.assigneeId ?? null,
          startDate: null,
          dueDate: null,
          orderIndex: index,
          createdBy: "alex",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    store = { items, nextSequence };
    stores.set(project.id, store);
  }
  return store;
}
function visible(store: Store, item: StoredItem) {
  return (
    !item.deletedAt &&
    (item.parentId === null ||
      store.items.some(
        (parent) =>
          parent.id === item.parentId &&
          parent.parentId === null &&
          !parent.deletedAt,
      ))
  );
}
function requireItem(projectId: string, itemId: string) {
  const store = storeFor(projectById(projectId));
  const item = store.items.find(
    (item) => item.id === itemId && visible(store, item),
  );
  if (!item) throw new WorkItemDataError("NOT_FOUND", "Work item not found.");
  return item;
}
function getItemSprintId(item: StoredItem) {
  if (item.parentId === null) return item.sprintId;
  const store = stores.get(item.projectId);
  return (
    store?.items.find((parent) => parent.id === item.parentId)?.sprintId ?? null
  );
}
function publicItem(item: StoredItem): WorkItem {
  const { deletedAt, sprintId, ...fields } = item;
  void deletedAt;
  void sprintId;
  const linked = getItemSprintId(item);
  return {
    ...fields,
    sprint: linked ? previewSprintRef(item.projectId, linked) : null,
  };
}

/** Live top-level items as mutable records, for the Sprint preview adapter only. */
export function previewTopLevelItems(projectId: string) {
  const store = storeFor(projectById(projectId));
  return store.items.filter(
    (item) => item.parentId === null && visible(store, item),
  );
}
export { publicItem as previewPublicWorkItem };
function titleValue(value: unknown) {
  if (typeof value !== "string" || !value.trim())
    throw new WorkItemDataError("VALIDATION", "Enter a title.");
  return value.trim();
}
function textValue(value: unknown) {
  if (value !== null && typeof value !== "string")
    throw new WorkItemDataError("VALIDATION", "Enter valid text.");
  return typeof value === "string" ? value.trim() || null : null;
}
function assigneeValue(projectId: string, value: unknown) {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !membersFor(projectId).some(
      (member) => member.membershipId === value && isWorkItemAssignee(member),
    )
  )
    throw new WorkItemDataError(
      "VALIDATION",
      "Choose an active Developer in this project.",
    );
  return value;
}
function dateValue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new WorkItemDataError("VALIDATION", "Enter valid dates.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new WorkItemDataError("VALIDATION", "Enter valid dates.");
  return value;
}
function updateItem(
  projectId: string,
  itemId: string,
  input: UpdateWorkItemInput,
) {
  const project = writable(projectId);
  const item = requireItem(projectId, itemId);
  const allowed =
    item.parentId !== null
      ? project.scrumRole === "Developer"
        ? ["title", "description", "assigneeId", "status"]
        : []
      : project.scrumRole === "Product Owner"
        ? ["title", "description", "priority", "workType"]
        : project.scrumRole === "Developer"
          ? ["status", "assigneeId", "startDate", "dueDate"]
          : [];
  const fields = Object.keys(input);
  if (!fields.length)
    throw new WorkItemDataError("VALIDATION", "Choose a field to update.");
  if (fields.some((field) => !allowed.includes(field)))
    throw new WorkItemDataError("FORBIDDEN", "You cannot update these fields.");
  const changes: UpdateWorkItemInput = {};
  for (const field of fields) {
    const value = input[field as keyof UpdateWorkItemInput];
    if (field === "title") changes.title = titleValue(value);
    else if (field === "description") changes.description = textValue(value);
    else if (field === "assigneeId")
      changes.assigneeId = assigneeValue(projectId, value);
    else if (field === "startDate" || field === "dueDate")
      changes[field] = dateValue(value);
    else if (field === "workType") {
      if (!["STORY", "TASK", "BUG"].includes(value as string))
        throw new WorkItemDataError("VALIDATION", "Choose a valid work type.");
      changes.workType = value as WorkItem["workType"];
    } else if (field === "priority") {
      if (!["LOW", "MEDIUM", "HIGH"].includes(value as string))
        throw new WorkItemDataError("VALIDATION", "Choose a valid priority.");
      changes.priority = value as WorkItem["priority"];
    } else if (field === "status") {
      if (!["TODO", "IN_PROGRESS", "DONE"].includes(value as string))
        throw new WorkItemDataError("VALIDATION", "Choose a valid status.");
      changes.status = value as WorkItem["status"];
    }
  }
  const next = { ...item, ...changes };
  if (next.startDate && next.dueDate && next.startDate > next.dueDate)
    throw new WorkItemDataError(
      "VALIDATION",
      "Due date must be on or after start date.",
    );
  const now = new Date().toISOString();
  Object.assign(item, changes, { updatedAt: now });
  return publicItem(item);
}

// Browser-memory preview only; refresh resets data. No server authorization is implemented here.
export const previewWorkItemRepository: WorkItemRepository = {
  async list(projectId, filter = { parentId: null }) {
    const project = projectById(projectId);
    const store = storeFor(project);
    if (filter.parentId !== null) {
      const parent = requireItem(projectId, filter.parentId);
      if (parent.parentId !== null)
        throw new WorkItemDataError(
          "VALIDATION",
          "Subtasks cannot have children.",
        );
    }
    return store.items
      .filter(
        (item) => visible(store, item) && item.parentId === filter.parentId,
      )
      .map(publicItem)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
  },
  async listMembers(projectId) {
    projectById(projectId);
    return membersFor(projectId);
  },
  async get(projectId, itemId) {
    return publicItem(requireItem(projectId, itemId));
  },
  async create(projectId, input) {
    const project = writable(projectId);
    const parentId = input.parentId ?? null;
    const allowed =
      parentId !== null
        ? ["title", "description", "assigneeId", "parentId", "workType"]
        : ["title", "description", "priority", "workType", "parentId"];
    requireRole(project, parentId !== null ? "Developer" : "Product Owner");
    if (Object.keys(input).some((field) => !allowed.includes(field)))
      throw new WorkItemDataError("VALIDATION", "Unsupported field.");
    if (parentId !== null) {
      if (typeof parentId !== "string")
        throw new WorkItemDataError("VALIDATION", "Choose a valid parent.");
      const parent = requireItem(projectId, parentId);
      if (parent.parentId !== null)
        throw new WorkItemDataError(
          "VALIDATION",
          "Subtasks cannot have children.",
        );
    }
    const title = titleValue(input.title);
    const description =
      input.description === undefined ? null : textValue(input.description);
    const workType = input.workType === undefined ? "TASK" : input.workType;
    if (
      !["STORY", "TASK", "BUG"].includes(workType) ||
      (parentId !== null && workType !== "TASK")
    )
      throw new WorkItemDataError("VALIDATION", "Choose a valid work type.");
    const priority =
      parentId !== null
        ? null
        : input.priority === undefined
          ? "MEDIUM"
          : input.priority;
    if (
      parentId === null &&
      !["LOW", "MEDIUM", "HIGH"].includes(priority as string)
    )
      throw new WorkItemDataError("VALIDATION", "Choose a valid priority.");
    const assigneeId =
      parentId !== null
        ? assigneeValue(projectId, input.assigneeId ?? null)
        : null;
    const store = storeFor(project);
    const now = new Date().toISOString();
    const item: StoredItem = {
      id: crypto.randomUUID().replaceAll("-", "").slice(0, 24),
      projectId,
      key: `${project.key}-${store.nextSequence}`,
      parentId,
      title,
      description,
      workType,
      status: "TODO",
      assigneeId,
      priority,
      startDate: null,
      dueDate: null,
      orderIndex:
        Math.max(
          -1,
          ...store.items
            .filter((item) => item.parentId === parentId)
            .map((item) => item.orderIndex),
        ) + 1,
      sprintId: null,
      createdBy: "alex",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    store.items.push(item);
    store.nextSequence++;
    return publicItem(item);
  },
  async update(projectId, itemId, input) {
    return updateItem(projectId, itemId, input);
  },
  async remove(projectId, itemId) {
    const project = writable(projectId);
    const item = requireItem(projectId, itemId);
    requireRole(
      project,
      item.parentId === null ? "Product Owner" : "Developer",
    );
    const now = new Date().toISOString();
    Object.assign(item, { deletedAt: now, updatedAt: now });
  },
};

export type PreviewWorkItemMetadata = {
  createdBy: PreviewPerson | null;
  assigneeId: string | null;
  sprintId: string | null;
  startDate: string | null;
  dueDate: string | null;
};
export type PreviewMetadataChanges = Partial<
  Omit<PreviewWorkItemMetadata, "createdBy">
>;
export function previewWorkItemMembers(projectId: string) {
  return membersFor(projectId)
    .filter(isWorkItemAssignee)
    .map((member) => ({ id: member.membershipId, ...member }));
}
export function getPreviewWorkItemMetadata(
  item: WorkItem,
): PreviewWorkItemMetadata {
  const current = requireItem(item.projectId, item.id);
  const person = people[current.createdBy];
  return {
    createdBy: person ? { ...person } : null,
    assigneeId: current.assigneeId,
    sprintId: getItemSprintId(current),
    startDate: current.startDate,
    dueDate: current.dueDate,
  };
}
export function updatePreviewWorkItemMetadata(
  item: WorkItem,
  changes: PreviewMetadataChanges,
) {
  const project = writable(item.projectId);
  const current = requireItem(item.projectId, item.id);
  const fields = Object.keys(changes);
  if (
    !fields.length ||
    fields.some(
      (field) =>
        !["assigneeId", "sprintId", "startDate", "dueDate"].includes(field),
    )
  )
    throw new WorkItemDataError("VALIDATION", "Unsupported field.");
  if ("sprintId" in changes) {
    if (
      project.scrumRole !== "Product Owner" &&
      project.scrumRole !== "Developer"
    )
      throw new WorkItemDataError(
        "FORBIDDEN",
        "Only the Product Owner or a Developer can choose a Sprint.",
      );
    if (fields.length !== 1 || current.parentId !== null)
      throw new WorkItemDataError(
        "FORBIDDEN",
        "Select a Sprint on the top-level item only.",
      );
    assignPreviewSprint(current, changes.sprintId ?? null);
  } else {
    const input: UpdateWorkItemInput = {};
    if ("assigneeId" in changes) input.assigneeId = changes.assigneeId;
    if ("startDate" in changes) input.startDate = changes.startDate;
    if ("dueDate" in changes) input.dueDate = changes.dueDate;
    updateItem(item.projectId, item.id, input);
  }
  return getPreviewWorkItemMetadata(item);
}
