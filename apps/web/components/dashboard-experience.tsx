"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Blocks,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Download,
  Filter,
  Gauge,
  Layers3,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  PieChart,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import {
  demoWorkspaces,
  demoItems,
  demoPortfolios,
  safeCsvCell,
  type Workspace,
  type Portfolio,
  type WorkItem,
} from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { type GroupedSignal, NOW } from "@/lib/attention";
import { useCapturedWork } from "@/lib/captured-work";
import {
  CURRENT_DASHBOARD_USER,
  dashboardLevelsForAccess,
  dashboardTeamsForAccess,
  filterItemsForDashboardView,
  type DashboardTeam,
  type DashboardViewLevel,
} from "@/lib/dashboard-access";
import { vocabularyFor } from "@/lib/terminology";
import { useWorkspaceState as useWorkspace } from "@/lib/workspace-context";
import { workspaceHref } from "@/lib/workspace-routes";
import { WorkspaceFrame } from "./workspace-frame";
import { BarChart, DonutChart, type Bar, type Slice } from "./charts";
import { HealthBar, PageHero, StatTile } from "./ui-kit";
import { Hint } from "./learning-center";

type ScopeFilter = "all" | "open";
type DashboardLensKind =
  | "all"
  | "attention"
  | "status"
  | "priority"
  | "owner"
  | "workspace"
  | "workspace_overdue"
  | "overdue"
  | "due_soon"
  | "handoffs"
  | "decisions"
  | "approvals"
  | "unassigned";

interface DashboardLens {
  kind: DashboardLensKind;
  label: string;
  note: string;
  key?: string;
}

const DEFAULT_LENS: DashboardLens = {
  kind: "attention",
  label: "Needs intervention",
  note: "The open commitments carrying the strongest combined risk signals.",
};

const STATUS_META: Record<
  WorkItem["status"],
  { label: string; color: string }
> = {
  not_started: { label: "Not started", color: "var(--fh-parked)" },
  working: { label: "Working on it", color: "var(--fh-warning)" },
  review: { label: "In review", color: "var(--fh-info)" },
  blocked: { label: "Stuck", color: "var(--fh-danger)" },
  done: { label: "Done", color: "var(--fh-success)" },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "var(--fh-danger)" },
  high: { label: "High", color: "var(--fh-warning)" },
  normal: { label: "Normal", color: "var(--fh-info)" },
  low: { label: "Low", color: "var(--fh-parked)" },
  none: { label: "None", color: "var(--fh-parked)" },
};

const DAY = 86_400_000;

export function DashboardExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  return (
    <WorkspaceFrame active="dashboard" workspaceSlug={workspaceSlug}>
      <DashboardMain />
    </WorkspaceFrame>
  );
}

