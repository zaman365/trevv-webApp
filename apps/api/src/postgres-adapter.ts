import type {
  AttentionSignalDto,
  BoardDto,
  CollaborationEventBatch,
  CollaborationUserDto,
  DataLifecycleRequestDto,
  ConversationDto,
  ConversationMessageDto,
  InboxItemDto,
  PortfolioDto,
  PortfolioResponse,
  TeamDto,
  TeamPreset,
  WeeklyReviewRecordDto,
  WorkItemEvidenceDto,
  WorkItemHistoryEntryDto,
  WaitingStateDto,
  WorkItemDto,
  WorkspaceSnapshotDto,
  WorkspaceDto,
} from "@founderhq/api-contract";
import { teamFeatureCapabilitiesForPreset } from "@founderhq/api-contract";
import type {
  CollaborationUserProjection,
  ConversationProjection,
  InboxItemProjection,
  MessageProjection,
  OrganizationScopedRepositories,
  PostgresRepositories,
  TeamProjection,
  RetentionPolicyProjection,
  WaitingProjection,
  WorkItemHistoryProjection,
  WorkItemProjection,
  WorkItemTransitionInput,
  WorkspaceProjection,
} from "@founderhq/db";
import {
  createIdentityScope,
  createOrganizationScope,
  privacyDataInventory,
  privacyInventoryVersion,
  privacyPolicyVersion,
} from "@founderhq/db";
import {
  canCollaborate,
  requireAccess,
  requireCollaborationAccess,
  type AccessContext,
  type CollaborationScope,
} from "@founderhq/permissions";
import {
  DataPlaneError,
  dataPlaneErrorCode,
  type AccessResolver,
  type ApiMutationContext,
  type ApiRequestContext,
  type DataPlane,
} from "./data-plane.js";

export interface LiveIdentity {
  authUserId: string;
  expiresAt: Date;
}

export interface PostgresAdapterOptions {
  repositories: PostgresRepositories;
  resolveIdentity(request: Request): Promise<LiveIdentity | null>;
}

