import type { Metadata } from "next";

import { CreateProject } from "@/components/projects/CreateProject";
export const metadata: Metadata = { title: "Create project" };
export default function CreateProjectPage() {
  return <CreateProject />;
}
