"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Copy,
  ExternalLink,
  FileQuestion,
  FolderKanban,
  GitBranch,
  Lightbulb,
  Link2,
  MoreHorizontal,
  Plus,
  Send,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  boardForWorkspace,
  calculateWorkspaceProgress,
  workspaceBySlug,
  itemsForWorkspace,
  rollupWorkspace,
} from "@founderhq/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { PageHero, StatTile } from "./ui-kit";
import { productCopy } from "@/lib/product-copy";
import { labelForType } from "@/lib/terminology";
import { useCustomWorkspaces } from "@/lib/custom-workspaces";
import { workspaceHref } from "@/lib/workspace-routes";

const workspaceHealthCopy: Record<string, string> = {
  on_track: "On track",
  watch: "Watch",
  critical: "Critical",
  parked: "Parked",
};

const workspaceTabIds = [
  "overview",
  "work",
  "milestones",
  "updates",
  "decisions",
  "ideas",
  "files",
  "team",
] as const;
type WorkspaceTabId = (typeof workspaceTabIds)[number];

export function WorkspaceOverview({ slug }: { slug: string }) {
  const customRecord = useCustomWorkspaces().find(
    (record) => record.workspace.slug === slug,
  );
  const workspace = workspaceBySlug(slug) ?? customRecord?.workspace;
  if (!workspace)
    return (
      <WorkspaceFrame active="workspace" workspaceSlug={slug}>
        <main className="workspace-main board-not-found">
          <h1>Workspace not found</h1>
          <Link href="/app/portfolio">Return to Portfolio</Link>
        </main>
      </WorkspaceFrame>
    );
  return (
    <WorkspaceWorkspace
      boardOverride={customRecord?.board}
      key={workspace.id}
      workspace={workspace}
    />
  );
}

