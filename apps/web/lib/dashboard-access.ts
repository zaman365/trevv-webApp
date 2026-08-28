import { demoHubs, demoPortfolios, type WorkItem } from "@founderhq/core";

export type DashboardViewLevel = "portfolio" | "project" | "team" | "personal";

export interface DashboardTeam {
  id: string;
  name: string;
  members: readonly string[];
}

export interface DashboardAccess {
  portfolioIds: readonly string[];
  projectIds: readonly string[];
  teamIds: readonly string[];
  personal: boolean;
}

export const CURRENT_DASHBOARD_USER = "Mohammed Zaman";

/**
 * Demo functional teams. In production these IDs and memberships come from the
 * organization directory; keeping them explicit here makes the reporting
 * scope deterministic and keeps access checks out of presentation code.
 */
export const DASHBOARD_TEAMS: readonly DashboardTeam[] = [
  {
    id: "marketing",
    name: "Marketing",
    members: ["Amira Demir", "Nora Klein", "Elias Hart"],
  },
  {
    id: "finance",
    name: "Finance",
    members: ["Mohammed Zaman", "Sofia Marin"],
  },
  {
    id: "operations",
    name: "Operations",
    members: ["Mohammed Zaman", "Tim Bauer", "Jana Roth"],
  },
] as const;

/**
 * The seeded owner can use every reporting altitude. Replace this object with
 * the server-authorized workspace policy when live identity is connected.
 */
export const DEMO_DASHBOARD_ACCESS: DashboardAccess = {
  portfolioIds: demoPortfolios.map((portfolio) => portfolio.id),
  projectIds: demoHubs.map((project) => project.id),
  teamIds: DASHBOARD_TEAMS.map((team) => team.id),
  personal: true,
};

export const DASHBOARD_LEVEL_ORDER: readonly DashboardViewLevel[] = [
  "portfolio",
  "project",
  "team",
  "personal",
];

export function dashboardLevelsForAccess(
  access: DashboardAccess,
): DashboardViewLevel[] {
  return DASHBOARD_LEVEL_ORDER.filter((level) => {
    if (level === "portfolio") return access.portfolioIds.length > 0;
    if (level === "project") return access.projectIds.length > 0;
    if (level === "team") return access.teamIds.length > 0;
    return access.personal;
  });
}

export function dashboardTeamsForAccess(
  access: DashboardAccess,
  teams: readonly DashboardTeam[] = DASHBOARD_TEAMS,
) {
  const allowed = new Set(access.teamIds);
  return teams.filter((team) => allowed.has(team.id));
}

export function filterItemsForDashboardView(
  items: readonly WorkItem[],
  level: DashboardViewLevel,
  targetId: string,
  teams: readonly DashboardTeam[] = DASHBOARD_TEAMS,
  currentUser = CURRENT_DASHBOARD_USER,
): WorkItem[] {
  if (level === "portfolio") return [...items];
  if (level === "project")
    return items.filter((item) => item.hubId === targetId);
  if (level === "team") {
    const members = new Set(
      teams.find((team) => team.id === targetId)?.members ?? [],
    );
    return items.filter((item) =>
      item.assignee ? members.has(item.assignee) : false,
    );
  }
  return items.filter((item) => item.assignee === currentUser);
}
