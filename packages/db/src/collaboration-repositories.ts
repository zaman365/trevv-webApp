import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type {
  MutationContext,
  MutationResult,
  TenantScope,
  TrevvDatabase,
} from "./repositories.js";
import { RepositoryError } from "./repositories.js";
import {
  auditLogs,
  collaborationEvents,
  conversationMessageMetadataQuarantine,
  conversationMessages,
  conversationParticipants,
  conversationReactions,
  conversationReadCheckpoints,
  conversations,
  idempotencyRecords,
  memberships,
  outboxEvents,
  portfolioMembers,
  teamFeaturePolicies,
  teamMembers,
  teamRooms,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from "./schema.js";

export type TeamFeatureCapability =
  "work" | "messages" | "decisions" | "approvals" | "resources" | "reporting";
export type TeamPreset =
  "leadership" | "marketing" | "technology" | "operations" | "sales" | "custom";
const TEAM_FEATURE_CAPABILITIES = [
  "work",
  "messages",
  "decisions",
  "approvals",
  "resources",
  "reporting",
] as const satisfies readonly TeamFeatureCapability[];

export interface CollaborationUserProjection {
  id: string;
  email: string;
  name: string;
  organizationRole: (typeof memberships.$inferSelect)["role"];
}

export interface TeamProjection {
  team: typeof teams.$inferSelect;
  portfolioId: string;
  members: Array<{
    membership: typeof teamMembers.$inferSelect;
    user: CollaborationUserProjection;
  }>;
  featureCapabilities: TeamFeatureCapability[];
  /** Describes where the currently persisted feature rows came from. */
  featurePolicySource: "preset" | "override" | "none";
  room: {
    conversationId: string;
    title: string;
    unreadCount: number;
  } | null;
}

const MAX_COLLABORATION_MEMBERS = 250;
const MAX_WORKSPACE_DIRECTORY_USERS = 2_000;
const MAX_REACTION_KINDS_PER_MESSAGE = 50;

export interface ConversationProjection {
  conversation: typeof conversations.$inferSelect;
  teamId?: string;
  participants: Array<{
    participant: typeof conversationParticipants.$inferSelect;
    user: CollaborationUserProjection;
    checkpoint: typeof conversationReadCheckpoints.$inferSelect | null;
  }>;
  unreadCount: number;
  needsResponseCount: number;
}

export interface MessageReactionProjection {
  emoji: string;
  userIds: string[];
  reactedByCurrentUser: boolean;
}

export interface MessageProjection {
  message: typeof conversationMessages.$inferSelect;
  sender: CollaborationUserProjection;
  reactions: MessageReactionProjection[];
}

export interface CollaborationPage<T> {
  data: T[];
  nextCursor: string | null;
}

export interface CollaborationEventBatch {
  events: Array<typeof collaborationEvents.$inferSelect>;
  nextCursor: number;
}

export interface CreateTeamRepositoryInput {
  workspaceId: string;
  name: string;
  purpose?: string;
  preset?: TeamPreset;
  featureCapabilities?: TeamFeatureCapability[];
  featurePolicySource?: "preset" | "override";
  memberIds?: string[];
  leadUserId?: string;
}

export interface UpdateTeamRepositoryInput {
  name?: string;
  purpose?: string;
  preset?: TeamPreset;
  featureCapabilities?: TeamFeatureCapability[];
  featurePolicySource?: "preset" | "override";
}

export interface CreateConversationRepositoryInput {
  workspaceId: string;
  title: string;
  purpose?: string;
  kind: "workspace" | "direct" | "external";
  visibility: "organization" | "private" | "guest_scoped";
  participantIds: string[];
  retentionDays?: number;
}

export interface SendMessageRepositoryInput {
  clientMessageId: string;
  parentMessageId?: string;
  body: string;
  intent?: (typeof conversationMessages.$inferInsert)["intent"];
  responseOwnerId?: string;
  responseDueAt?: Date;
  linkedEntityType?: string;
  linkedEntityId?: string;
  metadata?: Record<string, unknown>;
}

const MESSAGE_METADATA_MAX_BYTES = 8 * 1024;
const MESSAGE_METADATA_MAX_KEYS = 32;
const MESSAGE_METADATA_MAX_DEPTH = 4;
const MESSAGE_METADATA_MAX_ARRAY_ITEMS = 50;
const MESSAGE_METADATA_MAX_STRING_LENGTH = 1_000;

export interface CollaborationRepositories {
  listWorkspaceUsers: (
    workspaceId: string,
  ) => Promise<CollaborationUserProjection[]>;
  listTeams: (workspaceId: string) => Promise<TeamProjection[]>;
  getTeam: (teamId: string) => Promise<TeamProjection>;
  createTeam: (
    input: CreateTeamRepositoryInput,
    context: MutationContext,
  ) => Promise<MutationResult<TeamProjection>>;
  updateTeam: (
    teamId: string,
    expectedVersion: number,
    input: UpdateTeamRepositoryInput,
    context: MutationContext,
  ) => Promise<MutationResult<TeamProjection>>;
  setTeamMember: (
    teamId: string,
    userId: string,
    expectedTeamVersion: number,
    role: "lead" | "member",
    context: MutationContext,
  ) => Promise<MutationResult<TeamProjection>>;
  removeTeamMember: (
    teamId: string,
    userId: string,
    expectedTeamVersion: number,
    context: MutationContext,
  ) => Promise<MutationResult<TeamProjection>>;
  listConversations: (
    workspaceId: string,
    options?: { cursor?: string; limit?: number },
  ) => Promise<CollaborationPage<ConversationProjection>>;
  getConversation: (conversationId: string) => Promise<ConversationProjection>;
  createConversation: (
    input: CreateConversationRepositoryInput,
    context: MutationContext,
  ) => Promise<MutationResult<ConversationProjection>>;
  setConversationParticipant: (
    conversationId: string,
    userId: string,
    expectedConversationVersion: number,
    active: boolean,
    context: MutationContext,
    participantRole?: "member" | "owner",
  ) => Promise<MutationResult<ConversationProjection>>;
  listMessages: (
    conversationId: string,
    options?: { cursor?: string; limit?: number; parentMessageId?: string },
  ) => Promise<CollaborationPage<MessageProjection>>;
  getMessage: (messageId: string) => Promise<MessageProjection>;
  sendMessage: (
    conversationId: string,
    input: SendMessageRepositoryInput,
    context: MutationContext,
  ) => Promise<MutationResult<MessageProjection>>;
  setMessageResponse: (
    conversationId: string,
    messageId: string,
    expectedVersion: number,
    responseState: "open" | "resolved",
    context: MutationContext,
  ) => Promise<MutationResult<MessageProjection>>;
  addReaction: (
    conversationId: string,
    messageId: string,
    expectedVersion: number,
    emoji: string,
    context: MutationContext,
  ) => Promise<MutationResult<MessageProjection>>;
  removeReaction: (
    conversationId: string,
    messageId: string,
    expectedVersion: number,
    emoji: string,
    context: MutationContext,
  ) => Promise<MutationResult<MessageProjection>>;
  markRead: (
    conversationId: string,
    messageId: string,
    context: MutationContext,
  ) => Promise<MutationResult<typeof conversationReadCheckpoints.$inferSelect>>;
  listEvents: (
    workspaceId: string,
    options?: { afterCursor?: number; limit?: number },
  ) => Promise<CollaborationEventBatch>;
  redactExpiredMessages: (
    workspaceId: string,
    now?: Date,
    limit?: number,
  ) => Promise<number>;
}

export type CollaborationTransactionRunner = <T>(
  callback: (transaction: TrevvDatabase) => Promise<T>,
) => Promise<T>;

export function createCollaborationRepositories(
  database: TrevvDatabase,
  scope: TenantScope,
  runInTransaction: CollaborationTransactionRunner,
): CollaborationRepositories {
  return {
    listWorkspaceUsers: (workspaceId) =>
      listWorkspaceUsers(database, scope, workspaceId),
    listTeams: (workspaceId) => listTeams(database, scope, workspaceId),
    getTeam: (teamId) => getTeam(database, scope, teamId),
    createTeam: (input, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          { operation: "createTeam", input },
          () => createTeam(transaction, scope, input, context),
          (id) => getTeam(transaction, scope, id),
          "team",
        ),
      ),
    updateTeam: (teamId, version, input, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          { operation: "updateTeam", teamId, version, input },
          () => updateTeam(transaction, scope, teamId, version, input, context),
          (id) => getTeam(transaction, scope, id),
          "team",
        ),
      ),
    setTeamMember: (teamId, userId, version, role, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          { operation: "setTeamMember", teamId, userId, version, role },
          () =>
            setTeamMember(
              transaction,
              scope,
              teamId,
              userId,
              version,
              role,
              context,
            ),
          (id) => getTeam(transaction, scope, id),
          "team",
        ),
      ),
    removeTeamMember: (teamId, userId, version, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          { operation: "removeTeamMember", teamId, userId, version },
          () =>
            removeTeamMember(
              transaction,
              scope,
              teamId,
              userId,
              version,
              context,
            ),
          (id) => getTeam(transaction, scope, id),
          "team",
        ),
      ),
    listConversations: (workspaceId, options) =>
      listConversations(database, scope, workspaceId, options),
    getConversation: (conversationId) =>
      getConversation(database, scope, conversationId),
    createConversation: (input, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          { operation: "createConversation", input },
          () => createConversation(transaction, scope, input, context),
          (id) => getConversation(transaction, scope, id),
          "conversation",
        ),
      ),
    setConversationParticipant: (
      conversationId,
      userId,
      expectedConversationVersion,
      active,
      context,
      participantRole = "member",
    ) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          {
            operation: "setConversationParticipant",
            conversationId,
            userId,
            expectedConversationVersion,
            active,
            participantRole,
          },
          () =>
            setConversationParticipant(
              transaction,
              scope,
              conversationId,
              userId,
              expectedConversationVersion,
              active,
              context,
              participantRole,
            ),
          (id) => getConversation(transaction, scope, id),
          "conversation",
        ),
      ),
    listMessages: (conversationId, options) =>
      listMessages(database, scope, conversationId, options),
    getMessage: (messageId) => getMessage(database, scope, messageId),
    sendMessage: (conversationId, input, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          { operation: "sendMessage", conversationId, input },
          () => sendMessage(transaction, scope, conversationId, input, context),
          (id) => getMessage(transaction, scope, id),
          "message",
        ),
      ),
    setMessageResponse: (conversationId, messageId, version, state, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          {
            operation: "setMessageResponse",
            conversationId,
            messageId,
            version,
            state,
          },
          () =>
            setMessageResponse(
              transaction,
              scope,
              conversationId,
              messageId,
              version,
              state,
              context,
            ),
          (id) => getMessage(transaction, scope, id),
          "message",
        ),
      ),
    addReaction: (conversationId, messageId, version, emoji, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          {
            operation: "addReaction",
            conversationId,
            messageId,
            version,
            emoji,
          },
          () =>
            changeReaction(
              transaction,
              scope,
              conversationId,
              messageId,
              version,
              emoji,
              true,
              context,
            ),
          (id) => getMessage(transaction, scope, id),
          "message",
        ),
      ),
    removeReaction: (conversationId, messageId, version, emoji, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          {
            operation: "removeReaction",
            conversationId,
            messageId,
            version,
            emoji,
          },
          () =>
            changeReaction(
              transaction,
              scope,
              conversationId,
              messageId,
              version,
              emoji,
              false,
              context,
            ),
          (id) => getMessage(transaction, scope, id),
          "message",
        ),
      ),
    markRead: (conversationId, messageId, context) =>
      runInTransaction((transaction) =>
        idempotentMutation(
          transaction,
          scope,
          context,
          { operation: "markRead", conversationId, messageId },
          () =>
            markRead(transaction, scope, conversationId, messageId, context),
          (id) => getReadCheckpoint(transaction, scope, conversationId, id),
          "read_checkpoint",
        ),
      ),
    listEvents: (workspaceId, options) =>
      listEvents(database, scope, workspaceId, options),
    redactExpiredMessages: (workspaceId, now, limit) =>
      runInTransaction((transaction) =>
        redactExpiredMessages(transaction, scope, workspaceId, now, limit),
      ),
  };
}