function WorkspaceWorkspace({
  workspace,
  boardOverride,
}: {
  workspace: NonNullable<ReturnType<typeof workspaceBySlug>>;
  boardOverride?: ReturnType<typeof boardForWorkspace>;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("overview");
  const [summary, setSummary] = useState(
    `${workspace.healthNote} The team is focused on ${workspace.priority.toLocaleLowerCase()}, with the next review aligned to ${workspace.nextMilestone.title}.`,
  );
  const [summaryDraft, setSummaryDraft] = useState(summary);
  const [editingSummary, setEditingSummary] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [updates, setUpdates] = useState([
    {
      id: "seed",
      text: workspace.latestUpdate.text,
      date: workspace.latestUpdate.date,
    },
  ]);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAllTeam, setShowAllTeam] = useState(false);
  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.slice(1) as WorkspaceTabId;
      setActiveTab(workspaceTabIds.includes(hash) ? hash : "overview");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);
  const activateTab = (tab: WorkspaceTabId) => {
    setActiveTab(tab);
    const url = tab === "overview" ? window.location.pathname : `#${tab}`;
    window.history.replaceState(null, "", url);
    document
      .getElementById(tab)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const workspaceItems = itemsForWorkspace(workspace.id);
  const rollup = rollupWorkspace(
    workspace,
    workspaceItems,
    new Date("2026-08-24T12:00:00+02:00"),
  );
  const board = boardForWorkspace(workspace.id) ?? boardOverride;
  const boardHref = board
    ? `${workspaceHref(workspace.slug)}/boards/${board.id}`
    : workspaceHref(workspace.slug);
  const progress = calculateWorkspaceProgress(workspace);
  const decisions = workspaceItems.filter(
    (item) =>
      item.status !== "done" &&
      (item.type === "decision" || item.type === "approval"),
  );
  const ideas = workspaceItems.filter((item) => item.type === "idea");
  const completedItems = workspaceItems.filter(
    (item) => item.status === "done",
  ).length;
  const datedItems = workspaceItems.filter((item) => item.dueDate).length;
  const onTimeItems = Math.max(0, datedItems - rollup.overdue);
  const calculatedMetrics = [
    {
      label: "Scoped progress",
      value: progress === null ? "Manual" : `${progress}%`,
      trend: `${completedItems}/${workspaceItems.length} done`,
    },
    {
      label: "On-time work",
      value: datedItems === 0 ? "—" : `${onTimeItems}/${datedItems}`,
      trend: rollup.overdue === 0 ? "On track" : `${rollup.overdue} overdue`,
    },
  ];
  const team = Array.from(
    new Set(
      [
        workspace.lead.name,
        ...workspaceItems.map((item) => item.assignee),
      ].filter(Boolean),
    ),
  ) as string[];
  const copy = productCopy.en.workspace;
  return (
    <WorkspaceFrame active="workspace" workspaceSlug={workspace.slug}>
      <main
        className="workspace-main"
        style={
          { "--workspace-accent": workspace.accent } as React.CSSProperties
        }
      >
        {notice && (
          <div className="workflow-toast success-toast" role="status">
            <CheckCircle2 size={15} />
            <span>{notice}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <PageHero
          eyebrow={
            <>
              {labelForType(workspace.type)} · {workspace.stage} · Led by{" "}
              {workspace.lead.name}
            </>
          }
          title={workspace.name}
          hintId="workspaces"
          badge={
            <>
              <span className="scope-view-badge project-scope-badge">
                <FolderKanban size={13} />
                Workspace
              </span>
              <span className={`health-badge ${workspace.health}`}>
                {workspaceHealthCopy[workspace.health]}
              </span>
            </>
          }
          subtitle={workspace.healthNote}
          accent={workspace.accent}
          monogram={workspace.icon}
          actions={
            <>
              <Link className="primary-button" href={boardHref}>
                <Plus size={16} />
                <span>{copy.addItem}</span>
              </Link>
              <button
                className="quiet-button"
                onClick={() => setUpdateOpen(true)}
              >
                {copy.postUpdate}
              </button>
              {workspace.slug === "localreach" && (
                <Link
                  className="quiet-button"
                  href={`${workspaceHref(workspace.slug)}/stakeholder`}
                >
                  <ExternalLink size={14} />
                  Stakeholder view
                </Link>
              )}
              <div className="workspace-more-wrap">
                <button
                  aria-expanded={moreOpen}
                  className="icon-button"
                  aria-label="More actions"
                  onClick={() => setMoreOpen((current) => !current)}
                >
                  <MoreHorizontal size={17} />
                </button>
                {moreOpen && (
                  <div className="workspace-action-menu" role="menu">
                    <Link href={boardHref} role="menuitem">
                      Open board
                    </Link>
                    <button
                      role="menuitem"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          window.location.href,
                        );
                        setNotice("Workspace link copied.");
                        setMoreOpen(false);
                      }}
                    >
                      <Copy size={13} /> Copy project link
                    </button>
                    <Link
                      href={workspaceHref(workspace.slug, "settings")}
                      role="menuitem"
                    >
                      Connected tools
                    </Link>
                  </div>
                )}
              </div>
            </>
          }
          stats={
            <>
              <StatTile
                icon={TrendingUp}
                value={progress === null ? "Manual" : `${progress}%`}
                label="Scoped progress"
                note={
                  progress === null
                    ? "Set manually"
                    : `${completedItems} of ${workspaceItems.length} complete · weighted by status`
                }
                tone="primary"
                {...(progress !== null ? { meter: progress } : {})}
              />
              <StatTile
                icon={FolderKanban}
                value={rollup.open}
                label="Open work"
                note={`${datedItems} with a date`}
              />
              <StatTile
                icon={AlertTriangle}
                value={rollup.overdue + rollup.blocked}
                label="Overdue or blocked"
                note={`${rollup.overdue} overdue · ${rollup.blocked} blocked`}
                tone={rollup.overdue + rollup.blocked ? "danger" : "neutral"}
              />
              <StatTile
                icon={FileQuestion}
                value={rollup.decisions + rollup.approvals}
                label="Needs a call"
                note="Decisions and approvals"
                tone={
                  rollup.decisions + rollup.approvals ? "warning" : "neutral"
                }
                href={workspaceHref(workspace.slug, "decisions")}
              />
            </>
          }
        />
        <nav className="workspace-tabs">
          <button
            className={activeTab === "overview" ? "active" : ""}
            onClick={() => activateTab("overview")}
          >
            {copy.overview}
          </button>
          <button
            className={activeTab === "work" ? "active" : ""}
            onClick={() => activateTab("work")}
          >
            Work
          </button>
          <a href={boardHref}>Board</a>
          {workspaceTabIds.slice(2).map((tab) => (
            <button
              className={activeTab === tab ? "active" : ""}
              key={tab}
              onClick={() => activateTab(tab)}
            >
              {tab[0]?.toUpperCase()}
              {tab.slice(1)}
            </button>
          ))}
        </nav>
        <div className="workspace-content-grid" id="overview">
          <div className="workspace-primary-column">
            <section className="executive-card">
              <header>
                <div>
                  <span>Executive pulse</span>
                  <h2>{copy.executive}</h2>
                </div>
                <button
                  onClick={() => {
                    if (editingSummary) {
                      setSummaryDraft(summary);
                      setEditingSummary(false);
                    } else setEditingSummary(true);
                  }}
                >
                  {editingSummary ? "Cancel" : copy.editSummary}
                </button>
              </header>
              {editingSummary ? (
                <div className="executive-summary-editor">
                  <textarea
                    aria-label="Executive summary"
                    onChange={(event) => setSummaryDraft(event.target.value)}
                    value={summaryDraft}
                  />
                  <button
                    className="primary-button"
                    disabled={!summaryDraft.trim()}
                    onClick={() => {
                      setSummary(summaryDraft.trim());
                      setEditingSummary(false);
                      setNotice("Executive summary updated.");
                    }}
                  >
                    Save summary
                  </button>
                </div>
              ) : (
                <p>{summary}</p>
              )}
              <div className="executive-grid">
                <div>
                  <span>{copy.currentFocus}</span>
                  <strong>{workspace.priority}</strong>
                </div>
                <div>
                  <span>Primary blocker</span>
                  <strong>
                    {rollup.blocked
                      ? rollup.blocked === 1
                        ? "1 blocked item needs resolution"
                        : `${rollup.blocked} blocked items need resolution`
                      : "No material blocker"}
                  </strong>
                </div>
              </div>
            </section>
            <section className="overview-section" id="work">
              <div className="overview-section-title">
                <div>
                  <h2>{copy.liveSignals}</h2>
                  <p>Calculated directly from accessible work items.</p>
                </div>
                <a href={boardHref}>
                  {copy.viewBoard}
                  <ArrowRight size={13} />
                </a>
              </div>
              <div className="live-signal-cards">
                <Signal
                  icon={FolderKanban}
                  value={rollup.open}
                  label="Open items"
                  tone="primary"
                />
                <Signal
                  icon={AlertTriangle}
                  value={rollup.overdue}
                  label="Overdue"
                  tone="danger"
                />
                <Signal
                  icon={CircleDashed}
                  value={rollup.blocked}
                  label="Blocked"
                  tone="warning"
                />
                <Signal
                  icon={FileQuestion}
                  value={rollup.decisions + rollup.approvals}
                  label="Need attention"
                  tone="violet"
                />
              </div>
            </section>
            <section className="overview-section" id="updates">
              <div className="overview-section-title">
                <div>
                  <h2>{copy.latestUpdate}</h2>
                  <p>Published by {workspace.lead.name} · 1 day ago</p>
                </div>
                <button
                  aria-expanded={showAllUpdates}
                  onClick={() => setShowAllUpdates((current) => !current)}
                >
                  {showAllUpdates ? "Show latest" : "View all updates"}
                </button>
              </div>
              {(showAllUpdates ? updates : updates.slice(0, 1)).map(
                (update) => (
                  <article className="weekly-update" key={update.id}>
                    <div className="update-lead">
                      <span
                        className="avatar"
                        style={{ background: workspace.lead.color }}
                      >
                        {workspace.lead.initials}
                      </span>
                      <div>
                        <strong>What moved</strong>
                        <p>{update.text}</p>
                        <small>{update.date}</small>
                      </div>
                    </div>
                    <div className="weekly-update-grid">
                      <div>
                        <span>Current priority</span>
                        <p>{workspace.priority}</p>
                      </div>
                      <div>
                        <span>Help needed</span>
                        <p>
                          {rollup.blocked > 0
                            ? `Resolve ${rollup.blocked} blocked item${rollup.blocked === 1 ? "" : "s"} and record the evidence.`
                            : rollup.decisions + rollup.approvals > 0
                              ? `Resolve ${rollup.decisions + rollup.approvals} open decision${rollup.decisions + rollup.approvals === 1 ? "" : "s"} or approval${rollup.decisions + rollup.approvals === 1 ? "" : "s"}.`
                              : "No immediate escalation is required."}
                        </p>
                      </div>
                      <div>
                        <span>Next milestone</span>
                        <p>
                          {workspace.nextMilestone.title} ·{" "}
                          {workspace.nextMilestone.date}
                        </p>
                      </div>
                    </div>
                  </article>
                ),
              )}
            </section>
            <section className="overview-section" id="ideas">
              <div className="overview-section-title">
                <div>
                  <h2>Ideas</h2>
                  <p>Opportunities captured for this project.</p>
                </div>
              </div>
              <div className="workspace-activity">
                {ideas.map((item) => (
                  <Activity
                    icon={Lightbulb}
                    tone="primary"
                    title={`${item.title} · ${item.status.replace("_", " ")}`}
                    meta={`${item.assignee ?? "Unassigned"} · ${item.dueDate ?? "No due date"}`}
                    href={workspaceHref(workspace.slug, "ideas")}
                    key={item.id}
                  />
                ))}
                {ideas.length === 0 && (
                  <p>No ideas have been captured for this project yet.</p>
                )}
              </div>
            </section>
          </div>
          <aside className="workspace-secondary-column">
            <section className="side-overview-card" id="milestones">
              <header>
                <CalendarDays size={15} />
                <h2>{copy.milestone}</h2>
              </header>
              <strong>{workspace.nextMilestone.title}</strong>
              <time>{workspace.nextMilestone.date}</time>
              {progress !== null ? (
                <>
                  <div className="milestone-track">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                  <span>{progress}% of scoped work complete</span>
                </>
              ) : (
                <span>
                  Ongoing Workspace · completion percentage is intentionally off
                </span>
              )}
            </section>
            <section className="side-overview-card">
              <header>
                <TrendingUp size={15} />
                <h2>{copy.metrics}</h2>
              </header>
              <div className="side-metrics">
                {calculatedMetrics.map((metric) => (
                  <div key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.trend ?? "Live"}</small>
                  </div>
                ))}
              </div>
            </section>
            <section
              className="side-overview-card attention-list"
              id="decisions"
            >
              <header>
                <FileQuestion size={15} />
                <h2>{copy.decisions}</h2>
              </header>
              {decisions.map((item) => (
                <Link
                  href={
                    item.type === "decision"
                      ? workspaceHref(workspace.slug, "decisions")
                      : workspaceHref(workspace.slug, "approvals")
                  }
                  key={item.id}
                >
                  <span
                    className={`mini-tone ${item.type === "decision" ? "violet" : "green"}`}
                  >
                    {item.type === "decision" ? "D" : "A"}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.priority} · {item.dueDate ?? "No due date"}
                    </small>
                  </div>
                  <ArrowRight size={13} />
                </Link>
              ))}
              {decisions.length === 0 && <p>No open decisions or approvals.</p>}
            </section>
            <section className="side-overview-card resources-list" id="files">
              <header>
                <Link2 size={15} />
                <h2>{copy.connected}</h2>
              </header>
              <a href="https://www.figma.com">
                <span className="mini-tone dark">F</span>
                <div>
                  <strong>{workspace.name} designs</strong>
                  <small>Figma</small>
                </div>
                <ExternalLink size={12} />
              </a>
              <a href="https://github.com">
                <span className="mini-tone dark">
                  <GitBranch size={13} />
                </span>
                <div>
                  <strong>{workspace.name} repository</strong>
                  <small>GitHub</small>
                </div>
                <ExternalLink size={12} />
              </a>
              <a href="https://docs.google.com">
                <span className="mini-tone blue">D</span>
                <div>
                  <strong>{workspace.name} evidence</strong>
                  <small>Google Drive</small>
                </div>
                <ExternalLink size={12} />
              </a>
            </section>
            <section className="side-overview-card team-row" id="team">
              <header>
                <Users size={15} />
                <h2>{copy.team}</h2>
              </header>
              <div>
                {team.slice(0, showAllTeam ? team.length : 5).map((name) => (
                  <span className="avatar avatar-mz" title={name} key={name}>
                    {name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                ))}
                {team.length > 5 && (
                  <button
                    aria-expanded={showAllTeam}
                    onClick={() => setShowAllTeam((current) => !current)}
                  >
                    {showAllTeam ? "Show less" : `+${team.length - 5}`}
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>
        {updateOpen && (
          <div
            className="dialog-layer"
            role="presentation"
            onMouseDown={() => setUpdateOpen(false)}
          >
            <form
              className="capture-dialog workspace-update-dialog"
              aria-labelledby="workspace-update-title"
              aria-modal="true"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                if (!updateText.trim()) return;
                setUpdates((current) => [
                  {
                    id: `update-${Date.now()}`,
                    text: updateText.trim(),
                    date: new Date().toISOString().slice(0, 10),
                  },
                  ...current,
                ]);
                setUpdateText("");
                setUpdateOpen(false);
                setNotice("Workspace update published.");
              }}
              role="dialog"
            >
              <header>
                <span className="attention-icon">
                  <Send size={16} />
                </span>
                <div>
                  <h2 id="workspace-update-title">Post a workspace update</h2>
                  <p>
                    Record what moved, what is blocked, and what happens next.
                  </p>
                </div>
                <button
                  aria-label="Close update"
                  onClick={() => setUpdateOpen(false)}
                  type="button"
                >
                  <X size={17} />
                </button>
              </header>
              <label className="stacked-field">
                What changed?
                <textarea
                  autoFocus
                  onChange={(event) => setUpdateText(event.target.value)}
                  placeholder="Summarize meaningful movement and the next commitment…"
                  value={updateText}
                />
              </label>
              <footer>
                <button onClick={() => setUpdateOpen(false)} type="button">
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={!updateText.trim()}
                  type="submit"
                >
                  <Send size={14} /> Publish update
                </button>
              </footer>
            </form>
          </div>
        )}
      </main>
    </WorkspaceFrame>
  );
}

function Signal({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof FolderKanban;
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <article className={`live-signal signal-${tone}`}>
      <span>
        <Icon size={15} />
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}
function Activity({
  icon: Icon,
  tone,
  title,
  meta,
  href,
}: {
  icon: typeof CheckCircle2;
  tone: string;
  title: string;
  meta: string;
  href: string;
}) {
  return (
    <article>
      <span className={`activity-icon ${tone}`}>
        <Icon size={14} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{meta}</small>
      </div>
      <Link aria-label={`Open ${title}`} href={href}>
        <ArrowRight size={15} />
      </Link>
    </article>
  );
}
