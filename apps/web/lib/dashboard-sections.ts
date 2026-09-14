export const dashboardSections = [
  {
    id: "summary",
    label: "Summary",
    title: "Workspace summary",
    description: "Progress, deadlines and the work behind the numbers.",
    view: "dashboard",
  },
  {
    id: "attention",
    label: "Attention",
    title: "Attention",
    description:
      "Understand issues and choose the next action to resolve them.",
    view: "attention",
  },
  {
    id: "my-work",
    label: "My Work",
    title: "My Work",
    description: "Your assignments and next steps in this workspace.",
    view: "my-work",
  },
  {
    id: "planning",
    label: "Sprints",
    title: "Sprints",
    description: "Manage project goals, plans, cycles and delivery dates.",
    view: "planning",
  },
  {
    id: "ideas",
    label: "Plans and ideas",
    title: "Plans and ideas",
    description: "Invite input, explore ideas and discuss upcoming work.",
    view: "ideas",
  },
  {
    id: "teams",
    label: "Teams and people",
    title: "Teams and people",
    description: "Explore teams, manage membership and review workload.",
    view: "teams",
  },
  {
    id: "messages",
    label: "Messages",
    title: "Messages",
    description:
      "Keep team rooms, private conversations and follow-ups together.",
    view: "messages",
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Inbox",
    description: "Organize captured work and act on incoming requests.",
    view: "inbox",
  },
  {
    id: "decisions",
    label: "Decisions",
    title: "Decisions",
    description:
      "Review open choices and record an outcome with its reasoning.",
    view: "decisions",
  },
  {
    id: "approvals",
    label: "Approvals",
    title: "Approvals",
    description: "Review work and record accountable approval outcomes.",
    view: "approvals",
  },
  {
    id: "waiting",
    label: "Waiting",
    title: "Waiting and follow-ups",
    description:
      "Track what you are waiting for and agree on the next follow-up.",
    view: "waiting",
  },
] as const;

export type DashboardSection = (typeof dashboardSections)[number]["id"];

// Keep the shared Messages/Inbox metadata for other pages, while the Dashboard
// navigation focuses on work, people, and decisions.
export const dashboardNavigationSections = dashboardSections
  .filter((section) => section.id !== "messages" && section.id !== "inbox")
  .map((section) =>
    section.id === "planning"
      ? {
          ...section,
          label: "Sprints" as const,
          title: "Sprints",
          description:
            "Plan a sprint, follow its goal and move the team’s work forward.",
        }
      : section,
  );

export function dashboardSectionFromSearch(search: string): DashboardSection {
  const value = new URLSearchParams(search).get("section");
  return (
    dashboardNavigationSections.find((section) => section.id === value)?.id ??
    "summary"
  );
}

export function dashboardSectionUrl(
  current: string,
  section: DashboardSection,
) {
  const url = new URL(current);
  if (section === "summary") url.searchParams.delete("section");
  else url.searchParams.set("section", section);
  // Detail hashes belong to the panel that created them, not the next section.
  url.hash = "";
  return `${url.pathname}${url.search}`;
}
