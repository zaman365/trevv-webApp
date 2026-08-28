import type { ProgressMode } from "./commercial";
import { demoPortfolios } from "./commercial-demo";

export type WorkspaceHealth = "on_track" | "watch" | "critical" | "parked";
export type LifecycleStage =
  | "idea"
  | "validate"
  | "build"
  | "launch"
  | "grow"
  | "operate"
  | "paused"
  | "archived";
export type WorkspaceType =
  | "business"
  | "brand"
  | "client"
  | "product"
  | "department"
  | "venture"
  | "initiative"
  | "investment"
  | "campaign"
  | "program"
  | "project"
  | "shared_function"
  /** @deprecated compatibility alias for pre-TREVV records */
  | "client_program"
  | "journey"
  | "other";
export type WorkItemType =
  "task" | "decision" | "approval" | "milestone" | "idea" | "request";
export type Priority = "urgent" | "high" | "normal" | "low" | "none";

export interface WorkspaceMetric {
  label: string;
  value: string;
  trend?: string | undefined;
}

export interface Workspace {
  id: string;
  portfolioId: string;
  slug: string;
  name: string;
  icon: string;
  accent: string;
  type: WorkspaceType;
  stage: LifecycleStage;
  health: WorkspaceHealth;
  healthNote: string;
  priority: string;
  lead: { name: string; initials: string; color: string };
  nextMilestone: { title: string; date: string };
  latestUpdate: { text: string; date: string };
  metrics: WorkspaceMetric[];
  progressMode?: ProgressMode;
}

export interface WorkItem {
  id: string;
  workspaceId: string;
  boardId: string;
  title: string;
  type: WorkItemType;
  priority: Priority;
  status: "not_started" | "working" | "blocked" | "review" | "done";
  dueDate?: string;
  assignee?: string;
  approvalState?: "pending" | "changes_requested" | "approved" | "rejected";
  decisionState?: "needed" | "analyzing" | "delegated" | "deferred" | "decided";
  /** Visual grouping inside a Board (§4). Ungrouped items fall to the end. */
  groupId?: string;
}

/**
 * A Group is the visual band inside a Board — the device that keeps a
 * forty-row board readable. Colour is per-group and carries no status
 * meaning; status stays on the item.
 */
export interface WorkItemGroup {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  category: string;
  description: string;
}

export interface PortfolioSignal {
  decisions: number;
  approvals: number;
  blocked: number;
  overdueMilestones: number;
  staleUpdates: number;
  unassignedUrgent: number;
}

export interface WorkspaceRollup {
  open: number;
  overdue: number;
  blocked: number;
  decisions: number;
  approvals: number;
  score: number;
}

const DAY = 86_400_000;

export function rollupWorkspace(
  workspace: Workspace,
  items: readonly WorkItem[],
  now = new Date(),
): WorkspaceRollup {
  const scoped = items.filter(
    (item) => item.workspaceId === workspace.id && item.status !== "done",
  );
  const overdue = scoped.filter(
    (item) => item.dueDate && new Date(item.dueDate).getTime() < now.getTime(),
  ).length;
  const blocked = scoped.filter((item) => item.status === "blocked").length;
  const decisions = scoped.filter(
    (item) => item.type === "decision" && item.decisionState !== "decided",
  ).length;
  const approvals = scoped.filter(
    (item) => item.type === "approval" && item.approvalState === "pending",
  ).length;
  const healthWeight: Record<WorkspaceHealth, number> = {
    critical: 40,
    watch: 22,
    on_track: 4,
    parked: 0,
  };
  return {
    open: scoped.length,
    overdue,
    blocked,
    decisions,
    approvals,
    score:
      healthWeight[workspace.health] +
      overdue * 6 +
      blocked * 8 +
      decisions * 5 +
      approvals * 4,
  };
}

export function portfolioSignals(
  workspaces: readonly Workspace[],
  items: readonly WorkItem[],
  now = new Date(),
): PortfolioSignal {
  return {
    decisions: items.filter(
      (item) =>
        item.status !== "done" &&
        item.type === "decision" &&
        item.decisionState !== "decided",
    ).length,
    approvals: items.filter(
      (item) =>
        item.status !== "done" &&
        item.type === "approval" &&
        item.approvalState === "pending",
    ).length,
    blocked: items.filter((item) => item.status === "blocked").length,
    overdueMilestones: items.filter(
      (item) =>
        item.status !== "done" &&
        item.type === "milestone" &&
        item.dueDate &&
        new Date(item.dueDate).getTime() < now.getTime(),
    ).length,
    staleUpdates: workspaces.filter(
      (workspace) =>
        now.getTime() - new Date(workspace.latestUpdate.date).getTime() >
        7 * DAY,
    ).length,
    unassignedUrgent: items.filter(
      (item) =>
        item.status !== "done" &&
        !item.assignee &&
        ["urgent", "high"].includes(item.priority),
    ).length,
  };
}