export function createPostgresAdapter(options: PostgresAdapterOptions): {
  dataPlane: DataPlane;
  accessResolver: AccessResolver;
} {
  const accessResolver: AccessResolver = {
    mode: "live",
    async resolve(request, resolvedRequestId) {
      const identity = await options.resolveIdentity(request);
      if (!identity) return null;
      const requestId =
        resolvedRequestId ??
        request.headers.get("x-request-id") ??
        crypto.randomUUID();
      const identityResolution = await options.repositories
        .forIdentity(
          createIdentityScope({ authUserId: identity.authUserId, requestId }),
        )
        .resolve();
      if (identityResolution.status !== "active")
        throw identityResolutionError(identityResolution.status);
      const resolved = identityResolution;
      const access: AccessContext = {
        userId: resolved.appUser.id,
        organizationId: resolved.organization.id,
        role: resolved.membership.role,
        accessiblePortfolioIds: new Set(resolved.portfolioIds),
        managedPortfolioIds: new Set(resolved.managedPortfolioIds),
        accessibleWorkspaceIds: new Set(resolved.workspaceIds),
        managedWorkspaceIds: new Set(resolved.managedWorkspaceIds),
      };
      return {
        access,
        session: {
          user: {
            id: resolved.appUser.id,
            email: resolved.appUser.email,
            name: resolved.appUser.name,
            role: resolved.membership.role,
            locale: locale(resolved.appUser.locale),
          },
          organizationId: resolved.organization.id,
          organization: {
            id: resolved.organization.id,
            name: resolved.organization.name,
            slug: resolved.organization.slug,
            role: resolved.membership.role,
            timezone: resolved.organization.timezone,
          },
          availableOrganizations: resolved.availableOrganizations,
          managedWorkspaceIds: resolved.managedWorkspaceIds,
          expiresAt: identity.expiresAt.toISOString(),
        },
      };
    },
  };

  const dataPlane: DataPlane = {
    mode: "live",
    async readiness() {
      await options.repositories.readiness();
      return { database: "ready" };
    },

    async listPortfolios(context) {
      const repositories = scoped(options.repositories, context);
      const portfolios = await repositories.portfolios.list();
      return portfolios
        .filter(
          (portfolio) =>
            isOrganizationManager(context.access) ||
            canSeePortfolio(context.access, portfolio.id),
        )
        .map(toPortfolioDto);
    },

    async getPortfolio(context, requestedPortfolioId) {
      const repositories = scoped(options.repositories, context);
      const portfolio = requestedPortfolioId
        ? await repositories.portfolios.getRollup(requestedPortfolioId)
        : await getDefaultPortfolioRollup(repositories, context.access);
      const visibleWorkspaces = portfolio.workspaces.filter((workspace) =>
        canSeeWorkspace(context.access, workspace.id),
      );
      if (
        !visibleWorkspaces.length &&
        !isOrganizationManager(context.access) &&
        !canSeePortfolio(context.access, portfolio.portfolio.id)
      )
        throw notFound();
      const visibleWorkspaceIds = new Set(
        visibleWorkspaces.map((workspace) => workspace.id),
      );
      const items = portfolio.items.filter((item) =>
        visibleWorkspaceIds.has(item.workspaceId),
      );
      return buildPortfolioResponse(
        portfolio.portfolio,
        visibleWorkspaces,
        items,
        context.now,
      );
    },

    async listAttention(context, filters) {
      if (filters.workspaceId)
        requireWorkspaceAccess(context.access, "read", filters.workspaceId);
      const rows = await scoped(
        options.repositories,
        context,
      ).attention.listActive({
        ...(filters.portfolioId ? { portfolioId: filters.portfolioId } : {}),
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        now: context.now,
      });
      return rows
        .filter((row) =>
          row.workspaceId
            ? canSeeWorkspace(context.access, row.workspaceId)
            : isOrganizationManager(context.access) ||
              canSeePortfolio(context.access, row.portfolioId),
        )
        .map(toAttentionDto);
    },

    async actOnAttention(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.attention.get(id);
      requireScopedResourceAccess(
        context.access,
        "update",
        current.workspaceId,
      );
      const result = await repositories.attention.act(
        id,
        expectedVersion,
        {
          action: input.action,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.snoozedUntil
            ? { snoozedUntil: new Date(input.snoozedUntil) }
            : {}),
        },
        mutation(context),
      );
      return { value: toAttentionDto(result.value), replayed: result.replayed };
    },

    async listWaiting(context) {
      return (await scoped(options.repositories, context).waiting.listActive())
        .filter((waiting) =>
          canSeeWorkspace(context.access, waiting.workspaceId),
        )
        .map(toWaitingDto);
    },

    async actOnWaiting(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.waiting.get(id);
      requireWorkspaceAccess(context.access, "update", current.workspaceId);
      const result = await repositories.waiting.act(
        id,
        expectedVersion,
        {
          action: input.action,
          ...(input.note ? { note: input.note } : {}),
          ...(input.nextFollowUp ? { nextFollowUp: input.nextFollowUp } : {}),
        },
        mutation(context),
      );
      return { value: toWaitingDto(result.value), replayed: result.replayed };
    },

    async createWaiting(context, expectedItemVersion, input) {
      requireWorkspaceAccess(context.access, "update", input.workspaceId);
      const repositories = scoped(options.repositories, context);
      const item = await repositories.workItems.get(input.entityId);
      if (item.workspaceId !== input.workspaceId) throw notFound();
      const result = await repositories.waiting.create(
        {
          workspaceId: input.workspaceId,
          entityType: "work_item",
          entityId: input.entityId,
          expectedItemVersion,
          title: input.title,
          waitingType: input.waitingType,
          ...(input.waitingReferenceId
            ? { waitingReferenceId: input.waitingReferenceId }
            : {}),
          ...(input.waitingLabel ? { waitingLabel: input.waitingLabel } : {}),
          ...(input.expectedBy ? { expectedBy: input.expectedBy } : {}),
          followUpOwnerId: input.followUpOwnerId,
          ...(input.nextFollowUp ? { nextFollowUp: input.nextFollowUp } : {}),
          ...(input.note ? { note: input.note } : {}),
          reasonCode: "waiting_started",
          ...(input.note ? { evidence: { summary: input.note } } : {}),
        },
        mutation(context),
      );
      return { value: toWaitingDto(result.value), replayed: result.replayed };
    },

    async getChangeRadar(context) {
      const radar = await scoped(
        options.repositories,
        context,
      ).management.getChangeRadar();
      return {
        checkpoint: radar.checkpoint,
        changes: radar.changes.filter((change) =>
          canSeeWorkspace(context.access, change.workspaceId),
        ),
      };
    },

    async getManagementMemory(context) {
      const repositories = scoped(options.repositories, context);
      const memory = await repositories.management.getMemory();
      const accessibleItems = await listAccessibleItems(
        repositories,
        context.access,
      );
      const accessibleItemIds = new Set(accessibleItems.map(({ id }) => id));
      return {
        workspaceSnapshots: memory.workspaceSnapshots
          .filter((row) => canSeeWorkspace(context.access, row.workspaceId))
          .map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            portfolioId: row.portfolioId,
            workspaceId: row.workspaceId,
            capturedAt: row.capturedAt.toISOString(),
            health: row.health,
            ...(row.progress === null ? {} : { progress: row.progress }),
            openCount: row.openCount,
            overdueCount: row.overdueCount,
            blockedCount: row.blockedCount,
            decisionCount: row.decisionCount,
            attentionCount: row.attentionCount,
            ...(row.nextMilestoneId
              ? { nextMilestoneId: row.nextMilestoneId }
              : {}),
            ...(row.nextMilestoneStatus
              ? { nextMilestoneStatus: row.nextMilestoneStatus }
              : {}),
            ...(row.latestUpdateAt
              ? { latestUpdateAt: row.latestUpdateAt.toISOString() }
              : {}),
            source: reviewSource(row.source),
          })),
        reviewRituals: memory.reviewRituals
          .filter((row) =>
            row.workspaceId
              ? canSeeWorkspace(context.access, row.workspaceId)
              : isOrganizationManager(context.access) ||
                canSeePortfolio(context.access, row.portfolioId),
          )
          .map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            portfolioId: row.portfolioId,
            ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
            type: reviewType(row.type),
            cadence: row.cadence,
            enabled: row.enabled,
            ...(row.nextDueAt
              ? { nextDueAt: row.nextDueAt.toISOString() }
              : {}),
            reminderEnabled: row.reminderEnabled,
          })),
        decisionOutcomes: memory.decisionOutcomes
          .filter((row) => accessibleItemIds.has(row.decisionItemId))
          .map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            portfolioId: row.portfolioId,
            decisionItemId: row.decisionItemId,
            outcome: decisionOutcome(row.outcome),
            learning: row.learning,
            ...(row.wouldRepeat === null
              ? {}
              : { wouldRepeat: row.wouldRepeat }),
            recordedBy: row.recordedBy,
            recordedAt: row.recordedAt.toISOString(),
          })),
      };
    },

    async submitWeeklyReview(context, input) {
      requireWorkspaceAccess(context.access, "update", input.workspaceId);
      const result = await scoped(
        options.repositories,
        context,
      ).management.submitWeeklyReview(
        {
          workspaceId: input.workspaceId,
          health: input.health,
          progressSummary: input.progress,
          blocker: input.blocker,
          nextMilestone: input.nextMilestone,
          ...(input.decisionNeeded
            ? { decisionNeeded: input.decisionNeeded }
            : {}),
          priorityNextWeek: input.priorityNextWeek,
        },
        mutation(context),
      );
      return {
        replayed: result.replayed,
        value: {
          update: {
            id: result.value.update.id,
            workspaceId: result.value.update.workspaceId,
            health: input.health,
            progress: result.value.update.wins,
            blocker: result.value.update.blocker,
            nextMilestone: result.value.update.nextMilestone,
            ...(result.value.update.helpNeeded
              ? { decisionNeeded: result.value.update.helpNeeded }
              : {}),
            priorityNextWeek: result.value.update.currentPriority,
            publishedAt: result.value.update.publishedAt.toISOString(),
          },
          snapshot: {
            id: result.value.snapshot.id,
            organizationId: result.value.snapshot.organizationId,
            portfolioId: result.value.snapshot.portfolioId,
            workspaceId: result.value.snapshot.workspaceId,
            capturedAt: result.value.snapshot.capturedAt.toISOString(),
            health: result.value.snapshot.health,
            source: "weekly_review",
          },
          attentionRefreshQueued: true,
        },
      };
    },

    async listWeeklyReviews(context, workspaceId) {
      if (workspaceId)
        requireWorkspaceAccess(context.access, "read", workspaceId);
      const repositories = scoped(options.repositories, context);
      const updates = await repositories.workspaceUpdates.list(workspaceId);
      const visible = updates.filter((update) =>
        canSeeWorkspace(context.access, update.workspaceId),
      );
      const authors = new Map(
        await Promise.all(
          [...new Set(visible.map(({ authorId }) => authorId))].map(
            async (authorId) =>
              [
                authorId,
                await repositories.users.getMemberHistory(authorId),
              ] as const,
          ),
        ),
      );
      return visible.map((update) =>
        toWeeklyReviewRecord(
          update,
          requireAuthor(authors.get(update.authorId)),
        ),
      );
    },

    async listSnapshots(context, filters) {
      if (filters.workspaceId)
        requireWorkspaceAccess(context.access, "read", filters.workspaceId);
      if (
        filters.portfolioId &&
        !isOrganizationManager(context.access) &&
        !canSeePortfolio(context.access, filters.portfolioId)
      )
        throw notFound();
      const rows = await scoped(options.repositories, context).snapshots.list({
        ...(filters.portfolioId ? { portfolioId: filters.portfolioId } : {}),
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
      });
      return rows
        .filter((row) => canSeeWorkspace(context.access, row.workspaceId))
        .map(toSnapshotDto);
    },

    async getOperationsStatus(context) {
      if (!isOrganizationManager(context.access)) throw notFound();
      const status = await scoped(
        options.repositories,
        context,
      ).operations.status();
      return {
        pendingOutbox: status.pendingOutbox,
        failedCount: status.failedCount,
        ...(status.oldestPendingAt
          ? { oldestPendingAt: dateTime(status.oldestPendingAt) }
          : {}),
        ...(status.lastProcessedAt
          ? { lastProcessedAt: dateTime(status.lastProcessedAt) }
          : {}),
      };
    },

    listInsights: unsupported(
      "Live Insights repositories are outside Phase 1.",
    ),
    listBlueprints: unsupported(
      "Live Blueprint repositories are outside Phase 1.",
    ),
    getTeamPressure: unsupported(
      "Live resource-pressure projection is outside Phase 1.",
    ),
    getEntitlements: unsupported("Billing is outside Phase 1."),
    previewImport: unsupported("Live imports are outside Phase 1."),

    async listWorkspaces(context) {
      return (await scoped(options.repositories, context).workspaces.list())
        .filter((workspace) => canSeeWorkspace(context.access, workspace.id))
        .map(toWorkspaceDto);
    },

    async createWorkspace(context, input) {
      requireAccess(context.access, "create", "workspace", {
        organizationId: context.access.organizationId,
        portfolioId: input.portfolioId,
      });
      const repositories = scoped(options.repositories, context);
      await repositories.portfolios.get(input.portfolioId);
      return repositories.unitOfWork.run(async (transaction) => {
        const workspaceResult = await transaction.workspaces.create(
          {
            portfolioId: input.portfolioId,
            name: input.name,
            slug: input.slug,
            description: input.description,
            type: input.type,
            accentColor: input.accent,
            icon: input.icon,
            lifecycleStage: input.stage,
            health: input.health,
            healthNote: input.healthNote,
            currentPriority: input.priority,
            ...(input.leadUserId ? { leadUserId: input.leadUserId } : {}),
          },
          mutation(context),
        );
        const board = workspaceResult.replayed
          ? (await transaction.boards.list(workspaceResult.value.id)).find(
              (candidate) => candidate.templateKey === "trevv_default",
            )
          : (
              await transaction.boards.create(
                {
                  workspaceId: workspaceResult.value.id,
                  name: input.initialBoardName ?? `${input.name} Board`,
                  description: "",
                  templateKey: "trevv_default",
                  visibility: "private",
                  progressMode: "task_completion",
                },
                mutationWithoutIdempotency(context),
              )
            ).value;
        if (!board)
          throw new DataPlaneError(
            "repository_unavailable",
            "The Workspace starter board could not be resolved.",
          );
        return {
          value: {
            workspace: toWorkspaceDto(workspaceResult.value),
            board: toBoardDto(board),
          },
          replayed: workspaceResult.replayed,
        };
      });
    },

    async getWorkspace(context, slug) {
      const repositories = scoped(options.repositories, context);
      const workspace = await repositories.workspaces.getBySlug(slug);
      requireWorkspaceAccess(context.access, "read", workspace.id);
      const items = await listAllWorkspaceItems(repositories, workspace.id);
      return {
        workspace: toWorkspaceDto(workspace),
        rollup: rollupWorkspace(workspace, items, context.now),
        items: items.map(toWorkItemDto),
      };
    },

    async listTeamDirectory(context, workspaceId) {
      const repositories = scoped(options.repositories, context);
      requireWorkspaceAccess(context.access, "read", workspaceId);
      const [teams, availableMembers] = await Promise.all([
        repositories.collaboration.listTeams(workspaceId),
        repositories.collaboration.listWorkspaceUsers(workspaceId),
      ]);
      return {
        teams: teams
          .filter((team) =>
            canCollaborate(
              context.access,
              "read",
              "team",
              teamCollaborationScope(context.access, team),
            ),
          )
          .map((team) => toTeamDto(team)),
        availableMembers: availableMembers.map(toCollaborationUserDto),
      };
    },

    async getTeam(context, id) {
      const team = await scoped(
        options.repositories,
        context,
      ).collaboration.getTeam(id);
      requireCollaborationAccess(
        context.access,
        "read",
        "team",
        teamCollaborationScope(context.access, team),
      );
      return toTeamDto(team);
    },

    async createTeam(context, input) {
      requireCollaborationAccess(context.access, "create", "team", {
        organizationId: context.access.organizationId,
        workspaceId: input.workspaceId,
        kind: "team",
        visibility: "private",
        activeParticipant: false,
        activeTeamMember: false,
      });
      const featurePolicySource =
        input.featureCapabilities === undefined ? "preset" : "override";
      const featureCapabilities =
        input.featureCapabilities ??
        teamFeatureCapabilitiesForPreset(input.preset);
      const result = await scoped(
        options.repositories,
        context,
      ).collaboration.createTeam(
        {
          workspaceId: input.workspaceId,
          name: input.name,
          purpose: input.purpose,
          preset: input.preset,
          featureCapabilities,
          featurePolicySource,
          memberIds: input.memberIds,
          ...(input.leadUserId ? { leadUserId: input.leadUserId } : {}),
        },
        mutation(context),
      );
      return { value: toTeamDto(result.value), replayed: result.replayed };
    },

    async updateTeam(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const team = await repositories.collaboration.getTeam(id);
      requireCollaborationAccess(
        context.access,
        "update",
        "team",
        teamCollaborationScope(context.access, team),
      );
      const normalized = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
        ...(input.preset !== undefined ? { preset: input.preset } : {}),
        ...(input.featureCapabilities !== undefined
          ? {
              featureCapabilities: input.featureCapabilities,
              featurePolicySource: "override" as const,
            }
          : {}),
        ...(input.preset && input.featureCapabilities === undefined
          ? {
              featureCapabilities: teamFeatureCapabilitiesForPreset(
                input.preset,
              ),
              featurePolicySource: "preset" as const,
            }
          : {}),
      };
      const result = await repositories.collaboration.updateTeam(
        id,
        expectedVersion,
        normalized,
        mutation(context),
      );
      return { value: toTeamDto(result.value), replayed: result.replayed };
    },

    async setTeamMember(context, teamId, userId, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const team = await repositories.collaboration.getTeam(teamId);
      requireCollaborationAccess(
        context.access,
        "manage_members",
        "team",
        teamCollaborationScope(context.access, team),
      );
      const result = await repositories.collaboration.setTeamMember(
        teamId,
        userId,
        expectedVersion,
        input.role,
        mutation(context),
      );
      return { value: toTeamDto(result.value), replayed: result.replayed };
    },

    async removeTeamMember(context, teamId, userId, expectedVersion) {
      const repositories = scoped(options.repositories, context);
      const team = await repositories.collaboration.getTeam(teamId);
      requireCollaborationAccess(
        context.access,
        "manage_members",
        "team",
        teamCollaborationScope(context.access, team),
      );
      const result = await repositories.collaboration.removeTeamMember(
        teamId,
        userId,
        expectedVersion,
        mutation(context),
      );
      return { value: toTeamDto(result.value), replayed: result.replayed };
    },

    async listConversations(context, filters) {
      requireWorkspaceAccess(context.access, "read", filters.workspaceId);
      const page = await scoped(
        options.repositories,
        context,
      ).collaboration.listConversations(filters.workspaceId, {
        ...(filters.cursor ? { cursor: filters.cursor } : {}),
        limit: filters.limit,
      });
      return {
        data: page.data
          .filter((conversation) =>
            canCollaborate(
              context.access,
              "read",
              "conversation",
              conversationCollaborationScope(context.access, conversation),
            ),
          )
          .map(toConversationDto),
        nextCursor: page.nextCursor,
      };
    },

    async getConversation(context, id) {
      const conversation = await scoped(
        options.repositories,
        context,
      ).collaboration.getConversation(id);
      requireCollaborationAccess(
        context.access,
        "read",
        "conversation",
        conversationCollaborationScope(context.access, conversation),
      );
      return toConversationDto(conversation);
    },

    async createConversation(context, input) {
      requireCollaborationAccess(context.access, "create", "conversation", {
        organizationId: context.access.organizationId,
        workspaceId: input.workspaceId,
        kind: input.kind,
        visibility: input.visibility,
        activeParticipant: true,
      });
      const result = await scoped(
        options.repositories,
        context,
      ).collaboration.createConversation(
        {
          ...input,
          retentionDays: input.retentionDays,
        },
        mutation(context),
      );
      return {
        value: toConversationDto(result.value),
        replayed: result.replayed,
      };
    },

    async setConversationParticipant(
      context,
      conversationId,
      userId,
      expectedVersion,
      active,
      participantRole,
    ) {
      const repositories = scoped(options.repositories, context);
      const conversation =
        await repositories.collaboration.getConversation(conversationId);
      requireCollaborationAccess(
        context.access,
        "manage_participants",
        "conversation",
        conversationCollaborationScope(context.access, conversation),
      );
      const result =
        await repositories.collaboration.setConversationParticipant(
          conversationId,
          userId,
          expectedVersion,
          active,
          mutation(context),
          participantRole,
        );
      return {
        value: toConversationDto(result.value),
        replayed: result.replayed,
      };
    },

    async listConversationMessages(context, conversationId, filters) {
      const repositories = scoped(options.repositories, context);
      const conversation =
        await repositories.collaboration.getConversation(conversationId);
      requireCollaborationAccess(
        context.access,
        "read",
        "message",
        conversationCollaborationScope(context.access, conversation),
      );
      const page = await repositories.collaboration.listMessages(
        conversationId,
        {
          ...(filters.cursor ? { cursor: filters.cursor } : {}),
          ...(filters.parentMessageId
            ? { parentMessageId: filters.parentMessageId }
            : {}),
          limit: filters.limit,
        },
      );
      return {
        data: page.data.map(toConversationMessageDto),
        nextCursor: page.nextCursor,
      };
    },

    async sendConversationMessage(context, conversationId, input) {
      const repositories = scoped(options.repositories, context);
      const conversation =
        await repositories.collaboration.getConversation(conversationId);
      requireCollaborationAccess(
        context.access,
        "send",
        "message",
        conversationCollaborationScope(context.access, conversation),
      );
      const result = await repositories.collaboration.sendMessage(
        conversationId,
        {
          clientMessageId: input.clientMessageId,
          body: input.body,
          intent: input.intent,
          metadata: input.metadata,
          ...(input.parentMessageId
            ? { parentMessageId: input.parentMessageId }
            : {}),
          ...(input.responseOwnerId
            ? { responseOwnerId: input.responseOwnerId }
            : {}),
          ...(input.responseDueAt
            ? { responseDueAt: new Date(input.responseDueAt) }
            : {}),
        },
        mutation(context),
      );
      return {
        value: toConversationMessageDto(result.value),
        replayed: result.replayed,
      };
    },

    async updateMessageResponse(
      context,
      messageId,
      expectedVersion,
      responseState,
    ) {
      const repositories = scoped(options.repositories, context);
      const message = await repositories.collaboration.getMessage(messageId);
      const conversation = await repositories.collaboration.getConversation(
        message.message.conversationId,
      );
      requireCollaborationAccess(
        context.access,
        "update",
        "message",
        conversationCollaborationScope(context.access, conversation, message),
      );
      const result = await repositories.collaboration.setMessageResponse(
        message.message.conversationId,
        messageId,
        expectedVersion,
        responseState,
        mutation(context),
      );
      return {
        value: toConversationMessageDto(result.value),
        replayed: result.replayed,
      };
    },

    async addMessageReaction(context, messageId, expectedVersion, emoji) {
      return changeMessageReaction(
        scoped(options.repositories, context),
        context,
        messageId,
        expectedVersion,
        emoji,
        true,
      );
    },

    async removeMessageReaction(context, messageId, expectedVersion, emoji) {
      return changeMessageReaction(
        scoped(options.repositories, context),
        context,
        messageId,
        expectedVersion,
        emoji,
        false,
      );
    },

    async markConversationRead(context, conversationId, messageId) {
      const repositories = scoped(options.repositories, context);
      const conversation =
        await repositories.collaboration.getConversation(conversationId);
      requireCollaborationAccess(
        context.access,
        "mark_read",
        "conversation",
        conversationCollaborationScope(context.access, conversation),
      );
      const message = await repositories.collaboration.getMessage(messageId);
      if (message.message.conversationId !== conversationId) throw notFound();
      const result = await repositories.collaboration.markRead(
        conversationId,
        messageId,
        mutation(context),
      );
      return {
        value: {
          conversationId: result.value.conversationId,
          userId: result.value.userId,
          messageId,
          messageSequence: message.message.sequence,
          readAt: dateTime(result.value.lastReadAt),
          version: result.value.version,
        },
        replayed: result.replayed,
      };
    },

    async listCollaborationEvents(context, workspaceId, after) {
      requireWorkspaceAccess(context.access, "read", workspaceId);
      const repositories = scoped(options.repositories, context);
      const batch = await repositories.collaboration.listEvents(workspaceId, {
        afterCursor: after,
        limit: 500,
      });
      const events: CollaborationEventBatch["events"] = [];
      for (const event of batch.events) {
        let conversation: ConversationProjection | undefined;
        if (event.conversationId) {
          try {
            conversation = await repositories.collaboration.getConversation(
              event.conversationId,
            );
            requireCollaborationAccess(
              context.access,
              "read",
              "conversation",
              conversationCollaborationScope(context.access, conversation),
            );
          } catch (error) {
            if (isNotFound(error)) continue;
            throw error;
          }
        }
        events.push({
          cursor: event.cursor,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          type: collaborationEventType(event.eventType),
          aggregateType: collaborationAggregateType(event.aggregateType),
          aggregateId: event.aggregateId,
          ...(event.aggregateType === "team"
            ? { teamId: event.aggregateId }
            : conversation?.teamId
              ? { teamId: conversation.teamId }
              : {}),
          ...(event.conversationId
            ? { conversationId: event.conversationId }
            : {}),
          occurredAt: dateTime(event.createdAt),
        });
      }
      return { events, nextCursor: batch.nextCursor };
    },

    async listBoards(context, workspaceId) {
      requireWorkspaceAccess(context.access, "read", workspaceId);
      return (
        await scoped(options.repositories, context).boards.list(workspaceId)
      ).map(toBoardDto);
    },

    async getBoard(context, id) {
      const board = await scoped(options.repositories, context).boards.get(id);
      requireWorkspaceAccess(context.access, "read", board.workspaceId);
      return toBoardDto(board);
    },

    async createBoard(context, input) {
      requireWorkspaceAccess(context.access, "create", input.workspaceId);
      const result = await scoped(options.repositories, context).boards.create(
        {
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
          visibility: input.visibility,
          progressMode: input.progressMode,
          ...(input.templateKey !== undefined
            ? { templateKey: input.templateKey }
            : {}),
          ...(input.startDate !== undefined
            ? { startDate: input.startDate }
            : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        },
        mutation(context),
      );
      return { value: toBoardDto(result.value), replayed: result.replayed };
    },

    async listInbox(context) {
      return (await scoped(options.repositories, context).inbox.list()).map(
        toInboxItemDto,
      );
    },

    async captureInboxItem(context, input) {
      const result = await scoped(options.repositories, context).inbox.capture(
        input,
        mutation(context),
      );
      return { value: toInboxItemDto(result.value), replayed: result.replayed };
    },

    async updateInboxItem(context, id, expectedVersion, input) {
      const result = await scoped(options.repositories, context).inbox.update(
        id,
        expectedVersion,
        {
          ...(input.done !== undefined ? { done: input.done } : {}),
          ...(input.snoozedUntil !== undefined
            ? {
                snoozedUntil:
                  input.snoozedUntil === null
                    ? null
                    : new Date(input.snoozedUntil),
              }
            : {}),
        },
        mutation(context),
      );
      return { value: toInboxItemDto(result.value), replayed: result.replayed };
    },

    async convertInboxItem(context, id, expectedVersion, input) {
      requireWorkspaceAccess(context.access, "create", input.workspaceId);
      const result = await scoped(
        options.repositories,
        context,
      ).inbox.convertToWorkItem(
        id,
        expectedVersion,
        {
          workspaceId: input.workspaceId,
          boardId: input.boardId,
          type: input.type,
          priority: input.priority,
          status: input.status,
          assigneeIds: input.assigneeIds,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.approvalState !== undefined
            ? { approvalState: input.approvalState }
            : {}),
          ...(input.decisionState !== undefined
            ? { decisionState: input.decisionState }
            : {}),
        },
        mutation(context),
      );
      return {
        value: {
          inboxItem: toInboxItemDto(result.value.inboxItem),
          workItem: toWorkItemDto(result.value.workItem),
        },
        replayed: result.replayed,
      };
    },

    async listItems(context, filters) {
      if (filters.workspaceId)
        requireWorkspaceAccess(context.access, "read", filters.workspaceId);
      const repositories = scoped(options.repositories, context);
      const workspaceIds = filters.workspaceId
        ? [filters.workspaceId]
        : [...context.access.accessibleWorkspaceIds].sort();
      const page = await paginateWorkItems(
        repositories,
        workspaceIds,
        filters.limit,
        filters.cursor,
        filters.assigneeId,
      );
      return {
        data: page.items.map(toWorkItemDto),
        nextCursor: page.nextCursor,
      };
    },

    async getItem(context, id) {
      const item = await scoped(options.repositories, context).workItems.get(
        id,
      );
      requireWorkspaceAccess(context.access, "read", item.workspaceId);
      return toWorkItemDto(item);
    },

    async createItem(context, input) {
      requireWorkspaceAccess(context.access, "create", input.workspaceId);
      const result = await scoped(
        options.repositories,
        context,
      ).workItems.create(
        {
          workspaceId: input.workspaceId,
          boardId: input.boardId,
          title: input.title,
          description: input.description,
          type: input.type,
          priority: input.priority,
          status: input.status,
          assigneeIds: input.assigneeIds,
          ...(input.dueDate ? { dueDate: input.dueDate } : {}),
          ...(input.approvalState
            ? { approvalState: input.approvalState }
            : {}),
          ...(input.decisionState
            ? { decisionState: input.decisionState }
            : {}),
        },
        mutation(context),
      );
      return { value: toWorkItemDto(result.value), replayed: result.replayed };
    },

    async updateItem(context, id, expectedVersion, patch) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.workItems.get(id);
      requireWorkspaceAccess(context.access, "update", current.workspaceId);
      const result = await repositories.workItems.update(
        id,
        expectedVersion,
        {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined
            ? { description: patch.description }
            : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
          ...(patch.assigneeIds !== undefined
            ? { assigneeIds: patch.assigneeIds }
            : {}),
        },
        mutation(context),
      );
      return { value: toWorkItemDto(result.value), replayed: result.replayed };
    },

    async listItemHistory(context, id) {
      const repositories = scoped(options.repositories, context);
      const item = await repositories.workItems.get(id);
      requireWorkspaceAccess(context.access, "read", item.workspaceId);
      const history = await repositories.workItems.history(id);
      const actors = await historyActors(repositories, history);
      return history.map((entry) =>
        toWorkItemHistoryDto(entry, actors.get(entry.actorId ?? "")),
      );
    },

    async listItemEvidence(context, id) {
      const repositories = scoped(options.repositories, context);
      const item = await repositories.workItems.get(id);
      requireWorkspaceAccess(context.access, "read", item.workspaceId);
      const comments = await repositories.comments.list(id);
      const history = (await repositories.workItems.history(id)).filter(
        (entry) =>
          !entry.type.startsWith("comment_") && hasHistoryEvidence(entry),
      );
      const actorIds = [
        ...comments.map(({ authorId }) => authorId),
        ...history.flatMap(({ actorId }) => (actorId ? [actorId] : [])),
      ];
      const authors = new Map(
        await Promise.all(
          [...new Set(actorIds)].map(
            async (authorId) =>
              [
                authorId,
                await repositories.users.getMemberHistory(authorId),
              ] as const,
          ),
        ),
      );
      return [
        ...comments.map((comment) =>
          toEvidenceDto(comment, requireAuthor(authors.get(comment.authorId))),
        ),
        ...history.map((entry) =>
          toHistoryEvidenceDto(
            entry,
            entry.actorId
              ? requireAuthor(authors.get(entry.actorId))
              : { id: context.access.userId, name: "Former member" },
          ),
        ),
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },

    async addItemEvidence(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const item = await repositories.workItems.get(id);
      requireAccess(context.access, "comment", "comment", {
        organizationId: context.access.organizationId,
        workspaceId: item.workspaceId,
        explicitlyShared: true,
      });
      const result = await repositories.comments.create(
        { itemId: id, expectedItemVersion: expectedVersion, body: input.body },
        mutation(context),
      );
      const author = await repositories.users.getMemberHistory(
        result.value.authorId,
      );
      return {
        value: {
          evidence: toEvidenceDto(result.value, author),
          itemVersion: expectedVersion + 1,
        },
        replayed: result.replayed,
      };
    },

    async assignItem(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const item = await repositories.workItems.get(id);
      requireWorkspaceAccess(context.access, "update", item.workspaceId);
      const result = await repositories.itemAssignees.replace(
        id,
        expectedVersion,
        input.assigneeIds,
        mutation(context),
      );
      return {
        value: {
          item: toWorkItemDto(result.value),
          attentionRefreshQueued: true,
        },
        replayed: result.replayed,
      };
    },

    async setItemBlocked(context, id, expectedVersion, input) {
      return transitionItem(
        scoped(options.repositories, context),
        context,
        id,
        expectedVersion,
        {
          status: input.blocked ? "blocked" : "working",
          reasonCode: input.blocked ? "item_blocked" : "item_unblocked",
          rationale: input.reason,
          evidence: { summary: input.reason },
        },
        true,
      );
    },

    async transitionDecision(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.workItems.get(id);
      requireWorkspaceAccess(context.access, "update", current.workspaceId);
      if (current.type !== "decision") throw notFound();
      return transitionItem(
        repositories,
        context,
        id,
        expectedVersion,
        {
          decisionState: input.state,
          reasonCode: `decision_${input.state}`,
          rationale: input.rationale,
          ...(input.evidence ? { evidence: { summary: input.evidence } } : {}),
        },
        Boolean(input.evidence),
      );
    },

    async transitionApproval(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.workItems.get(id);
      requireWorkspaceAccess(context.access, "update", current.workspaceId);
      if (current.type !== "approval") throw notFound();
      return transitionItem(
        repositories,
        context,
        id,
        expectedVersion,
        {
          approvalState: input.state,
          reasonCode: `approval_${input.state}`,
          rationale: input.rationale,
          ...(input.evidence ? { evidence: { summary: input.evidence } } : {}),
        },
        Boolean(input.evidence),
      );
    },

    async resolveItem(context, id, expectedVersion, input) {
      return transitionItem(
        scoped(options.repositories, context),
        context,
        id,
        expectedVersion,
        {
          status: "done",
          reasonCode: "item_resolved",
          rationale: "Resolved with recorded evidence.",
          evidence: { summary: input.evidence },
        },
        true,
      );
    },

    async getPrivacyProgram(context) {
      const retention = await scoped(
        options.repositories,
        context,
      ).privacy.listRetentionPolicies();
      return {
        inventoryVersion: privacyInventoryVersion,
        policyVersion: privacyPolicyVersion,
        legalDocuments: {
          privacyNotice: {
            version: privacyPolicyVersion,
            reviewStatus: "pending",
          },
          terms: { version: privacyPolicyVersion, reviewStatus: "pending" },
        },
        externalProviders: {
          enabled: false,
          configured: [],
          revocationAutomation: "unavailable",
        },
        requestsAreReviewedBeforeEffects: true,
        inventory: privacyDataInventory.map((entry) => ({
          ...entry,
          examples: [...entry.examples],
        })),
        retention: retention.map(toRetentionPolicyDto),
      };
    },

    async listPrivacyRequests(context) {
      const organizationManager = isOrganizationManager(context.access);
      const requests = await scoped(
        options.repositories,
        context,
      ).privacy.listRequests(
        organizationManager
          ? undefined
          : { requestedBy: context.access.userId },
      );
      return requests.map(toDataLifecycleRequestDto);
    },

    async createPrivacyRequest(context, input) {
      if (input.scope === "organization") {
        requireAccess(
          context.access,
          input.kind === "erasure" ? "delete" : "export",
          "settings",
          { organizationId: context.access.organizationId },
        );
      }
      const result = await scoped(
        options.repositories,
        context,
      ).privacy.createRequest(input, mutation(context));
      return {
        value: toDataLifecycleRequestDto(result.value),
        replayed: result.replayed,
      };
    },

    async cancelPrivacyRequest(context, id, expectedVersion) {
      const result = await scoped(
        options.repositories,
        context,
      ).privacy.cancelRequest(id, expectedVersion, mutation(context));
      return {
        value: toDataLifecycleRequestDto(result.value),
        replayed: result.replayed,
      };
    },

    async updateRetentionPolicy(context, expectedVersion, input) {
      requireAccess(context.access, "manage_settings", "settings", {
        organizationId: context.access.organizationId,
      });
      const result = await scoped(
        options.repositories,
        context,
      ).privacy.updateRetentionPolicy(
        expectedVersion,
        input,
        mutation(context),
      );
      return {
        value: toRetentionPolicyDto(result.value),
        replayed: result.replayed,
      };
    },

    async search(context, query) {
      const result = await scoped(options.repositories, context).search(query, [
        ...context.access.accessibleWorkspaceIds,
      ]);
      return {
        workspaces: result.workspaces
          .filter((workspace) => canSeeWorkspace(context.access, workspace.id))
          .map(toWorkspaceDto),
        items: result.items
          .filter((item) => canSeeWorkspace(context.access, item.workspaceId))
          .map(toWorkItemDto),
      };
    },

    exportOrganization: unsupported(
      "Live organization exports require the Phase 5 export-audit policy.",
    ),
    exportBoardCsv: unsupported(
      "Live Board exports require the Phase 5 export-audit policy.",
    ),
  };

  return { dataPlane, accessResolver };
}

