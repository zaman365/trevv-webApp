"use client";

import {
  AlertTriangle,
  ArrowRight,
  Blocks,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  FileQuestion,
  Grid2X2,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  changesSinceCheckpoint,
  demoChangeCheckpoint,
  demoHubs,
  demoMeaningfulChanges,
  demoPortfolios,
  type HubHealth,
} from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SIGNAL_TONES, type SignalTone } from "@/lib/attention";
import { summarizePortfolio } from "@/lib/portfolios";
import { vocabularyFor } from "@/lib/terminology";
import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceFrame } from "./workspace-frame";
import { AttentionRow, HubMark } from "./management-experience";
import { ProjectTile } from "./project-tile";
import { HealthBar, PageHero, Panel, StatTile } from "./ui-kit";
import { useCustomHubs } from "@/lib/custom-hubs";
import {
  portfolioVisualFor,
  useCustomPortfolios,
} from "@/lib/custom-portfolios";
import { workspaceHref, type WorkspaceView } from "@/lib/workspace-routes";

const hubFor = (hubId?: string) => demoHubs.find((hub) => hub.id === hubId);

type PortfolioDetailKind =
  | "attention"
  | "decisions"
  | "blocked"
  | "approvals"
  | "overdueMilestones"
  | "unassignedUrgent"
  | "staleUpdates";

export function PortfolioExperience() {
  return (
    <WorkspaceFrame active="portfolio">
      <PortfolioMain />
    </WorkspaceFrame>
  );
}

