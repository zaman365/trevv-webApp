"use client";

import {
  AlertTriangle,
  Blocks,
  CalendarClock,
  CheckCircle2,
  Download,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  PieChart,
  TrendingUp,
  Users,
} from "lucide-react";
import { demoHubs, demoPortfolios, type WorkItem } from "@founderhq/core";
import { useMemo, useState, type ReactNode } from "react";
import { summarizePortfolio } from "@/lib/portfolios";
import { vocabularyFor } from "@/lib/terminology";
import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceFrame } from "./workspace-frame";
import { BarChart, DonutChart, type Bar, type Slice } from "./charts";
import { HealthBar, PageHero, StatTile } from "./ui-kit";
import { Hint } from "./learning-center";

export function DashboardExperience() {
  return (
    <WorkspaceFrame active="reviews">
      <DashboardMain />
    </WorkspaceFrame>
  );
}

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

const NOW = new Date("2026-08-24T12:00:00.000Z");

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

function DashboardMain() {
  const { scope, portfolioId, setPortfolioId } = useWorkspace();
  const vocab = vocabularyFor();
  const [scopeFilter, setScopeFilter] = useState<"all" | "open">("open");

  const portfolio = demoPortfolios.find((item) => item.id === portfolioId);
  const summary = useMemo(
    () => (portfolio ? summarizePortfolio(portfolio) : undefined),
    [portfolio],
  );

  const items = useMemo(
    () =>
      scopeFilter === "open"
        ? scope.items.filter((item) => item.status !== "done")
        : scope.items,
    [scope.items, scopeFilter],
  );

  const counts = useMemo(() => {
    const overdue = scope.items.filter(
      (item) =>
        item.status !== "done" &&
        item.dueDate &&
        new Date(`${item.dueDate}T23:59:59Z`) < NOW,
    ).length;
    return {
      all: scope.items.length,
      working: scope.items.filter((item) => item.status === "working").length,
      blocked: scope.items.filter((item) => item.status === "blocked").length,
      done: scope.items.filter((item) => item.status === "done").length,
      overdue,
    };
  }, [scope.items]);

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

  const ownerBars: Bar[] = useMemo(() => {
    const byOwner = new Map<string, number>();
    for (const item of items) {
      const owner = item.assignee ?? "Unassigned";
      byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
    }
    return [...byOwner.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([owner, value]) => ({
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
      }));
  }, [items]);

  // Work per project, so a reader can see where the load actually sits.
  const projectBars: Bar[] = useMemo(
    () =>
      (summary?.projects ?? [])
        .map((project) => ({
          key: project.hub.id,
          label: project.hub.name,
          value: project.rollup.open,
          color: project.hub.accent,
          badge: (
            <span
              className="bar-avatar"
              style={{
                background: `color-mix(in srgb, ${project.hub.accent} 16%, var(--fh-surface))`,
              }}
              aria-hidden="true"
            >
              {project.hub.icon}
            </span>
          ),
        }))
        .filter((bar) => bar.value > 0)
        .slice(0, 8),
    [summary],
  );

  const overdueBars: Bar[] = useMemo(
    () =>
      (summary?.projects ?? [])
        .map((project) => ({
          key: project.hub.id,
          label: project.hub.name,
          value: project.rollup.overdue,
          color: "var(--fh-danger)",
        }))
        .filter((bar) => bar.value > 0),
    [summary],
  );

  return (
    <main className="trevv-main dashboard-main">
      <PageHero
        eyebrow={<>Reporting · {portfolio?.name}</>}
        title="Dashboard"
        subtitle={`Live reporting across every ${vocab.one.toLowerCase()} in this ${vocab.groupOne.toLowerCase()}. Nothing here is entered by hand.`}
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
              onClick={() => {
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
                  `trevv-dashboard-${portfolio?.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "portfolio"}.csv`,
                  [
                    "id,title,type,status,priority,owner,due_date,hub",
                    ...rows,
                  ].join("\n"),
                  "text/csv;charset=utf-8",
                );
              }}
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
              note={`${counts.done} complete`}
              hintId="dashboard"
            />
            <StatTile
              icon={TrendingUp}
              value={counts.working}
              label="In progress"
              note="Actively being worked"
              tone="primary"
            />
            <StatTile
              icon={Blocks}
              value={counts.blocked}
              label="Stuck"
              note="Blocked on something"
              tone="danger"
            />
            <StatTile
              icon={AlertTriangle}
              value={counts.overdue}
              label="Overdue"
              note="Past their due date"
              tone="warning"
            />
          </>
        }
      />

      <div className="widget-grid">
        <Widget
          icon={PieChart}
          title="Work by status"
          note={scopeFilter === "open" ? "Open work only" : "All time"}
          span={4}
          hintId="dashboard-status"
          exportData={statusSlices}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <DonutChart slices={statusSlices} totalLabel="items" />
        </Widget>

        <Widget
          icon={Users}
          title="Work by owner"
          note="Top owners by open items"
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
          <BarChart bars={ownerBars} emptyNote="No owners assigned yet." />
        </Widget>

        <Widget
          icon={LayoutGrid}
          title={`Open work by ${vocab.one.toLowerCase()}`}
          note="Where the load actually sits"
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
            emptyNote={`No open work in this ${vocab.groupOne.toLowerCase()}.`}
          />
        </Widget>

        <Widget
          icon={CalendarClock}
          title="Work by priority"
          note="How the queue is weighted"
          span={4}
          hintId="dashboard-status"
          exportData={prioritySlices}
          scopeFilter={scopeFilter}
          onScopeFilter={setScopeFilter}
        >
          <DonutChart slices={prioritySlices} totalLabel="items" />
        </Widget>

        <Widget
          icon={AlertTriangle}
          title={`Overdue by ${vocab.one.toLowerCase()}`}
          note="Only projects with something late"
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
            emptyNote="Nothing is overdue. "
          />
        </Widget>

        <Widget
          icon={CheckCircle2}
          title={`${vocab.one} health`}
          note={`${summary?.count ?? 0} ${vocab.many.toLowerCase()}`}
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
                <span>{summary.focus.hub.name}</span>
                <small>{summary.focus.hub.healthNote}</small>
              </p>
            )}
          </div>
        </Widget>
      </div>
    </main>
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
  scopeFilter: "all" | "open";
  onScopeFilter: (scope: "all" | "open") => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section
      className="widget"
      style={{ "--span": span } as React.CSSProperties}
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

function hubForDashboard(hubId: string): string {
  return demoHubs.find((hub) => hub.id === hubId)?.name ?? "Unknown Hub";
}