function toDataLifecycleRequestDto(request: {
  id: string;
  organizationId: string;
  requestedBy: string;
  subjectUserId: string | null;
  kind: string;
  requestScope: string;
  status: string;
  dueAt: Date;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  failureCode: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): DataLifecycleRequestDto {
  if (
    ![
      "access",
      "portability",
      "erasure",
      "rectification",
      "restriction",
      "objection",
    ].includes(request.kind) ||
    !["user", "organization"].includes(request.requestScope) ||
    ![
      "submitted",
      "under_review",
      "approved",
      "processing",
      "completed",
      "rejected",
      "cancelled",
      "failed",
    ].includes(request.status)
  )
    throw new DataPlaneError(
      "repository_unavailable",
      "A persisted privacy request has an invalid state.",
    );
  return {
    id: request.id,
    organizationId: request.organizationId,
    requestedBy: request.requestedBy,
    ...(request.subjectUserId ? { subjectUserId: request.subjectUserId } : {}),
    kind: request.kind as DataLifecycleRequestDto["kind"],
    scope: request.requestScope as DataLifecycleRequestDto["scope"],
    status: request.status as DataLifecycleRequestDto["status"],
    dueAt: request.dueAt.toISOString(),
    ...(request.processingStartedAt
      ? { processingStartedAt: request.processingStartedAt.toISOString() }
      : {}),
    ...(request.completedAt
      ? { completedAt: request.completedAt.toISOString() }
      : {}),
    ...(request.cancelledAt
      ? { cancelledAt: request.cancelledAt.toISOString() }
      : {}),
    ...(request.failureCode ? { failureCode: request.failureCode } : {}),
    version: request.version,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function toRetentionPolicyDto(policy: RetentionPolicyProjection) {
  return {
    category: policy.category,
    retentionDays: policy.retentionDays,
    disposition: policy.disposition,
    legalHold: policy.legalHold,
    policyVersion: policy.policyVersion,
    source: policy.source,
    effectiveAt: policy.effectiveAt.toISOString(),
    enforcementStatus: policy.enforcementStatus,
  };
}

function identityResolutionError(
  status:
    | "verification_required"
    | "onboarding_required"
    | "organization_selection_required"
    | "access_unavailable",
): DataPlaneError {
  switch (status) {
    case "verification_required":
      return new DataPlaneError(
        "identity_verification_required",
        "Verify your email before accessing TREVV.",
      );
    case "onboarding_required":
      return new DataPlaneError(
        "onboarding_required",
        "Complete onboarding before accessing organization data.",
      );
    case "organization_selection_required":
      return new DataPlaneError(
        "organization_selection_required",
        "Choose one of your organizations before continuing.",
      );
    case "access_unavailable":
      return new DataPlaneError(
        "identity_access_unavailable",
        "This account does not have active organization access.",
      );
  }
}

function scoped(
  repositories: PostgresRepositories,
  context: ApiRequestContext,
): OrganizationScopedRepositories {
  return repositories.forOrganization(
    createOrganizationScope({
      organizationId: context.access.organizationId,
      userId: context.access.userId,
      requestId: context.requestId,
    }),
  );
}

function mutation(context: ApiMutationContext) {
  return {
    method: context.method,
    route: context.route,
    requestFingerprint: context.requestFingerprint,
    responseStatus: context.responseStatus,
    now: context.now,
    ...(context.idempotencyKey
      ? { idempotencyKey: context.idempotencyKey }
      : {}),
  };
}

function mutationWithoutIdempotency(context: ApiMutationContext) {
  return {
    method: context.method,
    route: context.route,
    requestFingerprint: context.requestFingerprint,
    responseStatus: context.responseStatus,
    now: context.now,
  };
}

async function changeMessageReaction(
  repositories: OrganizationScopedRepositories,
  context: ApiMutationContext,
  messageId: string,
  expectedVersion: number,
  emoji: string,
  add: boolean,
) {
  const message = await repositories.collaboration.getMessage(messageId);
  const conversation = await repositories.collaboration.getConversation(
    message.message.conversationId,
  );
  requireCollaborationAccess(
    context.access,
    "react",
    "message",
    conversationCollaborationScope(context.access, conversation, message),
  );
  const result = add
    ? await repositories.collaboration.addReaction(
        message.message.conversationId,
        messageId,
        expectedVersion,
        emoji,
        mutation(context),
      )
    : await repositories.collaboration.removeReaction(
        message.message.conversationId,
        messageId,
        expectedVersion,
        emoji,
        mutation(context),
      );
  return {
    value: toConversationMessageDto(result.value),
    replayed: result.replayed,
  };
}

function teamCollaborationScope(
  access: AccessContext,
  projection: TeamProjection,
): CollaborationScope {
  const membership = projection.members.find(
    ({ user }) => user.id === access.userId,
  );
  return {
    organizationId: projection.team.organizationId,
    workspaceId: projection.team.workspaceId,
    kind: "team",
    visibility: "private",
    activeParticipant: Boolean(membership),
    activeTeamMember: Boolean(membership),
    teamLead: membership?.membership.role === "lead",
  };
}

function conversationCollaborationScope(
  access: AccessContext,
  projection: ConversationProjection,
  message?: MessageProjection,
): CollaborationScope {
  const participant = projection.participants.find(
    ({ user }) => user.id === access.userId,
  );
  return {
    organizationId: projection.conversation.organizationId,
    workspaceId: projection.conversation.workspaceId,
    kind: conversationKind(projection.conversation.kind),
    visibility: conversationVisibility(projection.conversation.visibility),
    activeParticipant: Boolean(participant),
    ...(projection.teamId
      ? { activeTeamMember: participant?.participant.source === "team" }
      : {}),
    conversationOwner: participant?.participant.participantRole === "owner",
    ...(message
      ? {
          messageSender: message.message.senderId === access.userId,
          responseOwner: message.message.responseOwnerId === access.userId,
        }
      : {}),
  };
}

function toCollaborationUserDto(
  user: CollaborationUserProjection,
): CollaborationUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    organizationRole: user.organizationRole,
  };
}

function toTeamDto(projection: TeamProjection): TeamDto {
  return {
    id: projection.team.id,
    organizationId: projection.team.organizationId,
    portfolioId: projection.portfolioId,
    workspaceId: projection.team.workspaceId,
    name: projection.team.name,
    purpose: projection.team.purpose,
    preset: teamPreset(projection.team.presetKey),
    featureCapabilities: projection.featureCapabilities,
    featurePolicySource: projection.featurePolicySource,
    members: projection.members.map(({ membership, user }) => ({
      user: toCollaborationUserDto(user),
      role: membership.role,
      joinedAt: dateTime(membership.joinedAt),
    })),
    room: projection.room,
    version: projection.team.version,
    createdAt: dateTime(projection.team.createdAt),
    updatedAt: dateTime(projection.team.updatedAt),
  };
}

function toConversationDto(
  projection: ConversationProjection,
): ConversationDto {
  const conversation = projection.conversation;
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    portfolioId: conversation.portfolioId,
    workspaceId: conversation.workspaceId,
    ...(projection.teamId ? { teamId: projection.teamId } : {}),
    title: conversation.title,
    purpose: conversation.purpose,
    kind: conversationKind(conversation.kind),
    visibility: conversationVisibility(conversation.visibility),
    participants: projection.participants.map(
      ({ participant, user, checkpoint }) => ({
        user: toCollaborationUserDto(user),
        participantRole: conversationParticipantRole(
          participant.participantRole,
        ),
        notificationLevel: conversationNotificationLevel(
          participant.notificationLevel,
        ),
        ...(checkpoint?.lastReadMessageId
          ? { lastReadMessageId: checkpoint.lastReadMessageId }
          : {}),
        ...(checkpoint?.lastReadAt
          ? { lastReadAt: dateTime(checkpoint.lastReadAt) }
          : {}),
        joinedAt: dateTime(participant.joinedAt),
      }),
    ),
    unreadCount: projection.unreadCount,
    needsResponseCount: projection.needsResponseCount,
    retentionDays: conversation.retentionDays,
    lastMessageAt: dateTime(conversation.lastMessageAt),
    version: conversation.version,
    createdAt: dateTime(conversation.createdAt),
    updatedAt: dateTime(conversation.updatedAt),
  };
}

