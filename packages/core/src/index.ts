export type HubHealth = "on_track" | "watch" | "critical" | "parked";
export type LifecycleStage =
  | "idea"
  | "validate"
  | "build"
  | "launch"
  | "grow"
  | "operate"
  | "paused"
  | "archived";
export type HubType =
  | "venture"
  | "brand"
  | "product"
  | "shared_function"
  | "client_program"
  | "journey"
  | "other";
export type WorkItemType =
  "task" | "decision" | "approval" | "milestone" | "idea" | "request";
export type Priority = "urgent" | "high" | "normal" | "low" | "none";

export interface HubMetric {
  label: string;
  value: string;
  trend?: string | undefined;
}

export interface Hub {
  id: string;
  slug: string;
  name: string;
  icon: string;
  accent: string;
  type: HubType;
  stage: LifecycleStage;
  health: HubHealth;
  healthNote: string;
  priority: string;
  lead: { name: string; initials: string; color: string };
  nextMilestone: { title: string; date: string };
  latestUpdate: { text: string; date: string };
  metrics: HubMetric[];
}

export interface WorkItem {
  id: string;
  hubId: string;
  boardId: string;
  title: string;
  type: WorkItemType;
  priority: Priority;
  status: "not_started" | "working" | "blocked" | "review" | "done";
  dueDate?: string;
  assignee?: string;
  approvalState?: "pending" | "changes_requested" | "approved" | "rejected";
  decisionState?: "needed" | "analyzing" | "delegated" | "deferred" | "decided";
}

export interface PortfolioSignal {
  decisions: number;
  approvals: number;
  blocked: number;
  overdueMilestones: number;
  staleUpdates: number;
  unassignedUrgent: number;
}

export interface HubRollup {
  open: number;
  overdue: number;
  blocked: number;
  decisions: number;
  approvals: number;
  score: number;
}

const DAY = 86_400_000;

export function rollupHub(
  hub: Hub,
  items: readonly WorkItem[],
  now = new Date(),
): HubRollup {
  const scoped = items.filter(
    (item) => item.hubId === hub.id && item.status !== "done",
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
  const healthWeight: Record<HubHealth, number> = {
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
      healthWeight[hub.health] +
      overdue * 6 +
      blocked * 8 +
      decisions * 5 +
      approvals * 4,
  };
}

export function portfolioSignals(
  hubs: readonly Hub[],
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
    staleUpdates: hubs.filter(
      (hub) =>
        now.getTime() - new Date(hub.latestUpdate.date).getTime() > 7 * DAY,
    ).length,
    unassignedUrgent: items.filter(
      (item) =>
        item.status !== "done" &&
        !item.assignee &&
        ["urgent", "high"].includes(item.priority),
    ).length,
  };
}

export const demoHubs: Hub[] = [
  {
    id: "hub-zehn",
    slug: "zehn",
    name: "ZEHN",
    icon: "Z",
    accent: "#6456d8",
    type: "brand",
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
    id: "hub-leckereich",
    slug: "leckereich",
    name: "Leckereich",
    icon: "L",
    accent: "#e05f4f",
    type: "product",
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
    id: "hub-marktfix",
    slug: "marktfix",
    name: "MarktFix",
    icon: "M",
    accent: "#17846b",
    type: "client_program",
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
    id: "hub-lokalfix",
    slug: "lokalfix",
    name: "LokalFix",
    icon: "L",
    accent: "#2b77b9",
    type: "venture",
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
    id: "hub-mikroit",
    slug: "mikroit",
    name: "MikroIT",
    icon: "μ",
    accent: "#1f8c94",
    type: "client_program",
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
    id: "hub-gastrofix",
    slug: "gastrofix",
    name: "GastroFix",
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
    id: "hub-intelligentlab",
    slug: "intelligentlab",
    name: "IntelligentLab",
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
    id: "hub-bigboyz",
    slug: "bigboyz",
    name: "BigBoyz",
    icon: "B",
    accent: "#ad477c",
    type: "brand",
    stage: "idea",
    health: "parked",
    healthNote: "Intentionally parked until ZEHN launch work is complete.",
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
    id: "hub-founder",
    slug: "founder-journey",
    name: "Founder Journey",
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
      text: "Financial model is reviewed; the narrative now needs final proof points from ZEHN and MarktFix.",
      date: "2026-08-21",
    },
    metrics: [
      { label: "Application", value: "72%" },
      { label: "Learning streak", value: "6 wk" },
    ],
  },
];

