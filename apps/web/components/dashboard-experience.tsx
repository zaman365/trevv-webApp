"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Blocks,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Download,
  Filter,
  Gauge,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  PieChart,
  Plus,
  Search,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import {
  demoHubs,
  demoItems,
  demoPortfolios,
  type WorkItem,
} from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { type GroupedSignal, NOW } from "@/lib/attention";
import { useCapturedWork } from "@/lib/captured-work";
import { summarizePortfolio } from "@/lib/portfolios";
import { vocabularyFor } from "@/lib/terminology";
import { useWorkspace } from "@/lib/workspace-context";
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
  | "hub"
  | "hub_overdue"
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

export function DashboardExperience() {
  return (
    <WorkspaceFrame active="reviews">
      <DashboardMain />
    </WorkspaceFrame>
  );
}

function DashboardMain() {
  const { scope, portfolioId, setPortfolioId, setCaptureOpen } = useWorkspace();
  const capturedWork = useCapturedWork();
  const vocab = vocabularyFor();
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("open");
  const [lens, setLens] = useState<DashboardLens>(DEFAULT_LENS);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const portfolio = demoPortfolios.find((item) => item.id === portfolioId);
  const summary = useMemo(
    () => (portfolio ? summarizePortfolio(portfolio) : undefined),
    [portfolio],
  );

  const allItems = useMemo<WorkItem[]>(() => {
    const hubIds = new Set(scope.hubs.map((hub) => hub.id));
    const existingIds = new Set(scope.items.map((item) => item.id));
    const capturedItems = capturedWork
      .filter((item) => hubIds.has(item.hubId) && !existingIds.has(item.id))
      .map<WorkItem>((item) => ({
        id: item.id,
        hubId: item.hubId,
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
    return [...scope.items, ...capturedItems];
  }, [capturedWork, scope.hubs, scope.items]);

  const openItems = useMemo(
    () => allItems.filter((item) => item.status !== "done"),
    [allItems],
  );
  const items = useMemo(
    () => (scopeFilter === "open" ? openItems : allItems),
    [allItems, openItems, scopeFilter],
  );

  const attentionItemIds = useMemo(
    () => new Set(scope.attention.map((group) => group.entityId)),
    [scope.attention],
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
      scope.hubs
        .map((hub) => ({
          key: hub.id,
          label: hub.name,
          value: items.filter((item) => item.hubId === hub.id).length,
          color: hub.accent,
          badge: (
            <span
              className="bar-avatar"
              style={{
                background: `color-mix(in srgb, ${hub.accent} 16%, var(--fh-surface))`,
              }}
              aria-hidden="true"
            >
              {hub.icon}
            </span>
          ),
        }))
        .filter((bar) => bar.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [items, scope.hubs],
  );

  const overdueBars: Bar[] = useMemo(
    () =>
      scope.hubs
        .map((hub) => ({
          key: hub.id,
          label: hub.name,
          value: overdueItems.filter((item) => item.hubId === hub.id).length,
          color: "var(--fh-danger)",
        }))
        .filter((bar) => bar.value > 0)
        .sort((a, b) => b.value - a.value),
    [overdueItems, scope.hubs],
  );

  const pressureIndex = useMemo(() => {
    if (!openItems.length) return 0;
    const criticalHubs = scope.hubs.filter(
      (hub) => hub.health === "critical",
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
          criticalHubs * 7 +
          unassignedItems.filter((item) =>
            ["urgent", "high"].includes(item.priority),
          ).length *
            5,
      ),
    );
  }, [counts.blocked, openItems, riskItemIds, scope.hubs, unassignedItems]);

  const pressure =
    pressureIndex >= 68
      ? { label: "Intervention needed", tone: "critical" }
      : pressureIndex >= 40
        ? { label: "Watch the load", tone: "watch" }
        : { label: "Operating cleanly", tone: "healthy" };
  const topSignal = scope.attention[0];
  const topOwner = ownerLoad.find(([owner]) => owner !== "Unassigned");
  const capturedCount = Math.max(0, allItems.length - scope.items.length);

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
        const hub = demoHubs.find((candidate) => candidate.id === item.hubId);
        return [item.title, item.assignee, hub?.name, item.type, item.priority]
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

  return (
    <main className="trevv-main dashboard-main">
      <PageHero
        eyebrow={<>Reporting · {portfolio?.name}</>}
        title="Dashboard"
        subtitle={`A live command view across every ${vocab.one.toLowerCase()} in this ${vocab.groupOne.toLowerCase()}. Select any number or chart to inspect the work behind it.`}
        hintId="dashboard"
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
              onClick={() => exportDashboard(items, portfolio?.name)}
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
      />

      <section
        className="dashboard-intelligence-grid"
        aria-label="TREVV portfolio briefing"
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
                ? `${counts.attention} commitments need intervention before the portfolio can move cleanly.`
                : "The portfolio has no unresolved intervention signals."}
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
            <Link className="secondary-button" href="/app/attention">
              Open Attention center <ArrowRight size={14} />
            </Link>
          </div>

          <ol className="dashboard-next-actions">
            {scope.attention.slice(0, 3).map((group, index) => (
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
          <div className="dashboard-lens-presets" aria-label="Work lenses">
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
              const hub = demoHubs.find(
                (candidate) => candidate.id === item.hubId,
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
                      {hub?.name ?? "Unknown project"} · {typeLabel(item.type)}
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
          <p>Explore the portfolio</p>
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
            emptyNote={`No work in this ${vocab.groupOne.toLowerCase()}.`}
            onSelect={(bar) =>
              focusLens({
                kind: "hub",
                key: bar.key,
                label: bar.label,
                note: `Source work currently attached to ${bar.label}.`,
              })
            }
            {...(lens.kind === "hub" && lens.key
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
                kind: "hub_overdue",
                key: bar.key,
                label: `${bar.label} · overdue`,
                note: `Late commitments currently attached to ${bar.label}.`,
              })
            }
            {...(lens.kind === "hub_overdue" && lens.key
              ? { selectedKey: lens.key }
              : {})}
          />
        </Widget>

        <Widget
          icon={CheckCircle2}
          title={`${vocab.one} health`}
          note={`${summary?.count ?? 0} ${vocab.many.toLowerCase()} · live health evidence`}
          span={6}
          hintId="portfolios"
          exportData={{
            health: summary?.health ?? [],
            focus: summary?.focus ?? null,
          }}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <div className="widget-health">
            <HealthBar slices={summary?.health ?? []} />
            {summary?.focus && (
              <p className="widget-focus">
                <b>Most urgent</b>
                <Link href={`/app/hubs/${summary.focus.hub.slug}`}>
                  {summary.focus.hub.name}
                </Link>
                <small>{summary.focus.hub.healthNote}</small>
              </p>
            )}
          </div>
        </Widget>
      </div>
    </main>
  );
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
  if (lens.kind === "hub") return item.hubId === lens.key;
  if (lens.kind === "hub_overdue")
    return item.hubId === lens.key && isOverdue(item);
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
  if (item.type === "decision") return "/app/decisions";
  if (item.type === "approval") return "/app/approvals";
  const hub = demoHubs.find((candidate) => candidate.id === item.hubId);
  return hub ? `/app/hubs/${hub.slug}/boards/${item.boardId}` : "/app/my-work";
}

function signalHref(group: GroupedSignal) {
  const item = demoItems.find((candidate) => candidate.id === group.entityId);
  const hub = demoHubs.find((candidate) => candidate.id === group.hubId);
  if (group.signals.some((signal) => signal.signalType === "waiting_too_long"))
    return "/app/waiting";
  if (item?.type === "decision") return "/app/decisions";
  if (item?.type === "approval") return "/app/approvals";
  if (item && hub) return `/app/hubs/${hub.slug}/boards/${item.boardId}`;
  return hub ? `/app/hubs/${hub.slug}` : "/app/attention";
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

function exportDashboard(items: WorkItem[], portfolioName?: string) {
  const rows = items.map((item) =>
    [
      item.id,
      item.title,
      item.type,
      STATUS_META[item.status].label,
      PRIORITY_META[item.priority]?.label ?? item.priority,
      item.assignee ?? "Unassigned",
      item.dueDate ?? "",
      hubForDashboard(item.hubId),
    ]
      .map(csvValue)
      .join(","),
  );
  downloadDashboardFile(
    `trevv-dashboard-${portfolioName?.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "portfolio"}.csv`,
    ["id,title,type,status,priority,owner,due_date,hub", ...rows].join("\n"),
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

function csvValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function hubForDashboard(hubId: string): string {
  return demoHubs.find((hub) => hub.id === hubId)?.name ?? "Unknown Hub";
}
