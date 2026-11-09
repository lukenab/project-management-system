import type { ReactNode } from "react";

import { ProjectsGuard } from "@/components/projects/ProjectsGuard";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <ProjectsGuard>{children}</ProjectsGuard>;
}