function toConversationMessageDto(
  projection: MessageProjection,
): ConversationMessageDto {
  const message = projection.message;
  if (!message.expiresAt)
    throw new DataPlaneError(
      "repository_unavailable",
      "A persisted collaboration message is missing its retention deadline.",
    );
  return {
    id: message.id,
    sequence: message.sequence,
    clientMessageId: message.clientMessageId,
    organizationId: message.organizationId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    sender: toCollaborationUserDto(projection.sender),
    ...(message.parentMessageId
      ? { parentMessageId: message.parentMessageId }
      : {}),
    body: message.body,
    intent: message.intent,
    ...(message.responseOwnerId
      ? { responseOwnerId: message.responseOwnerId }
      : {}),
    ...(message.responseDueAt
      ? { responseDueAt: dateTime(message.responseDueAt) }
      : {}),
    ...(message.responseState ? { responseState: message.responseState } : {}),
    ...(message.linkedEntityType
      ? { linkedEntityType: message.linkedEntityType }
      : {}),
    ...(message.linkedEntityId
      ? { linkedEntityId: message.linkedEntityId }
      : {}),
    metadata: isRecord(message.metadata) ? message.metadata : {},
    reactions: projection.reactions,
    retainedUntil: dateTime(message.expiresAt),
    version: message.version,
    ...(message.editedAt ? { editedAt: dateTime(message.editedAt) } : {}),
    createdAt: dateTime(message.createdAt),
  };
}