function PortfolioMain() {
  const { copy, scope, portfolioId, setPortfolioId } = useWorkspace();
  const vocab = vocabularyFor();
  const [health, setHealth] = useState<HubHealth | "all">("all");
  // §5: "choose optional metrics" — on by default, dismissable.
  const [showMetrics, setShowMetrics] = useState(true);
  const [detail, setDetail] = useState<PortfolioDetailKind | null>(null);
  const customPortfolioRecords = useCustomPortfolios();
  const customHubs = useCustomHubs().filter(
    (record) => record.hub.portfolioId === portfolioId,
  );
  // Personal roll-ups that used to live on Home. They are inherently
  // cross-workspace, so the portfolio is where they belong; the scoped
  // equivalents stay in each workspace's Attention, My Work, and Updates.
  const scopedHubIds = new Set(scope.hubs.map((hub) => hub.id));
  const meaningfulChanges = changesSinceCheckpoint(
    demoMeaningfulChanges,
    demoChangeCheckpoint,
  ).filter((change) => scopedHubIds.has(change.hubId));
  const topNeedsYou = scope.attention.slice(0, 4);
  const todayItems = scope.items
    .filter((item) => item.status !== "done")
    .slice(0, 5);

  const portfolios = [
    ...demoPortfolios,
    ...customPortfolioRecords.map((record) => record.portfolio),
  ];
  const portfolio = portfolios.find((item) => item.id === portfolioId);
  const portfolioVisual = portfolio
    ? portfolioVisualFor(portfolio, customPortfolioRecords)
    : undefined;
  const summary = useMemo(
    () => (portfolio ? summarizePortfolio(portfolio) : undefined),
    [portfolio],
  );
  const projects = [
    ...customHubs.map(({ hub }) => ({
      hub,
      rollup: {
        open: 0,
        overdue: 0,
        blocked: 0,
        decisions: 0,
        approvals: 0,
        score: 0,
      },
      progress: null,
    })),
    ...(summary?.projects ?? []),
  ].filter((project) => health === "all" || project.hub.health === health);
  const projectCount = (summary?.count ?? 0) + customHubs.length;
  const healthMix = summary
    ? summary.health.map((slice) =>
        slice.key === "on_track"
          ? { ...slice, count: slice.count + customHubs.length }
          : slice,
      )
    : [
        { key: "critical", label: "Critical", count: 0 },
        { key: "watch", label: "Watch", count: 0 },
        { key: "on_track", label: "On track", count: customHubs.length },
        { key: "parked", label: "Parked", count: 0 },
      ];
  const signals = scope.breakdown;

  const cards = [
    {
      key: "decisions" as const,
      icon: FileQuestion,
      count: signals.decisions,
      label: "Decisions due",
      note: copy.portfolio.needsDecision,
    },
    {
      key: "blocked" as const,
      icon: Blocks,
      count: signals.blocked,
      label: copy.portfolio.blockedItems,
      note: copy.portfolio.aging,
    },
    {
      key: "approvals" as const,
      icon: ClipboardCheck,
      count: signals.approvals,
      label: copy.portfolio.approvalsDue,
      note: copy.portfolio.dueSoon,
    },
    {
      key: "overdueMilestones" as const,
      icon: AlertTriangle,
      count: signals.overdueMilestones,
      label: copy.portfolio.overdueMilestones,
      note: copy.portfolio.behindPlan,
    },
    {
      key: "unassignedUrgent" as const,
      icon: Users,
      count: signals.unassignedUrgent,
      label: copy.portfolio.unassignedUrgent,
      note: copy.portfolio.needsOwner,
    },
    {
      key: "staleUpdates" as const,
      icon: CircleDashed,
      count: signals.staleUpdates,
      label: copy.portfolio.staleUpdates,
      note: copy.portfolio.updateNeeded,
    },
  ];

  // Live signals first, then by severity — so the panel reads top-left down.
  const toneRank: Record<SignalTone, number> = {
    critical: 0,
    high: 1,
    normal: 2,
  };
  const orderedCards = [...cards].sort((left, right) => {
    if (left.count > 0 !== right.count > 0) return left.count > 0 ? -1 : 1;
    return toneRank[SIGNAL_TONES[left.key]] - toneRank[SIGNAL_TONES[right.key]];
  });
  const detailEntries = useMemo(() => {
    if (!detail) return [];
    if (detail === "staleUpdates") {
      return scope.hubs
        .filter((hub) =>
          scope.attention.some(
            (group) =>
              group.hubId === hub.id &&
              group.signals.some((signal) =>
                ["stale_update", "missing_update"].includes(signal.signalType),
              ),
          ),
        )
        .map((hub) => ({
          id: hub.id,
          title: hub.name,
          note: hub.healthNote,
          hub,
          view: undefined as WorkspaceView | undefined,
        }));
    }

    return scope.items
      .filter((item) => {
        if (item.status === "done") return false;
        if (detail === "attention")
          return scope.attention.some((group) => group.entityId === item.id);
        if (detail === "decisions") return item.type === "decision";
        if (detail === "approvals") return item.type === "approval";
        if (detail === "blocked") return item.status === "blocked";
        if (detail === "unassignedUrgent")
          return item.priority === "urgent" && !item.assignee;
        return (
          item.type === "milestone" &&
          Boolean(item.dueDate && item.dueDate < "2026-08-28")
        );
      })
      .map((item) => {
        const hub = scope.hubs.find(
          (candidate) => candidate.id === item.hubId,
        )!;
        const view: WorkspaceView =
          detail === "decisions"
            ? "decisions"
            : detail === "approvals"
              ? "approvals"
              : detail === "unassignedUrgent"
                ? "team"
                : "attention";
        return {
          id: item.id,
          title: item.title,
          note: `${hub.name} · ${item.status.replaceAll("_", " ")}`,
          hub,
          view,
        };
      });
  }, [detail, scope.attention, scope.hubs, scope.items]);
  const detailTitle =
    detail === "attention"
      ? "Portfolio attention"
      : (cards.find((card) => card.key === detail)?.label ??
        "Portfolio detail");

  return (
    <main className="trevv-main portfolio-main">
      <PageHero
        eyebrow={
          <>
            Portfolio · {projectCount}{" "}
            {projectCount === 1 ? "workspace" : "workspaces"}
          </>
        }
        title={portfolio?.name ?? vocab.groupOne}
        subtitle={`${portfolio?.description ?? copy.portfolio.subtitle} This page is the cumulative view across every accessible workspace. Choose a workspace below when you need its detailed operational view.`}
        {...(portfolioVisual
          ? {
              accent: portfolioVisual.accent,
              monogram: portfolioVisual.mark,
            }
          : {})}
        hintId="portfolios"
        badge={
          <span className="scope-view-badge portfolio-scope-badge">
            <Grid2X2 size={13} />
            Portfolio view
          </span>
        }
        selector={
          <label className="hero-select portfolio-hero-control">
            <span>{vocab.groupOne}</span>
            <div className="portfolio-hero-select-shell">
              <span className="portfolio-hero-select-mark" aria-hidden="true">
                {portfolioVisual?.mark ?? "P"}
              </span>
              <select
                aria-label="Choose portfolio"
                value={portfolioId}
                onChange={(event) => setPortfolioId(event.target.value)}
              >
                {portfolios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="portfolio-hero-select-chevron"
                size={16}
                aria-hidden="true"
              />
            </div>
          </label>
        }
        stats={
          <>
            <StatTile
              icon={Sparkles}
              value={scope.attentionCount}
              label="Need you"
              note="Across this portfolio"
              tone="danger"
              onClick={() => setDetail("attention")}
            />
            <StatTile
              icon={AlertTriangle}
              value={summary?.overdue ?? 0}
              label="Overdue"
              note="Past their due date"
              tone="warning"
              onClick={() => setDetail("overdueMilestones")}
            />
            <StatTile
              icon={Blocks}
              value={summary?.blocked ?? 0}
              label="Blocked"
              note="Waiting on a dependency"
              tone="warning"
              onClick={() => setDetail("blocked")}
            />
            <StatTile
              icon={Grid2X2}
              value={summary?.progress !== null ? `${summary?.progress}%` : "—"}
              label="Mean progress"
              note="Across reporting work"
              tone="primary"
              {...(summary?.progress !== null
                ? { meter: summary?.progress ?? 0 }
                : {})}
            />
          </>
        }
      />

      {summary && (
        <Panel
          icon={Grid2X2}
          title="Health mix"
          subtitle={`How the ${summary.count} ${summary.count === 1 ? vocab.one.toLowerCase() : vocab.many.toLowerCase()} in this ${vocab.groupOne.toLowerCase()} are doing right now.`}
          wide
        >
          <div className="health-mix">
            <HealthBar slices={healthMix} />
            {summary.focus && (
              <p className="health-focus">
                <b>Most urgent</b>
                <Link href={workspaceHref(summary.focus.hub.slug)}>
                  {summary.focus.hub.name}
                </Link>
                <span>{summary.focus.hub.healthNote}</span>
              </p>
            )}
          </div>
        </Panel>
      )}

      <Panel
        icon={Sparkles}
        title={copy.portfolio.attentionTitle}
        subtitle={copy.portfolio.attentionSubtitle}
        aside={
          <span className="signal-total">
            {scope.attentionCount} {copy.common.signals}
          </span>
        }
        wide
      >
        <div className="signal-grid">
          {orderedCards.map((card) => (
            <SignalCard
              key={card.key}
              onClick={() => setDetail(card.key)}
              tone={SIGNAL_TONES[card.key]}
              icon={card.icon}
              count={card.count}
              label={card.label}
              note={card.note}
            />
          ))}
        </div>
        <div className="attention-foot">
          <span>
            <span className="live-dot" />
            {copy.portfolio.dataNote}
          </span>
        </div>
      </Panel>

      <div className="home-columns">
        <Panel
          icon={Sparkles}
          title="Needs You"
          subtitle={`Top ${topNeedsYou.length} of ${scope.attentionCount}, ranked by impact, urgency, and your responsibility.`}
        >
          <div className="attention-list compact">
            {topNeedsYou.map((group) => (
              <AttentionRow key={group.id} group={group} />
            ))}
          </div>
        </Panel>
        <Panel
          icon={Clock3}
          title="Today"
          subtitle="The commitments closest to now."
        >
          <div className="today-list">
            {todayItems.map((item) => (
              <Link
                key={item.id}
                href={`${workspaceHref(hubFor(item.hubId)!.slug)}/boards/${item.boardId}`}
              >
                <span className={`priority-dot ${item.priority}`} />
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {hubFor(item.hubId)?.name} · {item.dueDate ?? "No date"}
                  </small>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        icon={RefreshCw}
        title="Change Radar"
        subtitle="Meaningful movement since your last visit — routine activity is filtered out."
        wide
      >
        <div className="change-groups">
          {[...new Set(meaningfulChanges.map((change) => change.hubId))].map(
            (hubId) => {
              const hub = hubFor(hubId);
              const hubChanges = meaningfulChanges.filter(
                (change) => change.hubId === hubId,
              );
              if (!hub) return null;
              return (
                <Link
                  className="change-group-card"
                  href={workspaceHref(hub.slug, undefined, "updates")}
                  aria-label={`Open ${hub.name} and review ${hubChanges.length} meaningful ${hubChanges.length === 1 ? "change" : "changes"}`}
                  key={hubId}
                >
                  <article>
                    <header>
                      <HubMark hubId={hubId} />
                      <div>
                        <strong>{hub.name}</strong>
                        <small>
                          {hubChanges.length} meaningful{" "}
                          {hubChanges.length === 1 ? "change" : "changes"}
                        </small>
                      </div>
                      <ArrowRight className="change-group-arrow" size={15} />
                    </header>
                    <ul>
                      {hubChanges.map((change) => (
                        <li key={change.id}>{change.summary}</li>
                      ))}
                    </ul>
                  </article>
                </Link>
              );
            },
          )}
        </div>
      </Panel>

      <Panel
        icon={Grid2X2}
        title="Workspaces"
        subtitle="Select a workspace to enter its complete operational view. Prioritized here by health, urgency, and update freshness."
        aside={
          <div className="filters">
            <select
              aria-label={copy.portfolio.allHealth}
              value={health}
              onChange={(event) =>
                setHealth(event.target.value as HubHealth | "all")
              }
            >
              <option value="all">{copy.portfolio.allHealth}</option>
              <option value="critical">{copy.health.critical}</option>
              <option value="watch">{copy.health.watch}</option>
              <option value="on_track">{copy.health.on_track}</option>
              <option value="parked">{copy.health.parked}</option>
            </select>
            <button
              className={showMetrics ? "filter-toggle on" : "filter-toggle"}
              aria-pressed={showMetrics}
              onClick={() => setShowMetrics((current) => !current)}
            >
              Metrics
              <ChevronDown size={14} />
            </button>
          </div>
        }
        wide
      >
        <div className="project-grid">
          {projects.map((project) => (
            <ProjectTile
              key={project.hub.id}
              {...project}
              copy={copy}
              showMetrics={showMetrics}
            />
          ))}
        </div>
      </Panel>
      {detail && (
        <div
          className="portfolio-detail-layer"
          role="presentation"
          onMouseDown={() => setDetail(null)}
        >
          <section
            className="portfolio-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="portfolio-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>Portfolio roll-up</small>
                <h2 id="portfolio-detail-title">{detailTitle}</h2>
                <p>
                  Review the cross-workspace picture here, then enter a specific
                  workspace only when you want to act.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close portfolio detail"
                onClick={() => setDetail(null)}
              >
                <X size={17} />
              </button>
            </header>
            <div className="portfolio-detail-list">
              {detailEntries.map((entry) => (
                <article key={entry.id}>
                  <span
                    style={{
                      background: `${entry.hub.accent}18`,
                      color: entry.hub.accent,
                    }}
                  >
                    {entry.hub.icon}
                  </span>
                  <div>
                    <strong>{entry.title}</strong>
                    <small>{entry.note}</small>
                  </div>
                  <Link href={workspaceHref(entry.hub.slug, entry.view)}>
                    Open workspace <ArrowRight size={13} />
                  </Link>
                </article>
              ))}
              {!detailEntries.length && (
                <div className="portfolio-detail-empty">
                  <ClipboardCheck size={20} />
                  <strong>Nothing is waiting here</strong>
                  <span>This roll-up is currently clear.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function SignalCard({
  tone,
  icon: Icon,
  count,
  label,
  note,
  onClick,
}: {
  tone: SignalTone;
  icon: typeof FileQuestion;
  count: number;
  label: string;
  note: string;
  onClick: () => void;
}) {
  const clear = count === 0;
  return (
    <button
      type="button"
      className={`signal-card signal-${tone} ${clear ? "is-clear" : ""}`}
      onClick={onClick}
    >
      <span className="signal-icon">
        <Icon size={17} />
      </span>
      <span>
        <strong>{count}</strong>
        <b>{label}</b>
        <small>{clear ? "Nothing waiting" : note}</small>
      </span>
      <span className="signal-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}
