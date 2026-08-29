import { z } from "zod";

export const idSchema = z.string().min(3).max(128);
export const cursorSchema = z.string().max(512).optional();
export const roleSchema = z.enum([
  "owner",
  "admin",
  "workspace_lead",
  "member",
  "guest",
  "viewer",
]);
export const readinessSchema = z.object({
  status: z.enum(["ready", "unavailable"]),
  service: z.literal("trevv-api"),
  version: z.literal("v1"),
  mode: z.enum(["demo", "live"]),
  database: z.enum(["ready", "not_applicable", "unavailable"]),
  time: z.iso.datetime(),
});
export const workspaceHealthSchema = z.enum([
  "on_track",
  "watch",
  "critical",
  "parked",
]);
export const lifecycleStageSchema = z.enum([
  "idea",
  "validate",
  "build",
  "launch",
  "grow",
  "operate",
  "paused",
  "archived",
]);
export const workspaceTypeSchema = z.enum([
  "business",
  "brand",
  "client",
  "product",
  "department",
  "venture",
  "initiative",
  "investment",
  "campaign",
  "program",
  "project",
  "shared_function",
  "client_program",
  "journey",
  "other",
]);
export const itemTypeSchema = z.enum([
  "task",
  "decision",
  "approval",
  "milestone",
  "idea",
  "request",
]);
export const itemStatusSchema = z.enum([
  "not_started",
  "working",
  "blocked",
  "review",
  "done",
]);
export const prioritySchema = z.enum([
  "urgent",
  "high",
  "normal",
  "low",
  "none",
]);

export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string().min(1).max(160),
  role: roleSchema,
  locale: z.enum(["en", "de"]),
});

export const organizationSummarySchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(120),
  role: roleSchema,
});

export const organizationContextSchema = organizationSummarySchema.extend({
  timezone: z.string().min(1).max(120),
});

export const sessionSchema = z.object({
  user: userSchema,
  organizationId: idSchema,
  organization: organizationContextSchema,
  availableOrganizations: z.array(organizationSummarySchema).min(1).max(100),
  managedWorkspaceIds: z.array(idSchema).max(1_000),
  expiresAt: z.iso.datetime(),
});

const productSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Use lowercase letters, numbers, and single hyphens.",
  });

export const onboardingBlueprintSchema = z.enum([
  "operating_business",
  "client_delivery",
  "product_initiative",
  "launch_campaign",
  "blank",
]);

export const onboardingStepSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const onboardingDraftSchema = z
  .object({
    step: onboardingStepSchema,
    organizationName: z.string().trim().min(2).max(160).optional(),
    organizationSlug: productSlugSchema.optional(),
    workspaceName: z.string().trim().min(2).max(160).optional(),
    workspaceSlug: productSlugSchema.optional(),
    workspaceType: workspaceTypeSchema.optional(),
    workspaceColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    blueprintKey: onboardingBlueprintSchema.optional(),
  })
  .strict();

export const completeOnboardingSchema = onboardingDraftSchema.extend({
  step: z.literal(5),
  organizationName: z.string().trim().min(2).max(160),
  organizationSlug: productSlugSchema,
  workspaceName: z.string().trim().min(2).max(160),
  workspaceSlug: productSlugSchema,
  workspaceType: workspaceTypeSchema,
  workspaceColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  blueprintKey: onboardingBlueprintSchema,
});

export const onboardingStateSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]),
  step: onboardingStepSchema,
  draft: onboardingDraftSchema.omit({ step: true }),
  version: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  organizationId: idSchema.optional(),
  portfolioId: idSchema.optional(),
  workspaceId: idSchema.optional(),
  boardId: idSchema.optional(),
  blueprintInstanceId: idSchema.optional(),
});

export const invitationRoleSchema = z.enum([
  "admin",
  "workspace_lead",
  "member",
  "guest",
  "viewer",
]);

export const invitationSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  email: z.email(),
  role: invitationRoleSchema,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  deliveryStatus: z.enum(["pending", "sent", "failed"]),
  version: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().optional(),
  revokedAt: z.iso.datetime().optional(),
  lastSentAt: z.iso.datetime().optional(),
  workspaceId: idSchema.optional(),
  teamId: idSchema.optional(),
});

export const createInvitationSchema = z
  .object({
    email: z.email().transform((value) => value.trim().toLowerCase()),
    role: invitationRoleSchema,
    workspaceId: idSchema.optional(),
    teamId: idSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.teamId && !value.workspaceId)
      context.addIssue({
        code: "custom",
        path: ["workspaceId"],
        message: "A Team invitation must name its Workspace.",
      });
  });

export const acceptInvitationSchema = z
  .object({ token: z.string().min(32).max(1_024) })
  .strict();

export const invitationAcceptanceSchema = z.object({
  invitationId: idSchema,
  organizationId: idSchema,
  role: invitationRoleSchema,
  workspaceId: idSchema.optional(),
  teamId: idSchema.optional(),
  acceptedAt: z.iso.datetime(),
});

export const organizationSelectionSchema = z
  .object({ organizationId: idSchema })
  .strict();

