import type { BacklogItem } from "./backlog-items";
import type { PreviewPerson } from "./preview-data";

import { BacklogDataError } from "./backlog-items";
import { getPreviewProject, previewUser } from "./preview-data";

export const previewBacklogMembers = [
  { id: "alex", ...previewUser },
  {
    id: "jordan",
    fullName: "Jordan Lee",
    email: "jordan@example.test",
    initials: "JL",
  },
  {
    id: "sam",
    fullName: "Sam Taylor",
    email: "sam@example.test",
    initials: "ST",
  },
];

export function previewBacklogSprints(projectId: string) {
  return [
    { id: `${projectId}-1`, name: "Sprint 1 — Foundation" },
    { id: `${projectId}-2`, name: "Sprint 2 — Core experience" },
  ];
}

export type PreviewBacklogMetadata = {
  createdBy: PreviewPerson | null;
  assigneeId: string | null;
  sprintId: string | null;
  startDate: string | null;
  dueDate: string | null;
};
export type PreviewMetadataChanges = Partial<
  Omit<PreviewBacklogMetadata, "createdBy">
>;
const metadata = new Map<string, PreviewBacklogMetadata>();
const seedCreators: Record<string, string> = {
  "COM-1": "jordan",
  "COM-2": "alex",
  "COM-3": "sam",
  "COM-4": "jordan",
  "ATL-1": "alex",
  "ATL-2": "sam",
};

function identity(item: BacklogItem) {
  return `${item.projectId}:${item.id}`;
}
function clone(value: PreviewBacklogMetadata): PreviewBacklogMetadata {
  return {
    ...value,
    createdBy: value.createdBy ? { ...value.createdBy } : null,
  };
}

export function initializePreviewBacklogMetadata(
  item: BacklogItem,
  creator?: PreviewPerson,
) {
  if (!metadata.has(identity(item))) {
    const person =
      creator ??
      previewBacklogMembers.find(
        (member) => member.id === seedCreators[item.key],
      );
    metadata.set(identity(item), {
      createdBy: person
        ? {
            fullName: person.fullName,
            email: person.email,
            initials: person.initials,
          }
        : null,
      assigneeId: null,
      sprintId: null,
      startDate: null,
      dueDate: null,
    });
  }
  return clone(metadata.get(identity(item))!);
}

export function getPreviewBacklogMetadata(item: BacklogItem) {
  return initializePreviewBacklogMetadata(item);
}

function validDate(value: string | null) {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function updatePreviewBacklogMetadata(
  item: BacklogItem,
  changes: PreviewMetadataChanges,
) {
  const project = getPreviewProject(item.projectId);
  if (!project) throw new BacklogDataError("NOT_FOUND", "Project not found.");
  if (project.status !== "ACTIVE")
    throw new BacklogDataError("ARCHIVED", "This project is read-only.");
  const allowed = ["assigneeId", "sprintId", "startDate", "dueDate"];
  if (Object.keys(changes).some((key) => !allowed.includes(key)))
    throw new BacklogDataError("VALIDATION", "Unsupported field.");
  const next = { ...getPreviewBacklogMetadata(item), ...changes };
  if (
    next.assigneeId !== null &&
    !previewBacklogMembers.some((member) => member.id === next.assigneeId)
  )
    throw new BacklogDataError("VALIDATION", "Choose a project member.");
  if (
    next.sprintId !== null &&
    !previewBacklogSprints(item.projectId).some(
      (sprint) => sprint.id === next.sprintId,
    )
  )
    throw new BacklogDataError("VALIDATION", "Choose a project sprint.");
  if (!validDate(next.startDate) || !validDate(next.dueDate))
    throw new BacklogDataError("VALIDATION", "Enter valid dates.");
  if (next.startDate && next.dueDate && next.startDate > next.dueDate)
    throw new BacklogDataError(
      "VALIDATION",
      "Due date must be on or after start date.",
    );
  metadata.set(identity(item), clone(next));
  return clone(next);
}
