import { readProjectOverrides } from "./preview-project-storage";

export type PreviewPerson = {
  fullName: string;
  email: string;
  initials: string;
};

export type PreviewProject = {
  id: string;
  key: string;
  name: string;
  description: string;
  productGoal: string;
  owner: PreviewPerson;
  scrumRole: string;
  initials: string;
  tone: "blue" | "violet";
  status: "ACTIVE" | "ARCHIVED";
  archivedAt?: string | null;
  updatedAt?: string;
};

export const previewUser: PreviewPerson = {
  fullName: "Alex Morgan",
  email: "alex@example.test",
  initials: "AM",
};

export const previewProjects: PreviewProject[] = [
  {
    id: "customer-portal",
    key: "ATL",
    name: "Atlas Platform",
    description:
      "A unified platform for customer accounts, services, and support.",
    productGoal:
      "Give customers one place to manage their accounts and access services.",
    owner: previewUser,
    scrumRole: "Developer",
    initials: "AP",
    tone: "blue",
    status: "ACTIVE",
  },
  {
    id: "team-workspace",
    key: "COM",
    name: "Commerce Platform",
    description:
      "An online commerce experience spanning product discovery, checkout, and orders.",
    productGoal:
      "Help customers find products, complete purchases, and track their orders.",
    owner: previewUser,
    scrumRole: "Product Owner",
    initials: "CP",
    tone: "violet",
    status: "ACTIVE",
  },
];

export function isProjectOwner(project: PreviewProject) {
  return project.owner.email === previewUser.email;
}

export function getPreviewProjects() {
  let created: PreviewProject[] = [];
  if (typeof window !== "undefined") {
    try {
      const stored = JSON.parse(
        localStorage.getItem("pms-preview-projects-v1") ?? "[]",
      );
      if (Array.isArray(stored))
        created = stored.filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            p.id.startsWith("preview-") &&
            typeof p.name === "string" &&
            typeof p.key === "string" &&
            typeof p.description === "string" &&
            typeof p.owner?.email === "string",
        );
    } catch {
      /* Keep the fixture directory when browser storage is unavailable. */
    }
  }
  const overrides = readProjectOverrides();
  return [...previewProjects, ...created].map(
    (project) => overrides[project.id]?.project ?? project,
  );
}
export function getPreviewProject(id: string) {
  return getPreviewProjects().find((project) => project.id === id);
}