export const demoItems: WorkItem[] = [
  {
    id: "i-1",
    hubId: "hub-zehn",
    boardId: "b-zehn-launch",
    title: "Approve packaging compliance copy",
    type: "approval",
    priority: "urgent",
    status: "review",
    dueDate: "2026-08-26",
    assignee: "Mohammed Zaman",
    approvalState: "pending",
  },
  {
    id: "i-2",
    hubId: "hub-zehn",
    boardId: "b-zehn-launch",
    title: "Choose storefront launch offer",
    type: "decision",
    priority: "urgent",
    status: "working",
    dueDate: "2026-08-25",
    assignee: "Mohammed Zaman",
    decisionState: "needed",
  },
  {
    id: "i-3",
    hubId: "hub-zehn",
    boardId: "b-zehn-launch",
    title: "Confirm GPSR manufacturer evidence",
    type: "task",
    priority: "high",
    status: "blocked",
    dueDate: "2026-08-22",
    assignee: "Amira Demir",
  },
  {
    id: "i-4",
    hubId: "hub-zehn",
    boardId: "b-zehn-launch",
    title: "SS26 storefront launch",
    type: "milestone",
    priority: "urgent",
    status: "working",
    dueDate: "2026-08-28",
    assignee: "Nora Klein",
  },
  {
    id: "i-5",
    hubId: "hub-zehn",
    boardId: "b-zehn-launch",
    title: "Publish polo fit guide",
    type: "task",
    priority: "normal",
    status: "working",
    dueDate: "2026-08-27",
    assignee: "Elias Hart",
  },
  {
    id: "i-6",
    hubId: "hub-leckereich",
    boardId: "b-leck-beta",
    title: "Select onboarding navigation",
    type: "decision",
    priority: "high",
    status: "review",
    dueDate: "2026-08-26",
    assignee: "Mohammed Zaman",
    decisionState: "needed",
  },
  {
    id: "i-7",
    hubId: "hub-leckereich",
    boardId: "b-leck-beta",
    title: "Restaurant owner dashboard review",
    type: "approval",
    priority: "high",
    status: "review",
    dueDate: "2026-08-27",
    assignee: "Nora Klein",
    approvalState: "pending",
  },
  {
    id: "i-8",
    hubId: "hub-leckereich",
    boardId: "b-leck-beta",
    title: "Fix onboarding permissions",
    type: "task",
    priority: "urgent",
    status: "blocked",
    dueDate: "2026-08-23",
    assignee: "Tim Bauer",
  },
  {
    id: "i-9",
    hubId: "hub-marktfix",
    boardId: "b-market-delivery",
    title: "Create proof pack checklist",
    type: "task",
    priority: "normal",
    status: "working",
    dueDate: "2026-08-29",
    assignee: "Elias Hart",
  },
  {
    id: "i-10",
    hubId: "hub-marktfix",
    boardId: "b-market-delivery",
    title: "Client storefront repair",
    type: "task",
    priority: "high",
    status: "review",
    dueDate: "2026-08-25",
    assignee: "Jana Roth",
  },
  {
    id: "i-11",
    hubId: "hub-lokalfix",
    boardId: "b-lokal-pilot",
    title: "Name recurring care tiers",
    type: "decision",
    priority: "high",
    status: "working",
    dueDate: "2026-08-28",
    decisionState: "needed",
  },
  {
    id: "i-12",
    hubId: "hub-lokalfix",
    boardId: "b-lokal-pilot",
    title: "Pilot proposal follow-up",
    type: "task",
    priority: "high",
    status: "working",
    dueDate: "2026-08-26",
  },
  {
    id: "i-13",
    hubId: "hub-mikroit",
    boardId: "b-it-requests",
    title: "Validate secure access checklist",
    type: "task",
    priority: "normal",
    status: "review",
    dueDate: "2026-08-30",
    assignee: "Tim Bauer",
  },
  {
    id: "i-14",
    hubId: "hub-gastrofix",
    boardId: "b-gastro-validation",
    title: "Choose single pilot outcome",
    type: "decision",
    priority: "urgent",
    status: "blocked",
    dueDate: "2026-08-20",
    assignee: "Mohammed Zaman",
    decisionState: "needed",
  },
  {
    id: "i-15",
    hubId: "hub-gastrofix",
    boardId: "b-gastro-validation",
    title: "Pilot scope approved",
    type: "milestone",
    priority: "urgent",
    status: "working",
    dueDate: "2026-08-21",
    assignee: "Sofia Marin",
  },
  {
    id: "i-16",
    hubId: "hub-intelligentlab",
    boardId: "b-il-compliance",
    title: "Approve supplier declaration pack",
    type: "approval",
    priority: "high",
    status: "review",
    dueDate: "2026-08-25",
    assignee: "Mohammed Zaman",
    approvalState: "pending",
  },
  {
    id: "i-17",
    hubId: "hub-intelligentlab",
    boardId: "b-il-compliance",
    title: "Collect marketplace evidence",
    type: "task",
    priority: "high",
    status: "blocked",
    dueDate: "2026-08-22",
    assignee: "Amira Demir",
  },
  {
    id: "i-18",
    hubId: "hub-founder",
    boardId: "b-founder-funding",
    title: "Write traction evidence",
    type: "task",
    priority: "normal",
    status: "working",
    dueDate: "2026-08-30",
    assignee: "Mohammed Zaman",
  },
];