async function listTeams(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
) {
  const actor = await assertActorMembership(database, scope);
  if (actor.role === "guest") throw notFound();
  await assertWorkspaceAccess(database, scope, workspaceId);
  const rows = await database
    .select()
    .from(teams)
    .where(
      and(
        eq(teams.organizationId, scope.organizationId),
        eq(teams.workspaceId, workspaceId),
        isNull(teams.archivedAt),
        isNull(teams.deletedAt),
      ),
    )
    .orderBy(asc(teams.name), asc(teams.id));
  return Promise.all(rows.map((team) => hydrateTeam(database, scope, team)));
}

async function listWorkspaceUsers(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
) {
  const workspace = await assertWorkspaceAccess(database, scope, workspaceId);
  const rows = await database
    .select({ user: users, membership: memberships })
    .from(memberships)
    .innerJoin(
      users,
      and(
        eq(users.id, memberships.userId),
        isNull(users.archivedAt),
        isNull(users.deletedAt),
      ),
    )
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.organizationId, memberships.organizationId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, memberships.userId),
        isNull(workspaceMembers.archivedAt),
        isNull(workspaceMembers.deletedAt),
      ),
    )
    .leftJoin(
      portfolioMembers,
      and(
        eq(portfolioMembers.organizationId, memberships.organizationId),
        eq(portfolioMembers.portfolioId, workspace.portfolioId),
        eq(portfolioMembers.userId, memberships.userId),
        isNull(portfolioMembers.archivedAt),
        isNull(portfolioMembers.deletedAt),
      ),
    )
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        ne(memberships.role, "guest"),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
        or(
          inArray(memberships.role, ["owner", "admin"]),
          workspace.leadUserId
            ? eq(memberships.userId, workspace.leadUserId)
            : undefined,
          isNotNull(workspaceMembers.userId),
          isNotNull(portfolioMembers.userId),
        ),
      ),
    )
    .orderBy(asc(users.name), asc(users.id))
    .limit(MAX_WORKSPACE_DIRECTORY_USERS + 1);
  if (rows.length > MAX_WORKSPACE_DIRECTORY_USERS)
    throw conflict(
      "This Workspace has more than 2,000 active members. Use the paginated member directory before assigning Teams.",
    );
  return rows.map(({ user, membership }) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    organizationRole: membership.role,
  }));
}

async function getTeam(
  database: TrevvDatabase,
  scope: TenantScope,
  teamId: string,
) {
  const actor = await assertActorMembership(database, scope);
  if (actor.role === "guest") throw notFound();
  const team = await getTeamRow(database, scope, teamId);
  await assertWorkspaceAccess(database, scope, team.workspaceId);
  return hydrateTeam(database, scope, team);
}

