"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileQuestion,
  FolderKanban,
  GitBranch,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  TrendingUp,
  Users,
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
import { productCopy } from "@/lib/product-copy";

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
  const hub = hubBySlug(slug);
  if (!hub)
    return (
      <WorkspaceFrame active="hub" hubSlug={slug}>
        <main className="hub-main board-not-found">
          <h1>Hub not found</h1>
          <Link href="/app/hubs">Return to All Hubs</Link>
        </main>
      </WorkspaceFrame>
    );
  return <HubWorkspace key={hub.id} hub={hub} />;
}

function HubWorkspace({
  hub,
}: {
  hub: NonNullable<ReturnType<typeof hubBySlug>>;
}) {
  const [activeTab, setActiveTab] = useState<HubTabId>("overview");
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
  const board = boardForHub(hub.id);
  const boardHref = board
    ? `/app/hubs/${hub.slug}/boards/${board.id}`
    : `/app/hubs/${hub.slug}`;
  const progress = calculateHubProgress(hub);
  const decisions = hubItems.filter(
    (item) =>
      item.status !== "done" &&
      (item.type === "decision" || item.type === "approval"),
  );
  const recentItems = hubItems.slice(0, 3);
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
        <header className="hub-page-header">
          <div className="hub-page-identity">
            <span>{hub.icon}</span>
            <div>
              <p>
                {hub.type.replaceAll("_", " ")} · {hub.stage}
              </p>
              <h1>{hub.name}</h1>
              <small>Lead by {hub.lead.name}</small>
            </div>
          </div>
          <div className="hub-page-actions">
            <a href={boardHref}>
              <Plus size={15} />
              {copy.addItem}
            </a>
            <button>{copy.postUpdate}</button>
            {hub.slug === "localreach" && (
              <a href={`/app/hubs/${hub.slug}/stakeholder`}>
                <ExternalLink size={14} />
                Stakeholder view
              </a>
            )}
            <button aria-label="More actions">
              <MoreHorizontal size={17} />
            </button>
          </div>
        </header>
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
                <button>{copy.editSummary}</button>
              </header>
              <p>
                {hub.healthNote} The team is focused on{" "}
                <strong>{hub.priority.toLocaleLowerCase()}</strong>, with the
                next review framed around one important decision and the
                evidence needed to move confidently.
              </p>
              <div className="executive-grid">
                <div>
                  <span>{copy.currentFocus}</span>
                  <strong>{hub.priority}</strong>
                </div>
                <div>
                  <span>Primary blocker</span>
                  <strong>
                    {rollup.blocked
                      ? "External evidence and final approval"
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
                <button>View all updates</button>
              </div>
              <article className="weekly-update">
                <div className="update-lead">
                  <span
                    className="avatar"
                    style={{ background: hub.lead.color }}
                  >
                    {hub.lead.initials}
                  </span>
                  <div>
                    <strong>What moved</strong>
                    <p>{hub.latestUpdate.text}</p>
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
                      Approve the recommended option so the launch path stays
                      intact.
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
            </section>
            <section className="overview-section" id="ideas">
              <div className="overview-section-title">
                <div>
                  <h2>{copy.recentActivity}</h2>
                  <p>The last meaningful changes across this Hub.</p>
                </div>
              </div>
              <div className="hub-activity">
                {recentItems.map((item) => (
                  <Activity
                    icon={item.status === "done" ? CheckCircle2 : MessageSquare}
                    tone={item.status === "blocked" ? "warning" : "primary"}
                    title={`${item.title} · ${item.status.replace("_", " ")}`}
                    meta={`${item.assignee ?? "Unassigned"} · ${item.dueDate ?? "No due date"}`}
                    key={item.id}
                  />
                ))}
                {recentItems.length === 0 && (
                  <p>No work activity has been recorded for this Hub yet.</p>
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
                {hub.metrics.map((metric) => (
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
                <a
                  href={
                    item.type === "decision"
                      ? "/app/decisions"
                      : "/app/approvals"
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
                </a>
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
                {team.slice(0, 5).map((name) => (
                  <span className="avatar avatar-mz" title={name} key={name}>
                    {name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                ))}
                {team.length > 5 && <button>+{team.length - 5}</button>}
              </div>
            </section>
          </aside>
        </div>
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
}: {
  icon: typeof CheckCircle2;
  tone: string;
  title: string;
  meta: string;
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
      <button aria-label={`Actions for ${title}`}>
        <MoreHorizontal size={15} />
      </button>
    </article>
  );
}
