import type {
  Blueprint,
  BlueprintInstance,
  BlueprintVersion,
  DecisionOutcome,
  HubSnapshot,
  IdeaOpportunity,
  Insight,
  InsightLink,
  MeaningfulChange,
  Portfolio,
  ReviewRitual,
  StakeholderExposure,
  UserSeenCheckpoint,
  WaitingState,
  WorkItemDependency,
} from "./commercial";

export const demoPortfolios: Portfolio[] = [
  {
    id: "portfolio-demo",
    organizationId: "org-demo",
    name: "Venture Portfolio",
    slug: "venture-portfolio",
    description: "Businesses, client work, products, and shared operations.",
    isDefault: true,
  },
  {
    id: "portfolio-personal",
    organizationId: "org-demo",
    name: "Personal Projects",
    slug: "personal-projects",
    description: "Private initiatives kept outside the operating portfolio.",
    isDefault: false,
  },
  {
    id: "portfolio-original",
    organizationId: "org-demo",
    name: "Original Portfolio",
    slug: "original-portfolio",
    description:
      "Mohammed's original project portfolio, restored with its established ventures and operating context.",
    isDefault: false,
  },
];

export const demoWaitingStates: WaitingState[] = [
  {
    id: "waiting-supplier-evidence",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-northstar",
    entityType: "work_item",
    entityId: "i-3",
    title: "Confirm product compliance evidence",
    waitingType: "vendor",
    waitingLabel: "Packaging supplier",
    waitingSince: "2026-08-18",
    expectedBy: "2026-08-22",
    followUpOwnerId: "user-admin",
    followUpOwnerName: "Amira Demir",
    nextFollowUp: "2026-08-24",
    waitingNote: "Need the signed declaration before the print release.",
  },
  {
    id: "waiting-client-copy",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-localreach",
    entityType: "approval",
    entityId: "i-10",
    title: "Client storefront repair",
    waitingType: "client",
    waitingLabel: "Client marketing lead",
    waitingSince: "2026-08-23",
    expectedBy: "2026-08-26",
    followUpOwnerId: "user-member",
    followUpOwnerName: "Jana Roth",
    nextFollowUp: "2026-08-25",
    waitingNote: "Final proof needs client acceptance before publishing.",
  },
  {
    id: "waiting-scope-decision",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-greentable",
    entityType: "decision",
    entityId: "i-14",
    title: "Choose single pilot outcome",
    waitingType: "decision",
    waitingLabel: "Portfolio owner",
    waitingSince: "2026-08-19",
    expectedBy: "2026-08-20",
    followUpOwnerId: "user-owner",
    followUpOwnerName: "Mohammed Zaman",
    nextFollowUp: "2026-08-24",
    waitingNote:
      "The delivery team cannot finalize scope until this is decided.",
  },
  {
    id: "waiting-research-file",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-mealflow",
    entityType: "work_item",
    entityId: "i-8",
    title: "Fix onboarding permissions",
    waitingType: "team",
    waitingLabel: "Platform team",
    waitingSince: "2026-08-23",
    expectedBy: "2026-08-27",
    followUpOwnerId: "user-lead",
    followUpOwnerName: "Nora Klein",
    nextFollowUp: "2026-08-26",
  },
];

export const demoDependencies: WorkItemDependency[] = [
  {
    itemId: "i-4",
    dependsOnItemId: "i-17",
    relation: "depends_on",
  },
];

export const demoChangeCheckpoint: UserSeenCheckpoint = {
  userId: "user-owner",
  portfolioId: "portfolio-demo",
  lastSeenAt: "2026-08-23T16:30:00.000Z",
};