const currentDemoWorkspaces: Workspace[] = [
  {
    id: "workspace-northstar",
    portfolioId: "portfolio-demo",
    slug: "northstar-apparel",
    name: "Northstar Apparel",
    icon: "N",
    accent: "#6456d8",
    type: "brand",
    progressMode: "milestone_completion",
    stage: "grow",
    health: "critical",
    healthNote:
      "Launch assets and GPSR evidence are converging on the same deadline.",
    priority: "Unlock SS26 product launch",
    lead: { name: "Mohammed Zaman", initials: "MZ", color: "#352f75" },
    nextMilestone: { title: "SS26 storefront launch", date: "2026-08-28" },
    latestUpdate: {
      text: "Polo photography landed. Packaging copy still needs legal approval before print.",
      date: "2026-08-23",
    },
    metrics: [
      { label: "Launch readiness", value: "68%", trend: "+9%" },
      { label: "Products ready", value: "14/22" },
    ],
  },
  {
    id: "workspace-mealflow",
    portfolioId: "portfolio-demo",
    slug: "mealflow",
    name: "MealFlow",
    icon: "M",
    accent: "#e05f4f",
    type: "product",
    progressMode: "weighted_work_items",
    stage: "build",
    health: "watch",
    healthNote:
      "Restaurant onboarding flow is waiting on two product decisions.",
    priority: "Validate restaurant dashboard beta",
    lead: { name: "Nora Klein", initials: "NK", color: "#8d392f" },
    nextMilestone: { title: "Pilot restaurant onboarding", date: "2026-09-03" },
    latestUpdate: {
      text: "The customer ordering prototype passed five usability sessions; owner controls need simplification.",
      date: "2026-08-22",
    },
    metrics: [
      { label: "Pilot venues", value: "3/5" },
      { label: "UX tasks", value: "11", trend: "-4" },
    ],
  },
  {
    id: "workspace-localreach",
    portfolioId: "portfolio-demo",
    slug: "localreach",
    name: "LocalReach",
    icon: "L",
    accent: "#17846b",
    type: "client",
    stage: "operate",
    health: "on_track",
    healthNote: "Delivery capacity and client response times are healthy.",
    priority: "Standardize proof-of-delivery packs",
    lead: { name: "Elias Hart", initials: "EH", color: "#11604f" },
    nextMilestone: { title: "Service playbook v2", date: "2026-09-09" },
    latestUpdate: {
      text: "Three client fixes shipped with complete before/after evidence and follow-up dates.",
      date: "2026-08-24",
    },
    metrics: [
      { label: "Active fixes", value: "8" },
      { label: "On-time", value: "94%", trend: "+3%" },
    ],
  },
  {
    id: "workspace-studioops",
    portfolioId: "portfolio-demo",
    slug: "studioops",
    name: "StudioOps",
    icon: "S",
    accent: "#2b77b9",
    type: "business",
    stage: "validate",
    health: "watch",
    healthNote: "The recurring-care package needs a sharper value proposition.",
    priority: "Close two paid care pilots",
    lead: { name: "Jana Roth", initials: "JR", color: "#205989" },
    nextMilestone: { title: "Care package pilot", date: "2026-09-14" },
    latestUpdate: {
      text: "The launch package converted; recurring care objections are now documented for iteration.",
      date: "2026-08-19",
    },
    metrics: [
      { label: "Qualified leads", value: "12" },
      { label: "Pilot calls", value: "5" },
    ],
  },
  {
    id: "workspace-clientspark",
    portfolioId: "portfolio-demo",
    slug: "clientspark",
    name: "ClientSpark",
    icon: "μ",
    accent: "#1f8c94",
    type: "client",
    stage: "operate",
    health: "on_track",
    healthNote:
      "Triage queue and scheduled field work are within service targets.",
    priority: "Automate access-check intake",
    lead: { name: "Tim Bauer", initials: "TB", color: "#17646a" },
    nextMilestone: { title: "Intake form rollout", date: "2026-09-02" },
    latestUpdate: {
      text: "Oldest open request is under two days; the new intake checklist removed two repeat visits.",
      date: "2026-08-23",
    },
    metrics: [
      { label: "Open requests", value: "6" },
      { label: "First response", value: "1.4h" },
    ],
  },
  {
    id: "workspace-greentable",
    portfolioId: "portfolio-demo",
    slug: "greentable",
    name: "GreenTable",
    icon: "G",
    accent: "#c87b2b",
    type: "venture",
    stage: "validate",
    health: "critical",
    healthNote:
      "Pilot scope is expanding before the core service promise is proven.",
    priority: "Cut pilot to one measurable outcome",
    lead: { name: "Sofia Marin", initials: "SM", color: "#86501b" },
    nextMilestone: { title: "Pilot scope decision", date: "2026-08-21" },
    latestUpdate: {
      text: "Restaurant interviews confirm demand, but the delivery package still spans too many services.",
      date: "2026-08-12",
    },
    metrics: [
      { label: "Interviews", value: "18" },
      { label: "Paid pilots", value: "1/3" },
    ],
  },
  {
    id: "workspace-centralops",
    portfolioId: "portfolio-demo",
    slug: "centralops",
    name: "CentralOps",
    icon: "I",
    accent: "#505c73",
    type: "shared_function",
    stage: "operate",
    health: "watch",
    healthNote: "Quarterly legal evidence pack needs two owner confirmations.",
    priority: "Close Q3 compliance evidence",
    lead: { name: "Amira Demir", initials: "AD", color: "#3b4558" },
    nextMilestone: { title: "Q3 evidence review", date: "2026-08-31" },
    latestUpdate: {
      text: "Insurance and registry records are current; two supplier declarations remain open.",
      date: "2026-08-20",
    },
    metrics: [
      { label: "Evidence complete", value: "87%" },
      { label: "Open risks", value: "3" },
    ],
  },
  {
    id: "workspace-futuregoods",
    portfolioId: "portfolio-demo",
    slug: "futuregoods",
    name: "FutureGoods",
    icon: "B",
    accent: "#ad477c",
    type: "brand",
    stage: "idea",
    health: "parked",
    healthNote:
      "Intentionally parked until Northstar Apparel launch work is complete.",
    priority: "Preserve sizing research",
    lead: { name: "Mohammed Zaman", initials: "MZ", color: "#352f75" },
    nextMilestone: { title: "Revisit concept", date: "2026-10-15" },
    latestUpdate: {
      text: "Research notes and target-customer interviews are safely archived for the next review.",
      date: "2026-08-04",
    },
    metrics: [
      { label: "Interviews", value: "9" },
      { label: "Concepts", value: "3" },
    ],
  },
  {
    id: "workspace-personal",
    portfolioId: "portfolio-personal",
    slug: "personal-projects",
    name: "Personal Projects",
    icon: "F",
    accent: "#78623c",
    type: "journey",
    stage: "operate",
    health: "on_track",
    healthNote: "Funding and learning milestones are current.",
    priority: "Complete funding application narrative",
    lead: { name: "Mohammed Zaman", initials: "MZ", color: "#352f75" },
    nextMilestone: { title: "Submit application", date: "2026-09-06" },
    latestUpdate: {
      text: "Financial model is reviewed; the narrative now needs final proof points from Northstar Apparel and LocalReach.",
      date: "2026-08-21",
    },
    metrics: [
      { label: "Application", value: "72%" },
      { label: "Learning streak", value: "6 wk" },
    ],
  },
];