async function createTeam(
  database: TrevvDatabase,
  scope: TenantScope,
  input: CreateTeamRepositoryInput,
  context: MutationContext,
): Promise<MutationResult<TeamProjection>> {
  if (
    input.featurePolicySource !== undefined &&
    input.featureCapabilities === undefined
  )
    throw conflict(
      "Feature policy provenance requires an explicit feature capability set.",
    );
  const workspace = await assertCanManageWorkspace(
    database,
    scope,
    input.workspaceId,
  );
  const now = context.now ?? new Date();
  await ensureActorWorkspaceMembership(database, scope, workspace.id, now);
  const name = requiredText(input.name, "Team name", 160);
  const leadUserId = input.leadUserId ?? scope.userId;
  const memberIds = [...new Set([leadUserId, ...(input.memberIds ?? [])])];
  if (memberIds.length > 250)
    throw conflict("A Team can contain at most 250 members.");
  await assertWorkspaceMembers(database, scope, workspace.id, memberIds, now);
  if (await hasGuestParticipant(database, scope, memberIds))
    throw conflict("Guests cannot be assigned to internal Teams.");
  const initialRoles = await listMemberRoles(database, scope, [leadUserId]);
  if (initialRoles.get(leadUserId) === "viewer")
    throw conflict("Viewers cannot lead a Team.");
  const teamId = randomUUID();
  const conversationId = randomUUID();
  const [team] = await database
    .insert(teams)
    .values({
      id: teamId,
      organizationId: scope.organizationId,
      workspaceId: workspace.id,
      name,
      slug: slugify(name),
      purpose: input.purpose?.trim() ?? "",
      presetKey: input.preset ?? "custom",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!team) throw conflict("An active Team already uses this name.");
  await database.insert(conversations).values({
    id: conversationId,
    organizationId: scope.organizationId,
    portfolioId: workspace.portfolioId,
    workspaceId: workspace.id,
    title: name,
    purpose: input.purpose?.trim() ?? "",
    kind: "team",
    visibility: "private",
    createdBy: scope.userId,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await database.insert(teamRooms).values({
    organizationId: scope.organizationId,
    workspaceId: workspace.id,
    teamId,
    conversationId,
    createdAt: now,
  });
  await database.insert(teamMembers).values(
    memberIds.map((userId) => ({
      organizationId: scope.organizationId,
      workspaceId: workspace.id,
      teamId,
      userId,
      role: userId === leadUserId ? ("lead" as const) : ("member" as const),
      joinedAt: now,
      updatedAt: now,
    })),
  );
  await database.insert(conversationParticipants).values(
    memberIds.map((userId) => ({
      organizationId: scope.organizationId,
      workspaceId: workspace.id,
      conversationId,
      userId,
      participantRole: userId === leadUserId ? "owner" : "member",
      source: "team" as const,
      joinedAt: now,
      updatedAt: now,
    })),
  );
  if (input.featureCapabilities !== undefined) {
    const enabledFeatures = new Set(input.featureCapabilities);
    await database.insert(teamFeaturePolicies).values(
      TEAM_FEATURE_CAPABILITIES.map((featureKey) => ({
        organizationId: scope.organizationId,
        workspaceId: workspace.id,
        teamId,
        featureKey,
        enabled: enabledFeatures.has(featureKey),
        source: input.featurePolicySource ?? "override",
        updatedBy: scope.userId,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  await journal(database, scope, {
    workspaceId: workspace.id,
    conversationId,
    type: "team.created",
    aggregateType: "team",
    aggregateId: teamId,
    payload: {
      teamId,
      conversationId,
      memberCount: memberIds.length,
      featurePolicySource:
        input.featureCapabilities !== undefined
          ? (input.featurePolicySource ?? "override")
          : "none",
    },
    now,
  });
  return {
    value: await hydrateTeam(database, scope, team),
    replayed: false,
  };
}

async function updateTeam(
  database: TrevvDatabase,
  scope: TenantScope,
  teamId: string,
  expectedVersion: number,
  input: UpdateTeamRepositoryInput,
  context: MutationContext,
): Promise<MutationResult<TeamProjection>> {
  if (
    input.featurePolicySource !== undefined &&
    input.featureCapabilities === undefined
  )
    throw conflict(
      "Feature policy provenance requires an explicit feature capability set.",
    );
  const current = await getTeamRow(database, scope, teamId, true);
  await assertCanManageTeam(database, scope, current);
  const now = context.now ?? new Date();
  let updated: typeof teams.$inferSelect | undefined;
  try {
    [updated] = await database
      .update(teams)
      .set({
        name: input.name
          ? requiredText(input.name, "Team name", 160)
          : undefined,
        slug: input.name ? slugify(input.name) : undefined,
        purpose: input.purpose?.trim(),
        presetKey: input.preset,
        version: sql`${teams.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(teams.organizationId, scope.organizationId),
          eq(teams.id, teamId),
          eq(teams.version, expectedVersion),
          isNull(teams.archivedAt),
          isNull(teams.deletedAt),
        ),
      )
      .returning();
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505"))
      throw conflict("An active Team already uses this name.");
    throw error;
  }
  if (!updated) throw versionConflict(current.version);
  const room = await getTeamRoom(database, scope, teamId);
  await database
    .update(conversations)
    .set({
      ...(input.name ? { title: input.name.trim() } : {}),
      ...(input.purpose !== undefined ? { purpose: input.purpose.trim() } : {}),
      version: sql`${conversations.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.id, room.conversationId),
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
      ),
    );
  if (input.featureCapabilities) {
    await database
      .delete(teamFeaturePolicies)
      .where(
        and(
          eq(teamFeaturePolicies.organizationId, scope.organizationId),
          eq(teamFeaturePolicies.teamId, teamId),
        ),
      );
    const enabledFeatures = new Set(input.featureCapabilities);
    await database.insert(teamFeaturePolicies).values(
      TEAM_FEATURE_CAPABILITIES.map((featureKey) => ({
        organizationId: scope.organizationId,
        workspaceId: current.workspaceId,
        teamId,
        featureKey,
        enabled: enabledFeatures.has(featureKey),
        source: input.featurePolicySource ?? "override",
        updatedBy: scope.userId,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  await journal(database, scope, {
    workspaceId: current.workspaceId,
    conversationId: room?.conversationId,
    type: "team.updated",
    aggregateType: "team",
    aggregateId: teamId,
    payload: {
      teamId,
      changedFields: Object.keys(input).sort(),
      ...(input.featureCapabilities
        ? {
            featurePolicySource: input.featurePolicySource ?? "override",
          }
        : {}),
    },
    now,
  });
  return {
    value: await hydrateTeam(database, scope, updated),
    replayed: false,
  };
}

async function setTeamMember(
  database: TrevvDatabase,
  scope: TenantScope,
  teamId: string,
  userId: string,
  expectedTeamVersion: number,
  role: "lead" | "member",
  context: MutationContext,
) {
  const team = await getTeamRow(database, scope, teamId, true);
  await assertCanManageTeam(database, scope, team);
  const now = context.now ?? new Date();
  await assertWorkspaceMembers(
    database,
    scope,
    team.workspaceId,
    [userId],
    now,
  );
  if (await hasGuestParticipant(database, scope, [userId]))
    throw conflict("Guests cannot be assigned to internal Teams.");
  if (role === "lead") {
    const roles = await listMemberRoles(database, scope, [userId]);
    if (roles.get(userId) === "viewer")
      throw conflict("Viewers cannot lead a Team.");
  }
  const [existingMembership] = await database
    .select({ role: teamMembers.role, removedAt: teamMembers.removedAt })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, scope.organizationId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
      ),
    )
    .limit(1)
    .for("update");
  if (
    role === "member" &&
    existingMembership?.removedAt === null &&
    existingMembership.role === "lead"
  )
    throw conflict(
      "Assign another Team lead before demoting the current lead.",
    );
  const room = await getTeamRoom(database, scope, teamId);
  await assertTeamHasCapacity(database, scope, teamId, userId);
  await assertConversationHasCapacity(
    database,
    scope,
    room.conversationId,
    userId,
  );
  if (role === "lead")
    await database
      .update(teamMembers)
      .set({
        role: "member",
        version: sql`${teamMembers.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(teamMembers.organizationId, scope.organizationId),
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.role, "lead"),
          isNull(teamMembers.removedAt),
        ),
      );
  await database
    .insert(teamMembers)
    .values({
      organizationId: scope.organizationId,
      workspaceId: team.workspaceId,
      teamId,
      userId,
      role,
      joinedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: {
        role,
        removedAt: null,
        version: sql`${teamMembers.version} + 1`,
        updatedAt: now,
      },
    });
  if (role === "lead")
    await database
      .update(conversationParticipants)
      .set({
        participantRole: "member",
        version: sql`${conversationParticipants.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(conversationParticipants.organizationId, scope.organizationId),
          eq(conversationParticipants.conversationId, room.conversationId),
          eq(conversationParticipants.source, "team"),
          ne(conversationParticipants.userId, userId),
          eq(conversationParticipants.participantRole, "owner"),
          isNull(conversationParticipants.removedAt),
        ),
      );
  await database
    .insert(conversationParticipants)
    .values({
      organizationId: scope.organizationId,
      workspaceId: team.workspaceId,
      conversationId: room.conversationId,
      userId,
      participantRole: role === "lead" ? "owner" : "member",
      source: "team",
      joinedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        conversationParticipants.conversationId,
        conversationParticipants.userId,
      ],
      set: {
        participantRole: role === "lead" ? "owner" : "member",
        source: "team",
        removedAt: null,
        version: sql`${conversationParticipants.version} + 1`,
        updatedAt: now,
      },
    });
  await database
    .update(conversations)
    .set({ version: sql`${conversations.version} + 1`, updatedAt: now })
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.id, room.conversationId),
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
      ),
    );
  const updated = await bumpTeamVersion(
    database,
    scope,
    team,
    expectedTeamVersion,
    now,
  );
  await journal(database, scope, {
    workspaceId: team.workspaceId,
    conversationId: room.conversationId,
    type: "team.membership_changed",
    aggregateType: "team",
    aggregateId: teamId,
    payload: { teamId, userId, role, active: true },
    now,
  });
  return {
    value: await hydrateTeam(database, scope, updated),
    replayed: false,
  };
}

async function removeTeamMember(
  database: TrevvDatabase,
  scope: TenantScope,
  teamId: string,
  userId: string,
  expectedTeamVersion: number,
  context: MutationContext,
) {
  const team = await getTeamRow(database, scope, teamId, true);
  await assertCanManageTeam(database, scope, team);
  const [member] = await database
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, scope.organizationId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.removedAt),
      ),
    )
    .limit(1)
    .for("update");
  if (!member) throw notFound();
  if (member.role === "lead")
    throw conflict("Transfer the Team lead role before removing this member.");
  const now = context.now ?? new Date();
  const room = await getTeamRoom(database, scope, teamId);
  await assertNoOpenResponseObligations(
    database,
    scope,
    room.conversationId,
    userId,
    now,
  );
  await database
    .update(teamMembers)
    .set({
      removedAt: now,
      version: sql`${teamMembers.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(teamMembers.organizationId, scope.organizationId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.removedAt),
      ),
    );
  await database
    .update(conversationParticipants)
    .set({
      removedAt: now,
      version: sql`${conversationParticipants.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, room.conversationId),
        eq(conversationParticipants.userId, userId),
        eq(conversationParticipants.source, "team"),
        isNull(conversationParticipants.removedAt),
      ),
    );
  await database
    .update(conversations)
    .set({ version: sql`${conversations.version} + 1`, updatedAt: now })
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.id, room.conversationId),
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
      ),
    );
  const updated = await bumpTeamVersion(
    database,
    scope,
    team,
    expectedTeamVersion,
    now,
  );
  await journal(database, scope, {
    workspaceId: team.workspaceId,
    conversationId: room.conversationId,
    type: "team.membership_changed",
    aggregateType: "team",
    aggregateId: teamId,
    payload: { teamId, userId, active: false },
    now,
  });
  return {
    value: await hydrateTeam(database, scope, updated),
    replayed: false,
  };
}

async function listConversations(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
  options?: { cursor?: string; limit?: number },
): Promise<CollaborationPage<ConversationProjection>> {
  await assertWorkspaceAccess(database, scope, workspaceId);
  const actor = await assertActorMembership(database, scope);
  const limit = boundedLimit(options?.limit, 50, 100);
  const cursor = decodeCursor(options?.cursor);
  const rows = await database
    .selectDistinct({ conversation: conversations })
    .from(conversations)
    .leftJoin(
      conversationParticipants,
      and(
        eq(
          conversationParticipants.organizationId,
          conversations.organizationId,
        ),
        eq(conversationParticipants.conversationId, conversations.id),
        eq(conversationParticipants.userId, scope.userId),
        isNull(conversationParticipants.removedAt),
      ),
    )
    .leftJoin(
      teamRooms,
      and(
        eq(teamRooms.organizationId, conversations.organizationId),
        eq(teamRooms.conversationId, conversations.id),
      ),
    )
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, conversations.organizationId),
        eq(teamMembers.teamId, teamRooms.teamId),
        eq(teamMembers.userId, scope.userId),
        isNull(teamMembers.removedAt),
      ),
    )
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.workspaceId, workspaceId),
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
        or(
          eq(conversations.visibility, "organization"),
          eq(conversationParticipants.userId, scope.userId),
        ),
        actor.role === "guest"
          ? and(
              eq(conversations.kind, "external"),
              eq(conversationParticipants.userId, scope.userId),
            )
          : undefined,
        or(
          ne(conversations.kind, "team"),
          and(
            eq(conversationParticipants.userId, scope.userId),
            eq(teamMembers.userId, scope.userId),
          ),
        ),
        cursor
          ? or(
              lt(conversations.lastMessageAt, cursor.at),
              and(
                eq(conversations.lastMessageAt, cursor.at),
                lt(conversations.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const data = await Promise.all(
    page.map(({ conversation }) =>
      hydrateConversation(database, scope, conversation),
    ),
  );
  const last = page.at(-1)?.conversation;
  return {
    data,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.lastMessageAt, last.id)
        : null,
  };
}

async function getConversation(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
) {
  const conversation = await assertConversationAccess(
    database,
    scope,
    conversationId,
  );
  return hydrateConversation(database, scope, conversation);
}

async function createConversation(
  database: TrevvDatabase,
  scope: TenantScope,
  input: CreateConversationRepositoryInput,
  context: MutationContext,
): Promise<MutationResult<ConversationProjection>> {
  const workspace = await assertWorkspaceAccess(
    database,
    scope,
    input.workspaceId,
  );
  const actor = await assertActorMembership(database, scope);
  if (actor.role === "viewer" || actor.role === "guest") throw notFound();
  const now = context.now ?? new Date();
  await ensureActorWorkspaceMembership(database, scope, workspace.id, now);
  assertConversationShape(input);
  const participantIds = [...new Set([scope.userId, ...input.participantIds])];
  if (participantIds.length > 250)
    throw conflict("A conversation can contain at most 250 participants.");
  await assertWorkspaceMembers(
    database,
    scope,
    workspace.id,
    participantIds,
    now,
  );
  if (
    input.kind === "external" &&
    !(await hasGuestParticipant(database, scope, participantIds))
  )
    throw conflict("An external room requires an active guest participant.");
  if (input.kind === "direct" && participantIds.length !== 2)
    throw conflict("A direct conversation requires exactly two participants.");
  if (
    input.kind === "direct" &&
    (await hasGuestParticipant(database, scope, participantIds))
  )
    throw conflict("Guest coordination must use an external room.");
  const directKey =
    input.kind === "direct" ? directConversationKey(participantIds) : undefined;
  if (directKey)
    await archiveStaleDirectConversation(
      database,
      scope,
      workspace.id,
      directKey,
      participantIds,
      now,
    );
  const [conversation] = await database
    .insert(conversations)
    .values({
      id: randomUUID(),
      organizationId: scope.organizationId,
      portfolioId: workspace.portfolioId,
      workspaceId: workspace.id,
      title: requiredText(input.title, "Conversation title", 160),
      purpose: input.purpose?.trim() ?? "",
      kind: input.kind,
      visibility: input.visibility,
      directKey,
      createdBy: scope.userId,
      retentionDays: input.retentionDays ?? 365,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!conversation) throw conflict("This direct conversation already exists.");
  const roles = await listMemberRoles(database, scope, participantIds);
  await database.insert(conversationParticipants).values(
    participantIds.map((userId) => ({
      organizationId: scope.organizationId,
      workspaceId: workspace.id,
      conversationId: conversation.id,
      userId,
      participantRole:
        userId === scope.userId
          ? "owner"
          : roles.get(userId) === "guest"
            ? "guest"
            : "member",
      source:
        input.kind === "direct" ? ("direct" as const) : ("manual" as const),
      joinedAt: now,
      updatedAt: now,
    })),
  );
  await journal(database, scope, {
    workspaceId: workspace.id,
    conversationId: conversation.id,
    type: "conversation.created",
    aggregateType: "conversation",
    aggregateId: conversation.id,
    payload: {
      conversationId: conversation.id,
      kind: conversation.kind,
      participantCount: participantIds.length,
    },
    now,
  });
  return {
    value: await hydrateConversation(database, scope, conversation),
    replayed: false,
  };
}

async function archiveStaleDirectConversation(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
  directKey: string,
  desiredParticipantIds: string[],
  now: Date,
) {
  const [existing] = await database
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.kind, "direct"),
        eq(conversations.directKey, directKey),
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1)
    .for("update");
  if (!existing) return;
  const activeParticipants = await database
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, existing.id),
        isNull(conversationParticipants.removedAt),
      ),
    );
  const currentIds = activeParticipants
    .map(({ userId }) => userId)
    .sort((left, right) => left.localeCompare(right));
  const desiredIds = [...desiredParticipantIds].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    currentIds.length === desiredIds.length &&
    currentIds.every((userId, index) => userId === desiredIds[index])
  )
    throw conflict("This direct conversation already exists.");
  await database
    .update(conversations)
    .set({
      archivedAt: now,
      version: sql`${conversations.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.id, existing.id),
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
      ),
    );
  await journal(database, scope, {
    workspaceId,
    conversationId: existing.id,
    type: "conversation.participants_changed",
    aggregateType: "conversation",
    aggregateId: existing.id,
    payload: {
      conversationId: existing.id,
      active: false,
      reason: "superseded_after_access_revocation",
    },
    now,
  });
}

async function setConversationParticipant(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  userId: string,
  expectedConversationVersion: number,
  active: boolean,
  context: MutationContext,
  requestedRole: "member" | "owner" = "member",
) {
  const conversation = await assertConversationAccess(
    database,
    scope,
    conversationId,
    true,
  );
  if (conversation.kind === "team" || conversation.kind === "direct")
    throw conflict(
      conversation.kind === "team"
        ? "Team-room participation is managed through Team membership."
        : "Direct-conversation membership cannot be changed.",
    );
  await assertCanManageConversation(database, scope, conversation);
  if (conversation.version !== expectedConversationVersion)
    throw versionConflict(conversation.version);
  const now = context.now ?? new Date();
  await assertWorkspaceMembers(
    database,
    scope,
    conversation.workspaceId,
    [userId],
    now,
    active,
  );
  const roles = await listMemberRoles(database, scope, [userId]);
  const targetIsGuest = roles.get(userId) === "guest";
  const targetIsViewer = roles.get(userId) === "viewer";
  if (
    active &&
    targetIsGuest &&
    (conversation.kind !== "external" ||
      conversation.visibility !== "guest_scoped")
  )
    throw conflict("Guest participants require an external guest-scoped room.");
  if (active && requestedRole === "owner" && (targetIsGuest || targetIsViewer))
    throw conflict("Guests and viewers cannot own a conversation.");
  if (active) {
    await assertConversationHasCapacity(
      database,
      scope,
      conversationId,
      userId,
    );
    const participantRole = targetIsGuest ? "guest" : requestedRole;
    if (participantRole === "owner")
      await database
        .update(conversationParticipants)
        .set({
          participantRole: "member",
          version: sql`${conversationParticipants.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(conversationParticipants.organizationId, scope.organizationId),
            eq(conversationParticipants.conversationId, conversationId),
            ne(conversationParticipants.userId, userId),
            eq(conversationParticipants.participantRole, "owner"),
            isNull(conversationParticipants.removedAt),
          ),
        );
    await database
      .insert(conversationParticipants)
      .values({
        organizationId: scope.organizationId,
        workspaceId: conversation.workspaceId,
        conversationId,
        userId,
        participantRole,
        source: "manual",
        joinedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          conversationParticipants.conversationId,
          conversationParticipants.userId,
        ],
        set: {
          participantRole: sql`case when ${conversationParticipants.participantRole} = 'owner' then 'owner' else ${participantRole} end`,
          removedAt: null,
          source: "manual",
          version: sql`${conversationParticipants.version} + 1`,
          updatedAt: now,
        },
      });
  } else {
    const [participant] = await database
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.organizationId, scope.organizationId),
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
          isNull(conversationParticipants.removedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!participant) throw notFound();
    if (
      participant.participantRole === "owner" &&
      !(await hasAnotherActiveConversationOwner(
        database,
        scope,
        conversationId,
        userId,
      ))
    )
      throw conflict(
        "Transfer conversation ownership before removing its sole owner.",
      );
    await assertNoOpenResponseObligations(
      database,
      scope,
      conversationId,
      userId,
      now,
    );
    if (
      conversation.kind === "external" &&
      !(await hasRemainingActiveGuestParticipant(
        database,
        scope,
        conversationId,
        userId,
      ))
    )
      throw conflict("An external room requires an active guest participant.");
    await database
      .update(conversationParticipants)
      .set({
        removedAt: now,
        version: sql`${conversationParticipants.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(conversationParticipants.organizationId, scope.organizationId),
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
          isNull(conversationParticipants.removedAt),
        ),
      );
  }
  const [updated] = await database
    .update(conversations)
    .set({ version: sql`${conversations.version} + 1`, updatedAt: now })
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.id, conversationId),
        eq(conversations.version, expectedConversationVersion),
      ),
    )
    .returning();
  if (!updated) throw versionConflict(conversation.version);
  await journal(database, scope, {
    workspaceId: conversation.workspaceId,
    conversationId,
    type: "conversation.participants_changed",
    aggregateType: "conversation",
    aggregateId: conversationId,
    payload: {
      conversationId,
      userId,
      active,
      ...(active ? { participantRole: requestedRole } : {}),
    },
    now,
  });
  return {
    value: await hydrateConversation(database, scope, updated),
    replayed: false,
  };
}

async function listMessages(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  options?: { cursor?: string; limit?: number; parentMessageId?: string },
): Promise<CollaborationPage<MessageProjection>> {
  await assertConversationAccess(database, scope, conversationId);
  const limit = boundedLimit(options?.limit, 50, 100);
  const cursor = decodeSequenceCursor(options?.cursor);
  const rows = await database
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.conversationId, conversationId),
        options?.parentMessageId
          ? eq(conversationMessages.parentMessageId, options.parentMessageId)
          : isNull(conversationMessages.parentMessageId),
        cursor ? lt(conversationMessages.sequence, cursor) : undefined,
        isNull(conversationMessages.deletedAt),
      ),
    )
    .orderBy(desc(conversationMessages.sequence))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    data: await Promise.all(
      page.map((message) => hydrateMessage(database, scope, message)),
    ),
    nextCursor:
      rows.length > limit && page.length
        ? encodeSequenceCursor(page.at(-1)!.sequence)
        : null,
  };
}

async function getMessage(
  database: TrevvDatabase,
  scope: TenantScope,
  messageId: string,
) {
  const [message] = await database
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.id, messageId),
        isNull(conversationMessages.deletedAt),
      ),
    )
    .limit(1);
  if (!message) throw notFound();
  await assertConversationAccess(database, scope, message.conversationId);
  return hydrateMessage(database, scope, message);
}

async function sendMessage(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  input: SendMessageRepositoryInput,
  context: MutationContext,
): Promise<MutationResult<MessageProjection>> {
  const conversation = await assertConversationAccess(
    database,
    scope,
    conversationId,
    true,
  );
  await assertCanWriteConversation(database, scope, conversation);
  const body = requiredText(input.body, "Message", 20_000);
  const existing = await findClientMessage(
    database,
    scope,
    conversationId,
    input.clientMessageId,
  );
  if (existing) {
    if (messageFingerprint(existing) !== messageInputFingerprint(input, body))
      throw new RepositoryError(
        "idempotency_key_reused",
        "This client message identifier was reused for different content.",
      );
    return {
      value: await hydrateMessage(database, scope, existing),
      replayed: true,
    };
  }
  const now = context.now ?? new Date();
  await ensureSenderParticipant(database, scope, conversation, now);
  if (input.parentMessageId) {
    const parent = await getMessageRow(
      database,
      scope,
      conversationId,
      input.parentMessageId,
    );
    assertMessageMutable(parent, now);
    if (parent.parentMessageId !== null)
      throw conflict("Replies can only be attached to a top-level message.");
  }
  if (input.responseOwnerId) {
    await assertActiveParticipant(
      database,
      scope,
      conversationId,
      input.responseOwnerId,
    );
    const responseOwnerRoles = await listMemberRoles(database, scope, [
      input.responseOwnerId,
    ]);
    if (responseOwnerRoles.get(input.responseOwnerId) === "viewer")
      throw conflict("A read-only viewer cannot own a response obligation.");
  }
  const intent = input.intent ?? "message";
  if ((intent === "request" || intent === "decision") && !input.responseOwnerId)
    throw conflict("Requests and decisions require a response owner.");
  if (input.linkedEntityType || input.linkedEntityId)
    throw conflict("Linked entities are not available in this release.");
  const metadata = validateMessageMetadata(input.metadata ?? {});
  const expiresAt = new Date(
    now.getTime() + conversation.retentionDays * 24 * 60 * 60 * 1_000,
  );
  const [message] = await database
    .insert(conversationMessages)
    .values({
      id: randomUUID(),
      organizationId: scope.organizationId,
      workspaceId: conversation.workspaceId,
      conversationId,
      senderId: scope.userId,
      parentMessageId: input.parentMessageId,
      clientMessageId: input.clientMessageId,
      body,
      intent,
      responseOwnerId: input.responseOwnerId,
      responseDueAt: input.responseDueAt,
      responseState: input.responseOwnerId ? "open" : undefined,
      linkedEntityType: input.linkedEntityType,
      linkedEntityId: input.linkedEntityId,
      metadata,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        conversationMessages.organizationId,
        conversationMessages.conversationId,
        conversationMessages.senderId,
        conversationMessages.clientMessageId,
      ],
    })
    .returning();
  if (!message) {
    const concurrent = await findClientMessage(
      database,
      scope,
      conversationId,
      input.clientMessageId,
    );
    if (!concurrent) throw unavailable("The message could not be persisted.");
    if (messageFingerprint(concurrent) !== messageInputFingerprint(input, body))
      throw new RepositoryError(
        "idempotency_key_reused",
        "This client message identifier was reused for different content.",
      );
    return {
      value: await hydrateMessage(database, scope, concurrent),
      replayed: true,
    };
  }
  await database
    .update(conversations)
    .set({
      lastMessageAt: now,
      version: sql`${conversations.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.id, conversationId),
      ),
    );
  await journal(database, scope, {
    workspaceId: conversation.workspaceId,
    conversationId,
    type: "message.sent",
    aggregateType: "message",
    aggregateId: message.id,
    payload: {
      conversationId,
      messageId: message.id,
      intent,
      bodyLength: body.length,
      hasLinkedEntity: Boolean(input.linkedEntityId),
    },
    now,
  });
  await scheduleMessageRetention(
    database,
    scope,
    message.id,
    conversationId,
    expiresAt,
    now,
  );
  return {
    value: await hydrateMessage(database, scope, message),
    replayed: false,
  };
}

