import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  createOrganizationScope,
  createPostgresRepositories,
} from "../src/index.js";
import {
  conversationMessages,
  conversationReactions,
  memberships,
  organizations,
  outboxEvents,
  portfolioMembers,
  portfolios,
  teamFeaturePolicies,
  teamMembers,
  users,
  workspaceMembers,
  workspaces,
} from "../src/schema.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "./database-test-helper.js";

let temporary: TemporaryDatabase;
let connection: ReturnType<typeof createDatabase>;

beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await migrateCurrent(temporary.url);
  connection = createDatabase(temporary.url);
}, 120_000);

afterAll(async () => {
  await connection?.close();
  await temporary?.drop();
}, 120_000);

async function seed(label: string) {
  const organizationId = `org-collab-${label}`;
  const ownerId = `owner-collab-${label}`;
  const memberId = `member-collab-${label}`;
  const observerId = `observer-collab-${label}`;
  const guestId = `guest-collab-${label}`;
  const secondGuestId = `guest-two-collab-${label}`;
  const portfolioId = `portfolio-collab-${label}`;
  const workspaceId = `workspace-collab-${label}`;
  await connection.db.transaction(async (transaction) => {
    await transaction.insert(organizations).values({
      id: organizationId,
      name: `Organization ${label}`,
      slug: `collaboration-${label}`,
    });
    await transaction.insert(users).values([
      { id: ownerId, email: `${ownerId}@example.test`, name: "Owner" },
      { id: memberId, email: `${memberId}@example.test`, name: "Member" },
      {
        id: observerId,
        email: `${observerId}@example.test`,
        name: "Observer",
      },
      { id: guestId, email: `${guestId}@example.test`, name: "Guest" },
      {
        id: secondGuestId,
        email: `${secondGuestId}@example.test`,
        name: "Second guest",
      },
    ]);
    await transaction.insert(memberships).values([
      { organizationId, userId: ownerId, role: "owner" },
      { organizationId, userId: memberId, role: "member" },
      { organizationId, userId: observerId, role: "member" },
      { organizationId, userId: guestId, role: "guest" },
      { organizationId, userId: secondGuestId, role: "guest" },
    ]);
    await transaction.insert(portfolios).values({
      id: portfolioId,
      organizationId,
      name: "Portfolio",
      slug: "portfolio",
      isDefault: true,
    });
    await transaction.insert(portfolioMembers).values({
      organizationId,
      portfolioId,
      userId: ownerId,
      role: "owner",
    });
    await transaction.insert(workspaces).values({
      id: workspaceId,
      organizationId,
      portfolioId,
      name: "Workspace",
      slug: "workspace",
      type: "business",
      accentColor: "#334455",
      icon: "W",
      lifecycleStage: "build",
      health: "on_track",
      leadUserId: ownerId,
    });
    await transaction.insert(workspaceMembers).values([
      { organizationId, workspaceId, userId: ownerId, canManage: true },
      { organizationId, workspaceId, userId: memberId, canManage: false },
      { organizationId, workspaceId, userId: observerId, canManage: false },
      { organizationId, workspaceId, userId: guestId, canManage: false },
      {
        organizationId,
        workspaceId,
        userId: secondGuestId,
        canManage: false,
      },
    ]);
  });
  return {
    organizationId,
    ownerId,
    memberId,
    observerId,
    guestId,
    secondGuestId,
    workspaceId,
  };
}

