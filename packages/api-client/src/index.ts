import {
  apiErrorSchema,
  acceptInvitationSchema,
  attentionActionSchema,
  attentionSignalSchema,
  changeRadarSchema,
  completeOnboardingSchema,
  createInvitationSchema,
  createItemSchema,
  entityTagSchema,
  idempotencyKeySchema,
  invitationAcceptanceSchema,
  invitationSchema,
  managementMemorySchema,
  membershipSchema,
  onboardingDraftSchema,
  onboardingStateSchema,
  organizationSummarySchema,
  organizationSelectionSchema,
  paginatedItemsSchema,
  portfolioResponseSchema,
  portfolioSchema,
  searchResultSchema,
  sessionSchema,
  updateItemSchema,
  updateMembershipSchema,
  waitingActionSchema,
  waitingStateSchema,
  weeklyReviewInputSchema,
  weeklyReviewResponseSchema,
  workItemSchema,
  workspaceDetailSchema,
  workspaceSchema,
  type AttentionSignalDto,
  type ChangeRadarDto,
  type CompleteOnboardingInput,
  type CreateInvitationInput,
  type CreateItemInput,
  type PortfolioResponse,
  type ManagementMemoryDto,
  type Invitation,
  type InvitationAcceptance,
  type Membership,
  type OnboardingDraft,
  type OnboardingState,
  type OrganizationSummary,
  type SearchResultDto,
  type Session,
  type UpdateItemInput,
  type UpdateMembershipInput,
  type WaitingAction,
  type WaitingStateDto,
  type WeeklyReviewInput,
  type WeeklyReviewResponse,
  type WorkItemDto,
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

    workspace: async (slug: string): Promise<WorkspaceDetailDto> =>
      workspaceDetailSchema.parse(
        (await request(`/workspaces/${encodeURIComponent(slug)}`)).body,
      ),

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
