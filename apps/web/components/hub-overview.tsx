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
import { demoHubs, demoItems, rollupHub } from "@founderhq/core";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";

export function HubOverview({ slug }: { slug: string }) {
  const hub =
    demoHubs.find((candidate) => candidate.slug === slug) ?? demoHubs[0];
  if (!hub) return null;
  const rollup = rollupHub(
    hub,
    demoItems,
    new Date("2026-08-24T12:00:00+02:00"),
  );
  const boardId =
    demoItems.find((item) => item.hubId === hub.id)?.boardId ??
    "b-northstar-launch";
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
                {hub.type.replace("_", " ")} · {hub.stage}
              </p>
              <h1>{hub.name}</h1>
              <small>Lead by {hub.lead.name}</small>
            </div>
          </div>
          <div className="hub-page-actions">
            <a href={`/app/hubs/${hub.slug}/boards/${boardId}`}>
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
          <a className="active" href={`/app/hubs/${hub.slug}`}>
            {copy.overview}
          </a>
          <a href="#work">Work</a>
          <a href={`/app/hubs/${hub.slug}/boards/${boardId}`}>Board</a>
          <a href="#milestones">Milestones</a>
          <a href="#updates">Updates</a>
          <a href="#decisions">Decisions</a>
          <a href="#ideas">Ideas</a>
          <a href="#files">Files</a>
          <a href="#team">Team</a>
        </nav>
        <div className="hub-content-grid">
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
                <a href={`/app/hubs/${hub.slug}/boards/${boardId}`}>
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
                <Activity
                  icon={CheckCircle2}
                  tone="success"
                  title="Polo photography moved to Review"
                  meta="Nora · 32 minutes ago"
                />
                <Activity
                  icon={MessageSquare}
                  tone="primary"
                  title="Amira posted compliance evidence notes"
                  meta="Launch board · 2 hours ago"
                />
                <Activity
                  icon={FileQuestion}
                  tone="warning"
                  title="Storefront offer decision requested"
                  meta="Mohammed · Yesterday"
                />
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
              {hub.progressMode && hub.progressMode !== "none" ? (
                <>
                  <div className="milestone-track">
                    <i style={{ width: "68%" }} />
                  </div>
                  <span>68% of milestone work complete</span>
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
              <a href="/app/decisions">
                <span className="mini-tone violet">D</span>
                <div>
                  <strong>Choose storefront launch offer</strong>
                  <small>Urgent · due tomorrow</small>
                </div>
                <ArrowRight size={13} />
              </a>
              <a href="/app/approvals">
                <span className="mini-tone green">A</span>
                <div>
                  <strong>Packaging compliance copy</strong>
                  <small>Approval · due Aug 26</small>
                </div>
                <ArrowRight size={13} />
              </a>
            </section>
            <section className="side-overview-card resources-list" id="files">
              <header>
                <Link2 size={15} />
                <h2>{copy.connected}</h2>
              </header>
              <a href="https://www.figma.com">
                <span className="mini-tone dark">F</span>
                <div>
                  <strong>SS26 launch designs</strong>
                  <small>Figma</small>
                </div>
                <ExternalLink size={12} />
              </a>
              <a href="https://github.com">
                <span className="mini-tone dark">
                  <GitBranch size={13} />
                </span>
                <div>
                  <strong>Storefront repository</strong>
                  <small>GitHub</small>
                </div>
                <ExternalLink size={12} />
              </a>
              <a href="https://docs.google.com">
                <span className="mini-tone blue">D</span>
                <div>
                  <strong>Compliance evidence</strong>
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
                <span className="avatar avatar-mz">MZ</span>
                <span className="avatar avatar-nk">NK</span>
                <span className="avatar avatar-ad">AD</span>
                <span className="avatar avatar-tb">TB</span>
                <button>+5</button>
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