async function setMessageResponse(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  messageId: string,
  expectedVersion: number,
  responseState: "open" | "resolved",
  context: MutationContext,
) {
  const conversation = await assertConversationAccess(
    database,
    scope,
    conversationId,
    true,
  );
  await assertCanWriteConversation(database, scope, conversation);
  const message = await getMessageRow(
    database,
    scope,
    conversationId,
    messageId,
    true,
  );
  const now = context.now ?? new Date();
  assertMessageMutable(message, now);
  if (!message.responseOwnerId)
    throw conflict("This message has no response workflow.");
  if (
    message.responseOwnerId !== scope.userId &&
    message.senderId !== scope.userId &&
    !(await canManageWorkspace(database, scope, conversation.workspaceId)) &&
    !(await isActiveConversationOwner(
      database,
      scope,
      conversationId,
      scope.userId,
    ))
  )
    throw notFound();
  const [updated] = await database
    .update(conversationMessages)
    .set({
      responseState,
      version: sql`${conversationMessages.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.id, messageId),
        eq(conversationMessages.version, expectedVersion),
        gt(conversationMessages.expiresAt, now),
        isNull(conversationMessages.redactedAt),
        isNull(conversationMessages.deletedAt),
      ),
    )
    .returning();
  if (!updated) throw versionConflict(message.version);
  await journal(database, scope, {
    workspaceId: conversation.workspaceId,
    conversationId,
    type: "message.response_changed",
    aggregateType: "message",
    aggregateId: messageId,
    payload: { conversationId, messageId, responseState },
    now,
  });
  return {
    value: await hydrateMessage(database, scope, updated),
    replayed: false,
  };
}

async function changeReaction(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  messageId: string,
  expectedVersion: number,
  requestedEmoji: string,
  add: boolean,
  context: MutationContext,
) {
  const conversation = await assertConversationAccess(
    database,
    scope,
    conversationId,
    true,
  );
  await assertCanWriteConversation(database, scope, conversation);
  const now = context.now ?? new Date();
  await ensureSenderParticipant(database, scope, conversation, now);
  const message = await getMessageRow(
    database,
    scope,
    conversationId,
    messageId,
    true,
  );
  assertMessageMutable(message, now);
  const emoji = requiredText(requestedEmoji, "Reaction", 32);
  if (add) {
    const [[existingKind], [reactionKinds]] = await Promise.all([
      database
        .select({ emoji: conversationReactions.emoji })
        .from(conversationReactions)
        .innerJoin(
          conversationParticipants,
          and(
            eq(
              conversationParticipants.organizationId,
              conversationReactions.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              conversationReactions.conversationId,
            ),
            eq(conversationParticipants.userId, conversationReactions.userId),
            isNull(conversationParticipants.removedAt),
          ),
        )
        .where(
          and(
            eq(conversationReactions.organizationId, scope.organizationId),
            eq(conversationReactions.conversationId, conversationId),
            eq(conversationReactions.messageId, messageId),
            eq(conversationReactions.emoji, emoji),
          ),
        )
        .limit(1),
      database
        .select({
          count: sql<number>`count(distinct ${conversationReactions.emoji})::int`,
        })
        .from(conversationReactions)
        .innerJoin(
          conversationParticipants,
          and(
            eq(
              conversationParticipants.organizationId,
              conversationReactions.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              conversationReactions.conversationId,
            ),
            eq(conversationParticipants.userId, conversationReactions.userId),
            isNull(conversationParticipants.removedAt),
          ),
        )
        .where(
          and(
            eq(conversationReactions.organizationId, scope.organizationId),
            eq(conversationReactions.conversationId, conversationId),
            eq(conversationReactions.messageId, messageId),
          ),
        ),
    ]);
    if (
      !existingKind &&
      (reactionKinds?.count ?? 0) >= MAX_REACTION_KINDS_PER_MESSAGE
    )
      throw conflict(
        "A message can contain at most 50 distinct reaction types.",
      );
  }
  const [versionedMessage] = await database
    .update(conversationMessages)
    .set({
      version: sql`${conversationMessages.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.id, messageId),
        eq(conversationMessages.version, expectedVersion),
        gt(conversationMessages.expiresAt, now),
        isNull(conversationMessages.redactedAt),
        isNull(conversationMessages.deletedAt),
      ),
    )
    .returning();
  if (!versionedMessage) throw versionConflict(message.version);
  if (add)
    await database
      .insert(conversationReactions)
      .values({
        organizationId: scope.organizationId,
        workspaceId: conversation.workspaceId,
        conversationId,
        messageId,
        userId: scope.userId,
        emoji,
        createdAt: now,
      })
      .onConflictDoNothing();
  else
    await database
      .delete(conversationReactions)
      .where(
        and(
          eq(conversationReactions.organizationId, scope.organizationId),
          eq(conversationReactions.conversationId, conversationId),
          eq(conversationReactions.messageId, messageId),
          eq(conversationReactions.userId, scope.userId),
          eq(conversationReactions.emoji, emoji),
        ),
      );
  await journal(database, scope, {
    workspaceId: conversation.workspaceId,
    conversationId,
    type: "message.reaction_changed",
    aggregateType: "message",
    aggregateId: messageId,
    payload: { conversationId, messageId, emoji, active: add },
    now,
  });
  return {
    value: await hydrateMessage(database, scope, versionedMessage),
    replayed: false,
  };
}