export const updateMembershipSchema = z
  .object({
    role: roleSchema.exclude(["owner"]).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.role !== undefined || value.active !== undefined,
    "Change a role or active state.",
  );

export const membershipSchema = z.object({
  organizationId: idSchema,
  user: z.object({
    id: idSchema,
    email: z.email(),
    name: z.string().min(1).max(160),
  }),
  role: roleSchema,
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workspaceSchema = z.object({
  id: idSchema,
  portfolioId: idSchema,
  slug: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  description: z.string().max(5_000),
  icon: z.string().min(1).max(12),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  type: workspaceTypeSchema,
  stage: lifecycleStageSchema,
  health: workspaceHealthSchema,
  healthNote: z.string().max(1_000),
  priority: z.string().max(500),
  lead: z
    .object({ name: z.string(), initials: z.string(), color: z.string() })
    .optional(),
  nextMilestone: z.object({ title: z.string(), date: z.iso.date() }).optional(),
  latestUpdate: z.object({ text: z.string(), date: z.iso.date() }).optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        trend: z.string().optional(),
      }),
    )
    .max(12),
  versionTag: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createWorkspaceSchema = z
  .object({
    portfolioId: idSchema,
    name: z.string().trim().min(2).max(160),
    slug: productSlugSchema,
    description: z.string().trim().max(5_000).default(""),
    type: workspaceTypeSchema,
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    icon: z.string().trim().min(1).max(12),
    stage: lifecycleStageSchema.default("idea"),
    health: workspaceHealthSchema.default("on_track"),
    healthNote: z.string().trim().max(1_000).default(""),
    priority: z.string().trim().max(500).default(""),
    leadUserId: idSchema.optional(),
    initialBoardName: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export const boardVisibilitySchema = z.enum(["private", "organization"]);
export const progressModeSchema = z.enum([
  "none",
  "task_completion",
  "weighted_work_items",
  "milestone_completion",
  "weighted_milestones",
  "manual",
]);

export const boardSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(5_000),
  templateKey: z.string().max(120).optional(),
  visibility: boardVisibilitySchema,
  progressMode: progressModeSchema,
  manualProgressValue: z.number().min(0).max(100).optional(),
  manualProgressNote: z.string().max(2_000).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  ordering: z.number(),
  versionTag: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createBoardSchema = z
  .object({
    workspaceId: idSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5_000).default(""),
    templateKey: z.string().trim().max(120).optional(),
    visibility: boardVisibilitySchema.default("private"),
    progressMode: progressModeSchema.default("task_completion"),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
  })
  .strict();

export const workspaceCreationSchema = z.object({
  workspace: workspaceSchema,
  board: boardSchema,
});

const workItemBaseSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  boardId: idSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(20_000),
  type: itemTypeSchema,
  priority: prioritySchema,
  status: itemStatusSchema,
  dueDate: z.iso.date().optional(),
  assignees: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1).max(160),
      }),
    )
    .max(100),
  approvalState: z
    .enum(["pending", "changes_requested", "approved", "rejected"])
    .optional(),
  decisionState: z
    .enum(["needed", "analyzing", "delegated", "deferred", "decided"])
    .optional(),
  version: z.number().int().nonnegative().max(2_147_483_647),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workItemSchema = workItemBaseSchema.superRefine(
  (value, context) => {
    if (value.type === "approval" && !value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "An approval item needs an approval state.",
      });
    if (value.type !== "approval" && value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "Only approval items can carry an approval state.",
      });
    if (value.type === "decision" && !value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "A decision item needs a decision state.",
      });
    if (value.type !== "decision" && value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "Only decision items can carry a decision state.",
      });
  },
);

export const workspaceRollupSchema = z.object({
  open: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  decisions: z.number().int().nonnegative(),
  approvals: z.number().int().nonnegative(),
  score: z.number().nonnegative(),
});

export const portfolioSignalSchema = z.object({
  decisions: z.number().int().nonnegative(),
  approvals: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  overdueMilestones: z.number().int().nonnegative(),
  staleUpdates: z.number().int().nonnegative(),
  unassignedUrgent: z.number().int().nonnegative(),
});

export const portfolioSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(120),
  description: z.string().max(1_000),
  isDefault: z.boolean(),
});

export const portfolioResponseSchema = z.object({
  asOf: z.iso.datetime(),
  portfolio: portfolioSchema,
  signals: portfolioSignalSchema,
  workspaces: z.array(
    z.object({ workspace: workspaceSchema, rollup: workspaceRollupSchema }),
  ),
});

export const attentionSignalSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema.optional(),
  entityType: z.string().min(1).max(80),
  entityId: idSchema,
  signalType: z.string().min(1).max(120),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  impact: z.number().min(1).max(5),
  urgency: z.number().min(1).max(5),
  responsibility: z.number().positive(),
  reasonCode: z.string().min(1).max(160),
  sourceFingerprint: z.string().min(1).max(256),
  reason: z.string().min(1).max(2_000),
  recommendedAction: z.string().max(2_000).optional(),
  createdAt: z.iso.datetime(),
  computedAt: z.iso.datetime(),
  sourceEvidence: z
    .array(
      z.object({
        sourceType: z.string().min(1).max(80),
        sourceId: idSchema,
        capturedAt: z.iso.datetime(),
        summary: z.string().max(1_000).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(50),
  resolvedAt: z.iso.datetime().optional(),
  dismissedAt: z.iso.datetime().optional(),
  snoozedUntil: z.iso.datetime().optional(),
  actionReason: z.string().max(1_000).optional(),
  metadata: z.record(z.string(), z.unknown()),
  version: z.number().int().nonnegative().max(2_147_483_647),
});

export const attentionActionSchema = z
  .object({
    action: z.enum(["resolve", "dismiss", "snooze"]),
    reason: z.string().trim().min(3).max(1_000).optional(),
    snoozedUntil: z.iso.datetime().optional(),
  })
  .superRefine((value, context) => {
    if (["dismiss", "snooze"].includes(value.action) && !value.reason)
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required when dismissing or snoozing a signal.",
      });
    if (value.action === "snooze" && !value.snoozedUntil)
      context.addIssue({
        code: "custom",
        path: ["snoozedUntil"],
        message: "A snooze-until date is required.",
      });
  });

