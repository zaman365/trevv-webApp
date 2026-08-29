import { describe, expect, it } from "vitest";
import {
  attentionSignalSchema,
  createWaitingSchema,
  sessionSchema,
  workspaceCreationSchema,
} from "./index";
import { openApiDocument } from "./openapi";

const timestamp = "2026-08-29T12:00:00.000Z";

describe("Phase 3 API contract", () => {
  it("requires organization timezone and durable Workspace versions", () => {
    expect(() =>
      sessionSchema.parse({
        user: {
          id: "user-1",
          email: "owner@example.test",
          name: "Owner",
          role: "owner",
          locale: "en",
        },
        organizationId: "org-1",
        organization: {
          id: "org-1",
          name: "Example",
          slug: "example",
          role: "owner",
        },
        availableOrganizations: [
          { id: "org-1", name: "Example", slug: "example", role: "owner" },
        ],
        expiresAt: timestamp,
      }),
    ).toThrow();

    expect(
      workspaceCreationSchema.parse({
        workspace: {
          id: "workspace-1",
          portfolioId: "portfolio-1",
          slug: "example-workspace",
          name: "Example Workspace",
          description: "Durable work",
          icon: "E",
          accent: "#334455",
          type: "project",
          stage: "build",
          health: "on_track",
          healthNote: "",
          priority: "Ship",
          metrics: [],
          versionTag: timestamp,
          updatedAt: timestamp,
        },
        board: {
          id: "board-1",
          workspaceId: "workspace-1",
          name: "Example Board",
          description: "",
          templateKey: "trevv_default",
          visibility: "private",
          progressMode: "task_completion",
          ordering: 0,
          versionTag: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    ).toMatchObject({
      workspace: { versionTag: timestamp },
      board: { templateKey: "trevv_default" },
    });
  });

  it("requires deterministic Attention provenance", () => {
    expect(
      attentionSignalSchema.parse({
        id: "attention-1",
        organizationId: "org-1",
        portfolioId: "portfolio-1",
        workspaceId: "workspace-1",
        entityType: "work_item",
        entityId: "item-1",
        signalType: "blocked_work",
        severity: "high",
        impact: 4,
        urgency: 5,
        responsibility: 1,
        reasonCode: "work_item.blocked",
        sourceFingerprint: "sha256:canonical-source",
        reason: "The item is blocked.",
        createdAt: timestamp,
        computedAt: timestamp,
        sourceEvidence: [
          {
            sourceType: "work_item",
            sourceId: "item-1",
            capturedAt: timestamp,
            data: { itemVersion: 3 },
          },
        ],
        metadata: {},
        version: 0,
      }),
    ).toMatchObject({
      reasonCode: "work_item.blocked",
      sourceEvidence: [{ data: { itemVersion: 3 } }],
    });
  });

  it("keeps Waiting anchored to a canonical WorkItem", () => {
    expect(
      createWaitingSchema.safeParse({
        workspaceId: "workspace-1",
        entityType: "decision",
        entityId: "item-1",
        title: "Wait for a decision",
        waitingType: "decision",
        followUpOwnerId: "user-1",
      }).success,
    ).toBe(false);
  });

  it("publishes every Phase 3 golden-path endpoint", () => {
    for (const path of [
      "/api/v1/workspaces",
      "/api/v1/boards",
      "/api/v1/inbox",
      "/api/v1/inbox/{id}/convert",
      "/api/v1/items/{id}",
      "/api/v1/items/{id}/history",
      "/api/v1/items/{id}/evidence",
      "/api/v1/items/{id}/assignees",
      "/api/v1/items/{id}/block",
      "/api/v1/items/{id}/decision",
      "/api/v1/items/{id}/approval",
      "/api/v1/items/{id}/resolve",
      "/api/v1/reviews/weekly",
      "/api/v1/snapshots",
      "/api/v1/operations/status",
    ] as const)
      expect(openApiDocument.paths).toHaveProperty(path);
  });
});
