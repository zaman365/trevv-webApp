import { dashboardSections } from "./dashboard-sections";
import type { WorkspaceView } from "./workspace-routes";

export const sectionCatalog = {
  ...Object.fromEntries(dashboardSections.map((entry) => [entry.id, entry])),
  "report-log": {
    id: "report-log",
    label: "Report & Log",
    title: "Report & Log",
    description: "Report progress, log work and time, and link results.",
  },
  people: {
    id: "people",
    label: "People",
    title: "People",
    description: "Find a teammate, see their work and start a conversation.",
  },
  reviews: {
    id: "reviews",
    label: "Weekly review",
    title: "Weekly review",
    description: "Review progress and publish an update for your workspace.",
  },
} as Record<
  string,
  { id: string; label: string; title: string; description: string }
>;

export const myWorkRelatedSections = [
  "decisions",
  "approvals",
  "waiting",
  "ideas",
  "report-log",
  "inbox",
  "attention",
] as const;

export const workspaceSectionGroups = {
  "my-work": ["my-work", ...myWorkRelatedSections],
  planning: [
    "planning",
    "report-log",
    "ideas",
    "my-work",
    "teams",
    "decisions",
  ],
  inbox: ["inbox", "my-work", "messages", "waiting"],
  attention: ["attention", "waiting", "decisions", "approvals", "reviews"],
  decisions: ["decisions", "approvals", "attention", "messages"],
  approvals: ["approvals", "decisions", "my-work", "messages"],
  waiting: ["waiting", "my-work", "messages", "attention"],
  ideas: ["ideas", "planning", "decisions", "teams"],
  people: ["people", "teams", "messages", "my-work"],
  teams: ["teams", "report-log", "people", "messages", "my-work", "planning"],
  messages: ["messages", "people", "teams", "inbox", "waiting"],
  reviews: [
    "reviews",
    "report-log",
    "attention",
    "my-work",
    "decisions",
    "approvals",
  ],
  calendar: ["calendar", "my-work", "planning", "waiting"],
  search: ["search", "my-work", "planning", "people"],
} as const satisfies Partial<
  Record<WorkspaceView | "people", readonly string[]>
>;
export type OrganizedWorkspacePage = keyof typeof workspaceSectionGroups;

export function sectionFromSearch(
  search: string,
  ids: readonly string[],
  fallback: string,
  parameter = "section",
) {
  const value = new URLSearchParams(search).get(parameter);
  return value && ids.includes(value) ? value : fallback;
}

export function pageSectionUrl(
  current: string,
  section: string,
  fallback: string,
  parameter = "section",
) {
  const url = new URL(current);
  if (section === fallback) url.searchParams.delete(parameter);
  else url.searchParams.set(parameter, section);
  url.hash = "";
  return `${url.pathname}${url.search}`;
}

export function portfolioWorkspaces<
  T extends { id: string; portfolioId: string; slug: string },
>(workspaces: readonly T[], portfolioId: string, requested: string) {
  const available = workspaces.filter(
    (workspace) => workspace.portfolioId === portfolioId,
  );
  return {
    available,
    selected:
      available.find((workspace) => workspace.slug === requested) ??
      available[0],
  };
}