async function markRead(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  messageId: string,
  context: MutationContext,
) {
  const conversation = await assertConversationAccess(
    database,
    scope,
    conversationId,
    true,
  );
  const message = await getMessageRow(
    database,
    scope,
    conversationId,
    messageId,
  );
  const now = context.now ?? new Date();
  await ensureSenderParticipant(database, scope, conversation, now);
  const [existingCheckpoint] = await database
    .select()
    .from(conversationReadCheckpoints)
    .where(
      and(
        eq(conversationReadCheckpoints.organizationId, scope.organizationId),
        eq(conversationReadCheckpoints.conversationId, conversationId),
        eq(conversationReadCheckpoints.userId, scope.userId),
      ),
    )
    .limit(1)
    .for("update");
  if (
    existingCheckpoint &&
    (await messageSequence(
      database,
      scope,
      existingCheckpoint.lastReadMessageId,
    )) >= message.sequence
  )
    return { value: existingCheckpoint, replayed: true };
  const [checkpoint] = await database
    .insert(conversationReadCheckpoints)
    .values({
      organizationId: scope.organizationId,
      workspaceId: conversation.workspaceId,
      conversationId,
      userId: scope.userId,
      lastReadMessageId: messageId,
      lastReadAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        conversationReadCheckpoints.conversationId,
        conversationReadCheckpoints.userId,
      ],
      set: {
        lastReadMessageId: messageId,
        lastReadAt: now,
        version: sql`${conversationReadCheckpoints.version} + 1`,
        updatedAt: now,
      },
    })
    .returning();
  if (!checkpoint) throw unavailable("The read checkpoint could not be saved.");
  await database
    .update(conversationParticipants)
    .set({ lastReadAt: now, updatedAt: now })
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, scope.userId),
        isNull(conversationParticipants.removedAt),
      ),
    );
  await journal(database, scope, {
    workspaceId: conversation.workspaceId,
    conversationId,
    type: "conversation.read",
    aggregateType: "conversation",
    aggregateId: conversationId,
    payload: {
      conversationId,
      messageId,
      messageSequence: message.sequence,
    },
    now,
  });
  return { value: checkpoint, replayed: false };
}

async function listEvents(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
  options?: { afterCursor?: number; limit?: number },
): Promise<CollaborationEventBatch> {
  await assertWorkspaceAccess(database, scope, workspaceId);
  const actor = await assertActorMembership(database, scope);
  const limit = boundedLimit(options?.limit, 100, 500);
  const afterCursor = Math.max(0, options?.afterCursor ?? 0);
  const rows = await database
    .selectDistinct({ event: collaborationEvents })
    .from(collaborationEvents)
    .leftJoin(
      conversations,
      and(
        eq(conversations.organizationId, collaborationEvents.organizationId),
        eq(conversations.id, collaborationEvents.conversationId),
      ),
    )
    .leftJoin(
      conversationParticipants,
      and(
        eq(
          conversationParticipants.organizationId,
          collaborationEvents.organizationId,
        ),
        eq(
          conversationParticipants.conversationId,
          collaborationEvents.conversationId,
        ),
        eq(conversationParticipants.userId, scope.userId),
        isNull(conversationParticipants.removedAt),
      ),
    )
    .leftJoin(
      teamRooms,
      and(
        eq(teamRooms.organizationId, collaborationEvents.organizationId),
        eq(teamRooms.conversationId, collaborationEvents.conversationId),
      ),
    )
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, collaborationEvents.organizationId),
        eq(teamMembers.teamId, teamRooms.teamId),
        eq(teamMembers.userId, scope.userId),
        isNull(teamMembers.removedAt),
      ),
    )
    .where(
      and(
        eq(collaborationEvents.organizationId, scope.organizationId),
        eq(collaborationEvents.workspaceId, workspaceId),
        gt(collaborationEvents.cursor, afterCursor),
        gt(collaborationEvents.expiresAt, new Date()),
        or(
          and(
            isNull(collaborationEvents.conversationId),
            actor.role === "guest" ? sql`false` : sql`true`,
          ),
          and(
            isNull(conversations.archivedAt),
            isNull(conversations.deletedAt),
            actor.role === "guest"
              ? and(
                  eq(conversations.kind, "external"),
                  eq(conversations.visibility, "guest_scoped"),
                  eq(conversationParticipants.userId, scope.userId),
                )
              : or(
                  and(
                    eq(conversations.kind, "team"),
                    eq(conversationParticipants.userId, scope.userId),
                    eq(teamMembers.userId, scope.userId),
                  ),
                  and(
                    ne(conversations.kind, "team"),
                    or(
                      eq(conversations.visibility, "organization"),
                      eq(conversationParticipants.userId, scope.userId),
                    ),
                  ),
                ),
          ),
        ),
      ),
    )
    .orderBy(asc(collaborationEvents.cursor))
    .limit(limit);
  const events = rows.map(({ event }) => event);
  const [watermark] =
    events.length < limit
      ? await database
          .select({
            cursor: sql<number>`coalesce(max(${collaborationEvents.cursor}), ${afterCursor})::int`,
          })
          .from(collaborationEvents)
          .where(
            and(
              eq(collaborationEvents.organizationId, scope.organizationId),
              eq(collaborationEvents.workspaceId, workspaceId),
              gt(collaborationEvents.expiresAt, new Date()),
            ),
          )
      : [];
  return {
    events,
    nextCursor:
      events.length === limit
        ? (events.at(-1)?.cursor ?? afterCursor)
        : (watermark?.cursor ?? afterCursor),
  };
}

async function redactExpiredMessages(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
  requestedNow?: Date,
  requestedLimit?: number,
) {
  await assertCanManageWorkspace(database, scope, workspaceId);
  const now = requestedNow ?? new Date();
  const candidates = await database
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.workspaceId, workspaceId),
        lt(conversationMessages.expiresAt, now),
        isNull(conversationMessages.redactedAt),
        isNull(conversationMessages.deletedAt),
      ),
    )
    .orderBy(asc(conversationMessages.expiresAt))
    .limit(boundedLimit(requestedLimit, 100, 500));
  if (!candidates.length) return 0;
  const updated = await database.execute(sql`
    update ${conversationMessages}
       set body = '[Message expired]',
           metadata = '{}'::jsonb,
           redacted_at = ${now},
           version = version + 1,
           updated_at = ${now}
     where organization_id = ${scope.organizationId}
       and id in (${sql.join(
         candidates.map(({ id }) => sql`${id}`),
         sql`, `,
       )})
       and redacted_at is null
  `);
  await database.delete(conversationMessageMetadataQuarantine).where(
    and(
      eq(
        conversationMessageMetadataQuarantine.organizationId,
        scope.organizationId,
      ),
      inArray(
        conversationMessageMetadataQuarantine.messageId,
        candidates.map(({ id }) => id),
      ),
    ),
  );
  await database.execute(sql`
    delete from legacy_collaboration_record_quarantine
     where organization_id = ${scope.organizationId}
       and entity_type = 'message'
       and entity_id in (${sql.join(
         candidates.map(({ id }) => sql`${id}`),
         sql`, `,
       )})
  `);
  return updated.count;
}

