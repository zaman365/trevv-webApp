import { describe, expect, it } from "vitest";
import {
  attentionSignalSchema,
  collaborationEventBatchSchema,
  conversationSchema,
  createPrivacyRequestSchema,
  createConversationMessageSchema,
  createConversationSchema,
  createTeamSchema,
  createWaitingSchema,
  readRuntimeReleaseMetadata,
  readinessSchema,
  runtimeReleaseMetadataRequired,
  privacyProgramStatusSchema,
  sessionSchema,
  setConversationParticipantSchema,
  teamSchema,
  teamFeatureCapabilitiesForPreset,
  updateMessageResponseSchema,
  workspaceCreationSchema,
} from "./index";
import { openApiDocument } from "./openapi";

const timestamp = "2026-08-29T12:00:00.000Z";

describe("runtime release metadata", () => {
  const valid = {
    RELEASE_ID: "release-2026.08.30.1",
    RELEASE_GIT_SHA: "A".repeat(40),
    RELEASE_IMAGE_ID: `sha256:${"B".repeat(64)}`,
  };

  it("normalizes complete immutable artifact identity", () => {
    expect(readRuntimeReleaseMetadata(valid)).toEqual({
      releaseId: valid.RELEASE_ID,
      gitSha: valid.RELEASE_GIT_SHA.toLowerCase(),
      imageId: valid.RELEASE_IMAGE_ID.toLowerCase(),
    });
  });

  it("rejects missing, partial, abbreviated, and mutable-looking identity", () => {
    expect(() => readRuntimeReleaseMetadata({}, { required: true })).toThrow(
      /required for this runtime/,
    );
    expect(() =>
      readRuntimeReleaseMetadata({ RELEASE_ID: valid.RELEASE_ID }),
    ).toThrow(/configured together/);
    expect(() =>
      readRuntimeReleaseMetadata({
        ...valid,
        RELEASE_GIT_SHA: "abc123",
      }),
    ).toThrow(/full 40-character Git SHA/);
    expect(() =>
      readRuntimeReleaseMetadata({
        ...valid,
        RELEASE_IMAGE_ID: "latest",
      }),
    ).toThrow(/sha256/);
    expect(() =>
      readRuntimeReleaseMetadata({
        ...valid,
        RELEASE_ID: "latest",
      }),
    ).toThrow(/manifest-compatible/);
    expect(() =>
      readRuntimeReleaseMetadata({
        ...valid,
        RELEASE_ID: "TREVV-2026.08.30",
      }),
    ).toThrow(/lowercase/);
    expect(
      readRuntimeReleaseMetadata({
        ...valid,
        RELEASE_ID: "trevv+2026.08.30",
      }),
    ).toMatchObject({ releaseId: "trevv+2026.08.30" });
  });

  it("requires metadata for production or an explicit topology gate", () => {
    expect(runtimeReleaseMetadataRequired({}, false)).toBe(false);
    expect(runtimeReleaseMetadataRequired({}, true)).toBe(true);
    expect(
      runtimeReleaseMetadataRequired(
        { RELEASE_METADATA_REQUIRED: "true" },
        false,
      ),
    ).toBe(true);
    expect(() =>
      runtimeReleaseMetadataRequired(
        { RELEASE_METADATA_REQUIRED: "sometimes" },
        false,
      ),
    ).toThrow(/explicitly true or false/);
  });
});

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

  it("publishes server-derived managed Workspace scopes in the session", () => {
    expect(
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
          timezone: "Europe/Berlin",
        },
        availableOrganizations: [
          { id: "org-1", name: "Example", slug: "example", role: "owner" },
        ],
        managedWorkspaceIds: ["workspace-1"],
        expiresAt: timestamp,
      }),
    ).toMatchObject({ managedWorkspaceIds: ["workspace-1"] });
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

describe("Phase 5 privacy contract", () => {
  it("keeps external providers disabled and legal review visibly pending", () => {
    expect(
      privacyProgramStatusSchema.parse({
        inventoryVersion: "2026-08-29.1",
        policyVersion: "2026-08-29.1",
        legalDocuments: {
          privacyNotice: {
            version: "2026-08-29.1",
            reviewStatus: "pending",
          },
          terms: { version: "2026-08-29.1", reviewStatus: "pending" },
        },
        externalProviders: {
          enabled: false,
          configured: [],
          revocationAutomation: "unavailable",
        },
        requestsAreReviewedBeforeEffects: true,
        inventory: [],
        retention: [],
      }),
    ).toMatchObject({
      legalDocuments: { privacyNotice: { reviewStatus: "pending" } },
      externalProviders: { enabled: false, configured: [] },
    });

    expect(
      privacyProgramStatusSchema.safeParse({
        inventoryVersion: "2026-08-29.1",
        policyVersion: "2026-08-29.1",
        legalDocuments: {
          privacyNotice: {
            version: "2026-08-29.1",
            reviewStatus: "pending",
          },
          terms: { version: "2026-08-29.1", reviewStatus: "pending" },
        },
        externalProviders: {
          enabled: true,
          configured: ["invented-provider"],
          revocationAutomation: "available",
        },
        requestsAreReviewedBeforeEffects: true,
        inventory: [],
        retention: [],
      }).success,
    ).toBe(false);
  });

  it("rejects organization-scoped correction requests", () => {
    expect(
      createPrivacyRequestSchema.safeParse({
        kind: "rectification",
        scope: "organization",
      }).success,
    ).toBe(false);
  });

  it("publishes the reviewed-request lifecycle endpoints", () => {
    for (const path of [
      "/api/v1/privacy",
      "/api/v1/privacy/requests",
      "/api/v1/privacy/requests/{id}",
      "/api/v1/privacy/retention",
    ] as const)
      expect(openApiDocument.paths).toHaveProperty(path);

    expect(
      openApiDocument.paths["/api/v1/privacy/requests"].post.responses["202"]
        .description,
    ).toContain("no effect");
  });
});

