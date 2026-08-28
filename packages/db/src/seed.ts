import {
  demoBlueprintInstances,
  demoBlueprints,
  demoBlueprintVersions,
  demoChangeCheckpoint,
  demoDecisionOutcomes,
  demoDependencies,
  demoWorkspaceSnapshots,
  demoWorkspaces,
  demoInsightLinks,
  demoInsights,
  demoItems,
  demoPortfolios,
  demoReviewRituals,
  demoStakeholderExposure,
  demoWaitingStates,
  generateAttentionSignals,
  unrestrictedDevelopmentEntitlements,
} from "@founderhq/core";
import { createDatabase } from "./index.js";
import {
  attentionSignals,
  blueprintInstances,
  blueprints,
  blueprintVersions,
  boards,
  decisionOutcomes,
  entitlements,
  workspaces,
  workspaceSnapshots,
  insightLinks,
  insights,
  itemDependencies,
  memberships,
  organizations,
  plans,
  portfolioMembers,
  portfolios,
  reviewRituals,
  stakeholderExposures,
  subscriptions,
  userSeenCheckpoints,
  users,
  waitingStates,
  workItems,
} from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed TREVV.");
const { db, close } = createDatabase(databaseUrl);

await db
  .insert(organizations)
  .values({ id: "org-demo", name: "TREVV Demo", slug: "trevv-demo" })
  .onConflictDoNothing();
for (const [index, portfolio] of demoPortfolios.entries())
  await db
    .insert(portfolios)
    .values({
      ...portfolio,
      ordering: index,
    })
    .onConflictDoNothing();
const demoUsers = [
  ["user-owner", "owner@trevv.local", "Mohammed Zaman", "owner"],
  ["user-admin", "admin@trevv.local", "Amira Demir", "admin"],
  ["user-lead", "lead@trevv.local", "Nora Klein", "workspace_lead"],
  ["user-member", "member@trevv.local", "Tim Bauer", "member"],
  ["user-guest", "guest@trevv.local", "Guest Reviewer", "guest"],
  ["user-viewer", "viewer@trevv.local", "Demo Viewer", "viewer"],
] as const;
for (const [id, email, name, role] of demoUsers) {
  await db.insert(users).values({ id, email, name }).onConflictDoNothing();
  await db
    .insert(memberships)
    .values({ organizationId: "org-demo", userId: id, role })
    .onConflictDoNothing();
  await db
    .insert(portfolioMembers)
    .values({
      organizationId: "org-demo",
      portfolioId: "portfolio-demo",
      userId: id,
      role,
    })
    .onConflictDoNothing();
}
for (const [index, workspace] of demoWorkspaces.entries()) {
  await db
    .insert(workspaces)
    .values({
      id: workspace.id,
      organizationId: "org-demo",
      portfolioId: workspace.portfolioId,
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      accentColor: workspace.accent,
      icon: workspace.icon,
      visibility:
        workspace.slug === "personal-projects" ? "private" : "organization",
      lifecycleStage: workspace.stage,
      health: workspace.health,
      healthNote: workspace.healthNote,
      leadUserId: "user-owner",
      currentPriority: workspace.priority,
      nextMilestoneSummary: workspace.nextMilestone.title,
      nextMilestoneDate: workspace.nextMilestone.date,
      lastUpdateAt: new Date(`${workspace.latestUpdate.date}T12:00:00Z`),
      ordering: index,
      progressMode: workspace.progressMode ?? "none",
    })
    .onConflictDoNothing();
}
const boardIds = [...new Set(demoItems.map((item) => item.boardId))];
for (const [index, boardId] of boardIds.entries()) {
  const item = demoItems.find((candidate) => candidate.boardId === boardId);
  if (!item) continue;
  await db
    .insert(boards)
    .values({
      id: boardId,
      organizationId: "org-demo",
      workspaceId: item.workspaceId,
      name: boardId.replace(/^b-/, "").replace(/-/g, " "),
      ordering: index,
    })
    .onConflictDoNothing();
}
for (const [index, item] of demoItems.entries()) {
  await db
    .insert(workItems)
    .values({
      id: item.id,
      organizationId: "org-demo",
      workspaceId: item.workspaceId,
      boardId: item.boardId,
      title: item.title,
      itemType: item.type,
      status: item.status,
      priority: item.priority,
      dueDate: item.dueDate,
      creatorId: "user-owner",
      ordering: index,
      typeData: {
        approvalState: item.approvalState,
        decisionState: item.decisionState,
      },
    })
    .onConflictDoNothing();
}
for (const dependency of demoDependencies)
  await db
    .insert(itemDependencies)
    .values({ organizationId: "org-demo", ...dependency })
    .onConflictDoNothing();

await db
  .insert(plans)
  .values({
    id: "plan-development",
    key: unrestrictedDevelopmentEntitlements.planKey,
    name: "Development unrestricted",
    metadata: { pricing: null, internal: true },
  })
  .onConflictDoNothing();
await db
  .insert(subscriptions)
  .values({
    id: "subscription-demo",
    organizationId: "org-demo",
    planId: "plan-development",
    status: "active",
    provider: "development",
  })
  .onConflictDoNothing();