export const waitingStateSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  entityType: z.enum(["work_item", "decision", "approval"]),
  entityId: idSchema,
  title: z.string().min(1).max(500),
  waitingType: z.enum([
    "person",
    "team",
    "external_partner",
    "client",
    "vendor",
    "decision",
    "document",
    "dependency",
    "other",
  ]),
  waitingReferenceId: idSchema.optional(),
  waitingLabel: z.string().max(200).optional(),
  waitingSince: z.iso.date(),
  expectedBy: z.iso.date().optional(),
  followUpOwnerId: idSchema,
  followUpOwnerName: z.string().min(1).max(160),
  nextFollowUp: z.iso.date().optional(),
  waitingNote: z.string().max(2_000).optional(),
  resolvedAt: z.iso.datetime().optional(),
  version: z.number().int().nonnegative().max(2_147_483_647),
});

export const waitingActionSchema = z
  .object({
    action: z.enum(["resolve", "nudge", "reschedule"]),
    note: z.string().trim().max(1_000).optional(),
    nextFollowUp: z.iso.date().optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reschedule" && !value.nextFollowUp)
      context.addIssue({
        code: "custom",
        path: ["nextFollowUp"],
        message: "A rescheduled follow-up needs a new date.",
      });
  });

export const createWaitingSchema = z
  .object({
    workspaceId: idSchema,
    entityType: z.literal("work_item"),
    entityId: idSchema,
    title: z.string().trim().min(1).max(500),
    waitingType: z.enum([
      "person",
      "team",
      "external_partner",
      "client",
      "vendor",
      "decision",
      "document",
      "dependency",
      "other",
    ]),
    waitingReferenceId: idSchema.optional(),
    waitingLabel: z.string().trim().max(200).optional(),
    expectedBy: z.iso.date().optional(),
    followUpOwnerId: idSchema,
    nextFollowUp: z.iso.date().optional(),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const weeklyReviewInputSchema = z.object({
  workspaceId: idSchema,
  health: workspaceHealthSchema,
  progress: z.string().trim().min(1),
  blocker: z.string().trim().min(1),
  nextMilestone: z.string().trim().min(1),
  decisionNeeded: z.string().trim().optional(),
  priorityNextWeek: z.string().trim().min(1),
});

export const weeklyReviewResponseSchema = z.object({
  update: z.object({
    id: idSchema,
    workspaceId: idSchema,
    health: workspaceHealthSchema,
    progress: z.string(),
    blocker: z.string(),
    nextMilestone: z.string(),
    decisionNeeded: z.string().optional(),
    priorityNextWeek: z.string(),
    publishedAt: z.iso.datetime(),
  }),
  snapshot: z.object({
    id: idSchema,
    organizationId: idSchema,
    portfolioId: idSchema,
    workspaceId: idSchema,
    capturedAt: z.iso.datetime(),
    health: workspaceHealthSchema,
    source: z.literal("weekly_review"),
  }),
  attentionRefreshQueued: z.boolean(),
});

export const weeklyReviewRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  author: z.object({
    id: idSchema,
    name: z.string().min(1).max(160),
  }),
  health: workspaceHealthSchema.optional(),
  progress: z.string(),
  blocker: z.string(),
  nextMilestone: z.string(),
  decisionNeeded: z.string().optional(),
  priorityNextWeek: z.string(),
  note: z.string().optional(),
  publishedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workspaceDetailSchema = z.object({
  workspace: workspaceSchema,
  rollup: workspaceRollupSchema,
  items: z.array(workItemSchema),
});

export const meaningfulChangeSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  entityType: z.string().min(1).max(80),
  entityId: idSchema,
  type: z.enum([
    "health_changed",
    "milestone_changed",
    "priority_changed",
    "decision_requested",
    "decision_resolved",
    "blocker_added",
    "blocker_resolved",
    "update_published",
    "update_became_stale",
    "major_work_completed",
    "due_date_materially_changed",
    "ownership_changed",
  ]),
  summary: z.string().min(1).max(2_000),
  occurredAt: z.iso.datetime(),
  importance: z.number().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
});

export const changeRadarSchema = z.object({
  checkpoint: z.object({
    userId: idSchema,
    portfolioId: idSchema,
    lastSeenAt: z.iso.datetime(),
  }),
  changes: z.array(meaningfulChangeSchema),
});

export const workspaceSnapshotSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  capturedAt: z.iso.datetime(),
  health: workspaceHealthSchema,
  progress: z.number().optional(),
  openCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  decisionCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(),
  nextMilestoneId: idSchema.optional(),
  nextMilestoneStatus: z.string().max(120).optional(),
  latestUpdateAt: z.iso.datetime().optional(),
  source: z.enum(["weekly_review", "monthly_review", "manual"]),
});