function teamPreset(value: string): TeamPreset {
  if (
    value === "leadership" ||
    value === "marketing" ||
    value === "technology" ||
    value === "operations" ||
    value === "sales" ||
    value === "custom"
  )
    return value;
  throw invalidManagementValue("Team preset");
}

function conversationKind(value: string): ConversationDto["kind"] {
  if (
    value === "workspace" ||
    value === "team" ||
    value === "direct" ||
    value === "external"
  )
    return value;
  throw invalidManagementValue("conversation kind");
}

function conversationVisibility(value: string): ConversationDto["visibility"] {
  if (
    value === "organization" ||
    value === "private" ||
    value === "guest_scoped"
  )
    return value;
  throw invalidManagementValue("conversation visibility");
}

function conversationParticipantRole(
  value: string,
): ConversationDto["participants"][number]["participantRole"] {
  if (value === "owner" || value === "member" || value === "guest")
    return value;
  throw invalidManagementValue("conversation participant role");
}

function conversationNotificationLevel(
  value: string,
): ConversationDto["participants"][number]["notificationLevel"] {
  if (value === "all" || value === "mentions" || value === "none") return value;
  throw invalidManagementValue("conversation notification level");
}

function collaborationEventType(
  value: string,
): CollaborationEventBatch["events"][number]["type"] {
  if (
    value === "team.created" ||
    value === "team.updated" ||
    value === "team.membership_changed" ||
    value === "conversation.created" ||
    value === "conversation.participants_changed" ||
    value === "message.sent" ||
    value === "message.response_changed" ||
    value === "message.reaction_changed" ||
    value === "conversation.read"
  )
    return value;
  throw invalidManagementValue("collaboration event type");
}

