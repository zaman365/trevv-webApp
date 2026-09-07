import { TrevvApiError, type TrevvApiClient } from "@founderhq/api-client";
import type { AppSyncSummary } from "@founderhq/api-contract";
import type { LiveAppDataSnapshot } from "./live-app-data";
import type { LiveAppAccessSnapshot } from "./live-app-sync";

export function summarizeAppSnapshot(
  snapshot: LiveAppDataSnapshot,
): AppSyncSummary {
  const workspaces = new Map(
    snapshot.workspaces.map(({ id }) => [
      id,
      {
        workspaceId: id,
        open: 0,
        blocked: 0,
        pendingDecisions: 0,
        attention: 0,
        attentionEntities: 0,
      },
    ]),
  );
  const portfolios = new Map(
    snapshot.portfolios.map(({ id }) => [
      id,
      { portfolioId: id, attention: 0, attentionEntities: 0 },
    ]),
  );
  const workspaceEntities = new Map<string, Set<string>>();
  const portfolioEntities = new Map<string, Set<string>>();
  for (const item of snapshot.items) {
    const row = workspaces.get(item.workspaceId);
    if (!row || item.status === "done") continue;
    row.open++;
    if (item.status === "blocked") row.blocked++;
    if (item.type === "decision" && item.decisionState !== "decided")
      row.pendingDecisions++;
  }
  const now = Date.parse(snapshot.refreshedAt);
  for (const signal of snapshot.attention) {
    if (
      signal.resolvedAt ||
      signal.dismissedAt ||
      (signal.snoozedUntil && Date.parse(signal.snoozedUntil) > now)
    )
      continue;
    const portfolio = portfolios.get(signal.portfolioId);
    if (
      !portfolio ||
      (signal.workspaceId && !workspaces.has(signal.workspaceId))
    )
      continue;
    portfolio.attention++;
    let entities = portfolioEntities.get(signal.portfolioId);
    if (!entities)
      portfolioEntities.set(signal.portfolioId, (entities = new Set()));
    entities.add(signal.entityId);
    if (signal.workspaceId) {
      const workspace = workspaces.get(signal.workspaceId)!;
      workspace.attention++;
      let entities = workspaceEntities.get(signal.workspaceId);
      if (!entities)
        workspaceEntities.set(signal.workspaceId, (entities = new Set()));
      entities.add(signal.entityId);
    }
  }
  for (const row of workspaces.values())
    row.attentionEntities = workspaceEntities.get(row.workspaceId)?.size ?? 0;
  for (const row of portfolios.values())
    row.attentionEntities = portfolioEntities.get(row.portfolioId)?.size ?? 0;
  return {
    protocol: 1,
    revision: snapshot.revision ?? null,
    workspaces: [...workspaces.values()],
    portfolios: [...portfolios.values()],
  };
}

export function restrictSummaryToAccess(
  summary: AppSyncSummary,
  access: LiveAppAccessSnapshot,
): AppSyncSummary {
  const workspaces = new Set(access.workspaces.map(({ id }) => id));
  const portfolios = new Set(access.portfolios.map(({ id }) => id));
  if (
    summary.workspaces.every(({ workspaceId }) =>
      workspaces.has(workspaceId),
    ) &&
    summary.portfolios.every(({ portfolioId }) => portfolios.has(portfolioId))
  )
    return summary;
  return {
    ...summary,
    workspaces: summary.workspaces.filter(({ workspaceId }) =>
      workspaces.has(workspaceId),
    ),
    portfolios: summary.portfolios.filter(({ portfolioId }) =>
      portfolios.has(portfolioId),
    ),
  };
}

/** Older deployments retain complete behavior; capability memory belongs to one identity. */
export function createLiveSummaryReader(client: TrevvApiClient) {
  let legacy = false;
  return async (
    signal: AbortSignal,
    readAccess: () => Promise<LiveAppAccessSnapshot>,
    readLegacy: (access: LiveAppAccessSnapshot) => Promise<LiveAppDataSnapshot>,
    previous?: AppSyncSummary,
  ): Promise<AppSyncSummary> => {
    let before = await readAccess();
    if (before.revision && previous?.revision === before.revision)
      return restrictSummaryToAccess(previous, before);
    for (let attempt = 0; attempt < 3; attempt++) {
      let summary: AppSyncSummary | undefined;
      if (!legacy) {
        try {
          summary = await client.withSignal(signal).syncSummary();
        } catch (error) {
          if (
            !(error instanceof TrevvApiError) ||
            ![404, 405, 501].includes(error.status)
          )
            throw error;
          legacy = true;
        }
      }
      if (!summary) summary = summarizeAppSnapshot(await readLegacy(before));
      signal.throwIfAborted();
      if (!before.revision)
        return restrictSummaryToAccess({ ...summary, revision: null }, before);
      const after = await readAccess();
      if (
        after.revision === before.revision &&
        (legacy || summary.revision === after.revision)
      ) {
        return restrictSummaryToAccess(
          { ...summary, revision: after.revision },
          after,
        );
      }
      before = after;
    }
    throw new Error("Your portfolio changed while loading. Try again.");
  };
}