export const reviewRitualSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema.optional(),
  type: z.enum(["daily_focus", "weekly_workspace", "monthly_portfolio"]),
  cadence: z.string().min(1).max(160),
  enabled: z.boolean(),
  nextDueAt: z.iso.datetime().optional(),
  reminderEnabled: z.boolean(),
});

export const decisionOutcomeSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  decisionItemId: idSchema,
  outcome: z.enum([
    "better_than_expected",
    "as_expected",
    "worse_than_expected",
    "too_early",
  ]),
  learning: z.string().max(5_000),
  wouldRepeat: z.boolean().optional(),
  recordedBy: idSchema,
  recordedAt: z.iso.datetime(),
});

export const managementMemorySchema = z.object({
  workspaceSnapshots: z.array(workspaceSnapshotSchema),
  reviewRituals: z.array(reviewRitualSchema),
  decisionOutcomes: z.array(decisionOutcomeSchema),
});

export const searchResultSchema = z.object({
  workspaces: z.array(workspaceSchema),
  items: z.array(workItemSchema),
});

export const teamFeatureCapabilitySchema = z.enum([
  "work",
  "messages",
  "decisions",
  "approvals",
  "resources",
  "reporting",
]);
export const teamPresetSchema = z.enum([
  "leadership",
  "marketing",
  "technology",
  "operations",
  "sales",
  "custom",
]);
export const teamFeaturePolicySourceSchema = z.enum([
  "preset",
  "override",
  "none",
]);

const teamPresetFeatureCapabilities = {
  leadership: [
    "work",
    "messages",
    "decisions",
    "approvals",
    "resources",
    "reporting",
  ],
  marketing: ["work", "messages", "decisions", "resources", "reporting"],
  technology: [
    "work",
    "messages",
    "decisions",
    "approvals",
    "resources",
    "reporting",
  ],
  operations: [
    "work",
    "messages",
    "decisions",
    "approvals",
    "resources",
    "reporting",
  ],
  sales: ["work", "messages", "approvals", "resources", "reporting"],
  custom: [],
} as const satisfies Record<TeamPreset, readonly TeamFeatureCapability[]>;

/** Canonical product-feature defaults; these values never grant data access. */
export function teamFeatureCapabilitiesForPreset(
  preset: TeamPreset,
): TeamFeatureCapability[] {
  return [...teamPresetFeatureCapabilities[preset]];
}
export const teamMemberRoleSchema = z.enum(["lead", "member"]);
export const collaborationUserSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string().min(1).max(160),
  organizationRole: roleSchema,
});
export const teamMemberSchema = z.object({
  user: collaborationUserSchema,
  role: teamMemberRoleSchema,
  joinedAt: z.iso.datetime(),
});
export const teamRoomSchema = z.object({
  conversationId: idSchema,
  title: z.string().trim().min(1).max(160),
  unreadCount: z.number().int().nonnegative(),
});

const messageMetadataSchema = z
  .record(z.string().max(64), z.unknown())
  .superRefine((value, context) => {
    const issue = messageMetadataIssue(value);
    if (issue) context.addIssue({ code: "custom", message: issue });
  });
export const teamSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  name: z.string().trim().min(1).max(160),
  purpose: z.string().trim().max(1_000),
  preset: teamPresetSchema,
  featureCapabilities: z.array(teamFeatureCapabilitySchema).max(20),
  featurePolicySource: teamFeaturePolicySourceSchema,
  members: z.array(teamMemberSchema).max(250),
  room: teamRoomSchema.nullable(),
  version: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const teamDirectorySchema = z.object({
  teams: z.array(teamSchema),
  availableMembers: z.array(collaborationUserSchema).max(2_000),
});
export const createTeamSchema = z
  .object({
    workspaceId: idSchema,
    name: z.string().trim().min(1).max(160),
    purpose: z.string().trim().max(1_000).default(""),
    preset: teamPresetSchema.default("custom"),
    featureCapabilities: z
      .array(teamFeatureCapabilitySchema)
      .max(20)
      .optional(),
    memberIds: z.array(idSchema).max(250).default([]),
    leadUserId: idSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.leadUserId && !value.memberIds.includes(value.leadUserId))
      context.addIssue({
        code: "custom",
        path: ["leadUserId"],
        message: "The Team lead must also be a Team member.",
      });
  });
export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    purpose: z.string().trim().max(1_000).optional(),
    preset: teamPresetSchema.optional(),
    featureCapabilities: z
      .array(teamFeatureCapabilitySchema)
      .max(20)
      .optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Change at least one Team field.",
  );
export const setTeamMemberSchema = z
  .object({ role: teamMemberRoleSchema.default("member") })
  .strict();
export const setConversationParticipantSchema = z
  .object({ participantRole: z.enum(["member", "owner"]).default("member") })
  .strict();

export const conversationKindSchema = z.enum([
  "workspace",
  "team",
  "direct",
  "external",
]);
export const conversationVisibilitySchema = z.enum([
  "organization",
  "private",
  "guest_scoped",
]);
export const conversationParticipantRoleSchema = z.enum([
  "owner",
  "member",
  "guest",
]);
export const messageIntentSchema = z.enum([
  "message",
  "request",
  "decision",
  "update",
]);
export const messageResponseStateSchema = z.enum([
  "open",
  "resolved",
  "cancelled",
]);
export const conversationParticipantSchema = z.object({
  user: collaborationUserSchema,
  participantRole: conversationParticipantRoleSchema,
  notificationLevel: z.enum(["all", "mentions", "none"]),
  lastReadMessageId: idSchema.optional(),
  lastReadAt: z.iso.datetime().optional(),
  joinedAt: z.iso.datetime(),
});
export const messageReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(32),
  userIds: z.array(idSchema).max(250),
  reactedByCurrentUser: z.boolean(),
});