function collaborationAggregateType(
  value: string,
): CollaborationEventBatch["events"][number]["aggregateType"] {
  if (value === "team" || value === "conversation" || value === "message")
    return value;
  throw invalidManagementValue("collaboration aggregate type");
}

function isNotFound(error: unknown): boolean {
  return dataPlaneErrorCode(error) === "resource_not_found";
}

async function getDefaultPortfolioRollup(
  repositories: OrganizationScopedRepositories,
  access: AccessContext,
) {
  const portfolios = await repositories.portfolios.list();
  const accessiblePortfolios = portfolios.filter(
    (portfolio) =>
      isOrganizationManager(access) || canSeePortfolio(access, portfolio.id),
  );
  const portfolio =
    accessiblePortfolios.find((candidate) => candidate.isDefault) ??
    accessiblePortfolios[0];
  if (!portfolio) throw notFound();
  return repositories.portfolios.getRollup(portfolio.id);
}

function buildPortfolioResponse(
  portfolio: Awaited<
    ReturnType<OrganizationScopedRepositories["portfolios"]["get"]>
  >,
  workspaces: WorkspaceProjection[],
  items: WorkItemProjection[],
  now: Date,
): PortfolioResponse {
  return {
    asOf: now.toISOString(),
    portfolio: toPortfolioDto(portfolio),
    signals: portfolioSignals(workspaces, items, now),
    workspaces: workspaces
      .map((workspace) => ({
        workspace: toWorkspaceDto(workspace),
        rollup: rollupWorkspace(workspace, items, now),
      }))
      .sort((left, right) => right.rollup.score - left.rollup.score),
  };
}

function toPortfolioDto(
  portfolio: Awaited<
    ReturnType<OrganizationScopedRepositories["portfolios"]["get"]>
  >,
): PortfolioDto {
  return {
    id: portfolio.id,
    organizationId: portfolio.organizationId,
    name: portfolio.name,
    slug: portfolio.slug,
    description: portfolio.description,
    isDefault: portfolio.isDefault,
  };
}

function toWorkspaceDto(workspace: WorkspaceProjection): WorkspaceDto {
  return {
    id: workspace.id,
    portfolioId: workspace.portfolioId,
    slug: workspace.slug,
    name: workspace.name,
    description: workspace.description,
    icon: workspace.icon,
    accent: workspace.accent,
    type: workspace.type,
    stage: workspace.stage,
    health: workspace.health,
    healthNote: workspace.healthNote,
    priority: workspace.priority,
    ...(workspace.lead
      ? {
          lead: {
            name: workspace.lead.name,
            initials: workspace.lead.initials,
            color: workspace.accent,
          },
        }
      : {}),
    ...(workspace.nextMilestone.title && workspace.nextMilestone.date
      ? {
          nextMilestone: {
            title: workspace.nextMilestone.title,
            date: workspace.nextMilestone.date,
          },
        }
      : {}),
    ...(workspace.latestUpdate
      ? {
          latestUpdate: {
            text: workspace.latestUpdate.text,
            date: workspace.latestUpdate.date.slice(0, 10),
          },
        }
      : {}),
    metrics: workspace.metrics
      .filter((metric) => metric.value !== null)
      .slice(0, 12)
      .map((metric) => ({
        label: metric.label,
        value: formatMetric(metric.value!, metric.target, metric.unit),
      })),
    versionTag: workspace.versionTag,
    updatedAt: workspace.versionTag,
  };
}