async function hydrateTeam(
  database: TrevvDatabase,
  scope: TenantScope,
  team: typeof teams.$inferSelect,
): Promise<TeamProjection> {
  const [members, policies, room, workspace] = await Promise.all([
    database
      .select({ membership: teamMembers, user: users, role: memberships.role })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .innerJoin(
        memberships,
        and(
          eq(memberships.organizationId, teamMembers.organizationId),
          eq(memberships.userId, teamMembers.userId),
        ),
      )
      .where(
        and(
          eq(teamMembers.organizationId, scope.organizationId),
          eq(teamMembers.teamId, team.id),
          isNull(teamMembers.removedAt),
          isNull(memberships.archivedAt),
          isNull(memberships.deletedAt),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(asc(users.name)),
    database
      .select({
        featureKey: teamFeaturePolicies.featureKey,
        enabled: teamFeaturePolicies.enabled,
        source: teamFeaturePolicies.source,
      })
      .from(teamFeaturePolicies)
      .where(
        and(
          eq(teamFeaturePolicies.organizationId, scope.organizationId),
          eq(teamFeaturePolicies.teamId, team.id),
        ),
      ),
    database
      .select({
        conversationId: teamRooms.conversationId,
        title: conversations.title,
      })
      .from(teamRooms)
      .innerJoin(
        conversations,
        and(
          eq(conversations.organizationId, teamRooms.organizationId),
          eq(conversations.id, teamRooms.conversationId),
        ),
      )
      .where(
        and(
          eq(teamRooms.organizationId, scope.organizationId),
          eq(teamRooms.teamId, team.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    database
      .select({ portfolioId: workspaces.portfolioId })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, scope.organizationId),
          eq(workspaces.id, team.workspaceId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!room || !workspace) throw unavailable("The Team room is unavailable.");
  const actorIsMember = members.some(
    ({ membership }) => membership.userId === scope.userId,
  );
  const unreadCount = actorIsMember
    ? await unreadCountForConversation(database, scope, room.conversationId)
    : null;
  return {
    team,
    portfolioId: workspace.portfolioId,
    members: members.map(({ membership, user, role }) => ({
      membership,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationRole: role,
      },
    })),
    featureCapabilities: policies
      .filter(({ enabled }) => enabled)
      .map(({ featureKey }) => featureKey)
      .filter(isTeamFeature),
    featurePolicySource:
      policies.length === 0
        ? "none"
        : policies.every(({ source }) => source === "preset")
          ? "preset"
          : "override",
    room: unreadCount === null ? null : { ...room, unreadCount },
  };
}

async function hydrateConversation(
  database: TrevvDatabase,
  scope: TenantScope,
  conversation: typeof conversations.$inferSelect,
): Promise<ConversationProjection> {
  const [participants, room, checkpoint] = await Promise.all([
    database
      .select({
        participant: conversationParticipants,
        user: users,
        role: memberships.role,
        checkpoint: conversationReadCheckpoints,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .innerJoin(
        memberships,
        and(
          eq(
            memberships.organizationId,
            conversationParticipants.organizationId,
          ),
          eq(memberships.userId, conversationParticipants.userId),
          isNull(memberships.archivedAt),
          isNull(memberships.deletedAt),
        ),
      )
      .leftJoin(
        conversationReadCheckpoints,
        and(
          eq(
            conversationReadCheckpoints.organizationId,
            conversationParticipants.organizationId,
          ),
          eq(
            conversationReadCheckpoints.conversationId,
            conversationParticipants.conversationId,
          ),
          eq(
            conversationReadCheckpoints.userId,
            conversationParticipants.userId,
          ),
        ),
      )
      .where(
        and(
          eq(conversationParticipants.organizationId, scope.organizationId),
          eq(conversationParticipants.conversationId, conversation.id),
          isNull(conversationParticipants.removedAt),
          isNull(users.deletedAt),
        ),
      ),
    database
      .select({ teamId: teamRooms.teamId })
      .from(teamRooms)
      .where(
        and(
          eq(teamRooms.organizationId, scope.organizationId),
          eq(teamRooms.conversationId, conversation.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    database
      .select()
      .from(conversationReadCheckpoints)
      .where(
        and(
          eq(conversationReadCheckpoints.organizationId, scope.organizationId),
          eq(conversationReadCheckpoints.conversationId, conversation.id),
          eq(conversationReadCheckpoints.userId, scope.userId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  const [unread, needsResponse] = await Promise.all([
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.organizationId, scope.organizationId),
          eq(conversationMessages.conversationId, conversation.id),
          checkpoint
            ? gt(
                conversationMessages.sequence,
                await messageSequence(
                  database,
                  scope,
                  checkpoint.lastReadMessageId,
                ),
              )
            : undefined,
          ne(conversationMessages.senderId, scope.userId),
          isNull(conversationMessages.deletedAt),
        ),
      )
      .then((rows) => rows[0]),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.organizationId, scope.organizationId),
          eq(conversationMessages.conversationId, conversation.id),
          eq(conversationMessages.responseOwnerId, scope.userId),
          eq(conversationMessages.responseState, "open"),
          gt(conversationMessages.expiresAt, new Date()),
          isNull(conversationMessages.redactedAt),
          isNull(conversationMessages.deletedAt),
        ),
      )
      .then((rows) => rows[0]),
  ]);
  return {
    conversation,
    ...(room ? { teamId: room.teamId } : {}),
    participants: participants.map(
      ({ participant, user, role, checkpoint }) => ({
        participant,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationRole: role,
        },
        checkpoint,
      }),
    ),
    unreadCount: unread?.count ?? 0,
    needsResponseCount: needsResponse?.count ?? 0,
  };
}

async function hydrateMessage(
  database: TrevvDatabase,
  scope: TenantScope,
  message: typeof conversationMessages.$inferSelect,
): Promise<MessageProjection> {
  const [senderRow, reactionRows] = await Promise.all([
    database
      .select({ user: users, role: memberships.role })
      .from(users)
      .innerJoin(
        memberships,
        and(
          eq(memberships.organizationId, scope.organizationId),
          eq(memberships.userId, users.id),
        ),
      )
      .where(eq(users.id, message.senderId))
      .limit(1)
      .then((rows) => rows[0]),
    database
      .select({
        emoji: conversationReactions.emoji,
        userId: conversationReactions.userId,
      })
      .from(conversationReactions)
      .innerJoin(
        conversationParticipants,
        and(
          eq(
            conversationParticipants.organizationId,
            conversationReactions.organizationId,
          ),
          eq(
            conversationParticipants.conversationId,
            conversationReactions.conversationId,
          ),
          eq(conversationParticipants.userId, conversationReactions.userId),
          isNull(conversationParticipants.removedAt),
        ),
      )
      .where(
        and(
          eq(conversationReactions.organizationId, scope.organizationId),
          eq(conversationReactions.conversationId, message.conversationId),
          eq(conversationReactions.messageId, message.id),
        ),
      ),
  ]);
  if (!senderRow) throw notFound();
  const grouped = new Map<string, string[]>();
  for (const reaction of reactionRows)
    grouped.set(reaction.emoji, [
      ...(grouped.get(reaction.emoji) ?? []),
      reaction.userId,
    ]);
  if (grouped.size > MAX_REACTION_KINDS_PER_MESSAGE)
    throw unavailable(
      "Stored reactions exceed the supported message reaction bound.",
    );
  const visibleMessage =
    message.redactedAt !== null || message.expiresAt <= new Date()
      ? { ...message, body: "[Message expired]", metadata: {} }
      : message;
  return {
    message: visibleMessage,
    sender: {
      id: senderRow.user.id,
      email: senderRow.user.email,
      name: senderRow.user.name,
      organizationRole: senderRow.role,
    },
    reactions: [...grouped].map(([emoji, userIds]) => ({
      emoji,
      userIds,
      reactedByCurrentUser: userIds.includes(scope.userId),
    })),
  };
}

async function getTeamRow(
  database: TrevvDatabase,
  scope: TenantScope,
  id: string,
  lock = false,
) {
  const query = database
    .select()
    .from(teams)
    .where(
      and(
        eq(teams.organizationId, scope.organizationId),
        eq(teams.id, id),
        isNull(teams.archivedAt),
        isNull(teams.deletedAt),
      ),
    )
    .limit(1);
  const [team] = lock ? await query.for("update") : await query;
  if (!team) throw notFound();
  return team;
}

async function getTeamRoom(
  database: TrevvDatabase,
  scope: TenantScope,
  teamId: string,
) {
  const [room] = await database
    .select()
    .from(teamRooms)
    .where(
      and(
        eq(teamRooms.organizationId, scope.organizationId),
        eq(teamRooms.teamId, teamId),
      ),
    )
    .limit(1);
  if (!room) throw notFound();
  return room;
}

async function getMessageRow(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  id: string,
  lock = false,
) {
  const query = database
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.id, id),
        isNull(conversationMessages.deletedAt),
      ),
    )
    .limit(1);
  const [message] = lock ? await query.for("update") : await query;
  if (!message) throw notFound();
  return message;
}

async function assertActorMembership(
  database: TrevvDatabase,
  scope: TenantScope,
) {
  const [membership] = await database
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        eq(memberships.userId, scope.userId),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!membership) throw notFound();
  return membership;
}

async function assertWorkspaceAccess(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
) {
  const actor = await assertActorMembership(database, scope);
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, scope.organizationId),
        eq(workspaces.id, workspaceId),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  if (!workspace) throw notFound();
  if (
    ["owner", "admin"].includes(actor.role) ||
    workspace.leadUserId === scope.userId
  )
    return workspace;
  const [[workspaceMember], [portfolioMember]] = await Promise.all([
    database
      .select({ id: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.organizationId, scope.organizationId),
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, scope.userId),
          isNull(workspaceMembers.archivedAt),
          isNull(workspaceMembers.deletedAt),
        ),
      )
      .limit(1),
    database
      .select({ id: portfolioMembers.userId })
      .from(portfolioMembers)
      .where(
        and(
          eq(portfolioMembers.organizationId, scope.organizationId),
          eq(portfolioMembers.portfolioId, workspace.portfolioId),
          eq(portfolioMembers.userId, scope.userId),
          isNull(portfolioMembers.archivedAt),
          isNull(portfolioMembers.deletedAt),
        ),
      )
      .limit(1),
  ]);
  if (!workspaceMember && !portfolioMember) throw notFound();
  return workspace;
}

async function canManageWorkspace(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
) {
  const actor = await assertActorMembership(database, scope);
  if (actor.role === "viewer" || actor.role === "guest") return false;
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, scope.organizationId),
        eq(workspaces.id, workspaceId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  if (!workspace) return false;
  if (
    ["owner", "admin"].includes(actor.role) ||
    workspace.leadUserId === scope.userId
  )
    return true;
  const [member] = await database
    .select({ canManage: workspaceMembers.canManage })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.organizationId, scope.organizationId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, scope.userId),
        eq(workspaceMembers.canManage, true),
        isNull(workspaceMembers.archivedAt),
        isNull(workspaceMembers.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(member);
}

async function assertCanManageWorkspace(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
) {
  const workspace = await assertWorkspaceAccess(database, scope, workspaceId);
  if (!(await canManageWorkspace(database, scope, workspaceId)))
    throw notFound();
  return workspace;
}

async function assertCanManageTeam(
  database: TrevvDatabase,
  scope: TenantScope,
  team: typeof teams.$inferSelect,
) {
  if (await canManageWorkspace(database, scope, team.workspaceId)) return;
  const [lead] = await database
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, scope.organizationId),
        eq(teamMembers.teamId, team.id),
        eq(teamMembers.userId, scope.userId),
        eq(teamMembers.role, "lead"),
        isNull(teamMembers.removedAt),
      ),
    )
    .limit(1);
  if (!lead) throw notFound();
}

async function assertConversationAccess(
  database: TrevvDatabase,
  scope: TenantScope,
  id: string,
  lock = false,
) {
  const actor = await assertActorMembership(database, scope);
  const query = database
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, scope.organizationId),
        eq(conversations.id, id),
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  const [conversation] = lock ? await query.for("update") : await query;
  if (!conversation) throw notFound();
  if (actor.role === "guest" && conversation.kind !== "external")
    throw notFound();
  await assertWorkspaceAccess(database, scope, conversation.workspaceId);
  if (conversation.visibility !== "organization")
    await assertActiveParticipant(database, scope, id, scope.userId);
  if (conversation.kind === "team")
    await assertActiveTeamMember(database, scope, id, scope.userId);
  return conversation;
}

