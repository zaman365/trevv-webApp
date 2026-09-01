import {
  approvalTransitionSchema,
  apiErrorSchema,
  acceptInvitationSchema,
  assignWorkItemSchema,
  attentionActionSchema,
  attentionSignalSchema,
  blockWorkItemSchema,
  boardSchema,
  captureInboxItemSchema,
  changeRadarSchema,
  collaborationEventBatchSchema,
  completeOnboardingSchema,
  conversationMessageSchema,
  conversationReadCheckpointSchema,
  conversationSchema,
  convertInboxItemSchema,
  convertedInboxItemSchema,
  createPrivacyRequestSchema,
  createBoardSchema,
  createConversationMessageSchema,
  createConversationSchema,
  createInvitationSchema,
  createItemSchema,
  createPortfolioSchema,
  createTeamSchema,
  createWaitingSchema,
  createWorkspaceSchema,
  decisionTransitionSchema,
  entityTagSchema,
  idempotencyKeySchema,
  inboxItemSchema,
  invitationAcceptanceSchema,
  invitationSchema,
  managementMemorySchema,
  markConversationReadSchema,
  membershipSchema,
  messageReactionInputSchema,
  onboardingDraftSchema,
  onboardingStateSchema,
  operationsStatusSchema,
  dataLifecycleRequestSchema,
  organizationSummarySchema,
  organizationSelectionSchema,
  paginatedItemsSchema,
  paginatedConversationMessagesSchema,
  paginatedConversationsSchema,
  portfolioResponseSchema,
  portfolioSchema,
  searchResultSchema,
  privacyProgramStatusSchema,
  retentionPolicySchema,
  readinessSchema,
  sessionSchema,
  setConversationParticipantSchema,
  setTeamMemberSchema,
  teamDirectorySchema,
  teamSchema,
  resolveWorkItemSchema,
  updateInboxItemSchema,
  updateItemSchema,
  updateMembershipSchema,
  updateRetentionPolicySchema,
  updateMessageResponseSchema,
  updateTeamSchema,
  updateWorkspaceSchema,
  versionTagEntityTagSchema,
  waitingActionSchema,
  waitingStateSchema,
  weeklyReviewInputSchema,
  weeklyReviewRecordSchema,
  weeklyReviewResponseSchema,
  workItemEvidenceInputSchema,
  workItemEvidenceMutationSchema,
  workItemEvidenceSchema,
  workItemHistoryEntrySchema,
  workItemSchema,
  workItemTransitionResponseSchema,
  workspaceSnapshotSchema,
  workspaceDetailSchema,
  workspaceCreationSchema,
  workspaceSchema,
  type AttentionSignalDto,
  type ApprovalTransitionInput,
  type AssignWorkItemInput,
  type BlockWorkItemInput,
  type BoardDto,
  type CaptureInboxItemInput,
  type ChangeRadarDto,
  type CollaborationEventBatch,
  type CompleteOnboardingInput,
  type ConversationDto,
  type ConversationMessageDto,
  type ConversationReadCheckpointDto,
  type CreatePrivacyRequestInput,
  type ConvertInboxItemInput,
  type ConvertedInboxItem,
  type CreateInvitationInput,
  type CreatePortfolioInput,
  type CreateConversationInput,
  type CreateConversationMessageInput,
  type CreateTeamInput,
  type CreateItemInput,
  type CreateBoardInput,
  type CreateWaitingInput,
  type CreateWorkspaceInput,
  type DecisionTransitionInput,
  type PortfolioResponse,
  type ManagementMemoryDto,
  type Invitation,
  type InvitationAcceptance,
  type InboxItemDto,
  type Membership,
  type OnboardingDraft,
  type OnboardingState,
  type OperationsStatusDto,
  type DataLifecycleRequestDto,
  type OrganizationSummary,
  type PaginatedConversationMessages,
  type PaginatedConversations,
  type SearchResultDto,
  type PrivacyProgramStatusDto,
  type RetentionPolicyDto,
  type Readiness,
  type Session,
  type SetTeamMemberInput,
  type TeamDirectoryDto,
  type TeamDto,
  type ResolveWorkItemInput,
  type UpdateInboxItemInput,
  type UpdateItemInput,
  type UpdateMembershipInput,
  type UpdateRetentionPolicyInput,
  type UpdateTeamInput,
  type UpdateWorkspaceInput,
  type WaitingAction,
  type WaitingStateDto,
  type WeeklyReviewInput,
  type WeeklyReviewRecordDto,
  type WeeklyReviewResponse,
  type WorkItemEvidenceInput,
  type WorkItemEvidenceDto,
  type WorkItemHistoryEntryDto,
  type WorkItemTransitionResponse,
  type WorkItemDto,
  type WorkspaceSnapshotDto,
  type WorkspaceCreation,
  type WorkspaceDetailDto,
} from "@founderhq/api-contract";