describe("collaboration PostgreSQL repositories", () => {
  it("lists and materializes implicit administrator Workspace access for Team assignment", async () => {
    const fixture = await seed("implicit-admin-team");
    const adminId = "admin-collab-implicit-admin-team";
    const unassignedMemberId = "unassigned-collab-implicit-admin-team";
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(users).values([
        {
          id: adminId,
          email: `${adminId}@example.test`,
          name: "Organization admin",
        },
        {
          id: unassignedMemberId,
          email: `${unassignedMemberId}@example.test`,
          name: "Unassigned member",
        },
      ]);
      await transaction.insert(memberships).values([
        {
          organizationId: fixture.organizationId,
          userId: adminId,
          role: "admin",
        },
        {
          organizationId: fixture.organizationId,
          userId: unassignedMemberId,
          role: "member",
        },
      ]);
    });
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-implicit-admin-team",
      }),
    );

    const directory = await repositories.collaboration.listWorkspaceUsers(
      fixture.workspaceId,
    );
    expect(directory).toContainEqual(
      expect.objectContaining({ id: adminId, organizationRole: "admin" }),
    );
    expect(directory.map(({ id }) => id)).not.toContain(unassignedMemberId);
    await expect(
      connection.db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.organizationId, fixture.organizationId),
          eq(workspaceMembers.workspaceId, fixture.workspaceId),
          eq(workspaceMembers.userId, adminId),
        ),
      }),
    ).resolves.toBeUndefined();

    const now = new Date("2026-08-29T12:00:00.000Z");
    const team = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Administrators",
        memberIds: [fixture.ownerId, adminId],
        leadUserId: fixture.ownerId,
      },
      { method: "POST", route: "/api/v1/teams/administrators", now },
    );

    expect(
      team.value.members.map(({ membership }) => membership.userId),
    ).toContain(adminId);
    await expect(
      connection.db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.organizationId, fixture.organizationId),
          eq(workspaceMembers.workspaceId, fixture.workspaceId),
          eq(workspaceMembers.userId, adminId),
        ),
      }),
    ).resolves.toMatchObject({
      canManage: false,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("creates a Team and private room atomically and replays safely", async () => {
    const fixture = await seed("atomic");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-team-create",
      }),
    );
    const context = {
      method: "POST",
      route: "/api/v1/teams",
      idempotencyKey: "team-create-key",
      now: new Date("2026-08-29T12:00:00.000Z"),
    };
    const input = {
      workspaceId: fixture.workspaceId,
      name: "Technology",
      memberIds: [fixture.ownerId, fixture.memberId],
      leadUserId: fixture.ownerId,
      featureCapabilities: ["work" as const, "messages" as const],
    };
    const created = await repositories.collaboration.createTeam(input, context);
    const replayed = await repositories.collaboration.createTeam(
      input,
      context,
    );

    expect(created.replayed).toBe(false);
    expect(replayed.replayed).toBe(true);
    expect(replayed.value.team.id).toBe(created.value.team.id);
    expect(created.value.members).toHaveLength(2);
    expect(created.value.room.conversationId).toBeTruthy();
    expect(created.value.featurePolicySource).toBe("override");
    const storedPolicies = await connection.db
      .select()
      .from(teamFeaturePolicies)
      .where(eq(teamFeaturePolicies.teamId, created.value.team.id));
    expect(storedPolicies).toHaveLength(6);
    expect(storedPolicies.every(({ source }) => source === "override")).toBe(
      true,
    );
    expect(
      storedPolicies
        .filter(({ enabled }) => enabled)
        .map(({ featureKey }) => featureKey)
        .sort(),
    ).toEqual(["messages", "work"]);

    const emptyOverride = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Explicitly empty",
        preset: "technology",
        featureCapabilities: [],
        featurePolicySource: "override",
      },
      { method: "POST", route: "/api/v1/teams/empty-override" },
    );
    expect(emptyOverride.value).toMatchObject({
      featureCapabilities: [],
      featurePolicySource: "override",
    });
    await expect(
      repositories.collaboration.createTeam(
        { ...input, name: "Different" },
        context,
      ),
    ).rejects.toMatchObject({
      code: "idempotency_key_reused",
    });
  });

  it("redacts private Team-room identity and activity from nonmembers", async () => {
    const fixture = await seed("team-directory-redaction");
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-team-directory-owner",
      }),
    );
    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Private operations",
        memberIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/teams/private-operations" },
    );
    expect(team.value.room).not.toBeNull();
    await ownerRepositories.collaboration.sendMessage(
      team.value.room!.conversationId,
      {
        clientMessageId: "2f0fc013-af6c-4fa7-a13c-a7878dc22a0a",
        body: "Member-only activity",
      },
      {
        method: "POST",
        route: `/api/v1/conversations/${team.value.room!.conversationId}/messages`,
      },
    );
    const observerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.observerId,
        requestId: "request-team-directory-observer",
      }),
    );
    const observerList = await observerRepositories.collaboration.listTeams(
      fixture.workspaceId,
    );
    expect(observerList).toHaveLength(1);
    expect(observerList[0]).toMatchObject({
      team: { id: team.value.team.id },
      room: null,
    });
    await expect(
      observerRepositories.collaboration.getTeam(team.value.team.id),
    ).resolves.toMatchObject({ room: null });

    const memberRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.memberId,
        requestId: "request-team-directory-member",
      }),
    );
    await expect(
      memberRepositories.collaboration.getTeam(team.value.team.id),
    ).resolves.toMatchObject({
      room: {
        conversationId: team.value.room!.conversationId,
        unreadCount: 1,
      },
    });
  });

  it("keeps Team and synchronized room versions coherent and maps slug conflicts", async () => {
    const fixture = await seed("team-room-cas");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-team-room-cas",
      }),
    );
    const first = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Original Team",
        purpose: "Original purpose",
        memberIds: [fixture.ownerId],
      },
      { method: "POST", route: "/api/v1/teams/original" },
    );
    const second = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Other Team",
        memberIds: [fixture.ownerId],
      },
      { method: "POST", route: "/api/v1/teams/other" },
    );
    const originalRoom = await repositories.collaboration.getConversation(
      first.value.room!.conversationId,
    );
    const renamed = await repositories.collaboration.updateTeam(
      first.value.team.id,
      first.value.team.version,
      { name: "Renamed Team", purpose: "Shared room purpose" },
      { method: "PATCH", route: "/api/v1/teams/original" },
    );
    const renamedRoom = await repositories.collaboration.getConversation(
      first.value.room!.conversationId,
    );
    expect(renamedRoom.conversation).toMatchObject({
      title: "Renamed Team",
      purpose: "Shared room purpose",
      version: originalRoom.conversation.version + 1,
    });
    const withMember = await repositories.collaboration.setTeamMember(
      renamed.value.team.id,
      fixture.memberId,
      renamed.value.team.version,
      "member",
      { method: "PUT", route: "/api/v1/teams/original/members/member" },
    );
    await expect(
      repositories.collaboration.getConversation(
        first.value.room!.conversationId,
      ),
    ).resolves.toMatchObject({
      conversation: { version: renamedRoom.conversation.version + 1 },
    });
    await expect(
      repositories.collaboration.updateTeam(
        second.value.team.id,
        second.value.team.version,
        { name: withMember.value.team.name },
        { method: "PATCH", route: "/api/v1/teams/other" },
      ),
    ).rejects.toMatchObject({
      code: "constraint_conflict",
      message: "An active Team already uses this name.",
    });
    await expect(
      repositories.collaboration.setTeamMember(
        withMember.value.team.id,
        fixture.ownerId,
        withMember.value.team.version,
        "member",
        { method: "PUT", route: "/api/v1/teams/original/members/lead" },
      ),
    ).rejects.toMatchObject({
      code: "constraint_conflict",
      message: "Assign another Team lead before demoting the current lead.",
    });
    const transferred = await repositories.collaboration.setTeamMember(
      withMember.value.team.id,
      fixture.memberId,
      withMember.value.team.version,
      "lead",
      { method: "PUT", route: "/api/v1/teams/original/members/new-lead" },
    );
    expect(
      transferred.value.members.map(({ membership }) => ({
        userId: membership.userId,
        role: membership.role,
      })),
    ).toEqual(
      expect.arrayContaining([
        { userId: fixture.ownerId, role: "member" },
        { userId: fixture.memberId, role: "lead" },
      ]),
    );
  });

  it("counts current-user open response obligations without exposing content", async () => {
    const fixture = await seed("needs-response-count");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-needs-response-count",
      }),
    );
    const room = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Response runway",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/conversations/response-runway" },
    );
    const message = await repositories.collaboration.sendMessage(
      room.value.conversation.id,
      {
        clientMessageId: "92975325-5090-4e4f-a2a4-fb9d28e38121",
        body: "Private decision details",
        intent: "decision",
        responseOwnerId: fixture.ownerId,
      },
      {
        method: "POST",
        route: "/api/v1/conversations/response-runway/messages",
      },
    );
    const listed = await repositories.collaboration.listConversations(
      fixture.workspaceId,
    );
    expect(
      listed.data.find(
        ({ conversation }) => conversation.id === room.value.conversation.id,
      )?.needsResponseCount,
    ).toBe(1);
    await repositories.collaboration.setMessageResponse(
      room.value.conversation.id,
      message.value.message.id,
      message.value.message.version,
      "resolved",
      { method: "PATCH", route: "/api/v1/messages/response/resolve" },
    );
    await expect(
      repositories.collaboration.getConversation(room.value.conversation.id),
    ).resolves.toMatchObject({ needsResponseCount: 0 });
  });

  it("sends one durable message for retries and does not cross tenants", async () => {
    const first = await seed("message-a");
    const second = await seed("message-b");
    const firstRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: first.organizationId,
        userId: first.ownerId,
        requestId: "request-message",
      }),
    );
    const team = await firstRepositories.collaboration.createTeam(
      {
        workspaceId: first.workspaceId,
        name: "Operations",
        memberIds: [first.ownerId],
      },
      { method: "POST", route: "/api/v1/teams" },
    );
    const messageInput = {
      clientMessageId: "2e5863df-d619-4da8-b8fa-ca17b34e5fb8",
      body: "Persistent coordination",
    };
    const messageContext = {
      method: "POST",
      route: `/api/v1/conversations/${team.value.room.conversationId}/messages`,
      idempotencyKey: "send-message-key",
    };
    const sent = await firstRepositories.collaboration.sendMessage(
      team.value.room.conversationId,
      messageInput,
      messageContext,
    );
    const retentionEvents = await connection.db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, first.organizationId),
          eq(outboxEvents.eventType, "message.retention_due"),
          eq(outboxEvents.aggregateId, sent.value.message.id),
        ),
      );
    expect(retentionEvents).toHaveLength(1);
    expect(retentionEvents[0]).toMatchObject({
      aggregateType: "message",
      availableAt: sent.value.message.expiresAt,
      payload: {
        messageId: sent.value.message.id,
        conversationId: team.value.room.conversationId,
        expiresAt: sent.value.message.expiresAt.toISOString(),
      },
    });
    const replay = await firstRepositories.collaboration.sendMessage(
      team.value.room.conversationId,
      messageInput,
      messageContext,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.value.message.id).toBe(sent.value.message.id);
    expect(
      await connection.db
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, first.organizationId),
            eq(outboxEvents.eventType, "message.retention_due"),
            eq(outboxEvents.aggregateId, sent.value.message.id),
          ),
        ),
    ).toHaveLength(1);

    const secondRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: second.organizationId,
        userId: second.ownerId,
        requestId: "request-cross-tenant",
      }),
    );
    await expect(
      secondRepositories.collaboration.getMessage(sent.value.message.id),
    ).rejects.toMatchObject({
      code: "resource_not_found",
    });
  });

  it("serializes concurrent client-message retries and rejects changed content", async () => {
    const fixture = await seed("client-message-race");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-client-message-race",
      }),
    );
    const room = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Retry room",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId],
      },
      { method: "POST", route: "/api/v1/conversations/retry-room" },
    );
    const input = {
      clientMessageId: "e4e31dab-6ce1-49ac-afde-a095ab4c6f8c",
      body: "Exactly once",
    };
    const send = (key: string, body = input.body) =>
      repositories.collaboration.sendMessage(
        room.value.conversation.id,
        { ...input, body },
        {
          method: "POST",
          route: "/api/v1/conversations/retry-room/messages",
          idempotencyKey: key,
        },
      );
    const results = await Promise.all([send("retry-a"), send("retry-b")]);
    expect(results.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(new Set(results.map(({ value }) => value.message.id)).size).toBe(1);
    await expect(send("retry-c", "Changed content")).rejects.toMatchObject({
      code: "idempotency_key_reused",
    });
  });

  it("persists replies as same-conversation threads and rejects foreign parents", async () => {
    const fixture = await seed("threads");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-message-threads",
      }),
    );
    const firstTeam = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Thread room",
        memberIds: [fixture.ownerId],
      },
      { method: "POST", route: "/api/v1/teams/thread-room" },
    );
    const secondTeam = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Other room",
        memberIds: [fixture.ownerId],
      },
      { method: "POST", route: "/api/v1/teams/other-room" },
    );
    const firstConversationId = firstTeam.value.room.conversationId;
    const parent = await repositories.collaboration.sendMessage(
      firstConversationId,
      {
        clientMessageId: "46d6cf6b-1c88-4b3a-820a-7794873f6bca",
        body: "Parent coordination message",
      },
      {
        method: "POST",
        route: `/api/v1/conversations/${firstConversationId}/messages`,
      },
    );
    const reply = await repositories.collaboration.sendMessage(
      firstConversationId,
      {
        clientMessageId: "34509ffc-8ca0-40f4-9576-2d6982dc847c",
        parentMessageId: parent.value.message.id,
        body: "Durable threaded reply",
      },
      {
        method: "POST",
        route: `/api/v1/conversations/${firstConversationId}/messages`,
      },
    );
    expect(reply.value.message.parentMessageId).toBe(parent.value.message.id);
    expect(
      (
        await repositories.collaboration.listMessages(firstConversationId)
      ).data.map(({ message }) => message.id),
    ).toEqual([parent.value.message.id]);
    expect(
      (
        await repositories.collaboration.listMessages(firstConversationId, {
          parentMessageId: parent.value.message.id,
        })
      ).data.map(({ message }) => message.id),
    ).toEqual([reply.value.message.id]);
    await expect(
      repositories.collaboration.sendMessage(
        firstConversationId,
        {
          clientMessageId: "04ea52fb-03c7-40f9-bf21-93bd30f2a3c1",
          parentMessageId: reply.value.message.id,
          body: "Nested reply that the client cannot render",
        },
        {
          method: "POST",
          route: `/api/v1/conversations/${firstConversationId}/messages`,
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      repositories.collaboration.sendMessage(
        secondTeam.value.room.conversationId,
        {
          clientMessageId: "6f90a012-31a5-4145-972c-fd3660853fa1",
          parentMessageId: parent.value.message.id,
          body: "Cross-room reply",
        },
        {
          method: "POST",
          route: `/api/v1/conversations/${secondTeam.value.room.conversationId}/messages`,
        },
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      repositories.collaboration.sendMessage(
        firstConversationId,
        {
          clientMessageId: "9f88dfc7-b125-4f83-a434-9735424d5827",
          parentMessageId: "missing-parent-message",
          body: "Missing-parent reply",
        },
        {
          method: "POST",
          route: `/api/v1/conversations/${firstConversationId}/messages`,
        },
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("guards participant membership with CAS and guest-room invariants", async () => {
    const fixture = await seed("participants");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-participants",
      }),
    );
    const mutation = (route: string, key: string) => ({
      method: "PUT",
      route,
      idempotencyKey: key,
      now: new Date("2026-08-29T12:00:00.000Z"),
    });
    const workspaceRoom = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Workspace room",
        kind: "workspace",
        visibility: "organization",
        participantIds: [fixture.ownerId],
      },
      mutation("/api/v1/conversations", "workspace-room"),
    );
    const workspaceConversationId = workspaceRoom.value.conversation.id;
    const added = await repositories.collaboration.setConversationParticipant(
      workspaceConversationId,
      fixture.memberId,
      workspaceRoom.value.conversation.version,
      true,
      mutation(
        `/api/v1/conversations/${workspaceConversationId}/participants/${fixture.memberId}`,
        "add-workspace-member",
      ),
    );
    expect(added.value.conversation.version).toBe(
      workspaceRoom.value.conversation.version + 1,
    );
    const removed = await repositories.collaboration.setConversationParticipant(
      workspaceConversationId,
      fixture.memberId,
      added.value.conversation.version,
      false,
      mutation(
        `/api/v1/conversations/${workspaceConversationId}/participants/${fixture.memberId}`,
        "remove-workspace-member",
      ),
    );
    expect(removed.value.conversation.version).toBe(
      added.value.conversation.version + 1,
    );
    await expect(
      repositories.collaboration.setConversationParticipant(
        workspaceConversationId,
        fixture.memberId,
        added.value.conversation.version,
        true,
        mutation(
          `/api/v1/conversations/${workspaceConversationId}/participants/${fixture.memberId}`,
          "stale-workspace-member",
        ),
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      repositories.collaboration.setConversationParticipant(
        workspaceConversationId,
        fixture.guestId,
        removed.value.conversation.version,
        true,
        mutation(
          `/api/v1/conversations/${workspaceConversationId}/participants/${fixture.guestId}`,
          "guest-in-workspace-room",
        ),
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });

    const direct = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Direct room",
        kind: "direct",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.memberId],
      },
      mutation("/api/v1/conversations", "direct-room"),
    );
    await expect(
      repositories.collaboration.setConversationParticipant(
        direct.value.conversation.id,
        fixture.memberId,
        direct.value.conversation.version,
        false,
        mutation(
          `/api/v1/conversations/${direct.value.conversation.id}/participants/${fixture.memberId}`,
          "change-direct-room",
        ),
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });

    const team = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Participant invariant team",
        memberIds: [fixture.ownerId, fixture.memberId],
      },
      mutation("/api/v1/teams", "participant-team"),
    );
    const teamRoom = await repositories.collaboration.getConversation(
      team.value.room.conversationId,
    );
    await expect(
      repositories.collaboration.setConversationParticipant(
        teamRoom.conversation.id,
        fixture.memberId,
        teamRoom.conversation.version,
        false,
        mutation(
          `/api/v1/conversations/${teamRoom.conversation.id}/participants/${fixture.memberId}`,
          "change-team-room",
        ),
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });

    const external = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "External room",
        kind: "external",
        visibility: "guest_scoped",
        participantIds: [fixture.ownerId, fixture.guestId],
      },
      mutation("/api/v1/conversations", "external-room"),
    );
    const guestRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.guestId,
        requestId: "request-guest-room-create",
      }),
    );
    await expect(
      guestRepositories.collaboration.createConversation(
        {
          workspaceId: fixture.workspaceId,
          title: "Guest-created external room",
          kind: "external",
          visibility: "guest_scoped",
          participantIds: [fixture.guestId, fixture.ownerId],
        },
        mutation("/api/v1/conversations", "guest-external-room"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      repositories.collaboration.setConversationParticipant(
        external.value.conversation.id,
        fixture.guestId,
        external.value.conversation.version,
        false,
        mutation(
          `/api/v1/conversations/${external.value.conversation.id}/participants/${fixture.guestId}`,
          "remove-last-guest",
        ),
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    const secondGuest =
      await repositories.collaboration.setConversationParticipant(
        external.value.conversation.id,
        fixture.secondGuestId,
        external.value.conversation.version,
        true,
        mutation(
          `/api/v1/conversations/${external.value.conversation.id}/participants/${fixture.secondGuestId}`,
          "add-second-guest",
        ),
      );
    const guestRemoved =
      await repositories.collaboration.setConversationParticipant(
        external.value.conversation.id,
        fixture.guestId,
        secondGuest.value.conversation.version,
        false,
        mutation(
          `/api/v1/conversations/${external.value.conversation.id}/participants/${fixture.guestId}`,
          "remove-first-guest",
        ),
      );
    expect(
      guestRemoved.value.participants.some(
        ({ participant, user }) =>
          user.id === fixture.secondGuestId && participant.removedAt === null,
      ),
    ).toBe(true);
    await connection.db
      .update(memberships)
      .set({ role: "member" })
      .where(
        and(
          eq(memberships.organizationId, fixture.organizationId),
          eq(memberships.userId, fixture.guestId),
        ),
      );
    const restoredAsMember =
      await repositories.collaboration.setConversationParticipant(
        external.value.conversation.id,
        fixture.guestId,
        guestRemoved.value.conversation.version,
        true,
        mutation(
          `/api/v1/conversations/${external.value.conversation.id}/participants/${fixture.guestId}`,
          "restore-former-guest",
        ),
      );
    expect(
      restoredAsMember.value.participants.find(
        ({ user }) => user.id === fixture.guestId,
      )?.participant.participantRole,
    ).toBe("member");
  });

  it("keeps private Workspace rooms visible only to active participants", async () => {
    const fixture = await seed("private-workspace-room");
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-private-room-owner",
      }),
    );
    const created = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Private project room",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.memberId],
      },
      {
        method: "POST",
        route: "/api/v1/conversations",
        idempotencyKey: "private-workspace-room",
        now: new Date("2026-08-29T12:00:00.000Z"),
      },
    );
    const memberRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.memberId,
        requestId: "request-private-room-member",
      }),
    );
    await expect(
      memberRepositories.collaboration.getConversation(
        created.value.conversation.id,
      ),
    ).resolves.toMatchObject({
      conversation: { id: created.value.conversation.id },
    });
    expect(
      (
        await memberRepositories.collaboration.listConversations(
          fixture.workspaceId,
        )
      ).data.map(({ conversation }) => conversation.id),
    ).toContain(created.value.conversation.id);

    const observerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.observerId,
        requestId: "request-private-room-observer",
      }),
    );
    await expect(
      observerRepositories.collaboration.getConversation(
        created.value.conversation.id,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    expect(
      (
        await observerRepositories.collaboration.listConversations(
          fixture.workspaceId,
        )
      ).data.map(({ conversation }) => conversation.id),
    ).not.toContain(created.value.conversation.id);
  });

  it("transfers manual room ownership before removing the former owner", async () => {
    const fixture = await seed("owner-transfer");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-owner-transfer",
      }),
    );
    const room = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Transferable room",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/conversations/transferable" },
    );
    const transferred =
      await repositories.collaboration.setConversationParticipant(
        room.value.conversation.id,
        fixture.memberId,
        room.value.conversation.version,
        true,
        {
          method: "PUT",
          route: "/api/v1/conversations/transferable/participants/member",
        },
        "owner",
      );
    expect(
      transferred.value.participants.map(({ participant, user }) => ({
        userId: user.id,
        role: participant.participantRole,
      })),
    ).toEqual(
      expect.arrayContaining([
        { userId: fixture.ownerId, role: "member" },
        { userId: fixture.memberId, role: "owner" },
      ]),
    );
    await expect(
      repositories.collaboration.setConversationParticipant(
        room.value.conversation.id,
        fixture.ownerId,
        room.value.conversation.version,
        false,
        {
          method: "DELETE",
          route: "/api/v1/conversations/transferable/participants/owner-stale",
        },
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const removed = await repositories.collaboration.setConversationParticipant(
      room.value.conversation.id,
      fixture.ownerId,
      transferred.value.conversation.version,
      false,
      {
        method: "DELETE",
        route: "/api/v1/conversations/transferable/participants/owner",
      },
    );
    expect(
      removed.value.participants.some(
        ({ user }) => user.id === fixture.ownerId,
      ),
    ).toBe(false);
  });

  it("keeps a two-person direct room writable for its non-viewer participant", async () => {
    const fixture = await seed("viewer-direct");
    await connection.db
      .update(memberships)
      .set({ role: "viewer" })
      .where(
        and(
          eq(memberships.organizationId, fixture.organizationId),
          eq(memberships.userId, fixture.observerId),
        ),
      );
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-viewer-direct-owner",
      }),
    );
    const direct = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Read-only participant direct",
        kind: "direct",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.observerId],
      },
      { method: "POST", route: "/api/v1/conversations/viewer-direct" },
    );
    await expect(
      ownerRepositories.collaboration.sendMessage(
        direct.value.conversation.id,
        {
          clientMessageId: "e797a699-e3e7-4d1e-bb13-b75243efc9d8",
          body: "The writable member can coordinate with a read-only viewer.",
        },
        {
          method: "POST",
          route: "/api/v1/conversations/viewer-direct/messages",
        },
      ),
    ).resolves.toMatchObject({
      value: {
        message: {
          body: "The writable member can coordinate with a read-only viewer.",
        },
      },
    });
    const viewerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.observerId,
        requestId: "request-viewer-direct-viewer",
      }),
    );
    await expect(
      viewerRepositories.collaboration.sendMessage(
        direct.value.conversation.id,
        {
          clientMessageId: "39184f79-7e29-4c1b-94c3-a65d6f93fb2e",
          body: "A viewer must remain read-only.",
        },
        {
          method: "POST",
          route: "/api/v1/conversations/viewer-direct/messages",
        },
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("keeps viewers read-only for response workflows", async () => {
    const fixture = await seed("viewer-response");
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-viewer-response-owner",
      }),
    );
    const room = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Viewer response",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.observerId],
      },
      { method: "POST", route: "/api/v1/conversations/viewer-response" },
    );
    const request = await ownerRepositories.collaboration.sendMessage(
      room.value.conversation.id,
      {
        clientMessageId: "e7c284c2-e5fe-4af3-a73c-c49da3e88bbc",
        body: "Resolve this after the legacy role transition",
        intent: "request",
        responseOwnerId: fixture.observerId,
      },
      {
        method: "POST",
        route: "/api/v1/conversations/viewer-response/messages",
      },
    );
    // Simulate a pre-hardening/legacy role transition so the repository guard
    // is tested independently from the lifecycle repair path.
    await connection.db
      .update(memberships)
      .set({ role: "viewer" })
      .where(
        and(
          eq(memberships.organizationId, fixture.organizationId),
          eq(memberships.userId, fixture.observerId),
        ),
      );
    const viewerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.observerId,
        requestId: "request-viewer-response-viewer",
      }),
    );
    await expect(
      viewerRepositories.collaboration.setMessageResponse(
        room.value.conversation.id,
        request.value.message.id,
        request.value.message.version,
        "resolved",
        {
          method: "PATCH",
          route: "/api/v1/messages/viewer-response/response",
        },
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("bounds distinct reaction types per message", async () => {
    const fixture = await seed("reaction-cap");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-reaction-cap",
      }),
    );
    const room = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Reaction cap",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId],
      },
      { method: "POST", route: "/api/v1/conversations/reaction-cap" },
    );
    const sent = await repositories.collaboration.sendMessage(
      room.value.conversation.id,
      {
        clientMessageId: "a1840797-ddff-4509-9007-aa5a9a057e38",
        body: "Bound the reaction vocabulary",
      },
      { method: "POST", route: "/api/v1/conversations/reaction-cap/messages" },
    );
    await connection.db.insert(conversationReactions).values(
      Array.from({ length: 50 }, (_, index) => ({
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
        conversationId: room.value.conversation.id,
        messageId: sent.value.message.id,
        userId: fixture.ownerId,
        emoji: `reaction-${index}`,
      })),
    );
    await expect(
      repositories.collaboration.addReaction(
        room.value.conversation.id,
        sent.value.message.id,
        sent.value.message.version,
        "overflow",
        { method: "PUT", route: "/api/v1/messages/reaction-cap/reactions" },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      repositories.collaboration.getMessage(sent.value.message.id),
    ).resolves.toMatchObject({
      message: { version: sent.value.message.version },
    });
  });

  it("reauthorizes idempotent replays after Team and room removal", async () => {
    const fixture = await seed("replay-authorization");
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-replay-owner",
      }),
    );
    const memberRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.memberId,
        requestId: "request-replay-member",
      }),
    );
    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Replay Team",
        memberIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/teams/replay" },
    );
    const teamInput = {
      clientMessageId: "f71f8435-0a7c-4f3a-a30f-12420a9dc47a",
      body: "Previously authorized Team content",
    };
    const teamContext = {
      method: "POST",
      route: "/api/v1/conversations/replay-team/messages",
      idempotencyKey: "replay-team-message",
    };
    await memberRepositories.collaboration.sendMessage(
      team.value.room!.conversationId,
      teamInput,
      teamContext,
    );
    await ownerRepositories.collaboration.removeTeamMember(
      team.value.team.id,
      fixture.memberId,
      team.value.team.version,
      { method: "DELETE", route: "/api/v1/teams/replay/member" },
    );
    await expect(
      memberRepositories.collaboration.sendMessage(
        team.value.room!.conversationId,
        teamInput,
        teamContext,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });

    const room = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Replay private room",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/conversations/replay-private" },
    );
    const roomInput = {
      clientMessageId: "4ce7ee29-b1be-4899-9441-314d66685192",
      body: "Previously authorized private content",
    };
    const roomContext = {
      method: "POST",
      route: "/api/v1/conversations/replay-private/messages",
      idempotencyKey: "replay-private-message",
    };
    await memberRepositories.collaboration.sendMessage(
      room.value.conversation.id,
      roomInput,
      roomContext,
    );
    const currentRoom = await ownerRepositories.collaboration.getConversation(
      room.value.conversation.id,
    );
    await ownerRepositories.collaboration.setConversationParticipant(
      room.value.conversation.id,
      fixture.memberId,
      currentRoom.conversation.version,
      false,
      {
        method: "DELETE",
        route: "/api/v1/conversations/replay-private/participants/member",
      },
    );
    await expect(
      memberRepositories.collaboration.sendMessage(
        room.value.conversation.id,
        roomInput,
        roomContext,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("replays read checkpoints and never moves them backwards", async () => {
    const fixture = await seed("read-checkpoint-replay");
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-checkpoint-owner",
      }),
    );
    const memberRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.memberId,
        requestId: "request-checkpoint-member",
      }),
    );
    const room = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Read checkpoint",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/conversations/read-checkpoint" },
    );
    const first = await ownerRepositories.collaboration.sendMessage(
      room.value.conversation.id,
      {
        clientMessageId: "08ed5afb-b43b-4c2a-9704-e68a4768e18d",
        body: "First",
      },
      { method: "POST", route: "/api/v1/conversations/read-checkpoint/first" },
    );
    const second = await ownerRepositories.collaboration.sendMessage(
      room.value.conversation.id,
      {
        clientMessageId: "3fe7cc7e-2d49-44bc-959c-64f713d2028e",
        body: "Second",
      },
      { method: "POST", route: "/api/v1/conversations/read-checkpoint/second" },
    );
    const firstContext = {
      method: "PUT",
      route: "/api/v1/conversations/read-checkpoint/read",
      idempotencyKey: "read-first",
    };
    await memberRepositories.collaboration.markRead(
      room.value.conversation.id,
      first.value.message.id,
      firstContext,
    );
    await expect(
      memberRepositories.collaboration.markRead(
        room.value.conversation.id,
        first.value.message.id,
        firstContext,
      ),
    ).resolves.toMatchObject({
      replayed: true,
      value: { lastReadMessageId: first.value.message.id },
    });
    await memberRepositories.collaboration.markRead(
      room.value.conversation.id,
      second.value.message.id,
      {
        method: "PUT",
        route: "/api/v1/conversations/read-checkpoint/read",
        idempotencyKey: "read-second",
      },
    );
    await expect(
      memberRepositories.collaboration.markRead(
        room.value.conversation.id,
        first.value.message.id,
        firstContext,
      ),
    ).resolves.toMatchObject({
      replayed: true,
      value: { lastReadMessageId: second.value.message.id },
    });
    await expect(
      memberRepositories.collaboration.markRead(
        room.value.conversation.id,
        first.value.message.id,
        {
          method: "PUT",
          route: "/api/v1/conversations/read-checkpoint/read",
          idempotencyKey: "read-first-after-second",
        },
      ),
    ).resolves.toMatchObject({
      value: { lastReadMessageId: second.value.message.id },
    });
  });

  it("filters event feeds with the same guest and Team access rules as reads", async () => {
    const fixture = await seed("event-authorization");
    const foreign = await seed("event-authorization-foreign");
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-event-owner",
      }),
    );
    const internal = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Internal organization room",
        kind: "workspace",
        visibility: "organization",
        participantIds: [fixture.ownerId],
      },
      { method: "POST", route: "/api/v1/conversations/event-internal" },
    );
    const external = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "External guest room",
        kind: "external",
        visibility: "guest_scoped",
        participantIds: [fixture.ownerId, fixture.guestId],
      },
      { method: "POST", route: "/api/v1/conversations/event-external" },
    );
    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Event Team",
        memberIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/teams/event-team" },
    );

    const guestRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.guestId,
        requestId: "request-event-guest",
      }),
    );
    const guestEvents = await guestRepositories.collaboration.listEvents(
      fixture.workspaceId,
    );
    expect(guestEvents.events.map(({ aggregateId }) => aggregateId)).toContain(
      external.value.conversation.id,
    );
    expect(
      guestEvents.events.map(({ aggregateId }) => aggregateId),
    ).not.toContain(internal.value.conversation.id);
    expect(
      guestEvents.events.map(({ aggregateId }) => aggregateId),
    ).not.toContain(team.value.team.id);

    await connection.db
      .update(teamMembers)
      .set({ removedAt: new Date("2026-08-29T13:00:00.000Z") })
      .where(
        and(
          eq(teamMembers.organizationId, fixture.organizationId),
          eq(teamMembers.teamId, team.value.team.id),
          eq(teamMembers.userId, fixture.memberId),
        ),
      );
    const staleMemberRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.memberId,
        requestId: "request-event-stale-team-member",
      }),
    );
    await expect(
      staleMemberRepositories.collaboration.getConversation(
        team.value.room!.conversationId,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    expect(
      (
        await staleMemberRepositories.collaboration.listConversations(
          fixture.workspaceId,
        )
      ).data.map(({ conversation }) => conversation.id),
    ).not.toContain(team.value.room!.conversationId);
    expect(
      (
        await staleMemberRepositories.collaboration.listEvents(
          fixture.workspaceId,
        )
      ).events.map(({ aggregateId }) => aggregateId),
    ).not.toContain(team.value.team.id);

    const foreignRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: foreign.organizationId,
        userId: foreign.ownerId,
        requestId: "request-event-foreign",
      }),
    );
    await expect(
      foreignRepositories.collaboration.listEvents(fixture.workspaceId),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("enforces the 250-person cap after adding the implicit actor", async () => {
    const fixture = await seed("participant-cap");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-participant-cap",
      }),
    );
    const submittedIds = Array.from(
      { length: 250 },
      (_, index) => `not-a-member-${index}`,
    );
    await expect(
      repositories.collaboration.createConversation(
        {
          workspaceId: fixture.workspaceId,
          title: "Too many participants",
          kind: "workspace",
          visibility: "private",
          participantIds: submittedIds,
        },
        {
          method: "POST",
          route: "/api/v1/conversations",
          idempotencyKey: "conversation-participant-cap",
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      repositories.collaboration.createTeam(
        {
          workspaceId: fixture.workspaceId,
          name: "Too many Team members",
          memberIds: submittedIds,
        },
        {
          method: "POST",
          route: "/api/v1/teams",
          idempotencyKey: "team-member-cap",
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
  });

  it("enforces active 250-person caps for Team and room re-adds", async () => {
    const fixture = await seed("active-member-cap");
    const generatedIds = Array.from(
      { length: 248 },
      (_, index) => `member-active-cap-${index}`,
    );
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(users).values(
        generatedIds.map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id,
        })),
      );
      await transaction.insert(memberships).values(
        generatedIds.map((userId) => ({
          organizationId: fixture.organizationId,
          userId,
          role: "member" as const,
        })),
      );
      await transaction.insert(workspaceMembers).values(
        generatedIds.map((userId) => ({
          organizationId: fixture.organizationId,
          workspaceId: fixture.workspaceId,
          userId,
          canManage: false,
        })),
      );
    });
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-active-member-cap",
      }),
    );
    const participantIds = [fixture.ownerId, fixture.memberId, ...generatedIds];
    const team = await repositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Full Team",
        memberIds: participantIds,
      },
      { method: "POST", route: "/api/v1/teams/full" },
    );
    const refreshedTeam = await repositories.collaboration.setTeamMember(
      team.value.team.id,
      fixture.memberId,
      team.value.team.version,
      "member",
      { method: "PUT", route: "/api/v1/teams/full/members/existing" },
    );
    await expect(
      repositories.collaboration.setTeamMember(
        team.value.team.id,
        fixture.observerId,
        refreshedTeam.value.team.version,
        "member",
        { method: "PUT", route: "/api/v1/teams/full/members/overflow" },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });

    const conversation = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Full private room",
        kind: "workspace",
        visibility: "private",
        participantIds,
      },
      { method: "POST", route: "/api/v1/conversations/full" },
    );
    const refreshedConversation =
      await repositories.collaboration.setConversationParticipant(
        conversation.value.conversation.id,
        fixture.memberId,
        conversation.value.conversation.version,
        true,
        {
          method: "PUT",
          route: "/api/v1/conversations/full/participants/existing",
        },
      );
    await expect(
      repositories.collaboration.setConversationParticipant(
        conversation.value.conversation.id,
        fixture.observerId,
        refreshedConversation.value.conversation.version,
        true,
        {
          method: "PUT",
          route: "/api/v1/conversations/full/participants/overflow",
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });

    const organizationRoom =
      await repositories.collaboration.createConversation(
        {
          workspaceId: fixture.workspaceId,
          title: "Full organization room",
          kind: "workspace",
          visibility: "organization",
          participantIds,
        },
        { method: "POST", route: "/api/v1/conversations/full-organization" },
      );
    const observerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.observerId,
        requestId: "request-active-member-cap-observer",
      }),
    );
    await expect(
      observerRepositories.collaboration.sendMessage(
        organizationRoom.value.conversation.id,
        {
          clientMessageId: "df6d1084-4672-46bc-95d7-cad177ee65a6",
          body: "Cannot auto-enroll participant 251",
        },
        {
          method: "POST",
          route: "/api/v1/conversations/full-organization/messages",
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
  });

  it("rejects an unpaginated Workspace directory above its contract bound", async () => {
    const fixture = await seed("directory-cap");
    const generatedIds = Array.from(
      { length: 1_998 },
      (_, index) => `directory-cap-member-${index}`,
    );
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(users).values(
        generatedIds.map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id,
        })),
      );
      await transaction.insert(memberships).values(
        generatedIds.map((userId) => ({
          organizationId: fixture.organizationId,
          userId,
          role: "member" as const,
        })),
      );
      await transaction.insert(workspaceMembers).values(
        generatedIds.map((userId) => ({
          organizationId: fixture.organizationId,
          workspaceId: fixture.workspaceId,
          userId,
          canManage: false,
        })),
      );
    });
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-directory-cap",
      }),
    );
    await expect(
      repositories.collaboration.listWorkspaceUsers(fixture.workspaceId),
    ).rejects.toMatchObject({
      code: "constraint_conflict",
      message:
        "This Workspace has more than 2,000 active members. Use the paginated member directory before assigning Teams.",
    });
  }, 30_000);

  it("protects sole owners and open response obligations during removal", async () => {
    const fixture = await seed("participant-obligations");
    await connection.db
      .update(workspaceMembers)
      .set({ canManage: true })
      .where(
        and(
          eq(workspaceMembers.organizationId, fixture.organizationId),
          eq(workspaceMembers.workspaceId, fixture.workspaceId),
          eq(workspaceMembers.userId, fixture.observerId),
        ),
      );
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-obligations-owner",
      }),
    );
    const managerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.observerId,
        requestId: "request-obligations-manager",
      }),
    );
    const room = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Ownership room",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.memberId, fixture.observerId],
      },
      { method: "POST", route: "/api/v1/conversations/ownership" },
    );
    await expect(
      managerRepositories.collaboration.setConversationParticipant(
        room.value.conversation.id,
        fixture.ownerId,
        room.value.conversation.version,
        false,
        {
          method: "DELETE",
          route: "/api/v1/conversations/ownership/participants/owner",
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    const request = await ownerRepositories.collaboration.sendMessage(
      room.value.conversation.id,
      {
        clientMessageId: "b5bdbce4-7816-428a-9305-aae9de42f7db",
        body: "Please decide",
        intent: "decision",
        responseOwnerId: fixture.memberId,
      },
      {
        method: "POST",
        route: "/api/v1/conversations/ownership/messages",
      },
    );
    const currentRoom = await ownerRepositories.collaboration.getConversation(
      room.value.conversation.id,
    );
    await expect(
      ownerRepositories.collaboration.setConversationParticipant(
        room.value.conversation.id,
        fixture.memberId,
        currentRoom.conversation.version,
        false,
        {
          method: "DELETE",
          route: "/api/v1/conversations/ownership/participants/member",
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    const memberRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.memberId,
        requestId: "request-obligations-member",
      }),
    );
    await memberRepositories.collaboration.setMessageResponse(
      room.value.conversation.id,
      request.value.message.id,
      request.value.message.version,
      "resolved",
      {
        method: "PATCH",
        route: "/api/v1/messages/obligation/response",
      },
    );
    await expect(
      ownerRepositories.collaboration.setConversationParticipant(
        room.value.conversation.id,
        fixture.memberId,
        currentRoom.conversation.version,
        false,
        {
          method: "DELETE",
          route:
            "/api/v1/conversations/ownership/participants/member/after-resolution",
        },
      ),
    ).resolves.toMatchObject({ value: { conversation: { version: 3 } } });

    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: fixture.workspaceId,
        name: "Obligation Team",
        memberIds: [fixture.ownerId, fixture.memberId],
      },
      { method: "POST", route: "/api/v1/teams/obligations" },
    );
    const teamRequest = await ownerRepositories.collaboration.sendMessage(
      team.value.room!.conversationId,
      {
        clientMessageId: "584d52f9-af42-4141-bf2e-c2d4ce2a31d2",
        body: "Please approve",
        intent: "request",
        responseOwnerId: fixture.memberId,
      },
      {
        method: "POST",
        route: "/api/v1/conversations/team-obligations/messages",
      },
    );
    await expect(
      ownerRepositories.collaboration.removeTeamMember(
        team.value.team.id,
        fixture.memberId,
        team.value.team.version,
        { method: "DELETE", route: "/api/v1/teams/obligations/member" },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await memberRepositories.collaboration.setMessageResponse(
      team.value.room!.conversationId,
      teamRequest.value.message.id,
      teamRequest.value.message.version,
      "resolved",
      {
        method: "PATCH",
        route: "/api/v1/messages/team-obligation/response",
      },
    );
    await expect(
      ownerRepositories.collaboration.removeTeamMember(
        team.value.team.id,
        fixture.memberId,
        team.value.team.version,
        {
          method: "DELETE",
          route: "/api/v1/teams/obligations/member/after-resolution",
        },
      ),
    ).resolves.toMatchObject({ value: { team: { version: 2 } } });
  });

  it("bounds message metadata, removes linked entities, and rejects viewer response owners", async () => {
    const fixture = await seed("message-boundaries");
    const repositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.ownerId,
        requestId: "request-message-boundaries",
      }),
    );
    const room = await repositories.collaboration.createConversation(
      {
        workspaceId: fixture.workspaceId,
        title: "Message boundaries",
        kind: "workspace",
        visibility: "private",
        participantIds: [fixture.ownerId, fixture.observerId],
      },
      { method: "POST", route: "/api/v1/conversations/message-boundaries" },
    );
    await connection.db
      .update(memberships)
      .set({ role: "viewer" })
      .where(
        and(
          eq(memberships.organizationId, fixture.organizationId),
          eq(memberships.userId, fixture.observerId),
        ),
      );
    const send = (suffix: string, input: Record<string, unknown>) =>
      repositories.collaboration.sendMessage(
        room.value.conversation.id,
        {
          clientMessageId: `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
          body: "Boundary test",
          ...input,
        },
        {
          method: "POST",
          route: `/api/v1/conversations/message-boundaries/messages/${suffix}`,
        },
      );
    await expect(
      send("1", {
        intent: "request",
        responseOwnerId: fixture.observerId,
      }),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      send("2", { metadata: { oversized: "x".repeat(8_192) } }),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      send("3", {
        linkedEntityType: "work_item",
        linkedEntityId: "cross-tenant-or-missing-item",
      }),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
  });
});
