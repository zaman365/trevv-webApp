import {
  attentionScore,
  demoDependencies,
  demoHubs,
  demoItems,
  demoWaitingStates,
  generateAttentionSignals,
  hubsForPortfolio,
  portfolioSignals,
  rankAttentionSignals,
  type AttentionSignal,
  type AttentionSeverity,
} from "@founderhq/core";

export const DEFAULT_PORTFOLIO_ID = "portfolio-demo";

/**
 * The moment every surface is calculated against. Fixed so the seeded demo
 * reads the same everywhere; swap for `new Date()` once the data is live.
 */
export const NOW = new Date("2026-08-24T12:00:00.000Z");

/**
 * One work item, with every reason it currently needs attention.
 *
 * `generateAttentionSignals` correctly emits one signal per rule, so a single
 * urgent item that is blocked, overdue and unowned produces three signals.
 * That is right for the engine and wrong for a list: rendered one-per-row it
 * reads as the same item stuttering. Grouping happens here, at the read
 * boundary, so no engine logic has to change.
 */
export interface GroupedSignal {
  id: string;
  entityId: string;
  entityType: string;
  hubId?: string | undefined;
  title: string;
  severity: AttentionSeverity;
  score: number;
  /** Highest-scoring signal for the entity; carries the recommended action. */
  primary: AttentionSignal;
  /** Every signal on this entity, ranked. */
  signals: AttentionSignal[];
  /** The distinct reasons, in the same order. */
  reasons: string[];
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function highestSeverity(signals: readonly AttentionSignal[]) {
  return signals.reduce<AttentionSeverity>(
    (worst, signal) =>
      SEVERITY_RANK[signal.severity] > SEVERITY_RANK[worst]
        ? signal.severity
        : worst,
    "info",
  );
}

/**
 * Engine reasons are written to stand alone ("Fix onboarding permissions is
 * blocked…"), which reads as noise once the title is the card's heading.
 * Strip the redundant prefix and re-sentence-case what is left.
 */
function trimReason(reason: string, title: string) {
  if (!reason.startsWith(title)) return reason;
  // Drop the linking verb too, so "…is blocked" reads as "Blocked".
  const rest = reason.slice(title.length).trim().replace(/^is /, "");
  if (!rest) return reason;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Collapse ranked signals into one entry per work item, order preserved. */
export function groupSignalsByEntity(
  signals: readonly AttentionSignal[],
  now = NOW,
): GroupedSignal[] {
  const byEntity = new Map<string, AttentionSignal[]>();
  for (const signal of signals) {
    const existing = byEntity.get(signal.entityId);
    if (existing) existing.push(signal);
    else byEntity.set(signal.entityId, [signal]);
  }
  return [...byEntity.entries()]
    .flatMap(([entityId, group]) => {
      const primary = group[0];
      if (!primary) return [];
      return [
        {
          id: `group-${entityId}`,
          entityId,
          entityType: primary.entityType,
          hubId: primary.hubId,
          title: String(primary.metadata.title ?? entityId),
          severity: highestSeverity(group),
          score: attentionScore(primary, now),
          primary,
          signals: group,
          reasons: [
            ...new Set(
              group.map((signal) =>
                trimReason(
                  signal.reason,
                  String(primary.metadata.title ?? entityId),
                ),
              ),
            ),
          ],
        },
      ];
    })
    .sort((left, right) => right.score - left.score);
}

export interface WorkspaceScope {
  portfolioId: string;
  hubs: ReturnType<typeof hubsForPortfolio>;
  items: typeof demoItems;
  waiting: typeof demoWaitingStates;
  /** Signals grouped one-per-item and ranked. */
  attention: GroupedSignal[];
  /**
   * The count. Every badge, tile and panel header reads this, so "how much
   * needs me" cannot return a different answer depending on the screen.
   */
  attentionCount: number;
  /** Category breakdown for the Portfolio panel. */
  breakdown: ReturnType<typeof portfolioSignals>;
}

/**
 * Scope the whole workspace to one Portfolio and derive every count from it.
 */
export function scopeWorkspace(
  portfolioId: string = DEFAULT_PORTFOLIO_ID,
  now = NOW,
): WorkspaceScope {
  const hubs = hubsForPortfolio(portfolioId);
  const hubIds = new Set(hubs.map((hub) => hub.id));
  const items = demoItems.filter((item) => hubIds.has(item.hubId));
  const itemIds = new Set(items.map((item) => item.id));
  const waiting = demoWaitingStates.filter((state) =>
    hubIds.has(state.hubId ?? ""),
  );
  const dependencies = demoDependencies.filter(
    (dependency) =>
      itemIds.has(dependency.itemId) && itemIds.has(dependency.dependsOnItemId),
  );
  const ranked = rankAttentionSignals(
    generateAttentionSignals(
      "org-demo",
      hubs,
      items,
      waiting,
      now,
      dependencies,
    ),
    now,
  );
  const attention = groupSignalsByEntity(ranked, now);
  return {
    portfolioId,
    hubs,
    items,
    waiting,
    attention,
    attentionCount: attention.length,
    breakdown: portfolioSignals(hubs, items, now),
  };
}

/** Severity of a signal category, used to colour the Portfolio panel. */
export type SignalTone = "critical" | "high" | "normal";

/**
 * Category severity for the Portfolio panel. Decisions and blocked work stop
 * other people; stale updates only cost you context.
 */
export const SIGNAL_TONES = {
  decisions: "critical",
  blocked: "critical",
  approvals: "high",
  overdueMilestones: "high",
  unassignedUrgent: "high",
  staleUpdates: "normal",
} as const satisfies Record<string, SignalTone>;

/** Fall back to the seeded portfolio when an unknown id is requested. */
export function resolvePortfolioId(candidate?: string) {
  if (!candidate) return DEFAULT_PORTFOLIO_ID;
  return demoHubs.some((hub) => hub.portfolioId === candidate)
    ? candidate
    : DEFAULT_PORTFOLIO_ID;
}
