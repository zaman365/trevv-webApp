import { apiErrorSchema, idempotencyKeySchema } from "@founderhq/api-contract";
import {
  reportPlanListSchema,
  reportPlanQuerySchema,
  reportPlanSchema,
  saveReportPlanSchema,
  type ReportPlanQuery,
  type SaveReportPlanInput,
} from "@founderhq/api-contract/report-plan";
import { TrevvApiError, type ApiClientOptions } from "./index.js";

/** Kept in the reporting route's chunk; other application routes pay no schema cost. */
export function createReportPlanClient({
  baseUrl,
  fetchImpl = fetch,
  getAccessToken,
}: ApiClientOptions) {
  async function request(path: string, init?: RequestInit) {
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
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      throw new TrevvApiError(
        parsed.success ? parsed.data.error.code : "unexpected_response",
        parsed.success
          ? parsed.data.error.message
          : "The server could not load this report or plan.",
        response.headers.get("x-request-id") ?? "unknown",
        response.status,
        parsed.success ? parsed.data.error.details : undefined,
      );
    }
    return body;
  }
  const headers = (key: string, version?: number) => ({
    "idempotency-key": idempotencyKeySchema.parse(key),
    ...(version === undefined ? {} : { "if-match": `"${version}"` }),
  });
  return {
    async list(
      workspaceId: string,
      filters: ReportPlanQuery,
      signal?: AbortSignal,
    ) {
      const parsed = reportPlanQuerySchema.parse(filters);
      const query = new URLSearchParams(
        Object.entries(parsed)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      );
      return reportPlanListSchema.parse(
        await request(
          `/workspaces/${encodeURIComponent(workspaceId)}/report-plans?${query}`,
          { signal: signal ?? null },
        ),
      );
    },
    async get(id: string, signal?: AbortSignal) {
      return reportPlanSchema.parse(
        await request(`/report-plans/${encodeURIComponent(id)}`, {
          signal: signal ?? null,
        }),
      );
    },
    async create(workspaceId: string, input: SaveReportPlanInput, key: string) {
      return reportPlanSchema.parse(
        await request(
          `/workspaces/${encodeURIComponent(workspaceId)}/report-plans`,
          {
            method: "POST",
            headers: headers(key),
            body: JSON.stringify(saveReportPlanSchema.parse(input)),
          },
        ),
      );
    },
    async update(
      id: string,
      version: number,
      input: SaveReportPlanInput,
      key: string,
    ) {
      return reportPlanSchema.parse(
        await request(`/report-plans/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: headers(key, version),
          body: JSON.stringify(saveReportPlanSchema.parse(input)),
        }),
      );
    },
    async archive(id: string, version: number, key: string) {
      return reportPlanSchema.parse(
        await request(`/report-plans/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: headers(key, version),
        }),
      );
    },
  };
}
export type ReportPlanClient = ReturnType<typeof createReportPlanClient>;