export const demoMeaningfulChanges: MeaningfulChange[] = [
  {
    id: "change-northstar-health",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-northstar",
    entityType: "hub",
    entityId: "hub-northstar",
    type: "health_changed",
    summary: "Health changed Attention → Critical",
    occurredAt: "2026-08-24T08:20:00.000Z",
    importance: 5,
    metadata: { from: "watch", to: "critical" },
  },
  {
    id: "change-northstar-milestone",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-northstar",
    entityType: "milestone",
    entityId: "i-4",
    type: "milestone_changed",
    summary: "Storefront launch moved by 3 days",
    occurredAt: "2026-08-24T08:12:00.000Z",
    importance: 4,
    metadata: { daysMoved: 3 },
  },
  {
    id: "change-mealflow-decision",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-mealflow",
    entityType: "decision",
    entityId: "i-6",
    type: "decision_requested",
    summary: "A product navigation decision now needs you",
    occurredAt: "2026-08-24T07:45:00.000Z",
    importance: 4,
    metadata: {},
  },
  {
    id: "change-localreach-completed",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-localreach",
    entityType: "work_item",
    entityId: "i-9",
    type: "major_work_completed",
    summary: "Proof pack checklist completed",
    occurredAt: "2026-08-23T18:10:00.000Z",
    importance: 3,
    metadata: {},
  },
  {
    id: "change-noise-comment",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-localreach",
    entityType: "comment",
    entityId: "comment-44",
    type: "update_published",
    summary: "Minor note edited",
    occurredAt: "2026-08-24T06:00:00.000Z",
    importance: 1,
    metadata: {},
  },
];

export const demoHubSnapshots: HubSnapshot[] = [
  ["snapshot-n-1", "2026-08-03T16:00:00.000Z", "on_track", 52, 13, 1, 0, 1, 1],
  ["snapshot-n-2", "2026-08-10T16:00:00.000Z", "watch", 58, 14, 2, 1, 2, 3],
  ["snapshot-n-3", "2026-08-17T16:00:00.000Z", "watch", 63, 12, 2, 2, 2, 4],
  ["snapshot-n-4", "2026-08-24T09:00:00.000Z", "critical", 68, 11, 3, 2, 2, 6],
].map(
  ([
    id,
    capturedAt,
    health,
    progress,
    openCount,
    overdueCount,
    blockedCount,
    decisionCount,
    attentionCount,
  ]) => ({
    id: String(id),
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-northstar",
    capturedAt: String(capturedAt),
    health: health as HubSnapshot["health"],
    progress: Number(progress),
    openCount: Number(openCount),
    overdueCount: Number(overdueCount),
    blockedCount: Number(blockedCount),
    decisionCount: Number(decisionCount),
    attentionCount: Number(attentionCount),
    nextMilestoneId: "i-4",
    nextMilestoneStatus: health === "critical" ? "at_risk" : "working",
    latestUpdateAt: String(capturedAt),
    source: "weekly_review",
  }),
);

export const demoReviewRituals: ReviewRitual[] = [
  {
    id: "ritual-daily",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    type: "daily_focus",
    cadence: "weekdays 08:30",
    enabled: true,
    nextDueAt: "2026-08-25T06:30:00.000Z",
    reminderEnabled: false,
  },
  {
    id: "ritual-weekly-northstar",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-northstar",
    type: "weekly_hub",
    cadence: "Monday 16:00",
    enabled: true,
    nextDueAt: "2026-08-31T14:00:00.000Z",
    reminderEnabled: true,
  },
  {
    id: "ritual-monthly",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    type: "monthly_portfolio",
    cadence: "last Friday",
    enabled: true,
    nextDueAt: "2026-08-28T14:00:00.000Z",
    reminderEnabled: true,
  },
];

export const demoDecisionOutcomes: DecisionOutcome[] = [
  {
    id: "outcome-pricing-pilot",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    decisionItemId: "i-19",
    outcome: "better_than_expected",
    learning:
      "A narrower pilot offer shortened sales calls and improved activation.",
    wouldRepeat: true,
    recordedBy: "user-owner",
    recordedAt: "2026-08-22T15:00:00.000Z",
  },
];

export const demoInsights: Insight[] = [
  {
    id: "insight-mealflow-navigation",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-mealflow",
    title: "Restaurant owners look for today's service first",
    description:
      "Four of five pilot participants ignored setup navigation and looked for live service status.",
    sourceType: "customer_feedback",
    impact: "high",
    labels: ["pilot", "navigation", "activation"],
    capturedBy: "user-lead",
    capturedAt: "2026-08-21T10:15:00.000Z",
  },
  {
    id: "insight-northstar-returns",
    organizationId: "org-demo",
    portfolioId: "portfolio-demo",
    hubId: "hub-northstar",
    title: "Fit guidance reduces exchange intent",
    description:
      "Prototype sessions showed clearer fit guidance reduced exchange questions before checkout.",
    sourceType: "research",
    impact: "medium",
    labels: ["commerce", "customer", "launch"],
    capturedBy: "user-member",
    capturedAt: "2026-08-20T13:30:00.000Z",
  },
];