function DashboardMain() {
  const {
    scope,
    portfolioId,
    setPortfolioId,
    setCaptureOpen,
    dashboardAccess,
    workspaceLevel,
    projectId: workspaceProjectId,
  } = useWorkspace();
  const capturedWork = useCapturedWork();
  const vocab = vocabularyFor();
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("open");
  const [lens, setLens] = useState<DashboardLens>(DEFAULT_LENS);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const allAvailableLevels = dashboardLevelsForAccess(dashboardAccess);
  const availableLevels = allAvailableLevels.filter(
    (level) => level !== "portfolio",
  );
  const accessibleTeams = dashboardTeamsForAccess(dashboardAccess);
  const accessiblePortfolioIds = new Set(dashboardAccess.portfolioIds);
  const accessiblePortfolios = demoPortfolios.filter((item) =>
    accessiblePortfolioIds.has(item.id),
  );
  const accessibleProjectIds = new Set(dashboardAccess.projectIds);
  const accessibleProjects = scope.workspaces.filter((project) =>
    accessibleProjectIds.has(project.id),
  );
  const [viewLevel, setViewLevel] = useState<DashboardViewLevel>(
    availableLevels[0] ?? "personal",
  );
  const [dashboardProjectId, setDashboardProjectId] = useState(
    () => workspaceProjectId ?? accessibleProjects[0]?.id ?? "",
  );
  const [teamId, setTeamId] = useState(() => accessibleTeams[0]?.id ?? "");
  const activeViewLevel = viewLevel;
  const activeProjectId =
    workspaceLevel === "project" && workspaceProjectId
      ? workspaceProjectId
      : dashboardProjectId;

  const portfolio = demoPortfolios.find((item) => item.id === portfolioId);
  const selectedProject =
    accessibleProjects.find((project) => project.id === activeProjectId) ??
    accessibleProjects[0];
  const selectedTeam =
    accessibleTeams.find((team) => team.id === teamId) ?? accessibleTeams[0];
  const viewTargetId =
    activeViewLevel === "project"
      ? (selectedProject?.id ?? "")
      : activeViewLevel === "team"
        ? (selectedTeam?.id ?? "")
        : activeViewLevel === "personal"
          ? CURRENT_DASHBOARD_USER
          : portfolioId;

  const capturedItems = useMemo<WorkItem[]>(() => {
    const projectIds = new Set(scope.workspaces.map((project) => project.id));
    const existingIds = new Set(scope.items.map((item) => item.id));
    return capturedWork
      .filter(
        (item) => projectIds.has(item.workspaceId) && !existingIds.has(item.id),
      )
      .map<WorkItem>((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        boardId: item.boardId,
        title: item.title,
        type: dashboardWorkType(item.type),
        priority: item.priority,
        status: "not_started",
        ...(item.dueDate ? { dueDate: item.dueDate } : {}),
        ...(item.owner && item.owner !== "Unassigned"
          ? { assignee: item.owner }
          : {}),
      }));
  }, [capturedWork, scope.workspaces, scope.items]);

  const workspaceItems = useMemo(
    () => [...scope.items, ...capturedItems],
    [capturedItems, scope.items],
  );

  const allItems = useMemo(
    () =>
      filterItemsForDashboardView(
        workspaceItems,
        activeViewLevel,
        viewTargetId,
      ),
    [activeViewLevel, viewTargetId, workspaceItems],
  );

  const viewItemIds = useMemo(
    () => new Set(allItems.map((item) => item.id)),
    [allItems],
  );
  const viewAttention = useMemo(
    () => scope.attention.filter((group) => viewItemIds.has(group.entityId)),
    [scope.attention, viewItemIds],
  );
  const viewWorkspaces = useMemo(() => {
    if (activeViewLevel === "portfolio") return scope.workspaces;
    if (activeViewLevel === "project")
      return selectedProject ? [selectedProject] : [];
    const projectIds = new Set(allItems.map((item) => item.workspaceId));
    return scope.workspaces.filter((project) => projectIds.has(project.id));
  }, [activeViewLevel, allItems, scope.workspaces, selectedProject]);
  const viewHealth = useMemo(
    () => dashboardHealth(viewWorkspaces),
    [viewWorkspaces],
  );
  const viewFocusWorkspace = useMemo(
    () => dashboardFocusWorkspace(viewWorkspaces),
    [viewWorkspaces],
  );
  const viewDescriptor = dashboardViewDescriptor(
    activeViewLevel,
    portfolio?.name,
    selectedProject,
    selectedTeam,
  );

  const openItems = useMemo(
    () => allItems.filter((item) => item.status !== "done"),
    [allItems],
  );
  const items = useMemo(
    () => (scopeFilter === "open" ? openItems : allItems),
    [allItems, openItems, scopeFilter],
  );

  const attentionItemIds = useMemo(
    () => new Set(viewAttention.map((group) => group.entityId)),
    [viewAttention],
  );
  const overdueItems = useMemo(
    () => openItems.filter((item) => isOverdue(item)),
    [openItems],
  );
  const dueSoonItems = useMemo(
    () => openItems.filter((item) => isDueSoon(item)),
    [openItems],
  );
  const decisions = useMemo(
    () =>
      openItems.filter(
        (item) => item.type === "decision" && item.decisionState !== "decided",
      ),
    [openItems],
  );
  const approvals = useMemo(
    () =>
      openItems.filter(
        (item) => item.type === "approval" && item.approvalState !== "approved",
      ),
    [openItems],
  );
  const unassignedItems = useMemo(
    () => openItems.filter((item) => !item.assignee),
    [openItems],
  );
  const riskItemIds = useMemo(() => {
    const ids = new Set(attentionItemIds);
    for (const item of openItems) {
      if (
        item.status === "blocked" ||
        isOverdue(item) ||
        (item.type === "decision" && item.decisionState !== "decided") ||
        (item.type === "approval" && item.approvalState !== "approved") ||
        (!item.assignee && ["urgent", "high"].includes(item.priority))
      ) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [attentionItemIds, openItems]);

  const counts = useMemo(
    () => ({
      all: allItems.length,
      working: allItems.filter((item) => item.status === "working").length,
      blocked: allItems.filter((item) => item.status === "blocked").length,
      done: allItems.filter((item) => item.status === "done").length,
      overdue: overdueItems.length,
      attention: openItems.filter((item) => riskItemIds.has(item.id)).length,
    }),
    [allItems, openItems, overdueItems.length, riskItemIds],
  );

  const statusSlices: Slice[] = useMemo(
    () =>
      (Object.keys(STATUS_META) as WorkItem["status"][])
        .map((key) => ({
          key,
          label: STATUS_META[key].label,
          color: STATUS_META[key].color,
          value: items.filter((item) => item.status === key).length,
        }))
        .filter((slice) => slice.value > 0),
    [items],
  );

  const prioritySlices: Slice[] = useMemo(
    () =>
      Object.keys(PRIORITY_META)
        .map((key) => ({
          key,
          label: PRIORITY_META[key]!.label,
          color: PRIORITY_META[key]!.color,
          value: items.filter((item) => item.priority === key).length,
        }))
        .filter((slice) => slice.value > 0),
    [items],
  );

  const ownerLoad = useMemo(() => {
    const byOwner = new Map<string, number>();
    for (const item of openItems) {
      const owner = item.assignee ?? "Unassigned";
      byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
    }
    return [...byOwner.entries()].sort((a, b) => b[1] - a[1]);
  }, [openItems]);

  const ownerBars: Bar[] = useMemo(
    () =>
      ownerLoad.slice(0, 6).map(([owner, value]) => ({
        key: owner,
        label: owner.split(" ")[0] ?? owner,
        value,
        color:
          owner === "Unassigned" ? "var(--fh-parked)" : "var(--fh-primary)",
        badge: (
          <span className="bar-avatar" aria-hidden="true">
            {owner === "Unassigned"
              ? "?"
              : owner
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
          </span>
        ),
      })),
    [ownerLoad],
  );

  const projectBars: Bar[] = useMemo(
    () =>
      viewWorkspaces
        .map((workspace) => ({
          key: workspace.id,
          label: workspace.name,
          value: items.filter((item) => item.workspaceId === workspace.id)
            .length,
          color: workspace.accent,
          badge: (
            <span
              className="bar-avatar"
              style={{
                background: `color-mix(in srgb, ${workspace.accent} 16%, var(--fh-surface))`,
              }}
              aria-hidden="true"
            >
              {workspace.icon}
            </span>
          ),
        }))
        .filter((bar) => bar.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [items, viewWorkspaces],
  );

  const overdueBars: Bar[] = useMemo(
    () =>
      viewWorkspaces
        .map((workspace) => ({
          key: workspace.id,
          label: workspace.name,
          value: overdueItems.filter(
            (item) => item.workspaceId === workspace.id,
          ).length,
          color: "var(--fh-danger)",
        }))
        .filter((bar) => bar.value > 0)
        .sort((a, b) => b.value - a.value),
    [overdueItems, viewWorkspaces],
  );

  const pressureIndex = useMemo(() => {
    if (!openItems.length) return 0;
    const criticalWorkspaces = viewWorkspaces.filter(
      (workspace) => workspace.health === "critical",
    ).length;
    const riskShare =
      (openItems.filter((item) => riskItemIds.has(item.id)).length /
        openItems.length) *
      64;
    return Math.min(
      100,
      Math.round(
        riskShare +
          counts.blocked * 4 +
          criticalWorkspaces * 7 +
          unassignedItems.filter((item) =>
            ["urgent", "high"].includes(item.priority),
          ).length *
            5,
      ),
    );
  }, [counts.blocked, openItems, riskItemIds, unassignedItems, viewWorkspaces]);

  const pressure =
    pressureIndex >= 68
      ? { label: "Intervention needed", tone: "critical" }
      : pressureIndex >= 40
        ? { label: "Watch the load", tone: "watch" }
        : { label: "Operating cleanly", tone: "healthy" };
  const topSignal = viewAttention[0];
  const topOwner = ownerLoad.find(([owner]) => owner !== "Unassigned");
  const capturedItemIds = new Set(capturedItems.map((item) => item.id));
  const capturedCount = allItems.filter((item) =>
    capturedItemIds.has(item.id),
  ).length;

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items
      .filter((item) =>
        matchesLens(item, lens, {
          attentionItemIds: riskItemIds,
        }),
      )
      .filter((item) => {
        if (!normalized) return true;
        const workspace = demoWorkspaces.find(
          (candidate) => candidate.id === item.workspaceId,
        );
        return [
          item.title,
          item.assignee,
          workspace?.name,
          item.type,
          item.priority,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase().includes(normalized),
          );
      })
      .sort((a, b) => dashboardWorkScore(b) - dashboardWorkScore(a));
  }, [items, lens, query, riskItemIds]);

  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, 6);

  const focusLens = (next: DashboardLens) => {
    setLens(next);
    setShowAll(false);
    window.requestAnimationFrame(() => {
      document
        .getElementById("dashboard-work-lens")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const resetDashboardFocus = () => {
    setLens(DEFAULT_LENS);
    setQuery("");
    setShowAll(false);
  };

  const selectViewLevel = (level: DashboardViewLevel) => {
    setViewLevel(level);
    resetDashboardFocus();
  };

  return (
    <main className="trevv-main dashboard-main">
      <PageHero
        eyebrow={<>Reporting · {viewDescriptor.levelLabel}</>}
        title="Dashboard"
        subtitle={`${viewDescriptor.name} — ${viewDescriptor.description} Select any number or chart to inspect the work behind it.`}
        hintId="dashboard"
        selector={
          <DashboardTargetSelector
            level={activeViewLevel}
            portfolioId={portfolioId}
            portfolios={accessiblePortfolios}
            projectId={selectedProject?.id ?? ""}
            teamId={selectedTeam?.id ?? ""}
            projects={accessibleProjects}
            teams={accessibleTeams}
            onPortfolio={(id) => {
              setPortfolioId(id);
              resetDashboardFocus();
            }}
            onProject={(id) => {
              setDashboardProjectId(id);
              resetDashboardFocus();
            }}
            onTeam={(id) => {
              setTeamId(id);
              resetDashboardFocus();
            }}
          />
        }
        actions={
          <>
            <div className="segmented" role="group" aria-label="Work scope">
              <button
                className={scopeFilter === "open" ? "is-on" : ""}
                aria-pressed={scopeFilter === "open"}
                onClick={() => setScopeFilter("open")}
              >
                Open work
              </button>
              <button
                className={scopeFilter === "all" ? "is-on" : ""}
                aria-pressed={scopeFilter === "all"}
                onClick={() => setScopeFilter("all")}
              >
                All time
              </button>
            </div>
            <button
              className="quiet-button"
              onClick={() => exportDashboard(items, viewDescriptor.name)}
            >
              <Download size={15} />
              Export {scopeFilter === "open" ? "open work" : "all work"}
            </button>
          </>
        }
        stats={
          <>
            <StatTile
              icon={ListChecks}
              value={counts.all}
              label="All work items"
              note={`${counts.done} complete · select to inspect`}
              hintId="dashboard"
              active={lens.kind === "all"}
              onClick={() =>
                focusLens({
                  kind: "all",
                  label: scopeFilter === "open" ? "All open work" : "All work",
                  note: "Every source item contributing to this dashboard view.",
                })
              }
            />
            <StatTile
              icon={Activity}
              value={counts.working}
              label="In progress"
              note="Actively being worked"
              tone="primary"
              active={lens.kind === "status" && lens.key === "working"}
              onClick={() =>
                focusLens({
                  kind: "status",
                  key: "working",
                  label: "In progress",
                  note: "Active commitments currently moving through delivery.",
                })
              }
            />
            <StatTile
              icon={Blocks}
              value={counts.blocked}
              label="Stuck"
              note="Blocked on something"
              tone="danger"
              active={lens.kind === "status" && lens.key === "blocked"}
              onClick={() =>
                focusLens({
                  kind: "status",
                  key: "blocked",
                  label: "Blocked work",
                  note: "Commitments that need an unblock plan before progress can resume.",
                })
              }
            />
            <StatTile
              icon={AlertTriangle}
              value={counts.overdue}
              label="Overdue"
              note="Past their due date"
              tone="warning"
              active={lens.kind === "overdue"}
              onClick={() =>
                focusLens({
                  kind: "overdue",
                  label: "Overdue work",
                  note: "Open commitments that have passed their agreed date.",
                })
              }
            />
          </>
        }
      >
        <DashboardHierarchy
          availableLevels={availableLevels}
          activeLevel={activeViewLevel}
          onSelect={selectViewLevel}
        />
      </PageHero>

      <section
        className="dashboard-intelligence-grid"
        aria-label={`TREVV ${viewDescriptor.levelLabel.toLocaleLowerCase()} briefing`}
      >
        <article className="dashboard-brief">
          <header>
            <span className="dashboard-intelligence-icon">
              <Sparkles size={17} />
            </span>
            <div>
              <p>Continuously derived from live work</p>
              <h2>TREVV Brief</h2>
            </div>
            <span className={`dashboard-pressure ${pressure.tone}`}>
              <b>{pressureIndex}</b>
              <span>Pressure</span>
            </span>
          </header>

          <div className="dashboard-brief-lead">
            <span>{pressure.label}</span>
            <h3>
              {counts.attention
                ? `${counts.attention} commitments need intervention before this ${viewDescriptor.levelNoun} can move cleanly.`
                : `This ${viewDescriptor.levelNoun} has no unresolved intervention signals.`}
            </h3>
            <p>
              {topSignal
                ? `${topSignal.title} is the best place to start. ${topSignal.primary.recommendedAction ?? topSignal.reasons[0]}`
                : "Keep ownership and dates current; TREVV will surface the next meaningful exception here."}
            </p>
          </div>

          <div className="dashboard-brief-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => focusLens(DEFAULT_LENS)}
            >
              <Target size={15} /> Review priority work
            </button>
            <Link
              className="secondary-button"
              href={
                selectedProject
                  ? workspaceHref(selectedProject.slug, "attention")
                  : "/app/portfolio"
              }
            >
              Open Attention center <ArrowRight size={14} />
            </Link>
          </div>

          <ol className="dashboard-next-actions">
            {viewAttention.slice(0, 3).map((group, index) => (
              <li key={group.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{group.title}</strong>
                  <p>{group.reasons[0]}</p>
                </div>
                <Link href={signalHref(group)}>
                  {signalActionLabel(group)} <ArrowRight size={13} />
                </Link>
              </li>
            ))}
          </ol>
        </article>

        <aside className="dashboard-runway" aria-labelledby="runway-title">
          <header>
            <span className="dashboard-intelligence-icon">
              <Gauge size={17} />
            </span>
            <div>
              <p>Execution sequence</p>
              <h2 id="runway-title">Decision runway</h2>
            </div>
          </header>

          <div className="dashboard-runway-list">
            <RunwayButton
              label="Intervene now"
              count={counts.attention}
              note="Compounding risk signals"
              active={lens.kind === "attention"}
              onClick={() => focusLens(DEFAULT_LENS)}
            />
            <RunwayButton
              label="Next 7 days"
              count={dueSoonItems.length}
              note="Commitments entering the window"
              active={lens.kind === "due_soon"}
              onClick={() =>
                focusLens({
                  kind: "due_soon",
                  label: "Next 7 days",
                  note: "Upcoming commitments that need a clean path before their due date.",
                })
              }
            />
            <RunwayButton
              label="Calls to make"
              count={decisions.length + approvals.length}
              note={`${decisions.length} decisions · ${approvals.length} approvals`}
              active={lens.kind === "handoffs"}
              onClick={() =>
                focusLens({
                  kind: "handoffs",
                  label: "Calls to make",
                  note: "Open decisions and approvals holding the next handoff.",
                })
              }
            />
            <RunwayButton
              label="Ownership gaps"
              count={unassignedItems.length}
              note="Open work without one owner"
              active={lens.kind === "unassigned"}
              onClick={() =>
                focusLens({
                  kind: "unassigned",
                  label: "Ownership gaps",
                  note: "Open work without a clearly accountable owner.",
                })
              }
            />
          </div>

          <div className="dashboard-capacity-signal">
            <Users size={16} />
            <p>
              {topOwner ? (
                <>
                  <strong>{topOwner[0]}</strong> carries the largest visible
                  load with {topOwner[1]} open items.
                </>
              ) : (
                "No owner load is available yet."
              )}
            </p>
          </div>

          <button
            className="quiet-button dashboard-create-follow-up"
            type="button"
            onClick={() => setCaptureOpen(true)}
          >
            <Plus size={15} /> Create a follow-up
          </button>
          {capturedCount > 0 && (
            <small>{capturedCount} captured items are included live.</small>
          )}
        </aside>
      </section>

      <section
        className="dashboard-work-lens"
        id="dashboard-work-lens"
        aria-labelledby="dashboard-work-lens-title"
      >
        <header>
          <span className="dashboard-intelligence-icon">
            <Filter size={16} />
          </span>
          <div>
            <p>Every number is auditable</p>
            <h2 id="dashboard-work-lens-title">Work lens · {lens.label}</h2>
            <span>{lens.note}</span>
          </div>
          <b aria-live="polite">
            {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
          </b>
        </header>

        <div className="dashboard-lens-controls">
          <div
            className="dashboard-lens-presets"
            aria-label="Work lenses"
            role="group"
          >
            <LensButton
              active={lens.kind === "attention"}
              label="Needs intervention"
              count={counts.attention}
              onClick={() => focusLens(DEFAULT_LENS)}
            />
            <LensButton
              active={lens.kind === "status" && lens.key === "blocked"}
              label="Blocked"
              count={counts.blocked}
              onClick={() =>
                focusLens({
                  kind: "status",
                  key: "blocked",
                  label: "Blocked work",
                  note: "Commitments that need an unblock plan.",
                })
              }
            />
            <LensButton
              active={lens.kind === "overdue"}
              label="Overdue"
              count={counts.overdue}
              onClick={() =>
                focusLens({
                  kind: "overdue",
                  label: "Overdue work",
                  note: "Open commitments that have passed their agreed date.",
                })
              }
            />
            <LensButton
              active={lens.kind === "decisions"}
              label="Decisions"
              count={decisions.length}
              onClick={() =>
                focusLens({
                  kind: "decisions",
                  label: "Decisions needed",
                  note: "Open choices that need a recorded answer before execution continues.",
                })
              }
            />
            <LensButton
              active={lens.kind === "approvals"}
              label="Approvals"
              count={approvals.length}
              onClick={() =>
                focusLens({
                  kind: "approvals",
                  label: "Approvals pending",
                  note: "Review gates that are waiting for a clear response.",
                })
              }
            />
            <LensButton
              active={lens.kind === "all"}
              label={scopeFilter === "open" ? "All open" : "All work"}
              count={items.length}
              onClick={() =>
                focusLens({
                  kind: "all",
                  label: scopeFilter === "open" ? "All open work" : "All work",
                  note: "Every source item contributing to this dashboard view.",
                })
              }
            />
          </div>

          <label className="dashboard-lens-search">
            <Search size={15} />
            <input
              aria-label="Search dashboard source work"
              placeholder="Search source work…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowAll(false);
              }}
            />
          </label>
        </div>

        {visibleItems.length > 0 ? (
          <div className="dashboard-work-list">
            {visibleItems.map((item) => {
              const workspace = demoWorkspaces.find(
                (candidate) => candidate.id === item.workspaceId,
              );
              return (
                <Link
                  className="dashboard-work-row"
                  href={workItemHref(item)}
                  key={item.id}
                >
                  <span
                    className={`dashboard-work-type type-${item.type}`}
                    aria-hidden="true"
                  >
                    <CircleDot size={14} />
                  </span>
                  <span className="dashboard-work-copy">
                    <strong>{item.title}</strong>
                    <small>
                      {workspace?.name ?? "Unknown workspace"} ·{" "}
                      {typeLabel(item.type)}
                    </small>
                  </span>
                  <span
                    className={`dashboard-work-state status-${item.status}`}
                  >
                    {STATUS_META[item.status].label}
                  </span>
                  <span className="dashboard-work-owner">
                    {item.assignee ?? "Unassigned"}
                  </span>
                  <span
                    className={`dashboard-work-due${isOverdue(item) ? " is-overdue" : ""}`}
                  >
                    {dueLabel(item)}
                  </span>
                  <span className="dashboard-work-open">
                    {workActionLabel(item)} <ArrowRight size={13} />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-lens-empty">
            <CheckCircle2 size={22} />
            <strong>No matching work</strong>
            <p>Try another lens or clear the search.</p>
          </div>
        )}

        {filteredItems.length > 6 && (
          <footer>
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? "Show the priority six"
                : `Show all ${filteredItems.length} items`}
              <ArrowRight size={13} />
            </button>
          </footer>
        )}
      </section>

      <div className="dashboard-section-heading">
        <div>
          <p>Explore this {viewDescriptor.levelNoun}</p>
          <h2>Interactive reporting</h2>
        </div>
        <span>Select any segment or bar to update the Work lens.</span>
      </div>

      <div className="widget-grid">
        <Widget
          icon={PieChart}
          title="Work by status"
          note="Select a status to inspect its source work"
          span={4}
          hintId="dashboard-status"
          exportData={statusSlices}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <DonutChart
            slices={statusSlices}
            totalLabel="items"
            onSelect={(slice) =>
              focusLens({
                kind: "status",
                key: slice.key,
                label: slice.label,
                note: `Source work currently marked ${slice.label.toLocaleLowerCase()}.`,
              })
            }
            {...(lens.kind === "status" && lens.key
              ? { selectedKey: lens.key }
              : {})}
          />
        </Widget>

        <Widget
          icon={Users}
          title="Work by owner"
          note="Select an owner to inspect load and commitments"
          span={8}
          hintId="dashboard-ownership"
          exportData={ownerBars.map(({ key, label, value }) => ({
            key,
            label,
            value,
          }))}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <BarChart
            bars={ownerBars}
            emptyNote="No owners assigned yet."
            onSelect={(bar) =>
              focusLens({
                kind: "owner",
                key: bar.key,
                label:
                  bar.key === "Unassigned"
                    ? "Unassigned work"
                    : `${bar.key}'s work`,
                note:
                  bar.key === "Unassigned"
                    ? "Open commitments without one accountable owner."
                    : `Open commitments currently owned by ${bar.key}.`,
              })
            }
            {...(lens.kind === "owner" && lens.key
              ? { selectedKey: lens.key }
              : {})}
          />
        </Widget>

        <Widget
          icon={LayoutGrid}
          title={`${scopeFilter === "open" ? "Open" : "All"} work by ${vocab.one.toLowerCase()}`}
          note={`Select a ${vocab.one.toLowerCase()} to inspect its source work`}
          span={8}
          hintId="dashboard-ownership"
          exportData={projectBars.map(({ key, label, value }) => ({
            key,
            label,
            value,
          }))}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <BarChart
            bars={projectBars}
            emptyNote={`No work in this ${viewDescriptor.levelNoun}.`}
            onSelect={(bar) =>
              focusLens({
                kind: "workspace",
                key: bar.key,
                label: bar.label,
                note: `Source work currently attached to ${bar.label}.`,
              })
            }
            {...(lens.kind === "workspace" && lens.key
              ? { selectedKey: lens.key }
              : {})}
          />
        </Widget>

        <Widget
          icon={CalendarClock}
          title="Work by priority"
          note="Select a priority to inspect how the queue is weighted"
          span={4}
          hintId="dashboard-status"
          exportData={prioritySlices}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <DonutChart
            slices={prioritySlices}
            totalLabel="items"
            onSelect={(slice) =>
              focusLens({
                kind: "priority",
                key: slice.key,
                label: `${slice.label} priority`,
                note: `Source work currently carrying ${slice.label.toLocaleLowerCase()} priority.`,
              })
            }
            {...(lens.kind === "priority" && lens.key
              ? { selectedKey: lens.key }
              : {})}
          />
        </Widget>

        <Widget
          icon={AlertTriangle}
          title={`Overdue by ${vocab.one.toLowerCase()}`}
          note={`Select a ${vocab.one.toLowerCase()} to inspect late work`}
          span={6}
          hintId="dashboard"
          exportData={overdueBars.map(({ key, label, value }) => ({
            key,
            label,
            value,
          }))}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <BarChart
            bars={overdueBars}
            height={150}
            emptyNote="Nothing is overdue."
            onSelect={(bar) =>
              focusLens({
                kind: "workspace_overdue",
                key: bar.key,
                label: `${bar.label} · overdue`,
                note: `Late commitments currently attached to ${bar.label}.`,
              })
            }
            {...(lens.kind === "workspace_overdue" && lens.key
              ? { selectedKey: lens.key }
              : {})}
          />
        </Widget>

        <Widget
          icon={CheckCircle2}
          title={`${vocab.one} health`}
          note={`${viewWorkspaces.length} ${viewWorkspaces.length === 1 ? vocab.one.toLowerCase() : vocab.many.toLowerCase()} · live health evidence`}
          span={6}
          hintId="portfolios"
          exportData={{
            health: viewHealth,
            focus: viewFocusWorkspace ?? null,
          }}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <div className="widget-health">
            <HealthBar slices={viewHealth} />
            {viewFocusWorkspace && (
              <p className="widget-focus">
                <b>Most urgent</b>
                <Link href={workspaceHref(viewFocusWorkspace.slug)}>
                  {viewFocusWorkspace.name}
                </Link>
                <small>{viewFocusWorkspace.healthNote}</small>
              </p>
            )}
          </div>
        </Widget>
      </div>
    </main>
  );
}

const DASHBOARD_VIEW_META: Record<
  DashboardViewLevel,
  {
    label: string;
    caption: string;
    targetLabel: string;
    icon: typeof Layers3;
  }
> = {
  portfolio: {
    label: "Portfolio",
    caption: "All Workspaces",
    targetLabel: "Portfolio view",
    icon: Layers3,
  },
  project: {
    label: "Workspace",
    caption: "Operational scope",
    targetLabel: "Workspace view",
    icon: LayoutGrid,
  },
  team: {
    label: "Team",
    caption: "Functional team",
    targetLabel: "Team view",
    icon: Users,
  },
  personal: {
    label: "Personal",
    caption: "My work",
    targetLabel: "Personal view",
    icon: UserRound,
  },
};

function DashboardHierarchy({
  availableLevels,
  activeLevel,
  onSelect,
}: {
  availableLevels: DashboardViewLevel[];
  activeLevel: DashboardViewLevel;
  onSelect: (level: DashboardViewLevel) => void;
}) {
  return (
    <div className="dashboard-hierarchy">
      <div className="dashboard-hierarchy-intro">
        <ShieldCheck size={16} />
        <span>
          <strong>Reporting hierarchy</strong>
          <small>Only views allowed by your access are shown.</small>
        </span>
      </div>
      <div
        className="dashboard-hierarchy-levels"
        role="tablist"
        aria-label="Dashboard reporting level"
      >
        {availableLevels.map((level, index) => {
          const meta = DASHBOARD_VIEW_META[level];
          const Icon = meta.icon;
          return (
            <span className="dashboard-hierarchy-step" key={level}>
              {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
              <button
                className={activeLevel === level ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={activeLevel === level}
                onClick={() => onSelect(level)}
              >
                <Icon size={15} />
                <span>
                  <strong>{meta.label}</strong>
                  <small>{meta.caption}</small>
                </span>
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DashboardTargetSelector({
  level,
  portfolioId,
  projectId,
  teamId,
  portfolios,
  projects,
  teams,
  onPortfolio,
  onProject,
  onTeam,
}: {
  level: DashboardViewLevel;
  portfolioId: string;
  projectId: string;
  teamId: string;
  portfolios: readonly Portfolio[];
  projects: readonly Workspace[];
  teams: readonly DashboardTeam[];
  onPortfolio: (id: string) => void;
  onProject: (id: string) => void;
  onTeam: (id: string) => void;
}) {
  const meta = DASHBOARD_VIEW_META[level];
  if (level === "personal") {
    return (
      <div className="hero-select dashboard-target-readonly">
        <span>{meta.targetLabel}</span>
        <strong>
          <UserRound size={14} /> My work
        </strong>
      </div>
    );
  }

  if (level === "project" && projects.length <= 1) {
    return (
      <div className="hero-select dashboard-target-readonly">
        <span>{meta.targetLabel}</span>
        <strong>
          <LayoutGrid size={14} /> {projects[0]?.name ?? "Selected workspace"}
        </strong>
      </div>
    );
  }

  const value =
    level === "portfolio"
      ? portfolioId
      : level === "project"
        ? projectId
        : teamId;
  return (
    <label className="hero-select dashboard-target-select">
      <span>{meta.targetLabel}</span>
      <select
        value={value}
        onChange={(event) => {
          if (level === "portfolio") onPortfolio(event.target.value);
          else if (level === "project") onProject(event.target.value);
          else onTeam(event.target.value);
        }}
      >
        {level === "portfolio" &&
          portfolios.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        {level === "project" &&
          projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        {level === "team" &&
          teams.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function dashboardViewDescriptor(
  level: DashboardViewLevel,
  portfolioName?: string,
  project?: Workspace,
  team?: DashboardTeam,
) {
  if (level === "portfolio")
    return {
      levelLabel: "Portfolio view",
      levelNoun: "portfolio",
      name: portfolioName ?? "Accessible portfolio",
      description: "Executive visibility across every accessible Workspace.",
    };
  if (level === "project")
    return {
      levelLabel: "Workspace view",
      levelNoun: "workspace",
      name: project?.name ?? "Accessible workspace",
      description:
        "Delivery, risk, ownership, and decisions for this workspace only.",
    };
  if (level === "team")
    return {
      levelLabel: "Team view",
      levelNoun: "team",
      name: team?.name ?? "Accessible team",
      description: "Shared commitments owned by this team in this workspace.",
    };
  return {
    levelLabel: "Personal view",
    levelNoun: "workload",
    name: "My work",
    description: "Your owned commitments in this workspace.",
  };
}

const DASHBOARD_HEALTH_ORDER = [
  { key: "critical", label: "Critical" },
  { key: "watch", label: "Watch" },
  { key: "on_track", label: "On track" },
  { key: "parked", label: "Parked" },
] as const;

function dashboardHealth(projects: readonly Workspace[]) {
  return DASHBOARD_HEALTH_ORDER.map(({ key, label }) => ({
    key,
    label,
    count: projects.filter((project) => project.health === key).length,
  }));
}

function dashboardFocusWorkspace(projects: readonly Workspace[]) {
  for (const { key } of DASHBOARD_HEALTH_ORDER) {
    const project = projects.find((candidate) => candidate.health === key);
    if (project) return project;
  }
  return undefined;
}

function RunwayButton({
  label,
  count,
  note,
  active,
  onClick,
}: {
  label: string;
  count: number;
  note: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "is-active" : ""}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      <span>
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
      <b>{count}</b>
      <ArrowRight size={14} />
    </button>
  );
}

function LensButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "is-active" : ""}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {label} <b>{count}</b>
    </button>
  );
}

function Widget({
  icon: Icon,
  title,
  note,
  span,
  hintId,
  exportData,
  scopeFilter,
  onScopeFilter,
  children,
}: {
  icon: typeof PieChart;
  title: string;
  note?: string;
  /** Columns out of 12. */
  span: number;
  hintId: string;
  exportData: unknown;
  scopeFilter: ScopeFilter;
  onScopeFilter: (scope: ScopeFilter) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section
      className="widget"
      style={{ "--span": span } as CSSProperties}
      aria-labelledby={`w-${slug}`}
    >
      <header>
        <span className="widget-icon">
          <Icon size={15} />
        </span>
        <div>
          <h2 id={`w-${slug}`}>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        <Hint resourceId={hintId} />
        <div
          className="widget-menu-wrap"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setMenuOpen(false);
            }
          }}
        >
          <button
            className="widget-action"
            aria-label={`Options for ${title}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="widget-menu" role="menu">
              <strong>{title}</strong>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onScopeFilter(scopeFilter === "open" ? "all" : "open");
                  setMenuOpen(false);
                }}
              >
                {scopeFilter === "open"
                  ? "Include completed work"
                  : "Show open work only"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  downloadDashboardFile(
                    `trevv-${slug}.json`,
                    JSON.stringify(
                      {
                        widget: title,
                        scope: scopeFilter,
                        exportedAt: new Date().toISOString(),
                        data: exportData,
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  );
                  setMenuOpen(false);
                }}
              >
                <Download size={13} /> Download widget data
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="widget-body">{children}</div>
    </section>
  );
}

function matchesLens(
  item: WorkItem,
  lens: DashboardLens,
  context: { attentionItemIds: Set<string> },
) {
  if (lens.kind === "all") return true;
  if (lens.kind === "attention") return context.attentionItemIds.has(item.id);
  if (lens.kind === "status") return item.status === lens.key;
  if (lens.kind === "priority") return item.priority === lens.key;
  if (lens.kind === "owner")
    return (item.assignee ?? "Unassigned") === lens.key;
  if (lens.kind === "workspace") return item.workspaceId === lens.key;
  if (lens.kind === "workspace_overdue")
    return item.workspaceId === lens.key && isOverdue(item);
  if (lens.kind === "overdue") return isOverdue(item);
  if (lens.kind === "due_soon") return isDueSoon(item);
  if (lens.kind === "handoffs")
    return (
      (item.type === "decision" && item.decisionState !== "decided") ||
      (item.type === "approval" && item.approvalState !== "approved")
    );
  if (lens.kind === "decisions")
    return item.type === "decision" && item.decisionState !== "decided";
  if (lens.kind === "approvals")
    return item.type === "approval" && item.approvalState !== "approved";
  return !item.assignee;
}

function dashboardWorkScore(item: WorkItem) {
  if (item.status === "done") return -100;
  let score = 0;
  if (item.status === "blocked") score += 55;
  if (isOverdue(item)) score += 42;
  if (item.priority === "urgent") score += 24;
  if (item.priority === "high") score += 14;
  if (item.type === "decision" && item.decisionState !== "decided") score += 12;
  if (item.type === "approval" && item.approvalState !== "approved")
    score += 10;
  if (!item.assignee) score += 8;
  if (isDueSoon(item)) score += 6;
  return score;
}

function isOverdue(item: WorkItem) {
  return Boolean(
    item.status !== "done" &&
    item.dueDate &&
    new Date(`${item.dueDate}T23:59:59Z`) < NOW,
  );
}

function isDueSoon(item: WorkItem) {
  if (item.status === "done" || !item.dueDate) return false;
  const due = new Date(`${item.dueDate}T23:59:59Z`).getTime();
  return due >= NOW.getTime() && due <= NOW.getTime() + 7 * DAY;
}

function dueLabel(item: WorkItem) {
  if (!item.dueDate) return "No date";
  const due = new Date(`${item.dueDate}T23:59:59Z`);
  if (isOverdue(item)) {
    const days = Math.max(1, Math.ceil((NOW.getTime() - due.getTime()) / DAY));
    return `${days}d overdue`;
  }
  const days = Math.max(0, Math.ceil((due.getTime() - NOW.getTime()) / DAY));
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

function typeLabel(type: WorkItem["type"]) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function dashboardWorkType(type: string): WorkItem["type"] {
  return [
    "task",
    "decision",
    "approval",
    "milestone",
    "idea",
    "request",
  ].includes(type)
    ? (type as WorkItem["type"])
    : "task";
}

function workActionLabel(item: WorkItem) {
  if (item.type === "decision") return "Review decision";
  if (item.type === "approval") return "Review approval";
  if (item.status === "blocked") return "Unblock";
  return "Open work";
}

function workItemHref(item: WorkItem) {
  const workspace = demoWorkspaces.find(
    (candidate) => candidate.id === item.workspaceId,
  );
  if (item.type === "decision" && workspace)
    return workspaceHref(workspace.slug, "decisions");
  if (item.type === "approval" && workspace)
    return workspaceHref(workspace.slug, "approvals");
  return workspace
    ? `${workspaceHref(workspace.slug)}/boards/${item.boardId}`
    : "/app/portfolio";
}

function signalHref(group: GroupedSignal) {
  const item = demoItems.find((candidate) => candidate.id === group.entityId);
  const workspace = demoWorkspaces.find(
    (candidate) => candidate.id === group.workspaceId,
  );
  if (group.signals.some((signal) => signal.signalType === "waiting_too_long"))
    return workspace
      ? workspaceHref(workspace.slug, "waiting")
      : "/app/portfolio";
  if (item?.type === "decision" && workspace)
    return workspaceHref(workspace.slug, "decisions");
  if (item?.type === "approval" && workspace)
    return workspaceHref(workspace.slug, "approvals");
  if (item && workspace)
    return `${workspaceHref(workspace.slug)}/boards/${item.boardId}`;
  return workspace ? workspaceHref(workspace.slug) : "/app/portfolio";
}

function signalActionLabel(group: GroupedSignal) {
  const types = group.signals.map((signal) => signal.signalType);
  if (types.includes("missing_owner")) return "Assign owner";
  if (types.some((type) => type.includes("decision"))) return "Decide";
  if (types.some((type) => type.includes("approval"))) return "Review";
  if (types.some((type) => type.includes("blocked"))) return "Unblock";
  if (types.some((type) => type.includes("overdue"))) return "Reset date";
  if (types.some((type) => type.includes("stale"))) return "Request update";
  return "Open";
}

function exportDashboard(items: WorkItem[], scopeName?: string) {
  const rows = items.map((item) =>
    [
      item.id,
      item.title,
      item.type,
      STATUS_META[item.status].label,
      PRIORITY_META[item.priority]?.label ?? item.priority,
      item.assignee ?? "Unassigned",
      item.dueDate ?? "",
      workspaceForDashboard(item.workspaceId),
    ]
      .map(safeCsvCell)
      .join(","),
  );
  downloadDashboardFile(
    `trevv-dashboard-${scopeName?.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "view"}.csv`,
    ["id,title,type,status,priority,owner,due_date,workspace", ...rows].join(
      "\n",
    ),
    "text/csv;charset=utf-8",
  );
}

function downloadDashboardFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function workspaceForDashboard(workspaceId: string): string {
  return (
    demoWorkspaces.find((workspace) => workspace.id === workspaceId)?.name ??
    "Unknown workspace"
  );
}
