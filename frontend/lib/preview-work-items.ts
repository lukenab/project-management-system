import type { PreviewProject, PreviewPerson } from "./preview-data";
import type {
  CreateWorkItemInput,
  WorkItem,
  WorkItemRepository,
  WorkItemMember,
  UpdateWorkItemInput,
} from "./work-items";

import { previewAccountStatus } from "./preview-admin-users";
import { recordPreviewActivity } from "./preview-collaboration";
import {
  allPreviewProjects,
  getPreviewProject,
  previewUser,
} from "./preview-data";
import {
  assignPreviewSprint,
  previewSprintOptions,
  previewSprintRef,
} from "./preview-sprints";
import { SprintDataError } from "./sprints";
import {
  WorkItemDataError,
  isWorkItemAssignee,
  workItemStatusLabels,
} from "./work-items";

type SeedItem = {
  sequence: number;
  title: string;
  description?: string;
  priority?: WorkItem["priority"];
  workType?: WorkItem["workType"];
  status?: WorkItem["status"];
  sprintId?: string;
  assigneeId?: string;
  dueDate?: string;
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
  {
    sequence: 5,
    title: "Apply coupon codes at checkout",
    workType: "STORY",
    priority: "HIGH",
    description: "Customers can enter a coupon code and see the new total.",
    status: "IN_PROGRESS",
    sprintId: "com-sprint-2",
    assigneeId: "com-member-sam",
    dueDate: "2026-10-30",
  },
  {
    sequence: 6,
    title: "Send an order confirmation email",
    workType: "STORY",
    description: "Customers receive an email after a successful order.",
    status: "IN_PROGRESS",
    sprintId: "com-sprint-2",
    assigneeId: "com-member-priya",
  },
  {
    sequence: 7,
    title: "Fix duplicate coupon error",
    workType: "BUG",
    priority: "HIGH",
    description: "Applying the same coupon twice shows two error messages.",
    sprintId: "com-sprint-2",
    assigneeId: "com-member-sam",
    dueDate: "2026-11-01",
  },
  {
    sequence: 8,
    title: "Validate postal codes",
    description: "Reject postal codes that don't match the selected country.",
    status: "DONE",
    sprintId: "com-sprint-2",
    assigneeId: "com-member-sam",
  },
  {
    sequence: 9,
    title: "Add a delivery estimate to checkout",
    workType: "STORY",
    description: "Show the expected delivery date before payment.",
    status: "IN_PROGRESS",
    sprintId: "com-sprint-2",
    assigneeId: "com-member-sam",
  },
  {
    sequence: 10,
    title: "Show saved addresses at checkout",
    description: "Signed-in customers can pick a saved address.",
    status: "DONE",
    sprintId: "com-sprint-2",
    assigneeId: "com-member-priya",
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

const mobileItems: SeedItem[] = [
  {
    sequence: 1,
    title: "Let customers sign in on mobile",
    workType: "STORY",
    priority: "HIGH",
    description: "Customers can sign in to the mobile app with their account.",
    assigneeId: "mob-member-alex",
  },
  {
    sequence: 2,
    title: "Show order status notifications",
    workType: "STORY",
    assigneeId: "mob-member-alex",
  },
  {
    sequence: 3,
    title: "Fix blank screen after app update",
    workType: "BUG",
    status: "DONE",
    assigneeId: "mob-member-alex",
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
    {
      id: "com-member-priya",
      fullName: "Priya Nair",
      email: "priya@example.test",
      initials: "PN",
      scrumAccountability: "DEVELOPER",
    },
  ],
  "mobile-app": [
    {
      id: "mob-member-jordan",
      fullName: "Jordan Lee",
      email: "jordan@example.test",
      initials: "JL",
      scrumAccountability: "PRODUCT_OWNER",
    },
    {
      id: "mob-member-alex",
      fullName: "Alex Morgan",
      email: "alex@example.test",
      initials: "AM",
      scrumAccountability: "DEVELOPER",
    },
    {
      id: "mob-member-sam",
      fullName: "Sam Taylor",
      email: "sam@example.test",
      initials: "ST",
      scrumAccountability: "DEVELOPER",
    },
  ],
};

function membersFor(projectId: string): WorkItemMember[] {
  return (membershipSeeds[projectId] ?? [])
    .map(({ id, ...rest }) => ({
      membershipId: id,
      ...rest,
      accountStatus: previewAccountStatus(rest.email),
    }))
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
  "mobile-app:a00000000000000000000001": [
    {
      id: "f00000000000000000000001",
      title: "Build the sign-in form",
      assigneeId: "mob-member-alex",
      status: "IN_PROGRESS",
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
  "MOB-1": "jordan",
  "MOB-2": "jordan",
  "MOB-3": "sam",
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
    const seeds =
      project.id === "team-workspace"
        ? commerceItems
        : project.id === "customer-portal"
          ? atlasItems
          : project.id === "mobile-app"
            ? mobileItems
            : [];
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
      assigneeId: seed.assigneeId ?? null,
      startDate: null,
      dueDate: seed.dueDate ?? null,
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
    for (const item of items) recordCreated(item);
  }
  return store;
}
function personName(id: string) {
  return people[id]?.fullName ?? "Unknown member";
}
function recordCreated(item: StoredItem) {
  recordPreviewActivity({
    projectId: item.projectId,
    workItemId: item.id,
    parentId: item.parentId,
    action: "CREATED",
    summary: item.parentId
      ? `created subtask ${item.key}`
      : "created this item",
    actor: { id: item.createdBy, fullName: personName(item.createdBy) },
    occurredAt: item.createdAt,
  });
}
const priorityLabels = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
const workTypeLabels = { STORY: "Story", TASK: "Task", BUG: "Bug" };
/** Describes one saved field change; child changes name their key for the parent's history. */
function changeSummary(
  item: StoredItem,
  field: keyof UpdateWorkItemInput,
  before: unknown,
  after: unknown,
) {
  const of = item.parentId ? ` of ${item.key}` : "";
  switch (field) {
    case "status":
      return `changed status${of} from ${workItemStatusLabels[before as WorkItem["status"]]} to ${workItemStatusLabels[after as WorkItem["status"]]}`;
    case "priority":
      return `changed priority${of} from ${priorityLabels[before as keyof typeof priorityLabels]} to ${priorityLabels[after as keyof typeof priorityLabels]}`;
    case "workType":
      return `changed type${of} from ${workTypeLabels[before as keyof typeof workTypeLabels]} to ${workTypeLabels[after as keyof typeof workTypeLabels]}`;
    case "title":
      return `changed the title${of}`;
    case "description":
      return `changed the description${of}`;
    case "assigneeId": {
      if (!after) return `removed the assignee${of}`;
      const name = membersFor(item.projectId).find(
        (member) => member.membershipId === after,
      )?.fullName;
      return `assigned ${item.parentId ? `${item.key} ` : "this item "}to ${name ?? "a member"}`;
    }
    case "startDate":
      return after
        ? `set the start date${of} to ${after}`
        : `cleared the start date${of}`;
    case "dueDate":
      return after
        ? `set the due date${of} to ${after}`
        : `cleared the due date${of}`;
    default:
      return `updated ${String(field)}${of}`;
  }
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
  const previous = { ...item };
  Object.assign(item, changes, { updatedAt: now });
  for (const field of Object.keys(changes) as (keyof UpdateWorkItemInput)[]) {
    const before = previous[field as keyof StoredItem];
    const after = item[field as keyof StoredItem];
    if (before === after) continue;
    recordPreviewActivity({
      projectId,
      workItemId: item.id,
      parentId: item.parentId,
      action: `${field.toUpperCase()}_CHANGED`,
      summary: changeSummary(item, field, before, after),
      changes: [{ field, before, after }],
      occurredAt: now,
    });
  }
  return publicItem(item);
}

// Browser-memory preview only; refresh resets data. No server authorization is implemented here.
export function createPreviewWorkItem(
  projectId: string,
  input: CreateWorkItemInput,
  placement?: { sprintId: string; status: "TODO" | "IN_PROGRESS" },
) {
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
  if (placement) {
    const target = previewSprintOptions(projectId, null).find(
      (sprint) =>
        sprint.id === placement.sprintId && sprint.status === "ACTIVE",
    );
    if (!target || parentId !== null)
      throw new SprintDataError(
        "CONFLICT",
        "This Sprint is no longer available for new work items.",
      );
    item.sprintId = target.id;
    item.status = placement.status;
  }
  store.items.push(item);
  store.nextSequence++;
  recordCreated(item);
  return publicItem(item);
}

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
  async reorder(projectId, itemIds) {
    const project = writable(projectId);
    requireRole(project, "Product Owner");
    const store = storeFor(project);
    const itemsById = new Map(
      store.items
        .filter((item) => item.parentId === null && visible(store, item))
        .map((item) => [item.id, item]),
    );
    if (
      itemIds.length < 2 ||
      itemIds.length !== itemsById.size ||
      new Set(itemIds).size !== itemIds.length ||
      itemIds.some((id) => !itemsById.has(id))
    ) {
      throw new WorkItemDataError("VALIDATION", "The work item list changed.");
    }

    return itemIds.map((id, orderIndex) => {
      const item = itemsById.get(id)!;
      item.orderIndex = orderIndex;
      return publicItem(item);
    });
  },
  async get(projectId, itemId) {
    return publicItem(requireItem(projectId, itemId));
  },
  async create(projectId, input) {
    return createPreviewWorkItem(projectId, input);
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
    if (item.parentId)
      recordPreviewActivity({
        projectId,
        workItemId: item.id,
        parentId: item.parentId,
        action: "DELETED",
        summary: `deleted subtask ${item.key}`,
        occurredAt: now,
      });
  },
};

function assignmentsOf(project: PreviewProject, email: string) {
  const member = membersFor(project.id).find((entry) => entry.email === email);
  const store = storeFor(project);
  return store.items.filter(
    (item) =>
      visible(store, item) &&
      item.status !== "DONE" &&
      !!member &&
      item.assigneeId === member.membershipId,
  );
}
/** Unfinished work the signed-in preview user would release by leaving. */
export function previewUserAssignmentCounts(projectId: string) {
  const items = assignmentsOf(projectById(projectId), previewUser.email);
  return {
    workItems: items.filter((item) => item.parentId === null).length,
    subtasks: items.filter((item) => item.parentId !== null).length,
  };
}
export function clearPreviewUserAssignments(projectId: string) {
  const now = new Date().toISOString();
  for (const item of assignmentsOf(projectById(projectId), previewUser.email)) {
    const before = item.assigneeId;
    Object.assign(item, { assigneeId: null, updatedAt: now });
    recordPreviewActivity({
      projectId,
      workItemId: item.id,
      parentId: item.parentId,
      action: "ASSIGNEEID_CHANGED",
      summary: `left the project, so ${item.parentId ? item.key : "this item"} is now unassigned`,
      changes: [{ field: "assigneeId", before, after: null }],
      occurredAt: now,
    });
  }
}

/** A deleted account's unfinished work becomes unassigned in every project. */
export function clearPreviewAssignmentsFor(
  email: string,
  actor: { id: string; fullName: string },
) {
  const now = new Date().toISOString();
  for (const project of allPreviewProjects()) {
    for (const item of assignmentsOf(project, email)) {
      const before = item.assigneeId;
      Object.assign(item, { assigneeId: null, updatedAt: now });
      recordPreviewActivity({
        projectId: project.id,
        workItemId: item.id,
        parentId: item.parentId,
        action: "ASSIGNEEID_CHANGED",
        summary: `removed the assignee${item.parentId ? ` of ${item.key}` : ""} because their account was deleted`,
        actor,
        changes: [{ field: "assigneeId", before, after: null }],
        occurredAt: now,
      });
    }
  }
}

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
/** Developers, including suspended ones who still hold assigned work. */
export function previewWorkItemMembers(projectId: string) {
  return membersFor(projectId)
    .filter((member) => member.scrumAccountability === "DEVELOPER")
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
    const before = getItemSprintId(current);
    assignPreviewSprint(current, changes.sprintId ?? null);
    const after = getItemSprintId(current);
    if (before !== after) {
      const name = (id: string | null) =>
        id ? (previewSprintRef(item.projectId, id)?.name ?? "a Sprint") : "";
      recordPreviewActivity({
        projectId: item.projectId,
        workItemId: current.id,
        parentId: null,
        action: "SPRINT_CHANGED",
        summary: !after
          ? `removed this item from ${name(before)}`
          : before
            ? `moved this item from ${name(before)} to ${name(after)}`
            : `added this item to ${name(after)}`,
        changes: [{ field: "sprintId", before, after }],
      });
    }
  } else {
    const input: UpdateWorkItemInput = {};
    if ("assigneeId" in changes) input.assigneeId = changes.assigneeId;
    if ("startDate" in changes) input.startDate = changes.startDate;
    if ("dueDate" in changes) input.dueDate = changes.dueDate;
    updateItem(item.projectId, item.id, input);
  }
  return getPreviewWorkItemMetadata(item);
}