const originalWorkspaceIdentity = [
  ["workspace-northstar", "workspace-zehn", "zehn", "ZEHN", "Z"],
  [
    "workspace-mealflow",
    "workspace-leckereich",
    "leckereich",
    "Leckereich",
    "L",
  ],
  ["workspace-localreach", "workspace-marktfix", "marktfix", "MarktFix", "M"],
  ["workspace-studioops", "workspace-lokalfix", "lokalfix", "LokalFix", "L"],
  ["workspace-clientspark", "workspace-mikroit", "mikroit", "MikroIT", "μ"],
  [
    "workspace-greentable",
    "workspace-gastrofix",
    "gastrofix",
    "GastroFix",
    "G",
  ],
  [
    "workspace-centralops",
    "workspace-intelligentlab",
    "intelligentlab",
    "IntelligentLab",
    "I",
  ],
  ["workspace-futuregoods", "workspace-bigboyz", "bigboyz", "BigBoyz", "B"],
] as const;

const originalWorkspaceIdByCurrentId = new Map<string, string>(
  originalWorkspaceIdentity.map(([currentId, originalId]) => [
    currentId,
    originalId,
  ]),
);

const originalDemoWorkspaces: Workspace[] = originalWorkspaceIdentity.map(
  ([currentId, id, slug, name, icon]) => {
    const source = currentDemoWorkspaces.find(
      (workspace) => workspace.id === currentId,
    );
    if (!source) throw new Error(`Missing source Workspace ${currentId}`);
    return {
      ...source,
      id,
      portfolioId: "portfolio-original",
      slug,
      name,
      icon,
      healthNote: source.healthNote
        .replace("Northstar Apparel", "ZEHN")
        .replace("MealFlow", "Leckereich")
        .replace("LocalReach", "MarktFix"),
      latestUpdate: {
        ...source.latestUpdate,
        text: source.latestUpdate.text
          .replace("Northstar Apparel", "ZEHN")
          .replace("MealFlow", "Leckereich")
          .replace("LocalReach", "MarktFix"),
      },
    };
  },
);