function toBoardDto(
  board: Awaited<ReturnType<OrganizationScopedRepositories["boards"]["get"]>>,
): BoardDto {
  return {
    id: board.id,
    workspaceId: board.workspaceId,
    name: board.name,
    description: board.description,
    ...(board.templateKey ? { templateKey: board.templateKey } : {}),
    visibility: board.visibility,
    progressMode: board.progressMode,
    ...(board.manualProgressValue === null
      ? {}
      : { manualProgressValue: board.manualProgressValue }),
    ...(board.manualProgressNote
      ? { manualProgressNote: board.manualProgressNote }
      : {}),
    ...(board.startDate ? { startDate: board.startDate } : {}),
    ...(board.endDate ? { endDate: board.endDate } : {}),
    ordering: board.ordering,
    versionTag: board.updatedAt.toISOString(),
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

function toInboxItemDto(item: InboxItemProjection): InboxItemDto {
  return {
    id: item.id,
    userId: item.userId,
    category: item.category,
    title: item.title,
    body: item.body,
    resource: isRecord(item.resource) ? item.resource : {},
    ...(item.doneAt ? { doneAt: item.doneAt } : {}),
    ...(item.snoozedUntil ? { snoozedUntil: item.snoozedUntil } : {}),
    ...(item.convertedItemId ? { convertedItemId: item.convertedItemId } : {}),
    ...(item.convertedAt ? { convertedAt: item.convertedAt } : {}),
    version: item.version,
    createdAt: item.createdAt,
  };
}

function toWorkItemDto(item: WorkItemProjection): WorkItemDto {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    boardId: item.boardId,
    title: item.title,
    description: item.description,
    type: item.type,
    priority: item.priority,
    status: item.status,
    ...(item.dueDate ? { dueDate: item.dueDate } : {}),
    assignees: item.assignees,
    ...(item.approvalState
      ? { approvalState: approvalState(item.approvalState) }
      : {}),
    ...(item.decisionState
      ? { decisionState: decisionState(item.decisionState) }
      : {}),
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toEvidenceDto(
  comment: Awaited<
    ReturnType<OrganizationScopedRepositories["comments"]["get"]>
  >,
  author: Awaited<
    ReturnType<OrganizationScopedRepositories["users"]["getMemberHistory"]>
  >,
): WorkItemEvidenceDto {
  return {
    id: comment.id,
    itemId: comment.itemId,
    author: { id: author.id, name: author.name },
    body: comment.body,
    evidence: true,
    ...(comment.editedAt ? { editedAt: comment.editedAt.toISOString() } : {}),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

type MemberHistory = Awaited<
  ReturnType<OrganizationScopedRepositories["users"]["getMemberHistory"]>
>;

async function historyActors(
  repositories: OrganizationScopedRepositories,
  history: WorkItemHistoryProjection[],
): Promise<Map<string, MemberHistory>> {
  return new Map(
    await Promise.all(
      [
        ...new Set(
          history.flatMap(({ actorId }) => (actorId ? [actorId] : [])),
        ),
      ].map(
        async (actorId) =>
          [
            actorId,
            await repositories.users.getMemberHistory(actorId),
          ] as const,
      ),
    ),
  );
}

function toWorkItemHistoryDto(
  entry: WorkItemHistoryProjection,
  actor?: MemberHistory,
): WorkItemHistoryEntryDto {
  return {
    id: entry.id,
    type: entry.type,
    reasonCode: entry.reasonCode,
    summary: entry.summary,
    ...(actor ? { actor: { id: actor.id, name: actor.name } } : {}),
    ...(hasHistoryEvidence(entry)
      ? { evidence: [{ id: entry.id, body: historyEvidenceBody(entry) }] }
      : {}),
    itemVersion: entry.itemVersion,
    occurredAt: entry.occurredAt,
    metadata: {
      ...entry.metadata,
      source: entry.source,
    },
  };
}

function hasHistoryEvidence(entry: WorkItemHistoryProjection): boolean {
  return Boolean(
    entry.evidence.summary ||
    entry.evidence.references?.length ||
    (entry.evidence.data && Object.keys(entry.evidence.data).length),
  );
}

function historyEvidenceBody(entry: WorkItemHistoryProjection): string {
  if (entry.evidence.summary) return entry.evidence.summary;
  if (entry.evidence.references?.length)
    return entry.evidence.references
      .map(
        (reference) =>
          reference.label ??
          reference.url ??
          `${reference.type}:${reference.id}`,
      )
      .join("\n");
  return entry.summary;
}

function toHistoryEvidenceDto(
  entry: WorkItemHistoryProjection,
  author: { id: string; name: string },
): WorkItemEvidenceDto {
  return {
    id: entry.id,
    itemId: entry.snapshot.id,
    author: { id: author.id, name: author.name },
    body: historyEvidenceBody(entry),
    evidence: true,
    createdAt: entry.occurredAt,
    updatedAt: entry.occurredAt,
  };
}

async function transitionItem(
  repositories: OrganizationScopedRepositories,
  context: ApiMutationContext,
  id: string,
  expectedVersion: number,
  input: WorkItemTransitionInput,
  exposeEvidence: boolean,
) {
  const current = await repositories.workItems.get(id);
  requireWorkspaceAccess(context.access, "update", current.workspaceId);
  const result = await repositories.workItems.transition(
    id,
    expectedVersion,
    input,
    mutation(context),
  );
  const actor = await repositories.users.getMemberHistory(
    result.value.evidence.actorId ?? context.access.userId,
  );
  return {
    value: {
      item: toWorkItemDto(result.value.item),
      ...(exposeEvidence
        ? { evidence: toHistoryEvidenceDto(result.value.evidence, actor) }
        : {}),
      attentionRefreshQueued: true,
    },
    replayed: result.replayed,
  };
}

function toWeeklyReviewRecord(
  update: Awaited<
    ReturnType<OrganizationScopedRepositories["workspaceUpdates"]["get"]>
  >,
  author: Awaited<
    ReturnType<OrganizationScopedRepositories["users"]["getMemberHistory"]>
  >,
): WeeklyReviewRecordDto {
  return {
    id: update.id,
    workspaceId: update.workspaceId,
    author: { id: author.id, name: author.name },
    progress: update.wins,
    blocker: update.blocker,
    nextMilestone: update.nextMilestone,
    ...(update.helpNeeded ? { decisionNeeded: update.helpNeeded } : {}),
    priorityNextWeek: update.currentPriority,
    ...(update.note ? { note: update.note } : {}),
    publishedAt: update.publishedAt.toISOString(),
    createdAt: update.createdAt.toISOString(),
    updatedAt: update.updatedAt.toISOString(),
  };
}

function toSnapshotDto(
  row: Awaited<ReturnType<OrganizationScopedRepositories["snapshots"]["get"]>>,
) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    portfolioId: row.portfolioId,
    workspaceId: row.workspaceId,
    capturedAt: row.capturedAt.toISOString(),
    health: row.health,
    ...(row.progress === null ? {} : { progress: row.progress }),
    openCount: row.openCount,
    overdueCount: row.overdueCount,
    blockedCount: row.blockedCount,
    decisionCount: row.decisionCount,
    attentionCount: row.attentionCount,
    ...(row.nextMilestoneId ? { nextMilestoneId: row.nextMilestoneId } : {}),
    ...(row.nextMilestoneStatus
      ? { nextMilestoneStatus: row.nextMilestoneStatus }
      : {}),
    ...(row.latestUpdateAt
      ? { latestUpdateAt: row.latestUpdateAt.toISOString() }
      : {}),
    source: reviewSource(row.source),
  };
}

function toAttentionDto(
  row: Awaited<ReturnType<OrganizationScopedRepositories["attention"]["get"]>>,
): AttentionSignalDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    portfolioId: row.portfolioId,
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    entityType: row.entityType,
    entityId: row.entityId,
    signalType: row.signalType,
    severity: row.severity,
    impact: row.impact,
    urgency: row.urgency,
    responsibility: row.responsibility,
    reasonCode: row.reasonCode,
    sourceFingerprint: row.sourceFingerprint,
    reason: row.reason,
    ...(row.recommendedAction
      ? { recommendedAction: row.recommendedAction }
      : {}),
    createdAt: row.createdAt.toISOString(),
    computedAt: row.computedAt.toISOString(),
    sourceEvidence: [
      {
        sourceType: row.entityType,
        sourceId: row.entityId,
        capturedAt: row.sourceOccurredAt.toISOString(),
        summary: row.reason,
        data: isRecord(row.evidence) ? row.evidence : {},
      },
    ],
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
    ...(row.dismissedAt ? { dismissedAt: row.dismissedAt.toISOString() } : {}),
    ...(row.snoozedUntil
      ? { snoozedUntil: row.snoozedUntil.toISOString() }
      : {}),
    ...(row.actionReason ? { actionReason: row.actionReason } : {}),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    version: row.version,
  };
}

function toWaitingDto(waiting: WaitingProjection): WaitingStateDto {
  return {
    id: waiting.id,
    organizationId: waiting.organizationId,
    portfolioId: waiting.portfolioId,
    workspaceId: waiting.workspaceId,
    entityType: waitingEntityType(waiting.entityType),
    entityId: waiting.entityId,
    title: waiting.title,
    waitingType: waitingType(waiting.waitingType),
    ...(waiting.waitingReferenceId
      ? { waitingReferenceId: waiting.waitingReferenceId }
      : {}),
    ...(waiting.waitingLabel ? { waitingLabel: waiting.waitingLabel } : {}),
    waitingSince: waiting.waitingSince,
    ...(waiting.expectedBy ? { expectedBy: waiting.expectedBy } : {}),
    followUpOwnerId: waiting.followUpOwnerId,
    followUpOwnerName: waiting.followUpOwnerName,
    ...(waiting.nextFollowUp ? { nextFollowUp: waiting.nextFollowUp } : {}),
    ...(waiting.waitingNote ? { waitingNote: waiting.waitingNote } : {}),
    ...(waiting.resolvedAt ? { resolvedAt: waiting.resolvedAt } : {}),
    version: waiting.version,
  };
}

function rollupWorkspace(
  workspace: WorkspaceProjection,
  allItems: WorkItemProjection[],
  now: Date,
) {
  const items = allItems.filter(
    (item) => item.workspaceId === workspace.id && item.status !== "done",
  );
  const overdue = items.filter(
    (item) => item.dueDate && new Date(item.dueDate).getTime() < now.getTime(),
  ).length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  const decisions = items.filter(
    (item) => item.type === "decision" && item.decisionState !== "decided",
  ).length;
  const approvals = items.filter(
    (item) => item.type === "approval" && item.approvalState === "pending",
  ).length;
  const healthWeight = {
    critical: 40,
    watch: 22,
    on_track: 4,
    parked: 0,
  } as const;
  return {
    open: items.length,
    overdue,
    blocked,
    decisions,
    approvals,
    score:
      healthWeight[workspace.health] +
      overdue * 6 +
      blocked * 8 +
      decisions * 5 +
      approvals * 4,
  };
}

function portfolioSignals(
  workspaces: WorkspaceProjection[],
  items: WorkItemProjection[],
  now: Date,
) {
  const open = items.filter((item) => item.status !== "done");
  return {
    decisions: open.filter(
      (item) => item.type === "decision" && item.decisionState !== "decided",
    ).length,
    approvals: open.filter(
      (item) => item.type === "approval" && item.approvalState === "pending",
    ).length,
    blocked: open.filter((item) => item.status === "blocked").length,
    overdueMilestones: open.filter(
      (item) =>
        item.type === "milestone" &&
        item.dueDate &&
        new Date(item.dueDate).getTime() < now.getTime(),
    ).length,
    staleUpdates: workspaces.filter(
      (workspace) =>
        !workspace.latestUpdate ||
        now.getTime() - new Date(workspace.latestUpdate.date).getTime() >
          7 * 86_400_000,
    ).length,
    unassignedUrgent: open.filter(
      (item) =>
        item.assignees.length === 0 &&
        (item.priority === "urgent" || item.priority === "high"),
    ).length,
  };
}

function canSeeWorkspace(access: AccessContext, workspaceId: string): boolean {
  return access.accessibleWorkspaceIds.has(workspaceId);
}

function canSeePortfolio(access: AccessContext, portfolioId: string): boolean {
  return access.accessiblePortfolioIds.has(portfolioId);
}

function requireWorkspaceAccess(
  access: AccessContext,
  action: "read" | "create" | "update",
  workspaceId: string,
): void {
  requireAccess(access, action, "workspace", {
    organizationId: access.organizationId,
    workspaceId,
    explicitlyShared: true,
  });
}

function requireScopedResourceAccess(
  access: AccessContext,
  action: "update",
  workspaceId: string | null,
): void {
  requireAccess(access, action, "item", {
    organizationId: access.organizationId,
    ...(workspaceId ? { workspaceId, explicitlyShared: true } : {}),
  });
}

function isOrganizationManager(access: AccessContext): boolean {
  return access.role === "owner" || access.role === "admin";
}

function formatMetric(
  value: number,
  target: number | null,
  unit: string,
): string {
  const measured = target === null ? String(value) : `${value}/${target}`;
  return unit
    ? `${measured}${unit.startsWith("%") ? "" : " "}${unit}`
    : measured;
}

function locale(value: string): "en" | "de" {
  if (value === "en" || value === "de") return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted user locale is invalid.",
  );
}

