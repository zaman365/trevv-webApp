"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Blocks,
  CalendarClock,
  ChartColumn,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  FileQuestion,
  FolderKanban,
  Grid2X2,
  Layers3,
  Maximize2,
  Plus,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  changesSinceCheckpoint,
  demoChangeCheckpoint,
  demoMeaningfulChanges,
  demoPortfolios,
  type HubHealth,
} from "@founderhq/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SIGNAL_TONES, type SignalTone } from "@/lib/attention";
import { summarizePortfolio } from "@/lib/portfolios";
import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceFrame } from "./workspace-frame";
import { ProjectTile } from "./project-tile";
import { HealthBar, PageHero, Panel, StatTile } from "./ui-kit";
import { BarChart, DonutChart, type Bar, type Slice } from "./charts";
import { useCustomHubs } from "@/lib/custom-hubs";
import {
  portfolioVisualFor,
  useCustomPortfolios,
} from "@/lib/custom-portfolios";

type ExpandedView =
  "attention" | "reporting" | "workspaces" | "milestones" | "updates";

const statusMeta = {
  not_started: { label: "Not started", color: "var(--fh-parked)" },
  working: { label: "Working", color: "var(--fh-warning)" },
  review: { label: "In review", color: "var(--fh-info)" },
  blocked: { label: "Blocked", color: "var(--fh-danger)" },
  done: { label: "Done", color: "var(--fh-success)" },
} as const;

const priorityMeta = {
  urgent: { label: "Urgent", color: "var(--fh-danger)" },
  high: { label: "High", color: "var(--fh-warning)" },
  normal: { label: "Normal", color: "var(--fh-info)" },
  low: { label: "Low", color: "var(--fh-parked)" },
} as const;

const expandedViewCopy: Record<
  ExpandedView,
  { eyebrow: string; title: string; note: string }
> = {
  attention: {
    eyebrow: "Portfolio attention",
    title: "Everything currently asking for intervention",
    note: "Grouped across workspaces so the same underlying item is never counted twice.",
  },
  reporting: {
    eyebrow: "Portfolio reporting",
    title: "Work distribution and ownership",
    note: "A cumulative diagnostic view. Open a workspace to change source work or operating structure.",
  },
  workspaces: {
    eyebrow: "Portfolio workspaces",
    title: "Complete workspace rollup",
    note: "Portfolio-level health and commitments for every workspace, with direct paths to the detailed operating view.",
  },
  milestones: {
    eyebrow: "Portfolio timeline",
    title: "All workspace milestones and dependencies",
    note: "Dates and waits are combined here to expose collisions that are difficult to see inside one workspace.",
  },
  updates: {
    eyebrow: "Portfolio activity",
    title: "Meaningful changes and workspace updates",
    note: "Informational movement across the portfolio. Work requiring action is separated into the attention section.",
  },
};

export function PortfolioExperience() {
  return (
    <WorkspaceFrame active="portfolio">
      <PortfolioMain />
    </WorkspaceFrame>
  );
}