export const conversationSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  teamId: idSchema.optional(),
  title: z.string().trim().min(1).max(160),
  purpose: z.string().trim().max(1_000),
  kind: conversationKindSchema,
  visibility: conversationVisibilitySchema,
  participants: z.array(conversationParticipantSchema).max(250),
  unreadCount: z.number().int().nonnegative(),
  needsResponseCount: z.number().int().nonnegative(),
  retentionDays: z.number().int().min(1).max(3_650),
  lastMessageAt: z.iso.datetime().optional(),
  version: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const conversationMessageSchema = z.object({
  id: idSchema,
  sequence: z.number().int().positive(),
  clientMessageId: z.string().uuid(),
  organizationId: idSchema,
  conversationId: idSchema,
  senderId: idSchema,
  sender: collaborationUserSchema,
  parentMessageId: idSchema.optional(),
  body: z.string().trim().min(1).max(20_000),
  intent: messageIntentSchema,
  responseOwnerId: idSchema.optional(),
  responseDueAt: z.iso.datetime().optional(),
  responseState: messageResponseStateSchema.optional(),
  linkedEntityType: z.string().trim().max(80).optional(),
  linkedEntityId: idSchema.optional(),
  metadata: messageMetadataSchema,
  reactions: z.array(messageReactionSchema).max(50),
  retainedUntil: z.iso.datetime(),
  version: z.number().int().nonnegative(),
  editedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
});

export const paginatedConversationsSchema = z.object({
  data: z.array(conversationSchema),
  nextCursor: z.string().nullable(),
});
export const paginatedConversationMessagesSchema = z.object({
  data: z.array(conversationMessageSchema),
  nextCursor: z.string().nullable(),
});

export const createConversationSchema = z
  .object({
    workspaceId: idSchema,
    title: z.string().trim().min(1).max(160),
    purpose: z.string().trim().max(1_000).default(""),
    kind: conversationKindSchema.exclude(["team"]),
    visibility: conversationVisibilitySchema,
    participantIds: z.array(idSchema).min(1).max(250),
    retentionDays: z.number().int().min(1).max(3_650).default(365),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "direct" && value.participantIds.length !== 2)
      context.addIssue({
        code: "custom",
        path: ["participantIds"],
        message: "A direct conversation must have exactly two participants.",
      });
    if (value.kind === "direct" && value.visibility !== "private")
      context.addIssue({
        code: "custom",
        path: ["visibility"],
        message: "A direct conversation must be private.",
      });
    if (value.kind === "external" && value.visibility !== "guest_scoped")
      context.addIssue({
        code: "custom",
        path: ["visibility"],
        message: "External rooms must use guest-scoped visibility.",
      });
  });

export const createConversationMessageSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    parentMessageId: idSchema.optional(),
    body: z.string().trim().min(1).max(20_000),
    intent: messageIntentSchema.default("message"),
    responseOwnerId: idSchema.optional(),
    responseDueAt: z.iso.datetime().optional(),
    metadata: messageMetadataSchema.default({}),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ["request", "decision"].includes(value.intent) &&
      !value.responseOwnerId
    )
      context.addIssue({
        code: "custom",
        path: ["responseOwnerId"],
        message: "Requests and decisions need a response owner.",
      });
  });

function messageMetadataIssue(value: Record<string, unknown>): string | null {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return "Metadata must be valid JSON.";
  }
  if (
    serialized === undefined ||
    new TextEncoder().encode(serialized).byteLength > 8 * 1024
  )
    return "Metadata cannot exceed 8 KiB.";
  let keyCount = 0;
  const inspect = (entry: unknown, depth: number): string | null => {
    if (typeof entry === "string")
      return entry.length <= 1_000
        ? null
        : "Metadata strings cannot exceed 1,000 characters.";
    if (
      entry === null ||
      typeof entry === "boolean" ||
      (typeof entry === "number" && Number.isFinite(entry))
    )
      return null;
    if (depth >= 4) return "Metadata cannot exceed four levels of nesting.";
    if (Array.isArray(entry)) {
      if (entry.length > 50) return "Metadata arrays cannot exceed 50 items.";
      for (const item of entry) {
        const issue = inspect(item, depth + 1);
        if (issue) return issue;
      }
      return null;
    }
    if (
      typeof entry !== "object" ||
      entry === undefined ||
      Object.getPrototypeOf(entry) !== Object.prototype
    )
      return "Metadata may contain JSON values only.";
    for (const [key, child] of Object.entries(entry)) {
      keyCount += 1;
      if (key.length > 64) return "Metadata keys cannot exceed 64 characters.";
      if (keyCount > 32) return "Metadata cannot contain more than 32 keys.";
      const issue = inspect(child, depth + 1);
      if (issue) return issue;
    }
    return null;
  };
  return inspect(value, 0);
}

export const updateMessageResponseSchema = z
  .object({ responseState: messageResponseStateSchema.exclude(["cancelled"]) })
  .strict();
