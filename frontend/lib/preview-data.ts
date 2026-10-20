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

// Presentation only: menu visibility is not authorization.
export function isProjectOwner(project: PreviewProject) {
  return project.owner.email === previewUser.email;
}

export function getPreviewProject(id: string) {
  return previewProjects.find((project) => project.id === id);
}
