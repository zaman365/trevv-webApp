import { learningHints } from "./learning-resource-hints";

export const learningCategories = [
  "Getting started",
  "Structure & work",
  "Focus & decisions",
  "Collaboration",
  "Reporting & routines",
  "Administration",
] as const;

export type LearningCategory = (typeof learningCategories)[number];
export type LearningResourceType = "Guide" | "Tutorial" | "Tip";

export interface LearningResource {
  id: string;
  category: LearningCategory;
  type: LearningResourceType;
  title: string;
  summary: string;
  body: string;
  duration: string;
  route?: string;
  steps?: string[];
  tips?: string[];
  keywords: string[];
  featured?: boolean;
}

export const learningResources: LearningResource[] = [
  {
    ...learningHints["welcome-to-trevv"]!,
    category: "Getting started",
    type: "Tutorial",
    body: "This technical preview uses fictional sample data and browser-local changes. It demonstrates how TREVV separates the cumulative Portfolio overview from the Workspace where teams would operate.",
    duration: "5 min",
    route: "/app/portfolio",
    steps: [
      "Open Portfolio to see the cumulative picture across its Workspaces.",
      "Choose a Workspace, then review Attention for the signals that need your judgment there.",
      "Use My Work for owned commitments and Inbox for requests from others.",
      "Stay in that Workspace for its complete operating context.",
    ],
    tips: ["Use Quick capture whenever something should not be lost."],
    keywords: ["start", "tour", "basics", "home", "overview"],
    featured: true,
  },
  {
    ...learningHints["navigation"]!,
    category: "Getting started",
    type: "Guide",
    body: "Portfolio is a single top-level overview. After you choose a Workspace, the left sidebar groups its overview, personal queues, workflows, people, and system tools. On smaller screens, the most-used destinations move to the bottom navigation.",
    duration: "3 min",
    steps: [
      "Portfolio returns to the cumulative cross-workspace overview.",
      "Workspace contains operational views for the selected Workspace only.",
      "Work groups decisions, approvals, ideas, reviews, and dependencies.",
      "People and System contain team, Blueprints, learning, and settings.",
    ],
    tips: [
      "Press / from anywhere outside a text field to move directly to search.",
    ],
    keywords: ["sidebar", "navigation", "menu", "mobile", "topbar"],
  },
  {
    ...learningHints["quick-capture"]!,
    category: "Getting started",
    type: "Tutorial",
    body: "Quick capture is a browser-local sample inbox for your own thoughts. It stays separate from the fictional actionable Inbox and is not persisted or shared.",
    duration: "2 min",
    route: "/app/inbox",
    steps: [
      "Open Quick capture from the top bar or mobile action.",
      "Write the smallest useful description.",
      "Optionally choose a work type, Workspace, owner, or date.",
      "Capture now and refine it when you have context.",
    ],
    tips: ["A short verb-first title is easier to process later."],
    keywords: ["capture", "task", "note", "idea", "inbox"],
  },
  {
    ...learningHints["keyboard-shortcuts"]!,
    category: "Getting started",
    type: "Tip",
    body: "TREVV keeps shortcuts deliberately small. The visible key hints in the top bar are the authoritative list for the current screen.",
    duration: "1 min",
    steps: [
      "Use / for search.",
      "Use Q for Quick capture.",
      "Use Escape to close dialogs and side panels.",
    ],
    tips: ["Search shortcuts stay inactive while you are typing in a field."],
    keywords: ["keyboard", "shortcut", "command", "search", "escape"],
  },
  {
    ...learningHints["mobile-workflow"]!,
    category: "Getting started",
    type: "Guide",
    body: "The mobile layout prioritizes My Work, Quick capture, Inbox, Messages, and More. Portfolio and the full workspace navigation remain available from More. Dense tables become stacked cards and secondary navigation scrolls horizontally.",
    duration: "3 min",
    tips: [
      "Use mobile for capture and decisions; use desktop for bulk board configuration.",
    ],
    keywords: ["mobile", "phone", "responsive", "bottom navigation"],
  },
  {
    ...learningHints["portfolios"]!,
    category: "Structure & work",
    type: "Guide",
    body: "A Portfolio is a cumulative lens across related Workspaces. It gives permitted owners combined health, workload, and Attention signals, while every operational action remains inside its Workspace.",
    duration: "4 min",
    route: "/app/portfolio",
    tips: [
      "Create portfolios around responsibility or review rhythm, not just legal structure.",
    ],
    keywords: ["portfolio", "group", "rollup", "responsibility", "health"],
    featured: true,
  },
  {
    ...learningHints["workspaces"]!,
    category: "Structure & work",
    type: "Tutorial",
    body: "A Workspace holds the boards, people, updates, resources, decisions, and health of one responsibility. Its type can be a business, brand, client, product, department, or initiative.",
    duration: "5 min",
    route: "/app/portfolio",
    steps: [
      "Give the Workspace a clear outcome and owner.",
      "Choose the lifecycle stage that reflects its current reality.",
      "Add a small number of boards for distinct workflows.",
      "Keep the latest update and next milestone current.",
    ],
    keywords: ["workspace", "project", "business", "client", "product"],
  },
  {
    ...learningHints["boards"]!,
    category: "Structure & work",
    type: "Tutorial",
    body: "A board is a view and configuration around shared work items. Groups, statuses, owners, dates, and custom fields create the workflow; switching views does not create separate work.",
    duration: "6 min",
    steps: [
      "Choose a table for scanning many fields or Kanban for flow.",
      "Use groups for meaningful process sections, not extra hierarchy.",
      "Keep statuses few enough that each one has a clear meaning.",
      "Open the item panel for details, evidence, and discussion.",
    ],
    tips: ["If a status needs a paragraph to explain, simplify the workflow."],
    keywords: ["board", "kanban", "table", "group", "status", "view"],
    featured: true,
  },
  {
    ...learningHints["work-items"]!,
    category: "Structure & work",
    type: "Guide",
    body: "All work-item types share owners, status, dates, discussion, and evidence. The type changes the workflow emphasis: decisions need an outcome, approvals need a reviewer, and milestones describe a meaningful checkpoint.",
    duration: "4 min",
    tips: [
      "Use a decision when multiple viable paths exist—not for a routine task.",
    ],
    keywords: ["task", "decision", "approval", "milestone", "idea", "request"],
  },
  {
    ...learningHints["my-work"]!,
    category: "Structure & work",
    type: "Guide",
    body: "My Work is a Workspace-scoped ownership view. It groups your work by urgency and date so you can plan execution without visiting every board in that Workspace.",
    duration: "3 min",
    route: "/app/my-work",
    tips: ["Use Following for work you need to monitor but do not own."],
    keywords: ["my work", "assigned", "owner", "following", "due"],
  },
  {
    ...learningHints["attention"]!,
    category: "Focus & decisions",
    type: "Tutorial",
    body: "Attention combines evidence, urgency, impact, and your responsibility. A signal explains why it appeared and recommends a next move; resolving or dismissing it changes the queue, not the underlying evidence.",
    duration: "5 min",
    route: "/app/attention",
    steps: [
      "Start with Needs You and read the evidence behind the top signal.",
      "Open the dependency or work item when more context is required.",
      "Resolve when the issue is handled, snooze when timing is known, or dismiss with a reason.",
      "Use At Risk and Blocked to scan emerging pressure before it escalates.",
    ],
    tips: [
      "A small healthy Attention queue is a feature, not a productivity score.",
    ],
    keywords: ["attention", "signal", "risk", "blocked", "priority", "resolve"],
    featured: true,
  },
  {
    ...learningHints["inbox"]!,
    category: "Focus & decisions",
    type: "Guide",
    body: "Inbox is for communication that requires your response: mentions, approval requests, decision requests, and follow-ups. Personal Quick captures stay separate until you deliberately turn them into shared work.",
    duration: "3 min",
    route: "/app/inbox",
    tips: [
      "If no response is expected, it belongs in Notifications or personal capture—not Inbox.",
    ],
    keywords: ["inbox", "request", "mention", "capture", "response"],
  },
  {
    ...learningHints["decisions"]!,
    category: "Focus & decisions",
    type: "Tutorial",
    body: "The fictional Decision Center demonstrates how a decision could record its question, options, recommendation, evidence, owner, due date, and outcome. Changes stay in this browser and are not a durable team record.",
    duration: "6 min",
    route: "/app/decisions",
    steps: [
      "Write the decision as a clear question.",
      "List viable options and the trade-off each carries.",
      "Add a recommendation and the evidence behind it.",
      "Record the outcome and what changes next.",
    ],
    tips: [
      "Time-box reversible decisions; spend more care on irreversible ones.",
    ],
    keywords: ["decision", "option", "recommendation", "outcome", "evidence"],
  },
  {
    ...learningHints["approvals"]!,
    category: "Focus & decisions",
    type: "Guide",
    body: "This browser-local sample demonstrates how a future approval could connect a reviewer with an exact artifact. It does not create an auditable or shared approval record.",
    duration: "4 min",
    route: "/app/approvals",
    tips: ["Request changes with an observable acceptance condition."],
    keywords: ["approval", "review", "version", "artifact", "changes"],
  },
  {
    ...learningHints["ideas"]!,
    category: "Focus & decisions",
    type: "Guide",
    body: "Ideas and insights preserve learning before it becomes committed work. Promote an idea when there is enough evidence, relevance, and timing to justify a decision or experiment.",
    duration: "4 min",
    route: "/app/ideas",
    tips: [
      "Capture the source of an insight so future readers can judge its strength.",
    ],
    keywords: ["idea", "insight", "opportunity", "evidence", "experiment"],
  },
  {
    ...learningHints["waiting"]!,
    category: "Collaboration",
    type: "Tutorial",
    body: "Waiting states make blocked dependencies explicit. They record what is expected, who or what you are waiting on, the expected date, the follow-up owner, and the next follow-up.",
    duration: "5 min",
    route: "/app/waiting",
    steps: [
      "Choose the correct waiting relationship: you, team, or external party.",
      "Record the expected outcome rather than a vague status.",
      "Set both an expected date and a next follow-up date.",
      "Draft a focused sample nudge; nothing is sent. Resolve the browser-local preview only when the sample dependency is complete.",
    ],
    tips: [
      "The follow-up owner remains accountable even when someone else owns the response.",
    ],
    keywords: [
      "waiting",
      "dependency",
      "follow-up",
      "nudge",
      "external",
      "blocked",
    ],
    featured: true,
  },
  {
    ...learningHints["team-pressure"]!,
    category: "Collaboration",
    type: "Guide",
    body: "Team pressure combines urgent work, near-term dates, blockers, critical Workspace signals, and milestone ownership. It is a coordination signal and never a performance score.",
    duration: "4 min",
    route: "/app/teams",
    tips: ["Discuss constraints and trade-offs before moving ownership."],
    keywords: ["team", "pressure", "workload", "capacity", "owner"],
  },
  {
    ...learningHints["stakeholder-views"]!,
    category: "Collaboration",
    type: "Guide",
    body: "The stakeholder surface is a fictional preview. It does not enforce recipient permissions or create an externally shareable link.",
    duration: "4 min",
    tips: [
      "A future live version must enforce the minimum useful access and be verified as the recipient.",
    ],
    keywords: ["stakeholder", "share", "external", "permission", "view"],
  },
  {
    ...learningHints["notifications"]!,
    category: "Collaboration",
    type: "Tip",
    body: "These notifications are seeded examples. No worker delivers them and nothing is routed to another person or device.",
    duration: "1 min",
    route: "/app/notifications",
    keywords: ["notification", "activity", "inbox", "read"],
  },
  {
    ...learningHints["dashboard"]!,
    category: "Reporting & routines",
    type: "Tutorial",
    body: "Dashboard widgets are calculated from the same fictional sample work used throughout this browser preview. Downloads contain sample browser data and are not complete, permission-checked exports or audit records.",
    duration: "5 min",
    route: "/app/dashboard",
    steps: [
      "Confirm the Workspace you are reviewing.",
      "Switch between open work and all time.",
      "Read status and overdue first, then inspect ownership and board concentration.",
      "Download the sample scope for preview purposes only; it is not an audit trail.",
    ],
    tips: [
      "A chart is a prompt for investigation—not a substitute for the underlying work.",
    ],
    keywords: ["dashboard", "report", "chart", "status", "owner", "export"],
    featured: true,
  },
  {
    ...learningHints["dashboard-status"]!,
    category: "Reporting & routines",
    type: "Tip",
    body: "A growing Stuck segment needs intervention; a growing In review segment often means reviewer capacity is the constraint. Use the page scope to compare open work with historical completion.",
    duration: "2 min",
    keywords: ["dashboard", "status", "stuck", "review", "done"],
  },
  {
    ...learningHints["dashboard-ownership"]!,
    category: "Reporting & routines",
    type: "Tip",
    body: "Owner bars show the number of visible items assigned to each person. Workspace-area bars show where open work sits. Read both together before deciding whether to move ownership or reduce scope.",
    duration: "2 min",
    keywords: ["dashboard", "owner", "workspace", "load", "capacity"],
  },
  {
    ...learningHints["reviews"]!,
    category: "Reporting & routines",
    type: "Tutorial",
    body: "Daily, weekly, monthly, and quarterly rituals are shown as optional sample structures. Running one changes only this browser preview; it does not persist or refresh shared context.",
    duration: "6 min",
    route: "/app/reviews",
    tips: ["Disable a ritual if nobody uses its output to make a decision."],
    keywords: ["review", "ritual", "weekly", "snapshot", "cadence"],
  },
  {
    ...learningHints["blueprints"]!,
    category: "Reporting & routines",
    type: "Tutorial",
    body: "This fictional preview demonstrates how a Blueprint could define reusable board structure and preserve local overrides. Applying a sample diff changes only browser-local demo state.",
    duration: "6 min",
    route: "/app/blueprints",
    steps: [
      "Review the available version and affected instance.",
      "Select only the additions and configuration changes you want.",
      "Confirm that listed local overrides remain preserved.",
      "Apply the selection or detach the instance if it should evolve independently.",
    ],
    tips: [
      "Use Blueprints for standards that should improve across several Workspaces.",
    ],
    keywords: [
      "blueprint",
      "template",
      "version",
      "diff",
      "override",
      "detach",
    ],
    featured: true,
  },
  {
    ...learningHints["search"]!,
    category: "Reporting & routines",
    type: "Guide",
    body: "Search reads the fictional demo corpus. It illustrates intended scoped results but does not prove production tenant or permission enforcement.",
    duration: "3 min",
    route: "/app/search",
    tips: [
      "Two or three distinctive words usually work better than a full sentence.",
    ],
    keywords: ["search", "find", "result", "permission", "resource"],
  },
  {
    ...learningHints["integrations"]!,
    category: "Administration",
    type: "Guide",
    body: "No provider account, OAuth token, sync, webhook, or provider write is active. A future live integration must request only the scopes needed for its picker or sync and support verified revocation.",
    duration: "4 min",
    route: "/app/settings/integrations#integrations",
    tips: [
      "Do not enter provider credentials in this preview. Permission lists describe future intended behavior only.",
    ],
    keywords: [
      "integration",
      "google drive",
      "figma",
      "github",
      "canva",
      "oauth",
    ],
  },
  {
    ...learningHints["security"]!,
    category: "Administration",
    type: "Tutorial",
    body: "Authentication and account-security controls are unavailable in this technical preview. The sample switches and device rows do not protect an account, change a session, or revoke access.",
    duration: "4 min",
    route: "/app/settings/integrations#security",
    steps: [
      "Review the disabled two-step verification example.",
      "Inspect the fictional session rows.",
      "Note that session removal and recovery are unavailable.",
      "Do not treat this surface as an account-security status page.",
    ],
    keywords: ["security", "two factor", "session", "login", "account"],
  },
  {
    ...learningHints["members-permissions"]!,
    category: "Administration",
    type: "Guide",
    body: "The role descriptions show intended future behavior only. Changes in this browser do not create accounts, grant access, or enforce permissions.",
    duration: "5 min",
    route: "/app/settings/integrations#members",
    tips: ["Review admin and stakeholder access regularly."],
    keywords: ["member", "role", "permission", "owner", "admin", "stakeholder"],
  },
  {
    ...learningHints["organization-settings"]!,
    category: "Administration",
    type: "Guide",
    body: "Organization settings change only this browser-local fictional preview. They do not affect another member or a shared organization.",
    duration: "3 min",
    route: "/app/settings/integrations#organization",
    keywords: ["organization", "workspace", "timezone", "language", "url"],
  },
  {
    ...learningHints["import-export"]!,
    category: "Administration",
    type: "Tutorial",
    body: "No file is uploaded and no record is imported. The dry-run report and browser-generated downloads use fictional sample data; they are not complete, permission-checked, or recorded in a server audit log.",
    duration: "6 min",
    route: "/app/settings/import",
    steps: [
      "Choose the source preset.",
      "Review the preloaded fictional source-file example.",
      "Review field mappings and warnings.",
      "Preview the sample outcome; there is no import confirmation or write.",
    ],
    tips: ["Keep the dry-run report with the original source file."],
    keywords: ["import", "export", "csv", "json", "mapping", "backup"],
  },
  {
    ...learningHints["audit-log"]!,
    category: "Administration",
    type: "Guide",
    body: "This is a browser-local fictional activity list, not a complete or immutable audit log. Its sample download is not valid evidence of server activity.",
    duration: "3 min",
    route: "/app/settings/integrations#audit",
    keywords: ["audit", "activity", "security", "history", "export"],
  },
];

export const learningResourceById = new Map(
  learningResources.map((resource) => [resource.id, resource]),
);

export function getLearningResource(id: string): LearningResource | undefined {
  return learningResourceById.get(id);
}

export function searchLearningResources(
  query: string,
  category: LearningCategory | "All",
): LearningResource[] {
  const normalized = query.trim().toLocaleLowerCase();
  return learningResources.filter((resource) => {
    if (category !== "All" && resource.category !== category) return false;
    if (!normalized) return true;
    return `${resource.title} ${resource.summary} ${resource.body} ${resource.keywords.join(" ")}`
      .toLocaleLowerCase()
      .includes(normalized);
  });
}
