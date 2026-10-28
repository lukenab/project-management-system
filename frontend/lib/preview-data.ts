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
    owner: {
      fullName: "Jordan Lee",
      email: "jordan@example.test",
      initials: "JL",
    },
    scrumRole: "Product Owner",
    initials: "CP",
    tone: "violet",
    status: "ACTIVE",
  },
];

export function isProjectOwner(project: PreviewProject) {
  return project.owner.email === previewUser.email;
}

export function getPreviewProject(id: string) {
  const fixture = previewProjects.find((project) => project.id === id);
  if (fixture || typeof window === "undefined") return fixture;
  try {
    const stored: PreviewProject[] = JSON.parse(
      localStorage.getItem("pms-preview-projects-v1") ?? "[]",
    );
    return Array.isArray(stored)
      ? stored.find(
          (project) =>
            project.id === id &&
            project.id.startsWith("preview-") &&
            project.owner?.email === previewUser.email,
        )
      : undefined;
  } catch {
    return undefined;
  }
}
