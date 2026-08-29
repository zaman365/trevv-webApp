import { describe, expect, it } from "vitest";
import * as schema from "./schema";

describe("tenant schema", () => {
  it("includes the required operating and audit records", () => {
    for (const table of [
      "organizations",
      "portfolios",
      "portfolioMembers",
      "memberships",
      "workspaces",
      "boards",
      "workItems",
      "comments",
      "attachments",
      "workspaceUpdates",
      "notifications",
      "activityEvents",
      "auditLogs",
      "integrationConnections",
      "webhookDeliveries",
      "outboxEvents",
      "attentionSignals",
      "waitingStates",
      "workspaceSnapshots",
      "idempotencyRecords",
      "decisionOutcomes",
      "insights",
      "insightLinks",
      "blueprints",
      "blueprintVersions",
      "blueprintInstances",
      "plans",
      "subscriptions",
      "entitlements",
      "usageCounters",
      "billingEvents",
      "userSeenCheckpoints",
      "reviewRituals",
      "stakeholderExposures",
      "importRuns",
      "inboxItems",
      "conversations",
      "conversationParticipants",
      "conversationMessages",
      "conversationReactions",
      "messageAttachments",
    ])
      expect(schema).toHaveProperty(table);
  });
});
