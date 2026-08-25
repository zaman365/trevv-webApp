"use client";

import {
  AlertTriangle,
  Blocks,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  FileQuestion,
  Grid2X2,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { demoPortfolios, type HubHealth } from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SIGNAL_TONES, type SignalTone } from "@/lib/attention";
import { summarizePortfolio } from "@/lib/portfolios";
import { vocabularyFor } from "@/lib/terminology";
import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceFrame } from "./workspace-frame";
import { ProjectTile } from "./project-tile";
import { HealthBar, PageHero, Panel, StatTile } from "./ui-kit";

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

  const portfolio = demoPortfolios.find((item) => item.id === portfolioId);
  const summary = useMemo(
    () => (portfolio ? summarizePortfolio(portfolio) : undefined),
    [portfolio],
  );
  const projects = (summary?.projects ?? []).filter(
    (project) => health === "all" || project.hub.health === health,
  );
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

  return (
    <main className="trevv-main portfolio-main">
      <PageHero
        eyebrow={
          <>
            {vocab.groupOne} · {summary?.count ?? 0} {vocab.many.toLowerCase()}
          </>
        }
        title={portfolio?.name ?? vocab.groupOne}
        subtitle={portfolio?.description ?? copy.portfolio.subtitle}
        selector={
          <label className="hero-select">
            <span>{vocab.groupOne}</span>
            <select
              value={portfolioId}
              onChange={(event) => setPortfolioId(event.target.value)}
            >
              {demoPortfolios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        }
        actions={
          <button className="primary-button">
            <Plus size={17} />
            <span>New {vocab.one.toLowerCase()}</span>
          </button>
        }
        stats={
          <>
            <StatTile
              icon={Sparkles}
              value={scope.attentionCount}
              label="Need you"
              note="Across this portfolio"
              tone="danger"
              href="/app/attention"
            />
            <StatTile
              icon={AlertTriangle}
              value={summary?.overdue ?? 0}
              label="Overdue"
              note="Past their due date"
              tone="warning"
            />
            <StatTile
              icon={Blocks}
              value={summary?.blocked ?? 0}
              label="Blocked"
              note="Waiting on a dependency"
              tone="warning"
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
            <HealthBar slices={summary.health} />
            {summary.focus && (
              <p className="health-focus">
                <b>Most urgent</b>
                <Link href={`/app/hubs/${summary.focus.hub.slug}`}>
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
        href="/app/attention"
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

      <Panel
        icon={Grid2X2}
        title={vocab.many}
        subtitle="Prioritized by health, urgency, and update freshness."
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
    </main>
  );
}

function SignalCard({
  tone,
  icon: Icon,
  count,
  label,
  note,
}: {
  tone: SignalTone;
  icon: typeof FileQuestion;
  count: number;
  label: string;
  note: string;
}) {
  const clear = count === 0;
  return (
    <button className={`signal-card signal-${tone} ${clear ? "is-clear" : ""}`}>
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