async function assertActiveParticipant(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  userId: string,
) {
  const [participant] = await database
    .select({ id: conversationParticipants.userId })
    .from(conversationParticipants)
    .innerJoin(
      memberships,
      and(
        eq(memberships.organizationId, conversationParticipants.organizationId),
        eq(memberships.userId, conversationParticipants.userId),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        isNull(conversationParticipants.removedAt),
      ),
    )
    .limit(1);
  if (!participant) throw notFound();
}

async function assertCanWriteConversation(
  database: TrevvDatabase,
  scope: TenantScope,
  conversation: typeof conversations.$inferSelect,
) {
  const actor = await assertActorMembership(database, scope);
  if (
    actor.role === "viewer" ||
    (actor.role === "guest" && conversation.kind !== "external")
  )
    throw notFound();
  if (conversation.visibility !== "organization")
    await assertActiveParticipant(
      database,
      scope,
      conversation.id,
      scope.userId,
    );
  if (conversation.kind === "team")
    await assertActiveTeamMember(
      database,
      scope,
      conversation.id,
      scope.userId,
    );
  if (conversation.kind === "direct")
    await assertDirectConversationWritable(database, scope, conversation.id);
}

async function assertDirectConversationWritable(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
) {
  const [eligible] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(conversationParticipants)
    .innerJoin(
      memberships,
      and(
        eq(memberships.organizationId, conversationParticipants.organizationId),
        eq(memberships.userId, conversationParticipants.userId),
        ne(memberships.role, "guest"),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .innerJoin(
      workspaceMembers,
      and(
        eq(
          workspaceMembers.organizationId,
          conversationParticipants.organizationId,
        ),
        eq(workspaceMembers.workspaceId, conversationParticipants.workspaceId),
        eq(workspaceMembers.userId, conversationParticipants.userId),
        isNull(workspaceMembers.archivedAt),
        isNull(workspaceMembers.deletedAt),
      ),
    )
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        isNull(conversationParticipants.removedAt),
      ),
    );
  if ((eligible?.count ?? 0) !== 2)
    throw conflict(
      "This direct conversation is inactive until both participants have access.",
    );
}

async function assertActiveTeamMember(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  userId: string,
) {
  const [member] = await database
    .select({ userId: teamMembers.userId })
    .from(teamRooms)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, teamRooms.organizationId),
        eq(teamMembers.workspaceId, teamRooms.workspaceId),
        eq(teamMembers.teamId, teamRooms.teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.removedAt),
      ),
    )
    .where(
      and(
        eq(teamRooms.organizationId, scope.organizationId),
        eq(teamRooms.conversationId, conversationId),
      ),
    )
    .limit(1);
  if (!member) throw notFound();
}

async function assertCanManageConversation(
  database: TrevvDatabase,
  scope: TenantScope,
  conversation: typeof conversations.$inferSelect,
) {
  const actor = await assertActorMembership(database, scope);
  if (actor.role === "guest" || actor.role === "viewer") throw notFound();
  if (await canManageWorkspace(database, scope, conversation.workspaceId))
    return;
  const [owner] = await database
    .select({ id: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversation.id),
        eq(conversationParticipants.userId, scope.userId),
        eq(conversationParticipants.participantRole, "owner"),
        isNull(conversationParticipants.removedAt),
      ),
    )
    .limit(1);
  if (!owner) throw notFound();
}

async function ensureSenderParticipant(
  database: TrevvDatabase,
  scope: TenantScope,
  conversation: typeof conversations.$inferSelect,
  now: Date,
) {
  if (conversation.visibility !== "organization") return;
  await assertConversationHasCapacity(
    database,
    scope,
    conversation.id,
    scope.userId,
  );
  await database
    .insert(conversationParticipants)
    .values({
      organizationId: scope.organizationId,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      userId: scope.userId,
      participantRole: "member",
      source: "workspace",
      joinedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        conversationParticipants.conversationId,
        conversationParticipants.userId,
      ],
      set: {
        removedAt: null,
        source: "workspace",
        version: sql`${conversationParticipants.version} + 1`,
        updatedAt: now,
      },
    });
}

async function ensureActorWorkspaceMembership(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
  now: Date,
) {
  await database
    .insert(workspaceMembers)
    .values({
      organizationId: scope.organizationId,
      workspaceId,
      userId: scope.userId,
      canManage: await canManageWorkspace(database, scope, workspaceId),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [workspaceMembers.workspaceId, workspaceMembers.userId],
    });
}

async function assertWorkspaceMembers(
  database: TrevvDatabase,
  scope: TenantScope,
  workspaceId: string,
  userIds: string[],
  now: Date,
  materialize = true,
) {
  if (!userIds.length) return;
  const [workspace] = await database
    .select({
      id: workspaces.id,
      portfolioId: workspaces.portfolioId,
      leadUserId: workspaces.leadUserId,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, scope.organizationId),
        eq(workspaces.id, workspaceId),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  if (!workspace) throw notFound();
  const rows = await database
    .select({
      userId: memberships.userId,
      explicitWorkspaceUserId: workspaceMembers.userId,
    })
    .from(memberships)
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.organizationId, memberships.organizationId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, memberships.userId),
        isNull(workspaceMembers.archivedAt),
        isNull(workspaceMembers.deletedAt),
      ),
    )
    .leftJoin(
      portfolioMembers,
      and(
        eq(portfolioMembers.organizationId, memberships.organizationId),
        eq(portfolioMembers.portfolioId, workspace.portfolioId),
        eq(portfolioMembers.userId, memberships.userId),
        isNull(portfolioMembers.archivedAt),
        isNull(portfolioMembers.deletedAt),
      ),
    )
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        inArray(memberships.userId, userIds),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
        or(
          inArray(memberships.role, ["owner", "admin"]),
          workspace.leadUserId
            ? eq(memberships.userId, workspace.leadUserId)
            : undefined,
          isNotNull(workspaceMembers.userId),
          isNotNull(portfolioMembers.userId),
        ),
      ),
    );
  if (new Set(rows.map(({ userId }) => userId)).size !== new Set(userIds).size)
    throw notFound();
  const implicitUserIds = rows
    .filter(({ explicitWorkspaceUserId }) => explicitWorkspaceUserId === null)
    .map(({ userId }) => userId);
  if (!materialize || !implicitUserIds.length) return;
  await database
    .insert(workspaceMembers)
    .values(
      implicitUserIds.map((userId) => ({
        organizationId: scope.organizationId,
        workspaceId,
        userId,
        canManage: false,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.userId],
      set: {
        canManage: false,
        archivedAt: null,
        deletedAt: null,
        updatedAt: now,
      },
    });
}

async function listMemberRoles(
  database: TrevvDatabase,
  scope: TenantScope,
  userIds: string[],
) {
  const rows = await database
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        inArray(memberships.userId, userIds),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    );
  return new Map(rows.map(({ userId, role }) => [userId, role]));
}

async function hasGuestParticipant(
  database: TrevvDatabase,
  scope: TenantScope,
  userIds: string[],
) {
  const roles = await listMemberRoles(database, scope, userIds);
  return [...roles.values()].includes("guest");
}

async function hasRemainingActiveGuestParticipant(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  excludedUserId: string,
) {
  const [guest] = await database
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .innerJoin(
      memberships,
      and(
        eq(memberships.organizationId, conversationParticipants.organizationId),
        eq(memberships.userId, conversationParticipants.userId),
        eq(memberships.role, "guest"),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, excludedUserId),
        isNull(conversationParticipants.removedAt),
      ),
    )
    .limit(1);
  return Boolean(guest);
}

async function assertTeamHasCapacity(
  database: TrevvDatabase,
  scope: TenantScope,
  teamId: string,
  userId: string,
) {
  const [existing] = await database
    .select({ removedAt: teamMembers.removedAt })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, scope.organizationId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
      ),
    )
    .limit(1);
  if (existing?.removedAt === null) return;
  const [active] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, scope.organizationId),
        eq(teamMembers.teamId, teamId),
        isNull(teamMembers.removedAt),
      ),
    );
  if ((active?.count ?? 0) >= MAX_COLLABORATION_MEMBERS)
    throw conflict("A Team can contain at most 250 members.");
}

async function assertConversationHasCapacity(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  userId: string,
) {
  const [existing] = await database
    .select({ removedAt: conversationParticipants.removedAt })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (existing?.removedAt === null) return;
  const [active] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        isNull(conversationParticipants.removedAt),
      ),
    );
  if ((active?.count ?? 0) >= MAX_COLLABORATION_MEMBERS)
    throw conflict("A conversation can contain at most 250 participants.");
}

async function hasAnotherActiveConversationOwner(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  excludedUserId: string,
) {
  const [owner] = await database
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, excludedUserId),
        eq(conversationParticipants.participantRole, "owner"),
        isNull(conversationParticipants.removedAt),
      ),
    )
    .limit(1);
  return Boolean(owner);
}

async function isActiveConversationOwner(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  userId: string,
) {
  const [owner] = await database
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.organizationId, scope.organizationId),
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        eq(conversationParticipants.participantRole, "owner"),
        isNull(conversationParticipants.removedAt),
      ),
    )
    .limit(1);
  return Boolean(owner);
}

async function assertNoOpenResponseObligations(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  userId: string,
  now: Date,
) {
  const [obligation] = await database
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.responseOwnerId, userId),
        eq(conversationMessages.responseState, "open"),
        gt(conversationMessages.expiresAt, now),
        isNull(conversationMessages.redactedAt),
        isNull(conversationMessages.deletedAt),
      ),
    )
    .limit(1);
  if (obligation)
    throw conflict(
      "Resolve this participant's open requests and decisions before removing them.",
    );
}

async function bumpTeamVersion(
  database: TrevvDatabase,
  scope: TenantScope,
  team: typeof teams.$inferSelect,
  expectedVersion: number,
  now: Date,
) {
  const [updated] = await database
    .update(teams)
    .set({ version: sql`${teams.version} + 1`, updatedAt: now })
    .where(
      and(
        eq(teams.organizationId, scope.organizationId),
        eq(teams.id, team.id),
        eq(teams.version, expectedVersion),
        isNull(teams.deletedAt),
      ),
    )
    .returning();
  if (!updated) throw versionConflict(team.version);
  return updated;
}

async function findClientMessage(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  clientMessageId: string,
) {
  const [message] = await database
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.senderId, scope.userId),
        eq(conversationMessages.clientMessageId, clientMessageId),
      ),
    )
    .limit(1);
  return message;
}

function messageFingerprint(message: typeof conversationMessages.$inferSelect) {
  return hash({
    body: message.body,
    parentMessageId: message.parentMessageId,
    intent: message.intent,
    responseOwnerId: message.responseOwnerId,
    responseDueAt: message.responseDueAt,
    linkedEntityType: message.linkedEntityType,
    linkedEntityId: message.linkedEntityId,
    metadata: message.metadata,
  });
}

function messageInputFingerprint(
  input: SendMessageRepositoryInput,
  body: string,
) {
  return hash({
    body,
    parentMessageId: input.parentMessageId ?? null,
    intent: input.intent ?? "message",
    responseOwnerId: input.responseOwnerId ?? null,
    responseDueAt: input.responseDueAt ?? null,
    linkedEntityType: input.linkedEntityType ?? null,
    linkedEntityId: input.linkedEntityId ?? null,
    metadata: input.metadata ?? {},
  });
}