export const demoWorkspaces: Workspace[] = [
  ...currentDemoWorkspaces,
  ...originalDemoWorkspaces,
];

const currentDemoItems: WorkItem[] = [
  {
    id: "i-1",
    workspaceId: "workspace-northstar",
    boardId: "b-northstar-launch",
    title: "Approve packaging compliance copy",
    type: "approval",
    priority: "urgent",
    status: "review",
    dueDate: "2026-08-26",
    assignee: "Mohammed Zaman",
    approvalState: "pending",
    groupId: "g-northstar-compliance",
  },
  {
    id: "i-2",
    workspaceId: "workspace-northstar",
    boardId: "b-northstar-launch",
    title: "Choose storefront launch offer",
    type: "decision",
    priority: "urgent",
    status: "working",
    dueDate: "2026-08-25",
    assignee: "Mohammed Zaman",
    decisionState: "needed",
    groupId: "g-northstar-launch",
  },
  {
    id: "i-3",
    workspaceId: "workspace-northstar",
    boardId: "b-northstar-launch",
    title: "Confirm GPSR manufacturer evidence",
    type: "task",
    priority: "high",
    status: "blocked",
    dueDate: "2026-08-22",
    assignee: "Amira Demir",
    groupId: "g-northstar-compliance",
  },
  {
    id: "i-4",
    workspaceId: "workspace-northstar",
    boardId: "b-northstar-launch",
    title: "SS26 storefront launch",
    type: "milestone",
    priority: "urgent",
    status: "working",
    dueDate: "2026-08-28",
    assignee: "Nora Klein",
    groupId: "g-northstar-launch",
  },
  {
    id: "i-5",
    workspaceId: "workspace-northstar",
    boardId: "b-northstar-launch",
    title: "Publish polo fit guide",
    type: "task",
    priority: "normal",
    status: "working",
    dueDate: "2026-08-27",
    assignee: "Elias Hart",
    groupId: "g-northstar-launch",
  },
  {
    id: "i-6",
    workspaceId: "workspace-mealflow",
    boardId: "b-mealflow-beta",
    title: "Select onboarding navigation",
    type: "decision",
    priority: "high",
    status: "review",
    dueDate: "2026-08-26",
    assignee: "Mohammed Zaman",
    decisionState: "needed",
    groupId: "g-mealflow-onboarding",
  },
  {
    id: "i-7",
    workspaceId: "workspace-mealflow",
    boardId: "b-mealflow-beta",
    title: "Restaurant owner dashboard review",
    type: "approval",
    priority: "high",
    status: "review",
    dueDate: "2026-08-27",
    assignee: "Nora Klein",
    approvalState: "pending",
    groupId: "g-mealflow-onboarding",
  },
  {
    id: "i-8",
    workspaceId: "workspace-mealflow",
    boardId: "b-mealflow-beta",
    title: "Fix onboarding permissions",
    type: "task",
    priority: "urgent",
    status: "blocked",
    dueDate: "2026-08-23",
    assignee: "Tim Bauer",
    groupId: "g-mealflow-onboarding",
  },
  {
    id: "i-9",
    workspaceId: "workspace-localreach",
    boardId: "b-localreach-delivery",
    title: "Create proof pack checklist",
    type: "task",
    priority: "normal",
    status: "working",
    dueDate: "2026-08-29",
    assignee: "Elias Hart",
    groupId: "g-localreach-delivery",
  },
  {
    id: "i-10",
    workspaceId: "workspace-localreach",
    boardId: "b-localreach-delivery",
    title: "Client storefront repair",
    type: "task",
    priority: "high",
    status: "review",
    dueDate: "2026-08-25",
    assignee: "Jana Roth",
    groupId: "g-localreach-delivery",
  },
  {
    id: "i-11",
    workspaceId: "workspace-studioops",
    boardId: "b-studioops-pilot",
    title: "Name recurring care tiers",
    type: "decision",
    priority: "high",
    status: "working",
    dueDate: "2026-08-28",
    decisionState: "needed",
    groupId: "g-studioops-pilot",
  },
  {
    id: "i-12",
    workspaceId: "workspace-studioops",
    boardId: "b-studioops-pilot",
    title: "Pilot proposal follow-up",
    type: "task",
    priority: "high",
    status: "working",
    dueDate: "2026-08-26",
    groupId: "g-studioops-pilot",
  },
  {
    id: "i-13",
    workspaceId: "workspace-clientspark",
    boardId: "b-clientspark-requests",
    title: "Validate secure access checklist",
    type: "task",
    priority: "normal",
    status: "review",
    dueDate: "2026-08-30",
    assignee: "Tim Bauer",
  },
  {
    id: "i-14",
    workspaceId: "workspace-greentable",
    boardId: "b-greentable-validation",
    title: "Choose single pilot outcome",
    type: "decision",
    priority: "urgent",
    status: "blocked",
    dueDate: "2026-08-20",
    assignee: "Mohammed Zaman",
    decisionState: "needed",
    groupId: "g-greentable-validation",
  },
  {
    id: "i-15",
    workspaceId: "workspace-greentable",
    boardId: "b-greentable-validation",
    title: "Pilot scope approved",
    type: "milestone",
    priority: "urgent",
    status: "working",
    dueDate: "2026-08-21",
    assignee: "Sofia Marin",
    groupId: "g-greentable-validation",
  },
  {
    id: "i-16",
    workspaceId: "workspace-centralops",
    boardId: "b-centralops-compliance",
    title: "Approve supplier declaration pack",
    type: "approval",
    priority: "high",
    status: "review",
    dueDate: "2026-08-25",
    assignee: "Mohammed Zaman",
    approvalState: "pending",
    groupId: "g-centralops-compliance",
  },
  {
    id: "i-17",
    workspaceId: "workspace-centralops",
    boardId: "b-centralops-compliance",
    title: "Collect marketplace evidence",
    type: "task",
    priority: "high",
    status: "blocked",
    dueDate: "2026-08-22",
    assignee: "Amira Demir",
    groupId: "g-centralops-compliance",
  },
  {
    id: "i-18",
    workspaceId: "workspace-personal",
    boardId: "b-personal-funding",
    title: "Write traction evidence",
    type: "task",
    priority: "normal",
    status: "working",
    dueDate: "2026-08-30",
    assignee: "Mohammed Zaman",
  },
  {
    id: "i-19",
    workspaceId: "workspace-localreach",
    boardId: "b-localreach-delivery",
    title: "Choose pilot packaging model",
    type: "decision",
    priority: "normal",
    status: "done",
    dueDate: "2026-07-31",
    assignee: "Mohammed Zaman",
    decisionState: "decided",
    groupId: "g-localreach-delivery",
  },
];

