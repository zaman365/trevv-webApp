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
  boardForHub,
  calculateHubProgress,
  hubBySlug,
  itemsForHub,
  rollupHub,
} from "@founderhq/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { PageHero, StatTile } from "./ui-kit";
import { productCopy } from "@/lib/product-copy";
import { labelForType } from "@/lib/terminology";
import { useCustomHubs } from "@/lib/custom-hubs";
import { workspaceDirectoryHref, workspaceHref } from "@/lib/workspace-routes";

const hubHealthCopy: Record<string, string> = {
  on_track: "On track",
  watch: "Watch",
  critical: "Critical",
  parked: "Parked",
};

const hubTabIds = [
  "overview",
  "work",
  "milestones",
  "updates",
  "decisions",
  "ideas",
  "files",
  "team",
] as const;
type HubTabId = (typeof hubTabIds)[number];

export function HubOverview({ slug }: { slug: string }) {
  const customRecord = useCustomHubs().find(
    (record) => record.hub.slug === slug,
  );
  const hub = hubBySlug(slug) ?? customRecord?.hub;
  if (!hub)
    return (
      <WorkspaceFrame active="hub" hubSlug={slug}>
        <main className="hub-main board-not-found">
          <h1>Workspace not found</h1>
          <Link href={workspaceDirectoryHref()}>Return to all workspaces</Link>
        </main>
      </WorkspaceFrame>
    );
  return (
    <HubWorkspace boardOverride={customRecord?.board} key={hub.id} hub={hub} />
  );
}

