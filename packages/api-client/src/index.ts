import {
  apiErrorSchema,
  hubSchema,
  paginatedItemsSchema,
  portfolioResponseSchema,
  sessionSchema,
  workItemSchema,
  type PortfolioResponse,
  type Session,
  type WorkItemDto,
} from "@founderhq/api-contract";

export class FounderHqApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FounderHqApiError";
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
        throw new FounderHqApiError(
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.requestId,
          response.status,
        );
      throw new FounderHqApiError(
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
    portfolio: async (): Promise<PortfolioResponse> =>
      portfolioResponseSchema.parse(await request("/portfolio")),
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

export type FounderHqApiClient = ReturnType<typeof createApiClient>;