function assertMessageMutable(
  message: typeof conversationMessages.$inferSelect,
  now: Date,
) {
  if (message.redactedAt !== null || message.expiresAt <= now)
    throw conflict("This message has expired and can no longer be changed.");
}

async function getReadCheckpoint(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
  _messageId: string,
) {
  await assertConversationAccess(database, scope, conversationId);
  const [checkpoint] = await database
    .select()
    .from(conversationReadCheckpoints)
    .where(
      and(
        eq(conversationReadCheckpoints.organizationId, scope.organizationId),
        eq(conversationReadCheckpoints.conversationId, conversationId),
        eq(conversationReadCheckpoints.userId, scope.userId),
      ),
    )
    .limit(1);
  if (!checkpoint) throw notFound();
  return checkpoint;
}

async function messageSequence(
  database: TrevvDatabase,
  scope: TenantScope,
  messageId: string | null,
) {
  if (!messageId) return 0;
  const [row] = await database
    .select({ sequence: conversationMessages.sequence })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.id, messageId),
      ),
    )
    .limit(1);
  return row?.sequence ?? 0;
}

async function unreadCountForConversation(
  database: TrevvDatabase,
  scope: TenantScope,
  conversationId: string,
) {
  const [checkpoint] = await database
    .select({ messageId: conversationReadCheckpoints.lastReadMessageId })
    .from(conversationReadCheckpoints)
    .where(
      and(
        eq(conversationReadCheckpoints.organizationId, scope.organizationId),
        eq(conversationReadCheckpoints.conversationId, conversationId),
        eq(conversationReadCheckpoints.userId, scope.userId),
      ),
    )
    .limit(1);
  const sequence = await messageSequence(
    database,
    scope,
    checkpoint?.messageId ?? null,
  );
  const [result] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, scope.organizationId),
        eq(conversationMessages.conversationId, conversationId),
        gt(conversationMessages.sequence, sequence),
        ne(conversationMessages.senderId, scope.userId),
        isNull(conversationMessages.deletedAt),
      ),
    );
  return result?.count ?? 0;
}

async function idempotentMutation<T>(
  database: TrevvDatabase,
  scope: TenantScope,
  context: MutationContext,
  request: unknown,
  operation: () => Promise<MutationResult<T>>,
  restore: (id: string) => Promise<T>,
  resultType: string,
): Promise<MutationResult<T>> {
  const key = context.idempotencyKey;
  if (!key) return operation();
  const now = context.now ?? new Date();
  const method = context.method.trim().toUpperCase();
  const route =
    context.route.trim().replace(/\?.*$/u, "").replace(/\/+$/u, "") || "/";
  const fingerprint =
    context.requestFingerprint ?? hash({ method, route, request });
  await database
    .delete(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.organizationId, scope.organizationId),
        eq(idempotencyRecords.userId, scope.userId),
        eq(idempotencyRecords.key, key),
        lte(idempotencyRecords.expiresAt, now),
      ),
    );
  const [inserted] = await database
    .insert(idempotencyRecords)
    .values({
      id: randomUUID(),
      organizationId: scope.organizationId,
      userId: scope.userId,
      method,
      route,
      key,
      requestFingerprint: fingerprint,
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        idempotencyRecords.organizationId,
        idempotencyRecords.userId,
        idempotencyRecords.key,
      ],
    })
    .returning({ id: idempotencyRecords.id });
  if (!inserted) {
    const [existing] = await database
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.organizationId, scope.organizationId),
          eq(idempotencyRecords.userId, scope.userId),
          eq(idempotencyRecords.key, key),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !existing ||
      existing.method !== method ||
      existing.route !== route ||
      existing.requestFingerprint !== fingerprint
    )
      throw new RepositoryError(
        "idempotency_key_reused",
        "The idempotency key was already used for a different request.",
      );
    if (existing.state !== "completed")
      throw unavailable("The original idempotent request has not completed.");
    if (!existing.resultId)
      throw unavailable("The original idempotent result is unavailable.");
    // Rehydrate through the scoped repository on every replay. Besides
    // returning the current durable projection, this re-runs tenant,
    // membership, Team, and participant authorization after access changes.
    return { value: await restore(existing.resultId), replayed: true };
  }
  const result = await operation();
  const resultId = mutationResultId(result.value);
  await database
    .update(idempotencyRecords)
    .set({
      state: "completed",
      responseStatus: context.responseStatus ?? 200,
      responseBody: result.value as object,
      resultType,
      resultId,
      updatedAt: now,
    })
    .where(eq(idempotencyRecords.id, inserted.id));
  return result;
}

function mutationResultId(value: unknown): string {
  if (typeof value !== "object" || value === null)
    throw unavailable("The mutation result cannot be replayed.");
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  for (const key of ["team", "conversation", "message"])
    if (typeof record[key] === "object" && record[key] !== null) {
      const id = (record[key] as Record<string, unknown>).id;
      if (typeof id === "string") return id;
    }
  if (typeof record.lastReadMessageId === "string")
    return record.lastReadMessageId;
  throw unavailable("The mutation result cannot be replayed.");
}

async function journal(
  database: TrevvDatabase,
  scope: TenantScope,
  input: {
    workspaceId: string;
    conversationId?: string | undefined;
    type: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    now: Date;
  },
) {
  const payload = { requestId: scope.requestId, ...input.payload };
  if (
    Object.keys(payload).some((key) =>
      ["body", "content", "text", "messageBody"].includes(key),
    )
  )
    throw unavailable("Collaboration journals cannot contain message content.");
  const dedupKey = hash({
    requestId: scope.requestId,
    type: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload,
  });
  await database.insert(auditLogs).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    actorId: scope.userId,
    action: input.type,
    targetType: input.aggregateType,
    targetId: input.aggregateId,
    payload,
    createdAt: input.now,
  });
  await database.insert(outboxEvents).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    eventType: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    schemaVersion: 1,
    actorId: scope.userId,
    requestId: scope.requestId,
    correlationId: scope.requestId,
    dedupKey,
    payload,
    availableAt: input.now,
    createdAt: input.now,
  });
  await database.insert(collaborationEvents).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    actorId: scope.userId,
    eventType: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload,
    expiresAt: new Date(input.now.getTime() + 7 * 86_400_000),
    createdAt: input.now,
  });
}

async function scheduleMessageRetention(
  database: TrevvDatabase,
  scope: TenantScope,
  messageId: string,
  conversationId: string,
  expiresAt: Date,
  now: Date,
) {
  const eventType = "message.retention_due";
  const payload = {
    messageId,
    conversationId,
    expiresAt: expiresAt.toISOString(),
  };
  await database.insert(outboxEvents).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    eventType,
    aggregateType: "message",
    aggregateId: messageId,
    schemaVersion: 1,
    actorId: scope.userId,
    requestId: scope.requestId,
    correlationId: scope.requestId,
    dedupKey: hash({
      organizationId: scope.organizationId,
      eventType,
      messageId,
      expiresAt,
    }),
    payload,
    availableAt: expiresAt,
    createdAt: now,
  });
}

function assertConversationShape(input: CreateConversationRepositoryInput) {
  if (input.kind === "direct" && input.visibility !== "private")
    throw conflict("Direct conversations must be private.");
  if (
    input.kind === "workspace" &&
    !["organization", "private"].includes(input.visibility)
  )
    throw conflict("Workspace rooms must be organization-visible or private.");
  if (input.kind === "external" && input.visibility !== "guest_scoped")
    throw conflict("External rooms must be guest-scoped.");
  const retention = input.retentionDays ?? 365;
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650)
    throw conflict("Message retention must be between 1 and 3650 days.");
}

function isTeamFeature(value: string): value is TeamFeatureCapability {
  return [
    "work",
    "messages",
    "decisions",
    "approvals",
    "resources",
    "reporting",
  ].includes(value);
}
function requiredText(value: string, label: string, max: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw conflict(`${label} is invalid.`);
  return normalized;
}
function validateMessageMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw conflict("Message metadata must be valid JSON.");
  }
  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, "utf8") > MESSAGE_METADATA_MAX_BYTES
  )
    throw conflict("Message metadata cannot exceed 8 KiB.");
  let keyCount = 0;
  const inspect = (entry: unknown, depth: number): void => {
    if (typeof entry === "string") {
      if (entry.length > MESSAGE_METADATA_MAX_STRING_LENGTH)
        throw conflict("Message metadata contains an oversized string.");
      return;
    }
    if (
      entry === null ||
      typeof entry === "boolean" ||
      (typeof entry === "number" && Number.isFinite(entry))
    )
      return;
    if (depth >= MESSAGE_METADATA_MAX_DEPTH)
      throw conflict("Message metadata is nested too deeply.");
    if (Array.isArray(entry)) {
      if (entry.length > MESSAGE_METADATA_MAX_ARRAY_ITEMS)
        throw conflict("Message metadata contains too many array items.");
      for (const item of entry) inspect(item, depth + 1);
      return;
    }
    if (
      typeof entry !== "object" ||
      entry === undefined ||
      Object.getPrototypeOf(entry) !== Object.prototype
    )
      throw conflict("Message metadata must contain JSON values only.");
    for (const [key, child] of Object.entries(entry)) {
      keyCount += 1;
      if (key.length > 64 || keyCount > MESSAGE_METADATA_MAX_KEYS)
        throw conflict("Message metadata contains too many or oversized keys.");
      inspect(child, depth + 1);
    }
  };
  inspect(value, 0);
  return value;
}
function slugify(value: string) {
  const slug = value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug || randomUUID();
}
function boundedLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
) {
  return Math.max(1, Math.min(value ?? fallback, maximum));
}
function encodeCursor(at: Date, id: string) {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString(
    "base64url",
  );
}
function decodeCursor(value?: string): { at: Date; id: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as {
      at?: string;
      id?: string;
    };
    const at = new Date(parsed.at ?? "");
    if (!parsed.id || Number.isNaN(at.getTime())) throw new Error();
    return { at, id: parsed.id };
  } catch {
    throw conflict("The pagination cursor is invalid.");
  }
}
function encodeSequenceCursor(sequence: number) {
  return Buffer.from(String(sequence)).toString("base64url");
}
function decodeSequenceCursor(value?: string) {
  if (!value) return undefined;
  const result = Number(Buffer.from(value, "base64url").toString());
  if (!Number.isInteger(result) || result < 1)
    throw conflict("The pagination cursor is invalid.");
  return result;
}
function hash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function directConversationKey(userIds: string[]) {
  return createHash("sha256")
    .update([...userIds].sort().join("\u001f"), "utf8")
    .digest("hex");
}
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
}
function notFound() {
  return new RepositoryError(
    "resource_not_found",
    "The requested resource is unavailable.",
  );
}
function conflict(message: string) {
  return new RepositoryError("constraint_conflict", message);
}

function hasPostgresErrorCode(error: unknown, expectedCode: string) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === expectedCode
    )
      return true;
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}
function versionConflict(currentVersion: number) {
  return new RepositoryError(
    "version_conflict",
    "The resource changed before this update was committed.",
    { currentVersion },
  );
}
function unavailable(message: string) {
  return new RepositoryError("repository_unavailable", message);
}