export const demoInsightLinks: InsightLink[] = [
  {
    id: "link-insight-idea-nav",
    organizationId: "org-demo",
    insightId: "insight-mealflow-navigation",
    entityType: "idea",
    entityId: "idea-service-first",
  },
  {
    id: "link-insight-decision-nav",
    organizationId: "org-demo",
    insightId: "insight-mealflow-navigation",
    entityType: "decision",
    entityId: "i-6",
  },
];

export const demoIdeaOpportunities: IdeaOpportunity[] = [
  {
    itemId: "idea-service-first",
    problemOrOpportunity:
      "Pilot users cannot see live service status quickly enough.",
    hypothesis:
      "A service-first home will shorten time to first useful action.",
    expectedImpact: 4,
    effort: 2,
    confidence: 4,
    strategicFit: 5,
    reviewDate: "2026-09-02",
    promotedEntityType: "decision",
    promotedEntityId: "i-6",
  },
];

export const demoBlueprints: Blueprint[] = [
  {
    id: "blueprint-client-delivery",
    organizationId: "org-demo",
    name: "Client delivery",
    description:
      "A repeatable delivery rhythm with review gates and stakeholder updates.",
    currentVersionId: "blueprint-client-delivery-v2",
  },
];

export const demoBlueprintVersions: BlueprintVersion[] = [
  {
    id: "blueprint-client-delivery-v1",
    blueprintId: "blueprint-client-delivery",
    version: 1,
    summary: "Initial client delivery operating system",
    definition: {
      groups: ["Intake", "Delivery", "Review"],
      statuses: ["Planned", "Working", "Client review", "Done"],
      customFields: ["Client owner", "Evidence link"],
      views: ["Delivery table", "Client review"],
      updateCadence: "weekly",
      defaultRoles: ["Project lead", "Delivery owner", "Guest reviewer"],
      automationRules: ["Notify owner when client review is overdue"],
      reviewRitual: "weekly project review",
    },
    createdAt: "2026-07-10T10:00:00.000Z",
  },
  {
    id: "blueprint-client-delivery-v2",
    blueprintId: "blueprint-client-delivery",
    version: 2,
    summary: "Adds evidence readiness and a monthly stakeholder view",
    definition: {
      groups: ["Intake", "Delivery", "Review", "Evidence ready"],
      statuses: ["Planned", "Working", "Client review", "Done"],
      customFields: ["Client owner", "Evidence link", "Approval due"],
      views: ["Delivery table", "Client review", "Stakeholder summary"],
      updateCadence: "weekly",
      defaultRoles: ["Project lead", "Delivery owner", "Guest reviewer"],
      automationRules: [
        "Notify owner when client review is overdue",
        "Request stakeholder update on the last Friday",
      ],
      reviewRitual: "weekly project review",
    },
    createdAt: "2026-08-22T10:00:00.000Z",
  },
];

export const demoBlueprintInstances: BlueprintInstance[] = [
  {
    id: "instance-localreach-delivery",
    organizationId: "org-demo",
    blueprintId: "blueprint-client-delivery",
    blueprintVersionId: "blueprint-client-delivery-v1",
    hubId: "hub-localreach",
    boardId: "b-localreach-delivery",
    localOverrides: ["Client review"],
  },
];

export const demoStakeholderExposure: StakeholderExposure = {
  id: "exposure-localreach-client",
  organizationId: "org-demo",
  hubId: "hub-localreach",
  principalId: "user-guest",
  health: true,
  latestUpdate: true,
  milestones: true,
  selectedWorkItemIds: ["i-9", "i-10"],
  selectedResourceIds: ["resource-proof-pack"],
  approvalItemIds: ["i-10"],
  decisionItemIds: [],
  internalComments: false,
};
