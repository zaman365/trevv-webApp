import {
  reportPlanSchema,
  saveReportPlanSchema,
  type ReportPlanDto,
} from "@founderhq/api-contract/report-plan";
import type { ReportPlanClient } from "@founderhq/api-client/report-plan";

/** Explicitly isolated from live accounts; failures never masquerade as a saved update. */
export function createDemoReportPlanClient(
  organizationId: string,
  user: { id: string; name: string },
): ReportPlanClient {
  const key = `trevv-demo-report-plans:${organizationId}:${user.id}`;
  const read = () => {
    const stored = localStorage.getItem(key);
    return stored ? reportPlanSchema.array().parse(JSON.parse(stored)) : [];
  };
  const write = (rows: ReportPlanDto[]) =>
    localStorage.setItem(key, JSON.stringify(rows));
  const get = (id: string) => {
    const row = read().find((value) => value.id === id);
    if (!row) throw new Error("This demo update is no longer available.");
    return row;
  };
  return {
    async list(workspaceId, filters) {
      const data = read()
        .filter(
          (row) =>
            row.workspaceId === workspaceId &&
            !row.archivedAt &&
            (!filters.kind || row.kind === filters.kind) &&
            (!filters.authorId || row.authorId === filters.authorId) &&
            (!filters.state || row.state === filters.state) &&
            (!filters.from || row.periodEnd >= filters.from) &&
            (!filters.to || row.periodStart <= filters.to) &&
            (!filters.attention ||
              ["blocked", "at_risk"].includes(row.health) ||
              Boolean(row.content.blockers || row.content.supportNeeded)),
        )
        .sort(
          (a, b) =>
            b.periodStart.localeCompare(a.periodStart) ||
            b.createdAt.localeCompare(a.createdAt) ||
            b.id.localeCompare(a.id),
        );
      const offset = (filters.page - 1) * 24;
      return {
        data: data.slice(offset, offset + 24),
        hasMore: data.length > offset + 24,
        page: filters.page,
      };
    },
    async get(id) {
      return get(id);
    },
    async create(workspaceId, input, idempotencyKey) {
      const rows = read();
      const id = `demo-${idempotencyKey}`;
      const existing = rows.find((row) => row.id === id);
      if (existing) return existing;
      const now = new Date().toISOString();
      const row: ReportPlanDto = {
        ...saveReportPlanSchema.parse(input),
        id,
        workspaceId,
        authorId: user.id,
        authorName: user.name,
        version: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: input.state === "published" ? now : null,
        archivedAt: null,
      };
      write([...rows, row]);
      return row;
    },
    async update(id, version, input) {
      const current = get(id);
      if (current.version !== version)
        throw new Error("This demo update changed. Reload it before saving.");
      const now = new Date().toISOString();
      const row = {
        ...current,
        ...saveReportPlanSchema.parse(input),
        version: version + 1,
        updatedAt: now,
        publishedAt:
          current.publishedAt ?? (input.state === "published" ? now : null),
      };
      write(read().map((value) => (value.id === id ? row : value)));
      return row;
    },
    async archive(id, version) {
      const current = get(id);
      if (current.version !== version)
        throw new Error(
          "This demo update changed. Reload it before archiving.",
        );
      const now = new Date().toISOString();
      const row = {
        ...current,
        version: version + 1,
        updatedAt: now,
        archivedAt: now,
      };
      write(read().map((value) => (value.id === id ? row : value)));
      return row;
    },
  };
}