function PortfolioMain() {
  const { copy, scope, portfolioId, setPortfolioId } = useWorkspace();
  const [health, setHealth] = useState<HubHealth | "all">("all");
  const [showMetrics, setShowMetrics] = useState(true);
  const [expandedView, setExpandedView] = useState<ExpandedView | null>(null);
  const customPortfolioRecords = useCustomPortfolios();
  const allCustomHubs = useCustomHubs();
  const customHubs = allCustomHubs.filter(
    (record) => record.hub.portfolioId === portfolioId,
  );
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
  const allProjects = [
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
  ];
  const projects = allProjects.filter(
    (project) => health === "all" || project.hub.health === health,
  );
  const projectCount = allProjects.length;
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
  const openItems = scope.items.filter((item) => item.status !== "done");
  const doneItems = scope.items.filter((item) => item.status === "done");
  const meanProgress = summary?.progress ?? null;
  const statusSlices: Slice[] = Object.entries(statusMeta).map(
    ([key, meta]) => ({
      key,
      label: meta.label,
      value: scope.items.filter((item) => item.status === key).length,
      color: meta.color,
    }),
  );
  const prioritySlices: Slice[] = Object.entries(priorityMeta).map(
    ([key, meta]) => ({
      key,
      label: meta.label,
      value: openItems.filter((item) => item.priority === key).length,
      color: meta.color,
    }),
  );
  const workspaceBars: Bar[] = [...allProjects]
    .sort((left, right) => right.rollup.open - left.rollup.open)
    .map((project) => ({
      key: project.hub.id,
      label: project.hub.name,
      value: project.rollup.open,
      color: project.hub.accent,
      badge: (
        <span
          className="portfolio-chart-mark"
          style={{
            background: `${project.hub.accent}18`,
            color: project.hub.accent,
          }}
        >
          {project.hub.icon}
        </span>
      ),
    }));
  const ownerBars = [
    ...new Set(openItems.map((item) => item.assignee ?? "Unassigned")),
  ]
    .map((owner) => ({
      key: owner,
      label: owner,
      value: openItems.filter(
        (item) => (item.assignee ?? "Unassigned") === owner,
      ).length,
      badge: (
        <span className="portfolio-chart-mark neutral">
          {owner === "Unassigned"
            ? "?"
            : owner
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
        </span>
      ),
    }))
    .sort((left, right) => right.value - left.value);
  const milestones = [...allProjects].sort((left, right) =>
    left.hub.nextMilestone.date.localeCompare(right.hub.nextMilestone.date),
  );
  const recentUpdates = [...allProjects].sort((left, right) =>
    right.hub.latestUpdate.date.localeCompare(left.hub.latestUpdate.date),
  );
  const meaningfulChanges = changesSinceCheckpoint(
    demoMeaningfulChanges,
    demoChangeCheckpoint,
  ).filter((change) => change.portfolioId === portfolioId);
  const signalCards = [
    {
      key: "decisions" as const,
      icon: FileQuestion,
      count: signals.decisions,
      label: "Decisions due",
      note: copy.portfolio.needsDecision,
      href: "/app/decisions",
    },
    {
      key: "blocked" as const,
      icon: Blocks,
      count: signals.blocked,
      label: copy.portfolio.blockedItems,
      note: copy.portfolio.aging,
      href: "/app/attention#blocked",
    },
    {
      key: "approvals" as const,
      icon: ClipboardCheck,
      count: signals.approvals,
      label: copy.portfolio.approvalsDue,
      note: copy.portfolio.dueSoon,
      href: "/app/approvals",
    },
    {
      key: "overdueMilestones" as const,
      icon: AlertTriangle,
      count: signals.overdueMilestones,
      label: copy.portfolio.overdueMilestones,
      note: copy.portfolio.behindPlan,
      href: "/app/attention#overdue",
    },
    {
      key: "unassignedUrgent" as const,
      icon: Users,
      count: signals.unassignedUrgent,
      label: copy.portfolio.unassignedUrgent,
      note: copy.portfolio.needsOwner,
      href: "/app/team",
    },
    {
      key: "staleUpdates" as const,
      icon: CircleDashed,
      count: signals.staleUpdates,
      label: copy.portfolio.staleUpdates,
      note: copy.portfolio.updateNeeded,
      href: "/app/attention#stale",
    },
  ].sort((left, right) => {
    if (left.count > 0 !== right.count > 0) return left.count > 0 ? -1 : 1;
    const rank: Record<SignalTone, number> = {
      critical: 0,
      high: 1,
      normal: 2,
    };
    return rank[SIGNAL_TONES[left.key]] - rank[SIGNAL_TONES[right.key]];
  });

  useEffect(() => {
    if (!expandedView) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedView(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expandedView]);

  return (
    <main className="trevv-main portfolio-main portfolio-command-page">
      <PageHero
        eyebrow={`Portfolio · cumulative view of ${projectCount} ${projectCount === 1 ? "workspace" : "workspaces"}`}
        title={`${portfolio?.name ?? "Portfolio"} overview`}
        subtitle={`This is the single cumulative view across every workspace in ${portfolio?.name ?? "this portfolio"}. Health, work, decisions, milestones, ownership, and meaningful updates roll up here; boards, discussions, files, and execution detail remain inside each workspace.`}
        {...(portfolioVisual
          ? {
              accent: portfolioVisual.accent,
              monogram: portfolioVisual.mark,
            }
          : {})}
        hintId="portfolios"
        badge={
          <span className="scope-view-badge portfolio-scope-badge">
            <Layers3 size={13} />
            All workspaces combined
          </span>
        }
        selector={
          <label className="hero-select">
            <span>Portfolio</span>
            <select
              value={portfolioId}
              onChange={(event) => setPortfolioId(event.target.value)}
            >
              {portfolios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        }
        actions={
          <Link className="primary-button" href="/app/hubs?create=project">
            <Plus size={17} />
            <span>New workspace</span>
          </Link>
        }
        stats={
          <>
            <StatTile
              icon={FolderKanban}
              value={projectCount}
              label="Workspaces"
              note="Included in this rollup"
              onClick={() => setExpandedView("workspaces")}
            />
            <StatTile
              icon={Sparkles}
              value={scope.attentionCount}
              label="Need intervention"
              note="Across the portfolio"
              tone="danger"
              onClick={() => setExpandedView("attention")}
            />
            <StatTile
              icon={AlertTriangle}
              value={summary?.overdue ?? 0}
              label="Overdue"
              note="Open work past due"
              tone="warning"
              onClick={() => setExpandedView("reporting")}
            />
            <StatTile
              icon={Grid2X2}
              value={meanProgress !== null ? `${meanProgress}%` : "—"}
              label="Mean progress"
              note={`${doneItems.length} completed work items`}
              tone="primary"
              {...(meanProgress !== null ? { meter: meanProgress } : {})}
              onClick={() => setExpandedView("reporting")}
            />
          </>
        }
      />

      <section className="portfolio-scope-explainer" aria-label="View scope">
        <span className="portfolio-scope-icon">
          <Layers3 size={18} />
        </span>
        <div>
          <strong>One portfolio page, every workspace summarized</strong>
          <p>
            Use this page to compare, prioritize, and spot cross-workspace
            pressure. Open an individual workspace when you need its boards,
            detailed work, conversations, evidence, or operating settings.
          </p>
        </div>
        <Link href="/app/hubs">
          Choose a workspace <ArrowRight size={14} />
        </Link>
      </section>

      <div className="portfolio-overview-grid">
        <Panel
          icon={Activity}
          title="Workspace health"
          subtitle={`Current health across all ${projectCount} workspaces.`}
          aside={
            <ExpandButton
              label="Expand workspace health"
              onClick={() => setExpandedView("workspaces")}
            />
          }
        >
          <div className="portfolio-health-overview">
            <HealthBar slices={healthMix} />
            {summary?.focus ? (
              <p className="health-focus">
                <b>Highest pressure</b>
                <Link href={`/app/hubs/${summary.focus.hub.slug}`}>
                  {summary.focus.hub.name}
                </Link>
                <span>{summary.focus.hub.healthNote}</span>
              </p>
            ) : (
              <p className="portfolio-clear-state">
                <CheckCircle2 size={17} /> No workspace pressure recorded yet.
              </p>
            )}
          </div>
        </Panel>

        <Panel
          icon={ChartColumn}
          title="Work state"
          subtitle={`${scope.items.length} work items combined across the portfolio.`}
          aside={
            <ExpandButton
              label="Expand portfolio reporting"
              onClick={() => setExpandedView("reporting")}
            />
          }
        >
          <div className="portfolio-donut-wrap">
            <DonutChart
              slices={statusSlices}
              size={158}
              thickness={24}
              totalLabel="items"
            />
          </div>
        </Panel>
      </div>

      <Panel
        icon={Sparkles}
        title="Portfolio attention"
        subtitle="Decision, blockage, approval, milestone, ownership, and update signals from every workspace—ranked before routine activity."
        aside={
          <div className="portfolio-panel-actions">
            <span className="signal-total">
              {scope.attentionCount} {copy.common.signals}
            </span>
            <ExpandButton
              label="Expand portfolio attention"
              onClick={() => setExpandedView("attention")}
            />
          </div>
        }
        wide
      >
        <div className="signal-grid">
          {signalCards.map((card) => (
            <SignalCard
              key={card.key}
              href={card.href}
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
          <Link href="/app/attention">
            Work the prioritized queue <ArrowRight size={13} />
          </Link>
        </div>
      </Panel>

      <Panel
        icon={ChartColumn}
        title="Workload by workspace"
        subtitle="Open commitments reveal where the portfolio is carrying its operating load."
        aside={
          <ExpandButton
            label="Expand portfolio reporting"
            onClick={() => setExpandedView("reporting")}
          />
        }
        wide
      >
        <div className="portfolio-workload-chart">
          <BarChart
            bars={workspaceBars}
            height={175}
            emptyNote="No workspace work has been created yet."
          />
        </div>
      </Panel>

      <Panel
        icon={FolderKanban}
        title="Workspace portfolio"
        subtitle="Each card is a rolled-up workspace summary. Open one for its detailed operating view."
        aside={
          <div className="portfolio-panel-actions">
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
                Metrics <ChevronDown size={14} />
              </button>
            </div>
            <ExpandButton
              label="Expand all workspace summaries"
              onClick={() => setExpandedView("workspaces")}
            />
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
        {!projects.length && (
          <div className="portfolio-empty-workspaces">
            <FolderKanban size={20} />
            <strong>No workspace matches this health filter</strong>
            <button onClick={() => setHealth("all")}>
              Show all workspaces
            </button>
          </div>
        )}
      </Panel>

      <div className="portfolio-overview-grid portfolio-lower-grid">
        <Panel
          icon={CalendarClock}
          title="Milestones and waits"
          subtitle="The next commitments and dependencies across workspaces."
          aside={
            <ExpandButton
              label="Expand portfolio timeline"
              onClick={() => setExpandedView("milestones")}
            />
          }
        >
          <div className="portfolio-milestone-list">
            {milestones.slice(0, 5).map((project) => (
              <Link href={`/app/hubs/${project.hub.slug}`} key={project.hub.id}>
                <span
                  className="portfolio-list-mark"
                  style={{
                    background: `${project.hub.accent}18`,
                    color: project.hub.accent,
                  }}
                >
                  {project.hub.icon}
                </span>
                <div>
                  <strong>{project.hub.nextMilestone.title}</strong>
                  <small>{project.hub.name}</small>
                </div>
                <time>{formatDate(project.hub.nextMilestone.date)}</time>
              </Link>
            ))}
          </div>
          <div className="portfolio-wait-summary">
            <Clock3 size={15} />
            <span>
              <strong>{scope.waiting.length} active waits</strong>
              Dependencies involving owners, teams, clients, and partners.
            </span>
            <Link href="/app/waiting">Open Waiting Center</Link>
          </div>
        </Panel>

        <Panel
          icon={BellRing}
          title="Updates and notifications"
          subtitle="Meaningful movement from every workspace, without routine noise."
          aside={
            <ExpandButton
              label="Expand portfolio updates"
              onClick={() => setExpandedView("updates")}
            />
          }
        >
          <div className="portfolio-update-list">
            {meaningfulChanges.slice(0, 3).map((change) => {
              const project = allProjects.find(
                (candidate) => candidate.hub.id === change.hubId,
              );
              return (
                <article key={change.id}>
                  <span className="portfolio-update-icon">
                    <Activity size={14} />
                  </span>
                  <div>
                    <strong>{change.summary}</strong>
                    <small>
                      {project?.hub.name ?? "Portfolio"} · Meaningful change
                    </small>
                  </div>
                </article>
              );
            })}
            {recentUpdates
              .slice(0, Math.max(0, 4 - meaningfulChanges.length))
              .map((project) => (
                <article key={project.hub.id}>
                  <span
                    className="portfolio-list-mark"
                    style={{
                      background: `${project.hub.accent}18`,
                      color: project.hub.accent,
                    }}
                  >
                    {project.hub.icon}
                  </span>
                  <div>
                    <strong>{project.hub.latestUpdate.text}</strong>
                    <small>
                      {project.hub.name} ·{" "}
                      {formatDate(project.hub.latestUpdate.date)}
                    </small>
                  </div>
                </article>
              ))}
          </div>
          <div className="portfolio-notification-footer">
            <span>
              Informational only. Items requiring action are already ranked
              above.
            </span>
            <Link href="/app/notifications">Notification center</Link>
          </div>
        </Panel>
      </div>

      <section className="portfolio-detail-boundary">
        <span>
          <FolderKanban size={20} />
        </span>
        <div>
          <strong>
            Portfolio overview ends where workspace execution begins
          </strong>
          <p>
            Open a workspace for boards, owners, dates, conversations,
            documents, evidence, automations, and detailed history. This page
            stays cumulative so portfolio decisions remain understandable.
          </p>
        </div>
        <Link href="/app/hubs">
          Browse workspaces <ArrowRight size={14} />
        </Link>
      </section>

      {expandedView && (
        <div
          className="portfolio-detail-layer"
          role="presentation"
          onMouseDown={() => setExpandedView(null)}
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
                <p>{expandedViewCopy[expandedView].eyebrow}</p>
                <h2 id="portfolio-detail-title">
                  {expandedViewCopy[expandedView].title}
                </h2>
                <span>{expandedViewCopy[expandedView].note}</span>
              </div>
              <button
                type="button"
                onClick={() => setExpandedView(null)}
                aria-label="Close expanded portfolio view"
              >
                <X size={18} />
              </button>
            </header>
            <div className="portfolio-detail-body">
              {expandedView === "attention" && (
                <div className="portfolio-detail-attention">
                  {scope.attention.map((group, index) => {
                    const project = allProjects.find(
                      (candidate) => candidate.hub.id === group.hubId,
                    );
                    return (
                      <article key={group.id}>
                        <span className={`severity-rank ${group.severity}`}>
                          {index + 1}
                        </span>
                        <div>
                          <small>
                            {project?.hub.name ?? "Portfolio"} ·{" "}
                            {group.severity}
                          </small>
                          <strong>{group.title}</strong>
                          <p>{group.reasons.join(" · ")}</p>
                        </div>
                        {project && (
                          <Link href={`/app/hubs/${project.hub.slug}`}>
                            Open workspace <ArrowRight size={13} />
                          </Link>
                        )}
                      </article>
                    );
                  })}
                  {!scope.attention.length && (
                    <p className="portfolio-clear-state large">
                      <CheckCircle2 size={20} /> Nothing needs intervention in
                      this portfolio.
                    </p>
                  )}
                </div>
              )}

              {expandedView === "reporting" && (
                <div className="portfolio-detail-reporting">
                  <section>
                    <header>
                      <h3>Work by status</h3>
                      <span>{scope.items.length} total work items</span>
                    </header>
                    <DonutChart
                      slices={statusSlices}
                      size={180}
                      thickness={28}
                      totalLabel="items"
                    />
                  </section>
                  <section>
                    <header>
                      <h3>Open work by priority</h3>
                      <span>{openItems.length} open commitments</span>
                    </header>
                    <DonutChart
                      slices={prioritySlices}
                      size={180}
                      thickness={28}
                      totalLabel="open"
                    />
                  </section>
                  <section className="wide">
                    <header>
                      <h3>Ownership load</h3>
                      <span>Open commitments by accountable owner</span>
                    </header>
                    <BarChart
                      bars={ownerBars}
                      height={190}
                      emptyNote="No open ownership data."
                    />
                  </section>
                </div>
              )}

              {expandedView === "workspaces" && (
                <div className="project-grid portfolio-dialog-projects">
                  {allProjects.map((project) => (
                    <ProjectTile
                      key={project.hub.id}
                      {...project}
                      copy={copy}
                      showMetrics
                    />
                  ))}
                </div>
              )}

              {expandedView === "milestones" && (
                <div className="portfolio-detail-timeline">
                  {milestones.map((project) => (
                    <article key={project.hub.id}>
                      <time>{formatDate(project.hub.nextMilestone.date)}</time>
                      <span
                        style={{ background: project.hub.accent }}
                        aria-hidden="true"
                      />
                      <div>
                        <small>{project.hub.name}</small>
                        <strong>{project.hub.nextMilestone.title}</strong>
                        <p>{project.hub.priority}</p>
                      </div>
                      <Link href={`/app/hubs/${project.hub.slug}`}>
                        Workspace <ArrowRight size={13} />
                      </Link>
                    </article>
                  ))}
                  {scope.waiting.map((waiting) => {
                    const project = allProjects.find(
                      (candidate) => candidate.hub.id === waiting.hubId,
                    );
                    return (
                      <article className="is-wait" key={waiting.id}>
                        <time>
                          {formatDate(
                            waiting.expectedBy ?? waiting.waitingSince,
                          )}
                        </time>
                        <span aria-hidden="true" />
                        <div>
                          <small>
                            {project?.hub.name ?? "Portfolio"} · Waiting
                          </small>
                          <strong>{waiting.title}</strong>
                          <p>
                            Waiting on{" "}
                            {waiting.waitingLabel ?? waiting.waitingType}
                          </p>
                        </div>
                        <Link href="/app/waiting">Follow up</Link>
                      </article>
                    );
                  })}
                </div>
              )}

              {expandedView === "updates" && (
                <div className="portfolio-detail-updates">
                  {meaningfulChanges.map((change) => {
                    const project = allProjects.find(
                      (candidate) => candidate.hub.id === change.hubId,
                    );
                    return (
                      <article key={change.id}>
                        <span className="portfolio-update-icon">
                          <Activity size={15} />
                        </span>
                        <div>
                          <small>
                            {project?.hub.name ?? "Portfolio"} · Meaningful
                            change
                          </small>
                          <strong>{change.summary}</strong>
                        </div>
                        {project && (
                          <Link href={`/app/hubs/${project.hub.slug}`}>
                            Open <ArrowRight size={13} />
                          </Link>
                        )}
                      </article>
                    );
                  })}
                  {recentUpdates.map((project) => (
                    <article key={project.hub.id}>
                      <span
                        className="portfolio-list-mark"
                        style={{
                          background: `${project.hub.accent}18`,
                          color: project.hub.accent,
                        }}
                      >
                        {project.hub.icon}
                      </span>
                      <div>
                        <small>
                          {project.hub.name} ·{" "}
                          {formatDate(project.hub.latestUpdate.date)}
                        </small>
                        <strong>{project.hub.latestUpdate.text}</strong>
                      </div>
                      <Link href={`/app/hubs/${project.hub.slug}`}>
                        Open <ArrowRight size={13} />
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <footer>
              <span>
                Portfolio rollup · source detail remains in each workspace
              </span>
              <button type="button" onClick={() => setExpandedView(null)}>
                Close overview
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function ExpandButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="portfolio-expand-button"
      aria-label={label}
      onClick={onClick}
    >
      <Maximize2 size={13} />
      Expand
    </button>
  );
}

function SignalCard({
  tone,
  icon: Icon,
  count,
  label,
  note,
  href,
}: {
  tone: SignalTone;
  icon: typeof FileQuestion;
  count: number;
  label: string;
  note: string;
  href: string;
}) {
  const clear = count === 0;
  return (
    <Link
      className={`signal-card signal-${tone} ${clear ? "is-clear" : ""}`}
      href={href}
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
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