const originalDemoItems: WorkItem[] = currentDemoItems.flatMap((item) => {
  const originalWorkspaceId = originalWorkspaceIdByCurrentId.get(
    item.workspaceId,
  );
  if (!originalWorkspaceId) return [];
  return [
    {
      ...item,
      id: `original-${item.id}`,
      workspaceId: originalWorkspaceId,
      boardId: `original-${item.boardId}`,
    },
  ];
});

export const demoItems: WorkItem[] = [
  ...currentDemoItems,
  ...originalDemoItems,
];

const currentBoardDefinitions: Board[] = [
  {
    id: "b-northstar-launch",
    workspaceId: "workspace-northstar",
    name: "SS26 launch board",
    category: "Product launch",
    description: "Products, compliance, content and storefront readiness",
  },
  {
    id: "b-mealflow-beta",
    workspaceId: "workspace-mealflow",
    name: "Restaurant beta board",
    category: "Product beta",
    description: "Onboarding, owner controls and pilot validation",
  },
  {
    id: "b-localreach-delivery",
    workspaceId: "workspace-localreach",
    name: "Delivery operations board",
    category: "Client delivery",
    description: "Active fixes, evidence packs and client approvals",
  },
  {
    id: "b-studioops-pilot",
    workspaceId: "workspace-studioops",
    name: "Care pilot board",
    category: "Business validation",
    description: "Offers, pilot calls and recurring-care evidence",
  },
  {
    id: "b-clientspark-requests",
    workspaceId: "workspace-clientspark",
    name: "Service requests board",
    category: "Client operations",
    description: "Intake, triage and service-delivery follow-through",
  },
  {
    id: "b-greentable-validation",
    workspaceId: "workspace-greentable",
    name: "Pilot validation board",
    category: "Venture validation",
    description: "Scope decisions, interviews and measurable pilot outcomes",
  },
  {
    id: "b-centralops-compliance",
    workspaceId: "workspace-centralops",
    name: "Compliance operations board",
    category: "Shared operations",
    description: "Evidence, declarations and quarterly compliance review",
  },
  {
    id: "b-futuregoods-research",
    workspaceId: "workspace-futuregoods",
    name: "Concept research board",
    category: "Brand research",
    description: "Customer evidence, sizing research and concept decisions",
  },
  {
    id: "b-personal-funding",
    workspaceId: "workspace-personal",
    name: "Funding application board",
    category: "Personal projects",
    description: "Narrative, evidence and submission milestones",
  },
];

