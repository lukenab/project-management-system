import {
  ChartNoAxesCombined,
  Columns3,
  LayoutDashboard,
  Rows3,
  UsersRound,
} from "lucide-react";

import { SprintIcon } from "@/components/icons/SprintIcon";

export const projectNavigation = [
  { label: "Overview", segment: "", icon: LayoutDashboard, group: "project" },
  { label: "Members", segment: "members", icon: UsersRound, group: "project" },
  {
    label: "Work Items",
    segment: "backlog",
    icon: Rows3,
    group: "planning",
  },
  { label: "Sprints", segment: "sprints", icon: SprintIcon, group: "planning" },
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