function dateTime(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf()))
    throw new DataPlaneError(
      "repository_unavailable",
      "A persisted operation timestamp is invalid.",
    );
  return parsed.toISOString();
}

function requireAuthor<T>(author: T | undefined): T {
  if (author) return author;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted evidence author could not be resolved.",
  );
}

function approvalState(
  value: string,
): NonNullable<WorkItemDto["approvalState"]> {
  if (
    value === "pending" ||
    value === "changes_requested" ||
    value === "approved" ||
    value === "rejected"
  )
    return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted approval state is invalid.",
  );
}

function decisionState(
  value: string,
): NonNullable<WorkItemDto["decisionState"]> {
  if (
    value === "needed" ||
    value === "analyzing" ||
    value === "delegated" ||
    value === "deferred" ||
    value === "decided"
  )
    return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted decision state is invalid.",
  );
}

interface WorkItemCursor {
  workspaceIndex: number;
  offset: number;
}

async function paginateWorkItems(
  repositories: OrganizationScopedRepositories,
  workspaceIds: string[],
  limit: number,
  cursor?: string,
  assigneeId?: string,
): Promise<{ items: WorkItemProjection[]; nextCursor: string | null }> {
  const initial = decodeCursor(cursor);
  let workspaceIndex = initial.workspaceIndex;
  let offset = initial.offset;
  const items: WorkItemProjection[] = [];
  while (workspaceIndex < workspaceIds.length && items.length < limit) {
    const workspaceId = workspaceIds[workspaceIndex];
    if (!workspaceId) break;
    const remaining = limit - items.length;
    const batch = await repositories.workItems.list({
      workspaceId,
      ...(assigneeId ? { assigneeId } : {}),
      limit: remaining,
      offset,
    });
    items.push(...batch);
    if (batch.length === remaining)
      return {
        items,
        nextCursor: encodeCursor({
          workspaceIndex,
          offset: offset + batch.length,
        }),
      };
    workspaceIndex += 1;
    offset = 0;
  }
  return { items, nextCursor: null };
}

async function listAccessibleItems(
  repositories: OrganizationScopedRepositories,
  access: AccessContext,
): Promise<WorkItemProjection[]> {
  const result: WorkItemProjection[] = [];
  for (const workspaceId of access.accessibleWorkspaceIds)
    result.push(...(await listAllWorkspaceItems(repositories, workspaceId)));
  return result;
}

async function listAllWorkspaceItems(
  repositories: OrganizationScopedRepositories,
  workspaceId: string,
): Promise<WorkItemProjection[]> {
  const result: WorkItemProjection[] = [];
  let offset = 0;
  while (true) {
    const batch = await repositories.workItems.list({
      workspaceId,
      limit: 100,
      offset,
    });
    result.push(...batch);
    if (batch.length < 100) return result;
    offset += batch.length;
  }
}

function decodeCursor(cursor?: string): WorkItemCursor {
  if (!cursor) return { workspaceIndex: 0, offset: 0 };
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      isRecord(parsed) &&
      Number.isSafeInteger(parsed.workspaceIndex) &&
      Number(parsed.workspaceIndex) >= 0 &&
      Number.isSafeInteger(parsed.offset) &&
      Number(parsed.offset) >= 0
    )
      return {
        workspaceIndex: Number(parsed.workspaceIndex),
        offset: Number(parsed.offset),
      };
  } catch {
    // Invalid cursors are treated as the first page and never enter SQL.
  }
  return { workspaceIndex: 0, offset: 0 };
}

function encodeCursor(cursor: WorkItemCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function unsupported(message: string) {
  return async (): Promise<never> => {
    throw unavailable(message);
  };
}

function unavailable(message: string): DataPlaneError {
  return new DataPlaneError("capability_unavailable", message);
}

function notFound(): DataPlaneError {
  return new DataPlaneError(
    "resource_not_found",
    "The requested resource is unavailable.",
  );
}

function waitingEntityType(value: string): WaitingStateDto["entityType"] {
  if (value === "work_item" || value === "decision" || value === "approval")
    return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted Waiting entity type is invalid.",
  );
}

function waitingType(value: string): WaitingStateDto["waitingType"] {
  const values: WaitingStateDto["waitingType"][] = [
    "person",
    "team",
    "external_partner",
    "client",
    "vendor",
    "decision",
    "document",
    "dependency",
    "other",
  ];
  const matched = values.find((candidate) => candidate === value);
  if (matched) return matched;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted Waiting type is invalid.",
  );
}

function reviewSource(value: string): WorkspaceSnapshotDto["source"] {
  if (
    value === "weekly_review" ||
    value === "monthly_review" ||
    value === "manual"
  )
    return value;
  throw invalidManagementValue("snapshot source");
}

function reviewType(value: string) {
  if (
    value === "daily_focus" ||
    value === "weekly_workspace" ||
    value === "monthly_portfolio"
  )
    return value;
  throw invalidManagementValue("review type");
}

function decisionOutcome(value: string) {
  if (
    value === "better_than_expected" ||
    value === "as_expected" ||
    value === "worse_than_expected" ||
    value === "too_early"
  )
    return value;
  throw invalidManagementValue("decision outcome");
}

function invalidManagementValue(field: string): DataPlaneError {
  return new DataPlaneError(
    "repository_unavailable",
    `A persisted ${field} is invalid.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