describe("Phase 4 collaboration contract", () => {
  it("requires a Team lead to be a member", () => {
    expect(
      createTeamSchema.safeParse({
        workspaceId: "workspace-1",
        name: "Technology",
        preset: "technology",
        memberIds: ["user-1"],
        leadUserId: "user-2",
      }).success,
    ).toBe(false);
    expect(
      createTeamSchema.parse({
        workspaceId: "workspace-1",
        name: "Preset Team",
        preset: "technology",
      }).featureCapabilities,
    ).toBeUndefined();
    expect(
      createTeamSchema.parse({
        workspaceId: "workspace-1",
        name: "Empty override Team",
        preset: "technology",
        featureCapabilities: [],
      }).featureCapabilities,
    ).toEqual([]);
    expect(
      teamSchema.safeParse({
        id: "team-1",
        organizationId: "org-1",
        portfolioId: "portfolio-1",
        workspaceId: "workspace-1",
        name: "Technology",
        purpose: "Ship",
        preset: "technology",
        featureCapabilities: ["work"],
        featurePolicySource: "preset",
        members: [],
        room: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
    ).toBe(true);
    expect(teamFeatureCapabilitiesForPreset("technology")).toEqual([
      "work",
      "messages",
      "decisions",
      "approvals",
      "resources",
      "reporting",
    ]);
  });

  it("keeps direct and external conversations scoped explicitly", () => {
    expect(
      createConversationSchema.safeParse({
        workspaceId: "workspace-1",
        title: "Direct",
        kind: "direct",
        visibility: "organization",
        participantIds: ["user-1", "user-2"],
      }).success,
    ).toBe(false);
    expect(
      createConversationSchema.safeParse({
        workspaceId: "workspace-1",
        title: "Partner room",
        kind: "external",
        visibility: "private",
        participantIds: ["user-1", "guest-1"],
      }).success,
    ).toBe(false);
  });

  it("requires response ownership for requests and decisions", () => {
    expect(
      createConversationMessageSchema.safeParse({
        clientMessageId: "98d1db31-da99-448b-886e-b2285761095a",
        body: "Please confirm the launch date.",
        intent: "request",
      }).success,
    ).toBe(false);
  });

  it("bounds metadata, reserves cancellation for server lifecycle, and supports owner transfer", () => {
    expect(
      createConversationMessageSchema.safeParse({
        clientMessageId: "98d1db31-da99-448b-886e-b2285761095b",
        body: "Bounded metadata",
        metadata: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [`key-${index}`, true]),
        ),
      }).success,
    ).toBe(false);
    expect(
      updateMessageResponseSchema.safeParse({ responseState: "cancelled" })
        .success,
    ).toBe(false);
    expect(
      setConversationParticipantSchema.parse({ participantRole: "owner" }),
    ).toEqual({ participantRole: "owner" });
    expect(
      conversationSchema.parse({
        id: "conversation-1",
        organizationId: "org-1",
        portfolioId: "portfolio-1",
        workspaceId: "workspace-1",
        title: "Launch room",
        purpose: "Coordinate launch",
        kind: "workspace",
        visibility: "private",
        participants: [],
        unreadCount: 0,
        needsResponseCount: 2,
        retentionDays: 365,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toMatchObject({ needsResponseCount: 2 });
  });

  it("uses monotonically cursorable collaboration events", () => {
    expect(
      collaborationEventBatchSchema.parse({
        events: [
          {
            cursor: 4,
            organizationId: "org-1",
            workspaceId: "workspace-1",
            type: "message.sent",
            aggregateType: "message",
            aggregateId: "message-1",
            conversationId: "conversation-1",
            occurredAt: timestamp,
          },
        ],
        nextCursor: 4,
      }),
    ).toMatchObject({ nextCursor: 4 });
  });

  it("publishes every Phase 4 collaboration endpoint", () => {
    for (const path of [
      "/api/v1/workspaces/{workspaceId}/teams",
      "/api/v1/teams/{id}",
      "/api/v1/teams/{teamId}/members/{userId}",
      "/api/v1/workspaces/{workspaceId}/conversations",
      "/api/v1/conversations/{id}",
      "/api/v1/conversations/{id}/participants/{userId}",
      "/api/v1/conversations/{id}/messages",
      "/api/v1/messages/{id}/response",
      "/api/v1/messages/{id}/reactions/{emoji}",
      "/api/v1/conversations/{id}/read-checkpoint",
      "/api/v1/events",
      "/api/v1/readyz",
    ] as const)
      expect(openApiDocument.paths).toHaveProperty(path);

    expect(
      openApiDocument.paths["/api/v1/conversations/{id}/messages"].get
        .parameters,
    ).toEqual(
      expect.arrayContaining([
        { $ref: "#/components/parameters/ParentMessageId" },
      ]),
    );
    expect(
      readinessSchema.parse({
        status: "ready",
        service: "trevv-api",
        version: "v1",
        mode: "live",
        registrationMode: "invite_only",
        database: "ready",
        release: {
          releaseId: "release-2026.08.30.1",
          gitSha: "a".repeat(40),
          imageId: `sha256:${"b".repeat(64)}`,
        },
        time: timestamp,
      }),
    ).toMatchObject({
      database: "ready",
      release: { releaseId: "release-2026.08.30.1" },
    });
  });
});