export const markConversationReadSchema = z
  .object({ messageId: idSchema })
  .strict();
export const messageReactionInputSchema = z
  .object({ emoji: z.string().trim().min(1).max(32) })
  .strict();
export const conversationReadCheckpointSchema = z.object({
  conversationId: idSchema,
  userId: idSchema,
  messageId: idSchema,
  messageSequence: z.number().int().positive(),
  readAt: z.iso.datetime(),
  version: z.number().int().nonnegative(),
});
export const collaborationEventTypeSchema = z.enum([
  "team.created",
  "team.updated",
  "team.membership_changed",
  "conversation.created",
  "conversation.participants_changed",
  "message.sent",
  "message.response_changed",
  "message.reaction_changed",
  "conversation.read",
]);
export const collaborationEventSchema = z.object({
  cursor: z.number().int().positive(),
  organizationId: idSchema,
  workspaceId: idSchema,
  type: collaborationEventTypeSchema,
  aggregateType: z.enum(["team", "conversation", "message"]),
  aggregateId: idSchema,
  teamId: idSchema.optional(),
  conversationId: idSchema.optional(),
  occurredAt: z.iso.datetime(),
});
export const collaborationEventBatchSchema = z.object({
  events: z.array(collaborationEventSchema).max(500),
  nextCursor: z.number().int().nonnegative(),
});

export const inboxItemSchema = z.object({
  id: idSchema,
  userId: idSchema,
  category: z.string().min(1).max(80),
  title: z.string().min(1).max(500),
  body: z.string().max(20_000),
  resource: z.record(z.string(), z.unknown()),
  doneAt: z.iso.datetime().optional(),
  snoozedUntil: z.iso.datetime().optional(),
  convertedItemId: idSchema.optional(),
  convertedAt: z.iso.datetime().optional(),
  version: z.number().int().nonnegative().max(2_147_483_647),
  createdAt: z.iso.datetime(),
});

export const captureInboxItemSchema = z
  .object({
    category: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(500),
    body: z.string().trim().max(20_000).default(""),
    resource: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const updateInboxItemSchema = z
  .object({
    done: z.boolean().optional(),
    snoozedUntil: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.done !== undefined || value.snoozedUntil !== undefined,
    "Change the completion or snooze state.",
  );

export const convertInboxItemSchema = z
  .object({
    workspaceId: idSchema,
    boardId: idSchema,
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(20_000).optional(),
    type: itemTypeSchema.default("task"),
    priority: prioritySchema.default("normal"),
    status: itemStatusSchema.default("not_started"),
    dueDate: z.iso.date().optional(),
    assigneeIds: z.array(idSchema).max(100).default([]),
    approvalState: z
      .enum(["pending", "changes_requested", "approved", "rejected"])
      .optional(),
    decisionState: z
      .enum(["needed", "analyzing", "delegated", "deferred", "decided"])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "approval" && !value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "An approval item needs an approval state.",
      });
    if (value.type !== "approval" && value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "Only approval items can carry an approval state.",
      });
    if (value.type === "decision" && !value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "A decision item needs a decision state.",
      });
    if (value.type !== "decision" && value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "Only decision items can carry a decision state.",
      });
  });

export const convertedInboxItemSchema = z.object({
  inboxItem: inboxItemSchema,
  workItem: workItemSchema,
});

export const workItemEvidenceInputSchema = z
  .object({ body: z.string().trim().min(1).max(20_000) })
  .strict();

