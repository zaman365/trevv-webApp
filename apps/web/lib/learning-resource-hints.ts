/** Small hint metadata stays available before the full learning catalog is loaded. */
export interface LearningHint {
  id: string;
  title: string;
  summary: string;
}
export const learningHints: Readonly<Record<string, LearningHint>> = {
  "welcome-to-trevv": {
    id: "welcome-to-trevv",
    title: "Welcome to TREVV",
    summary:
      "A five-minute tour of the fictional-data technical preview and its core rhythm.",
  },
  navigation: {
    id: "navigation",
    title: "Find your way around",
    summary:
      "Understand the sidebar, top bar, mobile navigation, and page hierarchy.",
  },
  "quick-capture": {
    id: "quick-capture",
    title: "Capture something quickly",
    summary:
      "Add a browser-local sample task, note, idea, or link without breaking the preview flow.",
  },
  "keyboard-shortcuts": {
    id: "keyboard-shortcuts",
    title: "Useful keyboard shortcuts",
    summary:
      "Move through TREVV faster without memorizing a large command system.",
  },
  "mobile-workflow": {
    id: "mobile-workflow",
    title: "Use TREVV on mobile",
    summary:
      "Keep personal focus and capture close without shrinking the desktop UI.",
  },
  portfolios: {
    id: "portfolios",
    title: "Portfolios and responsibility",
    summary:
      "Group Workspaces into a useful management view without changing how teams execute.",
  },
  workspaces: {
    id: "workspaces",
    title: "Understand workspaces",
    summary:
      "Use one flexible Workspace for a business, client, product, project, or function.",
  },
  boards: {
    id: "boards",
    title: "Work with boards",
    summary:
      "Organize work in table or Kanban views without duplicating items.",
  },
  "work-items": {
    id: "work-items",
    title: "Choose the right work-item type",
    summary:
      "Distinguish tasks, decisions, approvals, milestones, ideas, and requests.",
  },
  "my-work": {
    id: "my-work",
    title: "Use My Work",
    summary: "See commitments assigned to you in the current Workspace.",
  },
  attention: {
    id: "attention",
    title: "Work the Attention queue",
    summary:
      "Respond to ranked operational signals without turning every update into an alert.",
  },
  inbox: {
    id: "inbox",
    title: "Actionable Inbox vs capture",
    summary:
      "Separate requests that need a response from notes you captured yourself.",
  },
  decisions: {
    id: "decisions",
    title: "Make and record a decision",
    summary:
      "Preview how an unresolved choice could become a durable outcome with context.",
  },
  approvals: {
    id: "approvals",
    title: "Review approvals",
    summary:
      "Preview an approval for a fictional version or a concrete change request.",
  },
  ideas: {
    id: "ideas",
    title: "Move an idea toward action",
    summary:
      "Keep raw insights separate from opportunities that deserve investment.",
  },
  waiting: {
    id: "waiting",
    title: "Manage the Waiting Center",
    summary:
      "Track dependencies that are owned elsewhere without losing follow-up responsibility.",
  },
  "team-pressure": {
    id: "team-pressure",
    title: "Read team pressure responsibly",
    summary: "Use workload signals to rebalance commitments, not rank people.",
  },
  "stakeholder-views": {
    id: "stakeholder-views",
    title: "Preview a stakeholder view",
    summary:
      "Explore how selected outcomes could be separated from internal operating detail.",
  },
  notifications: {
    id: "notifications",
    title: "Notifications are informational",
    summary:
      "Explore fictional activity without creating another queue that demands processing.",
  },
  dashboard: {
    id: "dashboard",
    title: "Read the Dashboard",
    summary:
      "Interpret fictional Workspace reporting without mistaking it for live data.",
  },
  "dashboard-status": {
    id: "dashboard-status",
    title: "Work by status",
    summary: "See how work is distributed across the workflow.",
  },
  "dashboard-ownership": {
    id: "dashboard-ownership",
    title: "Work by owner and Workspace area",
    summary:
      "Find where commitments are concentrated before load becomes a blocker.",
  },
  reviews: {
    id: "reviews",
    title: "Run review rituals",
    summary:
      "Turn recurring updates into snapshots, learning, and refreshed attention.",
  },
  blueprints: {
    id: "blueprints",
    title: "Use managed Blueprints",
    summary:
      "Apply reusable operating standards without overwriting local work.",
  },
  search: {
    id: "search",
    title: "Search the fictional demo corpus",
    summary:
      "Find sample work items, updates, people, and resources in the current Workspace.",
  },
  integrations: {
    id: "integrations",
    title: "Preview future integrations",
    summary:
      "Explore intended smart-link and picker behavior without connecting an account.",
  },
  security: {
    id: "security",
    title: "Preview future account security",
    summary: "Inspect disabled examples of safeguards and fictional sessions.",
  },
  "members-permissions": {
    id: "members-permissions",
    title: "Members, roles, and permissions",
    summary:
      "Preview an intended least-privilege role model with fictional people.",
  },
  "organization-settings": {
    id: "organization-settings",
    title: "Organization settings",
    summary:
      "Preview naming, URL, language, timezone, and week defaults locally.",
  },
  "import-export": {
    id: "import-export",
    title: "Preview sample import and export",
    summary:
      "Explore fictional mappings and download clearly labeled sample browser data.",
  },
  "audit-log": {
    id: "audit-log",
    title: "Review the fictional activity sample",
    summary:
      "Explore how administration, security, integration, and export activity could be presented.",
  },
};

export function getLearningHint(id: string): LearningHint | undefined {
  return learningHints[id];
}