function HubWorkspace({
  hub,
  boardOverride,
}: {
  hub: NonNullable<ReturnType<typeof hubBySlug>>;
  boardOverride?: ReturnType<typeof boardForHub>;
}) {
  const [activeTab, setActiveTab] = useState<HubTabId>("overview");
  const [summary, setSummary] = useState(
    `${hub.healthNote} The team is focused on ${hub.priority.toLocaleLowerCase()}, with the next review aligned to ${hub.nextMilestone.title}.`,
  );
  const [summaryDraft, setSummaryDraft] = useState(summary);
  const [editingSummary, setEditingSummary] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [updates, setUpdates] = useState([
    { id: "seed", text: hub.latestUpdate.text, date: hub.latestUpdate.date },
  ]);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAllTeam, setShowAllTeam] = useState(false);
  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.slice(1) as HubTabId;
      setActiveTab(hubTabIds.includes(hash) ? hash : "overview");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);
  const activateTab = (tab: HubTabId) => {
    setActiveTab(tab);
    const url = tab === "overview" ? window.location.pathname : `#${tab}`;
    window.history.replaceState(null, "", url);
    document
      .getElementById(tab)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const hubItems = itemsForHub(hub.id);
  const rollup = rollupHub(
    hub,
    hubItems,
    new Date("2026-08-24T12:00:00+02:00"),
  );
  const board = boardForHub(hub.id) ?? boardOverride;
  const boardHref = board
    ? `${workspaceHref(hub.slug)}/boards/${board.id}`
    : workspaceHref(hub.slug);
  const progress = calculateHubProgress(hub);
  const decisions = hubItems.filter(
    (item) =>
      item.status !== "done" &&
      (item.type === "decision" || item.type === "approval"),
  );
  const ideas = hubItems.filter((item) => item.type === "idea");
  const completedItems = hubItems.filter(
    (item) => item.status === "done",
  ).length;
  const datedItems = hubItems.filter((item) => item.dueDate).length;
  const onTimeItems = Math.max(0, datedItems - rollup.overdue);
  const calculatedMetrics = [
    {
      label: "Scoped progress",
      value: progress === null ? "Manual" : `${progress}%`,
      trend: `${completedItems}/${hubItems.length} done`,
    },
    {
      label: "On-time work",
      value: datedItems === 0 ? "—" : `${onTimeItems}/${datedItems}`,
      trend: rollup.overdue === 0 ? "On track" : `${rollup.overdue} overdue`,
    },
  ];
  const team = Array.from(
    new Set(
      [hub.lead.name, ...hubItems.map((item) => item.assignee)].filter(Boolean),
    ),
  ) as string[];
  const copy = productCopy.en.hub;
  return (
    <WorkspaceFrame active="hub" hubSlug={hub.slug}>
      <main
        className="hub-main"
        style={{ "--hub-accent": hub.accent } as React.CSSProperties}
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
              {labelForType(hub.type)} · {hub.stage} · Led by {hub.lead.name}
            </>
          }
          title={hub.name}
          hintId="hubs"
          badge={
            <>
              <span className="scope-view-badge project-scope-badge">
                <FolderKanban size={13} />
                Workspace
              </span>
              <span className={`health-badge ${hub.health}`}>
                {hubHealthCopy[hub.health]}
              </span>
            </>
          }
          subtitle={hub.healthNote}
          accent={hub.accent}
          monogram={hub.icon}
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
              {hub.slug === "localreach" && (
                <Link
                  className="quiet-button"
                  href={`${workspaceHref(hub.slug)}/stakeholder`}
                >
                  <ExternalLink size={14} />
                  Stakeholder view
                </Link>
              )}
              <div className="hub-more-wrap">
                <button
                  aria-expanded={moreOpen}
                  className="icon-button"
                  aria-label="More actions"
                  onClick={() => setMoreOpen((current) => !current)}
                >
                  <MoreHorizontal size={17} />
                </button>
                {moreOpen && (
                  <div className="hub-action-menu" role="menu">
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
                      href={workspaceHref(hub.slug, "settings")}
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
                    : `${completedItems} of ${hubItems.length} complete · weighted by status`
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
                href={workspaceHref(hub.slug, "decisions")}
              />
            </>
          }
        />
        <nav className="hub-tabs">
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
          {hubTabIds.slice(2).map((tab) => (
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
        <div className="hub-content-grid" id="overview">
          <div className="hub-primary-column">
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
                  <strong>{hub.priority}</strong>
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
                  <p>Published by {hub.lead.name} · 1 day ago</p>
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
                        style={{ background: hub.lead.color }}
                      >
                        {hub.lead.initials}
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
                        <p>{hub.priority}</p>
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
                          {hub.nextMilestone.title} · {hub.nextMilestone.date}
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
              <div className="hub-activity">
                {ideas.map((item) => (
                  <Activity
                    icon={Lightbulb}
                    tone="primary"
                    title={`${item.title} · ${item.status.replace("_", " ")}`}
                    meta={`${item.assignee ?? "Unassigned"} · ${item.dueDate ?? "No due date"}`}
                    href={workspaceHref(hub.slug, "ideas")}
                    key={item.id}
                  />
                ))}
                {ideas.length === 0 && (
                  <p>No ideas have been captured for this project yet.</p>
                )}
              </div>
            </section>
          </div>
          <aside className="hub-secondary-column">
            <section className="side-overview-card" id="milestones">
              <header>
                <CalendarDays size={15} />
                <h2>{copy.milestone}</h2>
              </header>
              <strong>{hub.nextMilestone.title}</strong>
              <time>{hub.nextMilestone.date}</time>
              {progress !== null ? (
                <>
                  <div className="milestone-track">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                  <span>{progress}% of scoped work complete</span>
                </>
              ) : (
                <span>
                  Ongoing Hub · completion percentage is intentionally off
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
                      ? workspaceHref(hub.slug, "decisions")
                      : workspaceHref(hub.slug, "approvals")
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
                  <strong>{hub.name} designs</strong>
                  <small>Figma</small>
                </div>
                <ExternalLink size={12} />
              </a>
              <a href="https://github.com">
                <span className="mini-tone dark">
                  <GitBranch size={13} />
                </span>
                <div>
                  <strong>{hub.name} repository</strong>
                  <small>GitHub</small>
                </div>
                <ExternalLink size={12} />
              </a>
              <a href="https://docs.google.com">
                <span className="mini-tone blue">D</span>
                <div>
                  <strong>{hub.name} evidence</strong>
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
              className="capture-dialog hub-update-dialog"
              aria-labelledby="hub-update-title"
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
                  <h2 id="hub-update-title">Post a workspace update</h2>
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