export const workItemEvidenceSchema = z.object({
  id: idSchema,
  itemId: idSchema,
  author: z.object({
    id: idSchema,
    name: z.string().min(1).max(160),
  }),
  body: z.string().min(1).max(20_000),
  evidence: z.literal(true),
  editedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workItemEvidenceMutationSchema = z.object({
  evidence: workItemEvidenceSchema,
  itemVersion: z.number().int().nonnegative().max(2_147_483_647),
});

export const workItemHistoryEntrySchema = z.object({
  id: idSchema,
  type: z.string().min(1).max(120),
  reasonCode: z.string().min(1).max(160),
  summary: z.string().min(1).max(2_000),
  actor: z
    .object({
      id: idSchema,
      name: z.string().min(1).max(160),
    })
    .optional(),
  evidence: z
    .array(
      z.object({
        id: idSchema,
        body: z.string().min(1).max(20_000),
      }),
    )
    .max(25)
    .optional(),
  itemVersion: z.number().int().nonnegative().optional(),
  occurredAt: z.iso.datetime(),
  metadata: z.record(z.string(), z.unknown()),
});

export const assignWorkItemSchema = z
  .object({ assigneeIds: z.array(idSchema).max(100) })
  .strict();

export const blockWorkItemSchema = z
  .object({
    blocked: z.boolean(),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const decisionTransitionSchema = z
  .object({
    state: z.enum(["needed", "analyzing", "delegated", "deferred", "decided"]),
    rationale: z.string().trim().min(1).max(5_000),
    evidence: z.string().trim().min(1).max(20_000).optional(),
  })
  .strict();

export const approvalTransitionSchema = z
  .object({
    state: z.enum(["pending", "changes_requested", "approved", "rejected"]),
    rationale: z.string().trim().min(1).max(5_000),
    evidence: z.string().trim().min(1).max(20_000).optional(),
  })
  .strict();

export const resolveWorkItemSchema = z
  .object({ evidence: z.string().trim().min(1).max(20_000) })
  .strict();

export const workItemTransitionResponseSchema = z.object({
  item: workItemSchema,
  evidence: workItemEvidenceSchema.optional(),
  attentionRefreshQueued: z.boolean(),
});

export const operationsStatusSchema = z.object({
  pendingOutbox: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  oldestPendingAt: z.iso.datetime().optional(),
  lastProcessedAt: z.iso.datetime().optional(),
});

export const privacyRequestKindSchema = z.enum([
  "access",
  "portability",
  "erasure",
  "rectification",
  "restriction",
  "objection",
]);
export const privacyRequestScopeSchema = z.enum(["user", "organization"]);
export const privacyRequestStatusSchema = z.enum([
  "submitted",
  "under_review",
  "approved",
  "processing",
  "completed",
  "rejected",
  "cancelled",
  "failed",
]);
export const privacyDataCategorySchema = z.enum([
  "identity",
  "organization",
  "work",
  "collaboration",
  "audit",
  "operations",
  "integrations",
  "billing",
]);
export const privacyDispositionSchema = z.enum([
  "delete",
  "anonymize",
  "archive",
  "manual_review",
]);

export const createPrivacyRequestSchema = z.discriminatedUnion("scope", [
  z
    .object({
      kind: privacyRequestKindSchema,
      scope: z.literal("user"),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["access", "portability", "erasure", "restriction"]),
      scope: z.literal("organization"),
    })
    .strict(),
]);

export const dataLifecycleRequestSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  requestedBy: idSchema,
  subjectUserId: idSchema.optional(),
  kind: privacyRequestKindSchema,
  scope: privacyRequestScopeSchema,
  status: privacyRequestStatusSchema,
  dueAt: z.iso.datetime(),
  processingStartedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  cancelledAt: z.iso.datetime().optional(),
  failureCode: z.string().max(128).optional(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const retentionPolicySchema = z.object({
  category: privacyDataCategorySchema,
  retentionDays: z.number().int().min(1).max(3_650),
  disposition: privacyDispositionSchema,
  legalHold: z.boolean(),
  policyVersion: z.number().int().positive(),
  source: z.enum(["default", "organization_override"]),
  effectiveAt: z.iso.datetime(),
  enforcementStatus: z.literal("not_implemented"),
});

export const updateRetentionPolicySchema = retentionPolicySchema.pick({
  category: true,
  retentionDays: true,
  disposition: true,
  legalHold: true,
});

export const privacyInventoryEntrySchema = z.object({
  category: privacyDataCategorySchema,
  examples: z.array(z.string().min(1).max(120)).max(12),
  purpose: z.string().min(1).max(300),
  classification: z.enum([
    "personal",
    "customer_content",
    "security",
    "commercial",
  ]),
  defaultRetentionDays: z.number().int().min(1).max(3_650),
  defaultDisposition: privacyDispositionSchema,
});

export const privacyProgramStatusSchema = z.object({
  inventoryVersion: z.string().min(1).max(64),
  policyVersion: z.string().min(1).max(64),
  legalDocuments: z.object({
    privacyNotice: z.object({
      version: z.string(),
      reviewStatus: z.literal("pending"),
    }),
    terms: z.object({
      version: z.string(),
      reviewStatus: z.literal("pending"),
    }),
  }),
  externalProviders: z.object({
    enabled: z.literal(false),
    configured: z.array(z.string()).length(0),
    revocationAutomation: z.literal("unavailable"),
  }),
  requestsAreReviewedBeforeEffects: z.literal(true),
  inventory: z.array(privacyInventoryEntrySchema),
  retention: z.array(retentionPolicySchema),
});

export const paginatedItemsSchema = z.object({
  data: z.array(workItemSchema),
  nextCursor: z.string().nullable(),
});

export const createItemSchema = workItemBaseSchema
  .omit({
    id: true,
    version: true,
    assignees: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    description: z.string().max(20_000).default(""),
    assigneeIds: z.array(idSchema).max(100).default([]),
  })
  .superRefine((value, context) => {
    if (value.type === "approval" && !value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "An approval item needs an approval state.",
      });
    if (value.type !== "approval" && value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "Only approval items can carry an approval state.",
      });
    if (value.type === "decision" && !value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "A decision item needs a decision state.",
      });
    if (value.type !== "decision" && value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "Only decision items can carry a decision state.",
      });
  });
export const updateItemSchema = workItemBaseSchema
  .pick({
    title: true,
    description: true,
    status: true,
    priority: true,
    dueDate: true,
  })
  .partial()
  .extend({ assigneeIds: z.array(idSchema).max(100).optional() })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "At least one work-item field must change.",
    },
  );

