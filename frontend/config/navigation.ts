import {
  ChartNoAxesCombined,
  Columns3,
  LayoutDashboard,
  ListTodo,
  Repeat2,
  UsersRound,
} from "lucide-react";

export const projectNavigation = [
  { label: "Overview", segment: "", icon: LayoutDashboard, group: "project" },
  { label: "Members", segment: "members", icon: UsersRound, group: "project" },
  {
    label: "Product Backlog",
    segment: "backlog",
    icon: ListTodo,
    group: "planning",
  },
  { label: "Sprints", segment: "sprints", icon: Repeat2, group: "planning" },
  {
    label: "Sprint Board",
    segment: "board",
    icon: Columns3,
    group: "sprint-work",
  },
  {
    label: "Sprint Progress",
    segment: "progress",
    icon: ChartNoAxesCombined,
    group: "sprint-work",
  },
];

export function projectHref(id: string, segment = "") {
  return `/projects/${id}${segment ? `/${segment}` : ""}`;
}