export class TrevvApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
    readonly etag?: string,
  ) {
    super(message);
    this.name = "TrevvApiError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export interface MutationResponse<T> {
  data: T;
  idempotencyKey?: string;
  replayed: boolean;
}

export interface VersionedMutationResponse<T> extends MutationResponse<T> {
  etag: string;
}

interface RawResponse {
  body: unknown;
  response: Response;
}

export function createApiClient({
  baseUrl,
  getAccessToken,
  fetchImpl = fetch,
}: ApiClientOptions) {
  const request = async (
    path: string,
    init?: RequestInit,
  ): Promise<RawResponse> => {
    const token = await getAccessToken?.();
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");
    if (init?.body) headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      if (parsed.success)
        throw new TrevvApiError(
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.requestId,
          response.status,
          parsed.data.error.details,
          responseEntityTag(response),
        );
      throw new TrevvApiError(
        "unexpected_response",
        "The server returned an unexpected response.",
        response.headers.get("x-request-id") ?? "unknown",
        response.status,
      );
    }
    return { body, response };
  };

  return {
    readiness: async (): Promise<Readiness> =>
      readinessSchema.parse((await request("/readyz")).body),

    session: async (): Promise<Session> =>
      sessionSchema.parse((await request("/session")).body),

    organizations: async (): Promise<OrganizationSummary[]> =>
      organizationSummarySchema
        .array()
        .parse((await request("/session/organizations")).body),

    selectOrganization: async (organizationId: string): Promise<Session> => {
      const body = organizationSelectionSchema.parse({ organizationId });
      return sessionSchema.parse(
        (
          await request("/session/organization", {
            method: "POST",
            body: JSON.stringify(body),
          })
        ).body,
      );
    },

    onboarding: async (): Promise<OnboardingState> =>
      onboardingStateSchema.parse((await request("/onboarding")).body),

    saveOnboarding: async (
      input: OnboardingDraft,
      version: number,
    ): Promise<OnboardingState> =>
      onboardingStateSchema.parse(
        (
          await request("/onboarding", {
            method: "PUT",
            headers: { "if-match": entityTagSchema.parse(`"${version}"`) },
            body: JSON.stringify(onboardingDraftSchema.parse(input)),
          })
        ).body,
      ),

    completeOnboarding: async (
      input: CompleteOnboardingInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<OnboardingState>> => {
      const body = completeOnboardingSchema.parse(input);
      const key = idempotencyKeySchema.parse(idempotencyKey);
      const response = await request("/onboarding/complete", {
        method: "POST",
        headers: { "idempotency-key": key },
        body: JSON.stringify(body),
      });
      return parseVersionedMutation(response, onboardingStateSchema);
    },

    invitations: async (): Promise<Invitation[]> =>
      invitationSchema.array().parse((await request("/invitations")).body),

    createInvitation: async (
      input: CreateInvitationInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<Invitation>> => {
      const response = await request("/invitations", {
        method: "POST",
        headers: {
          "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
        },
        body: JSON.stringify(createInvitationSchema.parse(input)),
      });
      return parseVersionedMutation(response, invitationSchema);
    },

    resendInvitation: async (
      id: string,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<Invitation>> => {
      const response = await request(
        `/invitations/${encodeURIComponent(id)}/resend`,
        {
          method: "POST",
          headers: mutationHeaders(version, idempotencyKey),
        },
      );
      return parseVersionedMutation(response, invitationSchema);
    },

    revokeInvitation: async (
      id: string,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<Invitation>> => {
      const response = await request(`/invitations/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: mutationHeaders(version, idempotencyKey),
      });
      return parseVersionedMutation(response, invitationSchema);
    },

    acceptInvitation: async (token: string): Promise<InvitationAcceptance> =>
      invitationAcceptanceSchema.parse(
        (
          await request("/invitations/accept", {
            method: "POST",
            body: JSON.stringify(acceptInvitationSchema.parse({ token })),
          })
        ).body,
      ),

    acceptClaimedInvitation: async (): Promise<InvitationAcceptance> =>
      invitationAcceptanceSchema.parse(
        (
          await request("/invitations/accept-claim", {
            method: "POST",
          })
        ).body,
      ),

    memberships: async (): Promise<Membership[]> =>
      membershipSchema.array().parse((await request("/memberships")).body),

    updateMembership: async (
      userId: string,
      input: UpdateMembershipInput,
      idempotencyKey: string,
    ): Promise<MutationResponse<Membership>> => {
      const response = await request(
        `/memberships/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: {
            "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
          },
          body: JSON.stringify(updateMembershipSchema.parse(input)),
        },
      );
      return {
        data: membershipSchema.parse(response.body),
        ...mutationMetadata(response.response),
      };
    },

    portfolio: async (portfolioId?: string): Promise<PortfolioResponse> =>
      portfolioResponseSchema.parse(
        (
          await request(
            `/portfolio${portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : ""}`,
          )
        ).body,
      ),

    portfolios: async () =>
      portfolioSchema.array().parse((await request("/portfolios")).body),

    createPortfolio: async (
      input: CreatePortfolioInput,
      idempotencyKey: string,
    ): Promise<MutationResponse<ReturnType<typeof portfolioSchema.parse>>> => {
      const response = await request("/portfolios", {
        method: "POST",
        headers: {
          "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
        },
        body: JSON.stringify(createPortfolioSchema.parse(input)),
      });
      return {
        data: portfolioSchema.parse(response.body),
        ...mutationMetadata(response.response),
      };
    },

    attention: async (
      filters: {
        portfolioId?: string;
        workspaceId?: string;
      } = {},
    ) => {
      const query = new URLSearchParams();
      if (filters.portfolioId) query.set("portfolioId", filters.portfolioId);
      if (filters.workspaceId) query.set("workspaceId", filters.workspaceId);
      return attentionSignalSchema
        .array()
        .parse(
          (await request(`/attention${query.size ? `?${query}` : ""}`)).body,
        );
    },

    actOnAttention: async (
      id: string,
      input: {
        action: "resolve" | "dismiss" | "snooze";
        reason?: string;
        snoozedUntil?: string;
      },
      version: number,
      idempotencyKey?: string,
    ): Promise<VersionedMutationResponse<AttentionSignalDto>> => {
      const body = attentionActionSchema.parse(input);
      const response = await request(`/attention/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: mutationHeaders(version, idempotencyKey),
        body: JSON.stringify(body),
      });
      return parseVersionedMutation(response, attentionSignalSchema);
    },

    waiting: async () =>
      waitingStateSchema.array().parse((await request("/waiting")).body),

    actOnWaiting: async (
      id: string,
      input: WaitingAction,
      version: number,
      idempotencyKey?: string,
    ): Promise<VersionedMutationResponse<WaitingStateDto>> => {
      const body = waitingActionSchema.parse(input);
      const response = await request(`/waiting/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: mutationHeaders(version, idempotencyKey),
        body: JSON.stringify(body),
      });
      return parseVersionedMutation(response, waitingStateSchema);
    },

    workspaces: async () =>
      workspaceSchema.array().parse((await request("/workspaces")).body),

    createWorkspace: async (
      input: CreateWorkspaceInput,
      idempotencyKey: string,
    ): Promise<MutationResponse<WorkspaceCreation>> => {
      const response = await request("/workspaces", {
        method: "POST",
        headers: {
          "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
        },
        body: JSON.stringify(createWorkspaceSchema.parse(input)),
      });
      return {
        data: workspaceCreationSchema.parse(response.body),
        ...mutationMetadata(response.response),
      };
    },

    updateWorkspace: async (
      workspaceId: string,
      input: UpdateWorkspaceInput,
      versionTag: string,
      idempotencyKey: string,
    ): Promise<
      MutationResponse<WorkspaceDetailDto["workspace"]> & { etag: string }
    > => {
      const response = await request(
        `/workspaces/${encodeURIComponent(workspaceId)}/settings`,
        {
          method: "PATCH",
          headers: {
            "if-match": `"${versionTag}"`,
            "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
          },
          body: JSON.stringify(updateWorkspaceSchema.parse(input)),
        },
      );
      const data = workspaceSchema.parse(response.body);
      const etag = versionTagEntityTagSchema.parse(
        response.response.headers.get("etag"),
      );
      if (etag !== `"${data.versionTag}"`)
        throw new TrevvApiError(
          "unexpected_response",
          "The response ETag did not match the Workspace version.",
          response.response.headers.get("x-request-id") ?? "unknown",
          response.response.status,
        );
      return { data, etag, ...mutationMetadata(response.response) };
    },

    workspace: async (slug: string): Promise<WorkspaceDetailDto> =>
      workspaceDetailSchema.parse(
        (await request(`/workspaces/${encodeURIComponent(slug)}`)).body,
      ),

    teamDirectory: async (workspaceId: string): Promise<TeamDirectoryDto> =>
      teamDirectorySchema.parse(
        (await request(`/workspaces/${encodeURIComponent(workspaceId)}/teams`))
          .body,
      ),

    team: async (id: string): Promise<TeamDto> =>
      teamSchema.parse(
        (await request(`/teams/${encodeURIComponent(id)}`)).body,
      ),

    createTeam: async (
      input: CreateTeamInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<TeamDto>> => {
      const body = createTeamSchema.parse(input);
      const response = await request(
        `/workspaces/${encodeURIComponent(body.workspaceId)}/teams`,
        {
          method: "POST",
          headers: {
            "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
          },
          body: JSON.stringify(body),
        },
      );
      return parseVersionedMutation(response, teamSchema);
    },

    updateTeam: async (
      id: string,
      input: UpdateTeamInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<TeamDto>> => {
      const response = await request(`/teams/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: mutationHeaders(version, idempotencyKey),
        body: JSON.stringify(updateTeamSchema.parse(input)),
      });
      return parseVersionedMutation(response, teamSchema);
    },

    setTeamMember: async (
      teamId: string,
      userId: string,
      input: SetTeamMemberInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<TeamDto>> => {
      const response = await request(
        `/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(setTeamMemberSchema.parse(input)),
        },
      );
      return parseVersionedMutation(response, teamSchema);
    },

    removeTeamMember: async (
      teamId: string,
      userId: string,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<TeamDto>> => {
      const response = await request(
        `/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: mutationHeaders(version, idempotencyKey),
        },
      );
      return parseVersionedMutation(response, teamSchema);
    },

    conversations: async (filters: {
      workspaceId: string;
      cursor?: string;
      limit?: number;
    }): Promise<PaginatedConversations> => {
      const query = new URLSearchParams();
      if (filters.cursor) query.set("cursor", filters.cursor);
      if (filters.limit) query.set("limit", String(filters.limit));
      return paginatedConversationsSchema.parse(
        (
          await request(
            `/workspaces/${encodeURIComponent(filters.workspaceId)}/conversations${query.size ? `?${query}` : ""}`,
          )
        ).body,
      );
    },

    conversation: async (id: string): Promise<ConversationDto> =>
      conversationSchema.parse(
        (await request(`/conversations/${encodeURIComponent(id)}`)).body,
      ),

    createConversation: async (
      input: CreateConversationInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<ConversationDto>> => {
      const body = createConversationSchema.parse(input);
      const response = await request(
        `/workspaces/${encodeURIComponent(body.workspaceId)}/conversations`,
        {
          method: "POST",
          headers: {
            "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
          },
          body: JSON.stringify(body),
        },
      );
      return parseVersionedMutation(response, conversationSchema);
    },

    setConversationParticipant: async (
      conversationId: string,
      userId: string,
      version: number,
      idempotencyKey: string,
      participantRole: "member" | "owner" = "member",
    ): Promise<VersionedMutationResponse<ConversationDto>> => {
      const body = setConversationParticipantSchema.parse({ participantRole });
      const response = await request(
        `/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(body),
        },
      );
      return parseVersionedMutation(response, conversationSchema);
    },

    removeConversationParticipant: async (
      conversationId: string,
      userId: string,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<ConversationDto>> => {
      const response = await request(
        `/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: mutationHeaders(version, idempotencyKey),
        },
      );
      return parseVersionedMutation(response, conversationSchema);
    },

    conversationMessages: async (
      conversationId: string,
      filters: {
        cursor?: string;
        limit?: number;
        parentMessageId?: string;
      } = {},
    ): Promise<PaginatedConversationMessages> => {
      const query = new URLSearchParams();
      if (filters.cursor) query.set("cursor", filters.cursor);
      if (filters.limit) query.set("limit", String(filters.limit));
      if (filters.parentMessageId)
        query.set("parentMessageId", filters.parentMessageId);
      return paginatedConversationMessagesSchema.parse(
        (
          await request(
            `/conversations/${encodeURIComponent(conversationId)}/messages${query.size ? `?${query}` : ""}`,
          )
        ).body,
      );
    },

    sendConversationMessage: async (
      conversationId: string,
      input: CreateConversationMessageInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<ConversationMessageDto>> => {
      const response = await request(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          headers: {
            "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
          },
          body: JSON.stringify(createConversationMessageSchema.parse(input)),
        },
      );
      return parseVersionedMutation(response, conversationMessageSchema);
    },

    setMessageResponse: async (
      messageId: string,
      responseState: "open" | "resolved",
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<ConversationMessageDto>> => {
      const response = await request(
        `/messages/${encodeURIComponent(messageId)}/response`,
        {
          method: "PATCH",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(
            updateMessageResponseSchema.parse({ responseState }),
          ),
        },
      );
      return parseVersionedMutation(response, conversationMessageSchema);
    },

    addMessageReaction: async (
      messageId: string,
      emoji: string,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<ConversationMessageDto>> => {
      const body = messageReactionInputSchema.parse({ emoji });
      const response = await request(
        `/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(body.emoji)}`,
        {
          method: "PUT",
          headers: mutationHeaders(version, idempotencyKey),
        },
      );
      return parseVersionedMutation(response, conversationMessageSchema);
    },

    removeMessageReaction: async (
      messageId: string,
      emoji: string,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<ConversationMessageDto>> => {
      const body = messageReactionInputSchema.parse({ emoji });
      const response = await request(
        `/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(body.emoji)}`,
        {
          method: "DELETE",
          headers: mutationHeaders(version, idempotencyKey),
        },
      );
      return parseVersionedMutation(response, conversationMessageSchema);
    },

    markConversationRead: async (
      conversationId: string,
      messageId: string,
      idempotencyKey: string,
    ): Promise<MutationResponse<ConversationReadCheckpointDto>> => {
      const response = await request(
        `/conversations/${encodeURIComponent(conversationId)}/read-checkpoint`,
        {
          method: "PUT",
          headers: {
            "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
          },
          body: JSON.stringify(markConversationReadSchema.parse({ messageId })),
        },
      );
      return {
        data: conversationReadCheckpointSchema.parse(response.body),
        ...mutationMetadata(response.response),
      };
    },

    collaborationEvents: async (
      workspaceId: string,
      after = 0,
    ): Promise<CollaborationEventBatch> =>
      collaborationEventBatchSchema.parse(
        (
          await request(
            `/events?workspaceId=${encodeURIComponent(workspaceId)}&after=${encodeURIComponent(String(after))}&format=json`,
          )
        ).body,
      ),

    boards: async (workspaceId: string): Promise<BoardDto[]> =>
      boardSchema
        .array()
        .parse(
          (
            await request(
              `/boards?workspaceId=${encodeURIComponent(workspaceId)}`,
            )
          ).body,
        ),

    board: async (id: string): Promise<BoardDto> =>
      boardSchema.parse(
        (await request(`/boards/${encodeURIComponent(id)}`)).body,
      ),

    createBoard: async (
      input: CreateBoardInput,
      idempotencyKey: string,
    ): Promise<MutationResponse<BoardDto>> => {
      const response = await request("/boards", {
        method: "POST",
        headers: {
          "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
        },
        body: JSON.stringify(createBoardSchema.parse(input)),
      });
      return {
        data: boardSchema.parse(response.body),
        ...mutationMetadata(response.response),
      };
    },

    inbox: async (): Promise<InboxItemDto[]> =>
      inboxItemSchema.array().parse((await request("/inbox")).body),

    captureInboxItem: async (
      input: CaptureInboxItemInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<InboxItemDto>> => {
      const response = await request("/inbox", {
        method: "POST",
        headers: {
          "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
        },
        body: JSON.stringify(captureInboxItemSchema.parse(input)),
      });
      return parseVersionedMutation(response, inboxItemSchema);
    },

    updateInboxItem: async (
      id: string,
      input: UpdateInboxItemInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<InboxItemDto>> => {
      const response = await request(`/inbox/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: mutationHeaders(version, idempotencyKey),
        body: JSON.stringify(updateInboxItemSchema.parse(input)),
      });
      return parseVersionedMutation(response, inboxItemSchema);
    },

    convertInboxItem: async (
      id: string,
      input: ConvertInboxItemInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<ConvertedInboxItem>> => {
      const response = await request(
        `/inbox/${encodeURIComponent(id)}/convert`,
        {
          method: "POST",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(convertInboxItemSchema.parse(input)),
        },
      );
      return parseNestedVersionedMutation(
        response,
        convertedInboxItemSchema,
        (value) => value.inboxItem.version,
      );
    },

    changeRadar: async (): Promise<ChangeRadarDto> =>
      changeRadarSchema.parse((await request("/change-radar")).body),

    managementMemory: async (): Promise<ManagementMemoryDto> =>
      managementMemorySchema.parse((await request("/management-memory")).body),

    search: async (query: string): Promise<SearchResultDto> =>
      searchResultSchema.parse(
        (await request(`/search?q=${encodeURIComponent(query)}`)).body,
      ),

    items: async (
      filters: {
        cursor?: string;
        workspaceId?: string;
        assigneeId?: string;
        limit?: number;
      } = {},
    ) => {
      const query = new URLSearchParams();
      if (filters.cursor) query.set("cursor", filters.cursor);
      if (filters.workspaceId) query.set("workspaceId", filters.workspaceId);
      if (filters.assigneeId) query.set("assigneeId", filters.assigneeId);
      if (filters.limit) query.set("limit", String(filters.limit));
      return paginatedItemsSchema.parse(
        (await request(`/items${query.size ? `?${query}` : ""}`)).body,
      );
    },

    item: async (id: string): Promise<WorkItemDto> =>
      workItemSchema.parse(
        (await request(`/items/${encodeURIComponent(id)}`)).body,
      ),

    itemHistory: async (id: string): Promise<WorkItemHistoryEntryDto[]> =>
      workItemHistoryEntrySchema
        .array()
        .parse(
          (await request(`/items/${encodeURIComponent(id)}/history`)).body,
        ),

    itemEvidence: async (id: string): Promise<WorkItemEvidenceDto[]> =>
      workItemEvidenceSchema
        .array()
        .parse(
          (await request(`/items/${encodeURIComponent(id)}/evidence`)).body,
        ),

    addItemEvidence: async (
      id: string,
      input: WorkItemEvidenceInput,
      version: number,
      idempotencyKey: string,
    ): Promise<
      VersionedMutationResponse<{
        evidence: WorkItemEvidenceDto;
        itemVersion: number;
      }>
    > => {
      const response = await request(
        `/items/${encodeURIComponent(id)}/evidence`,
        {
          method: "POST",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(workItemEvidenceInputSchema.parse(input)),
        },
      );
      return parseNestedVersionedMutation(
        response,
        workItemEvidenceMutationSchema,
        (value) => value.itemVersion,
      );
    },

    createItem: async (
      input: CreateItemInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<WorkItemDto>> => {
      const body = createItemSchema.parse(input);
      const key = idempotencyKeySchema.parse(idempotencyKey);
      const response = await request("/items", {
        method: "POST",
        headers: { "idempotency-key": key },
        body: JSON.stringify(body),
      });
      return parseVersionedMutation(response, workItemSchema);
    },

    updateItem: async (
      id: string,
      patch: UpdateItemInput,
      version: number,
      idempotencyKey?: string,
    ): Promise<VersionedMutationResponse<WorkItemDto>> => {
      const body = updateItemSchema.parse(patch);
      const response = await request(`/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: mutationHeaders(version, idempotencyKey),
        body: JSON.stringify(body),
      });
      return parseVersionedMutation(response, workItemSchema);
    },

    assignItem: async (
      id: string,
      input: AssignWorkItemInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<WorkItemTransitionResponse>> =>
      parseItemTransition(
        await request(`/items/${encodeURIComponent(id)}/assignees`, {
          method: "PUT",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(assignWorkItemSchema.parse(input)),
        }),
      ),

    setItemBlocked: async (
      id: string,
      input: BlockWorkItemInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<WorkItemTransitionResponse>> =>
      parseItemTransition(
        await request(`/items/${encodeURIComponent(id)}/block`, {
          method: "POST",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(blockWorkItemSchema.parse(input)),
        }),
      ),

    transitionDecision: async (
      id: string,
      input: DecisionTransitionInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<WorkItemTransitionResponse>> =>
      parseItemTransition(
        await request(`/items/${encodeURIComponent(id)}/decision`, {
          method: "POST",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(decisionTransitionSchema.parse(input)),
        }),
      ),

    transitionApproval: async (
      id: string,
      input: ApprovalTransitionInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<WorkItemTransitionResponse>> =>
      parseItemTransition(
        await request(`/items/${encodeURIComponent(id)}/approval`, {
          method: "POST",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(approvalTransitionSchema.parse(input)),
        }),
      ),

    resolveItem: async (
      id: string,
      input: ResolveWorkItemInput,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<WorkItemTransitionResponse>> =>
      parseItemTransition(
        await request(`/items/${encodeURIComponent(id)}/resolve`, {
          method: "POST",
          headers: mutationHeaders(version, idempotencyKey),
          body: JSON.stringify(resolveWorkItemSchema.parse(input)),
        }),
      ),

    createWaiting: async (
      input: CreateWaitingInput,
      itemVersion: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<WaitingStateDto>> => {
      const response = await request("/waiting", {
        method: "POST",
        headers: {
          "if-match": `"${itemVersion}"`,
          "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
        },
        body: JSON.stringify(createWaitingSchema.parse(input)),
      });
      return parseVersionedMutation(response, waitingStateSchema);
    },

    submitWeeklyReview: async (
      input: WeeklyReviewInput,
      idempotencyKey: string,
    ): Promise<MutationResponse<WeeklyReviewResponse>> => {
      const body = weeklyReviewInputSchema.parse(input);
      const key = idempotencyKeySchema.parse(idempotencyKey);
      const response = await request("/reviews/weekly", {
        method: "POST",
        headers: { "idempotency-key": key },
        body: JSON.stringify(body),
      });
      return {
        data: weeklyReviewResponseSchema.parse(response.body),
        ...mutationMetadata(response.response),
      };
    },

    weeklyReviews: async (
      workspaceId?: string,
    ): Promise<WeeklyReviewRecordDto[]> =>
      weeklyReviewRecordSchema
        .array()
        .parse(
          (
            await request(
              `/reviews/weekly${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""}`,
            )
          ).body,
        ),

    workspaceSnapshots: async (
      filters: { workspaceId?: string; portfolioId?: string } = {},
    ): Promise<WorkspaceSnapshotDto[]> => {
      const query = new URLSearchParams();
      if (filters.workspaceId) query.set("workspaceId", filters.workspaceId);
      if (filters.portfolioId) query.set("portfolioId", filters.portfolioId);
      return workspaceSnapshotSchema
        .array()
        .parse(
          (await request(`/snapshots${query.size ? `?${query}` : ""}`)).body,
        );
    },

    operationStatus: async (): Promise<OperationsStatusDto> =>
      operationsStatusSchema.parse((await request("/operations/status")).body),

    privacyProgram: async (): Promise<PrivacyProgramStatusDto> =>
      privacyProgramStatusSchema.parse((await request("/privacy")).body),

    privacyRequests: async (): Promise<DataLifecycleRequestDto[]> =>
      dataLifecycleRequestSchema
        .array()
        .parse((await request("/privacy/requests")).body),

    createPrivacyRequest: async (
      input: CreatePrivacyRequestInput,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<DataLifecycleRequestDto>> => {
      const body = createPrivacyRequestSchema.parse(input);
      return parseVersionedMutation(
        await request("/privacy/requests", {
          method: "POST",
          headers: {
            "idempotency-key": idempotencyKeySchema.parse(idempotencyKey),
          },
          body: JSON.stringify(body),
        }),
        dataLifecycleRequestSchema,
      );
    },

    cancelPrivacyRequest: async (
      id: string,
      version: number,
      idempotencyKey: string,
    ): Promise<VersionedMutationResponse<DataLifecycleRequestDto>> =>
      parseVersionedMutation(
        await request(`/privacy/requests/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: mutationHeaders(version, idempotencyKey),
        }),
        dataLifecycleRequestSchema,
      ),

    updateRetentionPolicy: async (
      input: UpdateRetentionPolicyInput,
      version: number,
      idempotencyKey: string,
    ): Promise<MutationResponse<RetentionPolicyDto> & { etag: string }> => {
      const body = updateRetentionPolicySchema.parse(input);
      const result = await request("/privacy/retention", {
        method: "PUT",
        headers: mutationHeaders(version, idempotencyKey),
        body: JSON.stringify(body),
      });
      return {
        data: retentionPolicySchema.parse(result.body),
        etag: entityTagSchema.parse(result.response.headers.get("etag")),
        ...mutationMetadata(result.response),
      };
    },
  };
}

function mutationHeaders(
  version: number,
  idempotencyKey?: string,
): HeadersInit {
  const headers = new Headers({ "if-match": `"${version}"` });
  if (idempotencyKey)
    headers.set("idempotency-key", idempotencyKeySchema.parse(idempotencyKey));
  return headers;
}

function parseVersionedMutation<T>(
  result: RawResponse,
  schema: { parse(value: unknown): T & { version: number } },
): VersionedMutationResponse<T> {
  const data = schema.parse(result.body);
  const etag = entityTagSchema.parse(result.response.headers.get("etag"));
  if (Number.parseInt(etag.slice(1, -1), 10) !== data.version)
    throw new TrevvApiError(
      "unexpected_response",
      "The response ETag did not match the resource version.",
      result.response.headers.get("x-request-id") ?? "unknown",
      result.response.status,
    );
  return { data, etag, ...mutationMetadata(result.response) };
}

function parseNestedVersionedMutation<T>(
  result: RawResponse,
  schema: { parse(value: unknown): T },
  version: (value: T) => number,
): VersionedMutationResponse<T> {
  const data = schema.parse(result.body);
  const etag = entityTagSchema.parse(result.response.headers.get("etag"));
  if (Number.parseInt(etag.slice(1, -1), 10) !== version(data))
    throw new TrevvApiError(
      "unexpected_response",
      "The response ETag did not match the resource version.",
      result.response.headers.get("x-request-id") ?? "unknown",
      result.response.status,
    );
  return { data, etag, ...mutationMetadata(result.response) };
}

function parseItemTransition(
  result: RawResponse,
): VersionedMutationResponse<WorkItemTransitionResponse> {
  return parseNestedVersionedMutation(
    result,
    workItemTransitionResponseSchema,
    (value) => value.item.version,
  );
}

function mutationMetadata(response: Response): {
  idempotencyKey?: string;
  replayed: boolean;
} {
  const idempotencyKey = response.headers.get("idempotency-key") ?? undefined;
  return {
    ...(idempotencyKey ? { idempotencyKey } : {}),
    replayed: response.headers.get("idempotency-replayed") === "true",
  };
}

function responseEntityTag(response: Response): string | undefined {
  const parsed = entityTagSchema.safeParse(response.headers.get("etag"));
  return parsed.success ? parsed.data : undefined;
}

export type TrevvApiClient = ReturnType<typeof createApiClient>;
/** @deprecated Use TrevvApiError. */
export { TrevvApiError as FounderHqApiError };
/** @deprecated Use TrevvApiClient. */
export type FounderHqApiClient = TrevvApiClient;