const originalBoardDefinitions: Board[] = originalWorkspaceIdentity.map(
  ([currentWorkspaceId, originalWorkspaceId]) => {
    const source = currentBoardDefinitions.find(
      (board) => board.workspaceId === currentWorkspaceId,
    );
    if (!source)
      throw new Error(`Missing source Board for ${currentWorkspaceId}`);
    return {
      ...source,
      id: `original-${source.id}`,
      workspaceId: originalWorkspaceId,
    };
  },
);

export const demoBoards: Board[] = [
  ...currentBoardDefinitions,
  ...originalBoardDefinitions,
];

export function portfolioById(portfolioId: string) {
  return demoPortfolios.find((portfolio) => portfolio.id === portfolioId);
}

export function workspacesForPortfolio(portfolioId: string): Workspace[] {
  return demoWorkspaces.filter(
    (workspace) => workspace.portfolioId === portfolioId,
  );
}

export function workspaceBySlug(slug: string): Workspace | undefined {
  return demoWorkspaces.find((workspace) => workspace.slug === slug);
}

export function boardsForWorkspace(workspaceId: string): Board[] {
  return demoBoards.filter((board) => board.workspaceId === workspaceId);
}

export function boardForWorkspace(
  workspaceId: string,
  boardId?: string,
): Board | undefined {
  return demoBoards.find(
    (board) =>
      board.workspaceId === workspaceId && (!boardId || board.id === boardId),
  );
}

/**
 * Seeded Groups. Every board gets a small set of bands so the table has
 * structure before a customer defines their own.
 */
export const demoWorkItemGroups: WorkItemGroup[] = [
  {
    id: "g-northstar-launch",
    boardId: "b-northstar-launch",
    name: "Launch critical",
    color: "#ad3148",
  },
  {
    id: "g-northstar-compliance",
    boardId: "b-northstar-launch",
    name: "Compliance",
    color: "#865006",
  },
  {
    id: "g-mealflow-onboarding",
    boardId: "b-mealflow-beta",
    name: "Onboarding",
    color: "#5b5bd6",
  },
  {
    id: "g-mealflow-feedback",
    boardId: "b-mealflow-beta",
    name: "Beta feedback",
    color: "#2873b9",
  },
  {
    id: "g-localreach-delivery",
    boardId: "b-localreach-delivery",
    name: "In delivery",
    color: "#146b50",
  },
  {
    id: "g-localreach-intake",
    boardId: "b-localreach-delivery",
    name: "Client intake",
    color: "#2873b9",
  },
  {
    id: "g-greentable-validation",
    boardId: "b-greentable-validation",
    name: "Pilot decisions",
    color: "#ad3148",
  },
  {
    id: "g-studioops-pilot",
    boardId: "b-studioops-pilot",
    name: "Pilot scope",
    color: "#5b5bd6",
  },
  {
    id: "g-centralops-compliance",
    boardId: "b-centralops-compliance",
    name: "Controls",
    color: "#865006",
  },
];

