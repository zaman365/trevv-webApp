import { describe, expect, it } from "vitest";
import * as schema from "./schema";

describe("tenant schema", () => {
  it("includes the required operating and audit records", () => {
    for (const table of [
      "organizations",
      "memberships",
      "hubs",
      "boards",
      "workItems",
      "comments",
      "attachments",
      "hubUpdates",
      "notifications",
      "activityEvents",
      "auditLogs",
      "integrationConnections",
      "webhookDeliveries",
      "outboxEvents",
    ])
      expect(schema).toHaveProperty(table);
  });
});
