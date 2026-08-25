import {
  apiErrorSchema,
  attentionActionSchema,
  attentionSignalSchema,
  hubSchema,
  paginatedItemsSchema,
  portfolioResponseSchema,
  portfolioSchema,
  sessionSchema,
  workItemSchema,
  waitingStateSchema,
  type AttentionSignalDto,
  type PortfolioResponse,
  type Session,
  type WorkItemDto,
} from "@founderhq/api-contract";

export class TrevvApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly status: number,
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

export function createApiClient({
  baseUrl,
  getAccessToken,
  fetchImpl = fetch,
}: ApiClientOptions) {
  const request = async (
    path: string,
    init?: RequestInit,
  ): Promise<unknown> => {
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
        );
      throw new TrevvApiError(
        "unexpected_response",
        "The server returned an unexpected response.",
        response.headers.get("x-request-id") ?? "unknown",
        response.status,
      );
    }
    return body;
  };

  return {
    session: async (): Promise<Session> =>
      sessionSchema.parse(await request("/session")),
    portfolio: async (portfolioId?: string): Promise<PortfolioResponse> =>
      portfolioResponseSchema.parse(
        await request(
          `/portfolio${portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : ""}`,
        ),
      ),
    portfolios: async () =>
      portfolioSchema.array().parse(await request("/portfolios")),
    attention: async (portfolioId?: string) =>
      attentionSignalSchema
        .array()
        .parse(
          await request(
            `/attention${portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : ""}`,
          ),
        ),
    actOnAttention: async (
      id: string,
      input: {
        action: "resolve" | "dismiss" | "snooze";
        reason?: string;
        snoozedUntil?: string;
      },
    ): Promise<AttentionSignalDto> => {
      const body = attentionActionSchema.parse(input);
      return attentionSignalSchema.parse(
        await request(`/attention/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      );
    },
    waiting: async () =>
      waitingStateSchema.array().parse(await request("/waiting")),
    hubs: async () => hubSchema.array().parse(await request("/hubs")),
    items: async (cursor?: string) =>
      paginatedItemsSchema.parse(
        await request(
          `/items${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        ),
      ),
    createItem: async (
      input: Omit<WorkItemDto, "id">,
      idempotencyKey: string,
    ) =>
      workItemSchema.parse(
        await request("/items", {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey },
          body: JSON.stringify(input),
        }),
      ),
    updateItem: async (
      id: string,
      patch: Partial<WorkItemDto>,
      version: number,
    ) =>
      workItemSchema.parse(
        await request(`/items/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "if-match": String(version) },
          body: JSON.stringify(patch),
        }),
      ),
  };
}

export type TrevvApiClient = ReturnType<typeof createApiClient>;
/** @deprecated Use TrevvApiError. */
export { TrevvApiError as FounderHqApiError };
/** @deprecated Use TrevvApiClient. */
export type FounderHqApiClient = TrevvApiClient;