export function groupsForBoard(boardId: string): WorkItemGroup[] {
  return demoWorkItemGroups.filter((group) => group.boardId === boardId);
}

export function itemsForBoard(boardId: string): WorkItem[] {
  return demoItems.filter((item) => item.boardId === boardId);
}

export function itemsForWorkspace(workspaceId: string): WorkItem[] {
  return demoItems.filter((item) => item.workspaceId === workspaceId);
}

const statusCompletion: Record<WorkItem["status"], number> = {
  not_started: 0,
  blocked: 0.15,
  working: 0.5,
  review: 0.85,
  done: 1,
};

const priorityWeight: Record<WorkItem["priority"], number> = {
  urgent: 5,
  high: 3,
  normal: 2,
  low: 1,
  none: 1,
};

export function calculateWorkProgress(
  items: readonly WorkItem[],
  mode: ProgressMode = "task_completion",
): number | null {
  if (mode === "none" || mode === "manual") return null;
  const scoped =
    mode === "milestone_completion"
      ? items.filter((item) => item.type === "milestone")
      : items;
  if (scoped.length === 0) return null;
  const weighted = mode === "weighted_work_items";
  const possible = scoped.reduce(
    (total, item) => total + (weighted ? priorityWeight[item.priority] : 1),
    0,
  );
  const completed = scoped.reduce(
    (total, item) =>
      total +
      statusCompletion[item.status] *
        (weighted ? priorityWeight[item.priority] : 1),
    0,
  );
  return Math.round((completed / possible) * 100);
}

export function calculateWorkspaceProgress(
  workspace: Workspace,
): number | null {
  return calculateWorkProgress(
    itemsForWorkspace(workspace.id),
    workspace.progressMode ?? "task_completion",
  );
}

export function validateDemoRelationships(): string[] {
  const errors: string[] = [];
  const portfolioIds = new Set(demoPortfolios.map((portfolio) => portfolio.id));
  const workspaceIds = new Set(demoWorkspaces.map((workspace) => workspace.id));
  const boardIds = new Set(demoBoards.map((board) => board.id));
  const itemIds = new Set(demoItems.map((item) => item.id));
  if (portfolioIds.size !== demoPortfolios.length)
    errors.push("Portfolio IDs must be unique");
  if (workspaceIds.size !== demoWorkspaces.length)
    errors.push("Workspace IDs must be unique");
  if (
    new Set(demoWorkspaces.map((workspace) => workspace.slug)).size !==
    demoWorkspaces.length
  )
    errors.push("Workspace slugs must be unique");
  if (boardIds.size !== demoBoards.length)
    errors.push("Board IDs must be unique");
  if (itemIds.size !== demoItems.length) errors.push("Item IDs must be unique");
  for (const workspace of demoWorkspaces)
    if (!portfolioIds.has(workspace.portfolioId))
      errors.push(
        `Workspace ${workspace.id} references missing Portfolio ${workspace.portfolioId}`,
      );
    else if (!demoBoards.some((board) => board.workspaceId === workspace.id))
      errors.push(`Workspace ${workspace.id} has no Board`);
  for (const board of demoBoards)
    if (!workspaceIds.has(board.workspaceId))
      errors.push(
        `Board ${board.id} references missing Workspace ${board.workspaceId}`,
      );
  for (const item of demoItems) {
    const board = demoBoards.find((candidate) => candidate.id === item.boardId);
    if (!workspaceIds.has(item.workspaceId))
      errors.push(
        `Item ${item.id} references missing Workspace ${item.workspaceId}`,
      );
    if (!boardIds.has(item.boardId))
      errors.push(`Item ${item.id} references missing Board ${item.boardId}`);
    else if (board?.workspaceId !== item.workspaceId)
      errors.push(
        `Item ${item.id} does not belong to Board Workspace ${board?.workspaceId}`,
      );
  }
  return errors;
}

export * from "./commercial";
export * from "./commercial-demo";
