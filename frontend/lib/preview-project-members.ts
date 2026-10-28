import type { PreviewProject } from "./preview-data";

import { getPreviewProject, isProjectOwner, previewUser } from "./preview-data";

export const scrumRoles = {
  PRODUCT_OWNER: "Product Owner",
  SCRUM_MASTER: "Scrum Master",
  DEVELOPER: "Developer",
} as const;

export type ScrumAccountability = keyof typeof scrumRoles;
export type ProjectMember = {
  id: string;
  userId: string;
  projectId: string;
  fullName: string;
  email: string;
  initials: string;
  accessRole: "OWNER" | "MEMBER";
  scrumAccountability: ScrumAccountability | null;
  status: "ACTIVE";
  joinedAt: string;
};

export type ChangeAccountabilityInput = {
  scrumAccountability: ScrumAccountability;
  replaceCurrentProductOwner?: boolean;
  previousProductOwnerId?: string;
  previousProductOwnerNewAccountability?: "DEVELOPER" | "SCRUM_MASTER";
};

const accounts = [
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
  {
    id: "priya",
    fullName: "Priya Nair",
    email: "priya@example.test",
    initials: "PN",
  },
  {
    id: "taylor",
    fullName: "Taylor Chen",
    email: "taylor@example.test",
    initials: "TC",
  },
  {
    id: "morgan",
    fullName: "Morgan Reed",
    email: "morgan@example.test",
    initials: "MR",
  },
  {
    id: "jamie",
    fullName: "Jamie Park",
    email: "jamie@example.test",
    initials: "JP",
  },
];

// Session-only fixtures. These checks simulate responses, not server authorization.
const records = new Map<string, ProjectMember[]>();
const unfinishedSprintWork = new Set(["sam"]);

function projectForWrite(projectId: string) {
  const project = getPreviewProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.status !== "ACTIVE")
    throw new Error("This project is archived. Members are read-only.");
  if (!isProjectOwner(project))
    throw new Error("You don't have permission to manage project members.");
  return project;
}

function membersFor(project: PreviewProject) {
  if (!records.has(project.id)) {
    const members = accounts
      .slice(0, project.id.startsWith("preview-") ? 1 : 4)
      .map((account, index): ProjectMember => ({
        id: `${project.id}-${account.id}`,
        userId: account.id,
        projectId: project.id,
        fullName: account.fullName,
        email: account.email,
        initials: account.initials,
        accessRole: account.email === project.owner.email ? "OWNER" : "MEMBER",
        scrumAccountability: project.id.startsWith("preview-")
          ? null
          : account.id === "jordan"
            ? "PRODUCT_OWNER"
            : account.id === "priya"
              ? "SCRUM_MASTER"
              : "DEVELOPER",
        status: "ACTIVE",
        joinedAt: `2026-10-${21 + index}T09:00:00.000Z`,
      }));
    records.set(project.id, members);
  }
  return records.get(project.id)!;
}

function roleIsValid(role: string): role is ScrumAccountability {
  return Object.hasOwn(scrumRoles, role);
}

export function listPreviewProjectMembers(projectId: string) {
  const project = getPreviewProject(projectId);
  if (!project) throw new Error("Project not found.");
  return membersFor(project)
    .map((member) => ({ ...member }))
    .sort(
      (a, b) =>
        a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id),
    );
}

export function invitePreviewProjectMember(
  projectId: string,
  input: { email: string; scrumAccountability: ScrumAccountability },
) {
  const project = projectForWrite(projectId);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  if (!roleIsValid(input.scrumAccountability))
    throw new Error("Choose a Scrum role.");
  const members = membersFor(project);
  const account = accounts.find((candidate) => candidate.email === email);
  if (!account)
    throw new Error("No eligible account was found for this email address.");
  if (members.some((member) => member.email === email))
    throw new Error("This person is already a project member.");
  if (
    input.scrumAccountability === "PRODUCT_OWNER" &&
    members.some((member) => member.scrumAccountability === "PRODUCT_OWNER")
  )
    throw new Error(
      "This project already has a Product Owner. Choose another role, then change their Scrum role to replace the current Product Owner.",
    );
  members.push({
    id: `${projectId}-${account.id}`,
    userId: account.id,
    projectId,
    fullName: account.fullName,
    email: account.email,
    initials: account.initials,
    accessRole: "MEMBER",
    scrumAccountability: input.scrumAccountability,
    status: "ACTIVE",
    joinedAt: new Date().toISOString(),
  });
  return listPreviewProjectMembers(projectId);
}

export function changePreviewAccountability(
  projectId: string,
  membershipId: string,
  input: ChangeAccountabilityInput,
) {
  const members = membersFor(projectForWrite(projectId));
  const member = members.find((candidate) => candidate.id === membershipId);
  if (!member) throw new Error("This member is no longer available.");
  if (!roleIsValid(input.scrumAccountability))
    throw new Error("Choose a Scrum role.");
  if (
    member.scrumAccountability === "DEVELOPER" &&
    input.scrumAccountability !== "DEVELOPER" &&
    unfinishedSprintWork.has(member.userId)
  )
    throw new Error(
      "Clear or reassign this member's unfinished work before changing their Scrum role.",
    );
  const currentPO = members.find(
    (candidate) =>
      candidate.scrumAccountability === "PRODUCT_OWNER" &&
      candidate.id !== member.id,
  );
  if (input.scrumAccountability === "PRODUCT_OWNER" && currentPO) {
    if (
      !input.replaceCurrentProductOwner ||
      input.previousProductOwnerId !== currentPO.id
    )
      throw new Error(
        "The current Product Owner has changed. Close this dialog and try again.",
      );
    if (
      input.previousProductOwnerNewAccountability !== "DEVELOPER" &&
      input.previousProductOwnerNewAccountability !== "SCRUM_MASTER"
    )
      throw new Error("Choose a new Scrum role for the current Product Owner.");
    currentPO.scrumAccountability = input.previousProductOwnerNewAccountability;
  }
  member.scrumAccountability = input.scrumAccountability;
  return listPreviewProjectMembers(projectId);
}

export function removePreviewProjectMember(
  projectId: string,
  membershipId: string,
) {
  const members = membersFor(projectForWrite(projectId));
  const member = members.find((candidate) => candidate.id === membershipId);
  if (!member) throw new Error("This member is no longer available.");
  if (member.accessRole === "OWNER")
    throw new Error("The Project Owner cannot be removed.");
  if (unfinishedSprintWork.has(member.userId))
    throw new Error(
      "Clear or reassign this member's unfinished Sprint work before removing them.",
    );
  records.set(
    projectId,
    members.filter((candidate) => candidate.id !== membershipId),
  );
  return listPreviewProjectMembers(projectId);
}