export const idempotencyKeySchema = z.string().uuid();
export const entityTagSchema = z.string().regex(/^"\d+"$/);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type User = z.infer<typeof userSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;
export type OrganizationContext = z.infer<typeof organizationContextSchema>;
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type InvitationAcceptance = z.infer<typeof invitationAcceptanceSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type WorkspaceDto = z.infer<typeof workspaceSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type WorkspaceCreation = z.infer<typeof workspaceCreationSchema>;
export type BoardDto = z.infer<typeof boardSchema>;
export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type WorkItemDto = z.infer<typeof workItemSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;
export type PortfolioDto = z.infer<typeof portfolioSchema>;
export type AttentionSignalDto = z.infer<typeof attentionSignalSchema>;
export type AttentionAction = z.infer<typeof attentionActionSchema>;
export type WaitingStateDto = z.infer<typeof waitingStateSchema>;
export type WaitingAction = z.infer<typeof waitingActionSchema>;
export type CreateWaitingInput = z.infer<typeof createWaitingSchema>;
export type WeeklyReviewInput = z.infer<typeof weeklyReviewInputSchema>;
export type WeeklyReviewResponse = z.infer<typeof weeklyReviewResponseSchema>;
export type WeeklyReviewRecordDto = z.infer<typeof weeklyReviewRecordSchema>;
export type WorkspaceDetailDto = z.infer<typeof workspaceDetailSchema>;
export type MeaningfulChangeDto = z.infer<typeof meaningfulChangeSchema>;
export type ChangeRadarDto = z.infer<typeof changeRadarSchema>;
export type WorkspaceSnapshotDto = z.infer<typeof workspaceSnapshotSchema>;
export type ReviewRitualDto = z.infer<typeof reviewRitualSchema>;
export type DecisionOutcomeDto = z.infer<typeof decisionOutcomeSchema>;
export type ManagementMemoryDto = z.infer<typeof managementMemorySchema>;
export type SearchResultDto = z.infer<typeof searchResultSchema>;
export type TeamFeatureCapability = z.infer<typeof teamFeatureCapabilitySchema>;
export type TeamPreset = z.infer<typeof teamPresetSchema>;
export type TeamFeaturePolicySource = z.infer<
  typeof teamFeaturePolicySourceSchema
>;
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;
export type CollaborationUserDto = z.infer<typeof collaborationUserSchema>;
export type TeamMemberDto = z.infer<typeof teamMemberSchema>;
export type TeamDto = z.infer<typeof teamSchema>;
export type TeamDirectoryDto = z.infer<typeof teamDirectorySchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type SetTeamMemberInput = z.infer<typeof setTeamMemberSchema>;
export type SetConversationParticipantInput = z.infer<
  typeof setConversationParticipantSchema
>;
export type ConversationDto = z.infer<typeof conversationSchema>;
export type ConversationMessageDto = z.infer<typeof conversationMessageSchema>;
export type ConversationParticipantDto = z.infer<
  typeof conversationParticipantSchema
>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type CreateConversationMessageInput = z.infer<
  typeof createConversationMessageSchema
>;
export type ConversationReadCheckpointDto = z.infer<
  typeof conversationReadCheckpointSchema
>;
export type PaginatedConversations = z.infer<
  typeof paginatedConversationsSchema
>;
export type PaginatedConversationMessages = z.infer<
  typeof paginatedConversationMessagesSchema
>;
export type CollaborationEventDto = z.infer<typeof collaborationEventSchema>;
export type CollaborationEventBatch = z.infer<
  typeof collaborationEventBatchSchema
>;
export type InboxItemDto = z.infer<typeof inboxItemSchema>;
export type CaptureInboxItemInput = z.infer<typeof captureInboxItemSchema>;
export type UpdateInboxItemInput = z.infer<typeof updateInboxItemSchema>;
export type ConvertInboxItemInput = z.infer<typeof convertInboxItemSchema>;
export type ConvertedInboxItem = z.infer<typeof convertedInboxItemSchema>;
export type WorkItemEvidenceInput = z.infer<typeof workItemEvidenceInputSchema>;
export type WorkItemEvidenceDto = z.infer<typeof workItemEvidenceSchema>;
export type WorkItemEvidenceMutation = z.infer<
  typeof workItemEvidenceMutationSchema
>;
export type WorkItemHistoryEntryDto = z.infer<
  typeof workItemHistoryEntrySchema
>;
export type AssignWorkItemInput = z.infer<typeof assignWorkItemSchema>;
export type BlockWorkItemInput = z.infer<typeof blockWorkItemSchema>;
export type DecisionTransitionInput = z.infer<typeof decisionTransitionSchema>;
export type ApprovalTransitionInput = z.infer<typeof approvalTransitionSchema>;
export type ResolveWorkItemInput = z.infer<typeof resolveWorkItemSchema>;
export type WorkItemTransitionResponse = z.infer<
  typeof workItemTransitionResponseSchema
>;
export type OperationsStatusDto = z.infer<typeof operationsStatusSchema>;
export type PrivacyRequestKind = z.infer<typeof privacyRequestKindSchema>;
export type PrivacyRequestScope = z.infer<typeof privacyRequestScopeSchema>;
export type PrivacyRequestStatus = z.infer<typeof privacyRequestStatusSchema>;
export type PrivacyDataCategory = z.infer<typeof privacyDataCategorySchema>;
export type PrivacyDisposition = z.infer<typeof privacyDispositionSchema>;
export type CreatePrivacyRequestInput = z.infer<
  typeof createPrivacyRequestSchema
>;
export type DataLifecycleRequestDto = z.infer<
  typeof dataLifecycleRequestSchema
>;
export type RetentionPolicyDto = z.infer<typeof retentionPolicySchema>;
export type UpdateRetentionPolicyInput = z.infer<
  typeof updateRetentionPolicySchema
>;
export type PrivacyProgramStatusDto = z.infer<
  typeof privacyProgramStatusSchema
>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workspace.health.changed"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("item.status.changed"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("decision.requested"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("approval.completed"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
]);
