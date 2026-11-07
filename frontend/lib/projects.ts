import type { PreviewProject } from "./preview-data";
import type {
  ProjectMember,
  ScrumAccountability,
} from "./preview-project-members";

import { request } from "./api";

/** A project as the backend returns it (docs/api/projects.md). */
export type ApiProject = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  ownerId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { fullName: string; email: string } | null;
  myRole: {
    accessRole: "OWNER" | "MEMBER";
    scrumAccountability: "PRODUCT_OWNER" | "SCRUM_MASTER" | "DEVELOPER" | null;
  };
};

const scrumRoleLabels = {
  PRODUCT_OWNER: "Product Owner",
  SCRUM_MASTER: "Scrum Master",
  DEVELOPER: "Developer",
} as const;

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Shapes a backend project like the sample projects the screens already render. */
export function toProject(api: ApiProject): PreviewProject {
  const ownerName = api.owner?.fullName ?? "Unknown";
  return {
    id: api.id,
    key: api.key,
    name: api.name,
    description: api.description ?? "",
    // Not part of the API contract; kept empty for the screens that still show it.
    productGoal: "",
    owner: {
      fullName: ownerName,
      email: api.owner?.email ?? "",
      initials: initialsOf(ownerName),
    },
    scrumRole: api.myRole.scrumAccountability
      ? scrumRoleLabels[api.myRole.scrumAccountability]
      : "None",
    accessRole: api.myRole.accessRole,
    initials: initialsOf(api.name),
    tone: api.key.charCodeAt(0) % 2 === 0 ? "blue" : "violet",
    status: api.status,
    archivedAt: api.archivedAt,
    updatedAt: api.updatedAt,
  };
}

/** `GET /api/projects`: the projects the signed-in user belongs to. */
export const listProjects = async () =>
  (await request<ApiProject[]>("GET", "/api/projects")).map(toProject);

/** `POST /api/projects`: creates the project; the caller becomes its Owner and Product Owner. */
export const createProject = async (input: {
  name: string;
  key: string;
  description: string;
}) =>
  toProject(
    await request<ApiProject>("POST", "/api/projects", {
      name: input.name.trim(),
      key: input.key.trim(),
      description: input.description.trim() || null,
    }),
  );

export const isApiProjectId = (id: string) => /^[0-9a-f]{24}$/i.test(id);

const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

type ProjectOverview = {
  project: ApiProject;
  memberCount: number;
  currentSprint: { id: string } | null;
};

export async function getProject(projectId: string) {
  const { project } = await request<ProjectOverview>(
    "GET",
    projectPath(projectId),
  );
  return toProject(project);
}

export async function updateProject(
  projectId: string,
  input: {
    name?: string;
    description?: string | null;
  },
) {
  return toProject(
    await request<ApiProject>("PATCH", projectPath(projectId), input),
  );
}

export async function archiveProject(projectId: string) {
  return toProject(
    await request<ApiProject>("POST", `${projectPath(projectId)}/archive`),
  );
}

export async function transferOwnership(projectId: string, newOwnerId: string) {
  return toProject(
    await request<ApiProject>(
      "POST",
      `${projectPath(projectId)}/ownership-transfer`,
      { newOwnerId },
    ),
  );
}

type ApiProjectMember = Omit<ProjectMember, "initials">;
const toMember = (member: ApiProjectMember): ProjectMember => ({
  ...member,
  initials: initialsOf(member.fullName),
});
const membersPath = (projectId: string) => projectPath(projectId) + "/members";
const memberPath = (projectId: string, membershipId: string) =>
  membersPath(projectId) + "/" + encodeURIComponent(membershipId);

export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  const members = await request<ApiProjectMember[]>(
    "GET",
    membersPath(projectId),
  );
  return members.map(toMember);
}

export async function inviteProjectMember(
  projectId: string,
  input: { email: string; scrumAccountability: ScrumAccountability },
) {
  return toMember(
    await request<ApiProjectMember>("POST", membersPath(projectId), input),
  );
}

export async function changeProjectMemberAccountability(
  projectId: string,
  membershipId: string,
  input: {
    scrumAccountability: ScrumAccountability;
    previousUserMembershipId?: string;
    previousUserNewAccountability?: ScrumAccountability;
  },
) {
  const members = await request<ApiProjectMember[]>(
    "PATCH",
    memberPath(projectId, membershipId) + "/scrum-accountability",
    input,
  );
  return members.map(toMember);
}

export const removeProjectMember = (projectId: string, membershipId: string) =>
  request<void>("DELETE", memberPath(projectId, membershipId));

export const leaveProject = (projectId: string) =>
  request<void>("POST", projectPath(projectId) + "/leave");