for (const [key, value] of Object.entries(
  unrestrictedDevelopmentEntitlements.values,
))
  await db
    .insert(entitlements)
    .values({
      id: `entitlement-demo-${key}`,
      organizationId: "org-demo",
      subscriptionId: "subscription-demo",
      key,
      value,
      source: "development",
    })
    .onConflictDoNothing();

for (const waiting of demoWaitingStates)
  await db
    .insert(waitingStates)
    .values({
      id: waiting.id,
      organizationId: waiting.organizationId,
      portfolioId: waiting.portfolioId,
      workspaceId: waiting.workspaceId,
      entityType: waiting.entityType,
      entityId: waiting.entityId,
      waitingType: waiting.waitingType,
      waitingReferenceId: waiting.waitingReferenceId,
      waitingLabel: waiting.waitingLabel,
      waitingSince: new Date(`${waiting.waitingSince}T12:00:00Z`),
      expectedBy: waiting.expectedBy,
      followUpOwnerId: waiting.followUpOwnerId,
      nextFollowUp: waiting.nextFollowUp,
      waitingNote: waiting.waitingNote,
      resolvedAt: waiting.resolvedAt ? new Date(waiting.resolvedAt) : undefined,
    })
    .onConflictDoNothing();

const generatedSignals = generateAttentionSignals(
  "org-demo",
  demoWorkspaces,
  demoItems,
  demoWaitingStates,
  new Date("2026-08-24T12:00:00.000Z"),
  demoDependencies,
);
for (const signal of generatedSignals)
  await db
    .insert(attentionSignals)
    .values({
      id: signal.id,
      organizationId: signal.organizationId,
      portfolioId: signal.portfolioId,
      workspaceId: signal.workspaceId,
      entityType: signal.entityType,
      entityId: signal.entityId,
      signalType: signal.signalType,
      severity: signal.severity,
      impact: signal.impact,
      urgency: signal.urgency,
      responsibility: signal.responsibility,
      reason: signal.reason,
      recommendedAction: signal.recommendedAction,
      metadata: signal.metadata,
      createdAt: new Date(signal.createdAt),
    })
    .onConflictDoNothing();

await db
  .insert(userSeenCheckpoints)
  .values({
    organizationId: "org-demo",
    portfolioId: demoChangeCheckpoint.portfolioId,
    userId: demoChangeCheckpoint.userId,
    lastSeenAt: new Date(demoChangeCheckpoint.lastSeenAt),
  })
  .onConflictDoNothing();

for (const snapshot of demoWorkspaceSnapshots)
  await db
    .insert(workspaceSnapshots)
    .values({
      ...snapshot,
      capturedAt: new Date(snapshot.capturedAt),
      latestUpdateAt: snapshot.latestUpdateAt
        ? new Date(snapshot.latestUpdateAt)
        : undefined,
    })
    .onConflictDoNothing();

for (const ritual of demoReviewRituals)
  await db
    .insert(reviewRituals)
    .values({
      ...ritual,
      nextDueAt: ritual.nextDueAt ? new Date(ritual.nextDueAt) : undefined,
    })
    .onConflictDoNothing();

for (const outcome of demoDecisionOutcomes)
  await db
    .insert(decisionOutcomes)
    .values({
      ...outcome,
      recordedAt: new Date(outcome.recordedAt),
    })
    .onConflictDoNothing();

for (const insight of demoInsights)
  await db
    .insert(insights)
    .values({
      ...insight,
      capturedAt: new Date(insight.capturedAt),
    })
    .onConflictDoNothing();
for (const link of demoInsightLinks)
  await db.insert(insightLinks).values(link).onConflictDoNothing();

for (const blueprint of demoBlueprints)
  await db.insert(blueprints).values(blueprint).onConflictDoNothing();
for (const version of demoBlueprintVersions)
  await db
    .insert(blueprintVersions)
    .values({
      ...version,
      organizationId: "org-demo",
      createdAt: new Date(version.createdAt),
    })
    .onConflictDoNothing();
for (const instance of demoBlueprintInstances)
  await db
    .insert(blueprintInstances)
    .values({
      ...instance,
      detachedAt: instance.detachedAt
        ? new Date(instance.detachedAt)
        : undefined,
    })
    .onConflictDoNothing();

await db
  .insert(stakeholderExposures)
  .values({
    id: demoStakeholderExposure.id,
    organizationId: demoStakeholderExposure.organizationId,
    workspaceId: demoStakeholderExposure.workspaceId,
    principalId: demoStakeholderExposure.principalId,
    showHealth: demoStakeholderExposure.health,
    showLatestUpdate: demoStakeholderExposure.latestUpdate,
    showMilestones: demoStakeholderExposure.milestones,
    selectedWorkItemIds: demoStakeholderExposure.selectedWorkItemIds,
    selectedResourceIds: demoStakeholderExposure.selectedResourceIds,
    approvalItemIds: demoStakeholderExposure.approvalItemIds,
    decisionItemIds: demoStakeholderExposure.decisionItemIds,
    showInternalComments: false,
  })
  .onConflictDoNothing();
await close();
