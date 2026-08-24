"use client";

import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileQuestion,
  FileText,
  GitBranch,
  Grid2X2,
  History,
  Hourglass,
  Lightbulb,
  Link2,
  MessageSquareText,
  Pause,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  attentionScore,
  calculateResourcePressure,
  changesSinceCheckpoint,
  demoBlueprintInstances,
  demoBlueprints,
  demoBlueprintVersions,
  demoChangeCheckpoint,
  demoDecisionOutcomes,
  demoDependencies,
  demoHubSnapshots,
  demoHubs,
  demoIdeaOpportunities,
  demoInsights,
  demoItems,
  demoMeaningfulChanges,
  demoPortfolios,
  demoReviewRituals,
  demoWaitingStates,
  generateAttentionSignals,
  opportunityScore,
  previewBlueprintUpdate,
  type AttentionSignal,
  type ImportPreset,
  type WaitingState,
} from "@founderhq/core";
import { useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";

const now = new Date("2026-08-24T12:00:00.000Z");
const initialSignals = generateAttentionSignals(
  "org-demo",
  demoHubs,
  demoItems,
  demoWaitingStates,
  now,
  demoDependencies,
);

const hubFor = (hubId?: string) => demoHubs.find((hub) => hub.id === hubId);

export function HomeExperience() {
  const changes = changesSinceCheckpoint(
    demoMeaningfulChanges,
    demoChangeCheckpoint,
  );
  const needsYou = initialSignals.slice(0, 4);
  const decisions = demoItems.filter(
    (item) =>
      item.type === "decision" &&
      item.status !== "done" &&
      item.assignee === "Mohammed Zaman",
  );
  const recentWins = demoMeaningfulChanges.filter(
    (change) => change.type === "major_work_completed",
  );
  return (
    <WorkspaceFrame active="home">
      <main className="trevv-main">
        <PageHeader
          eyebrow="Monday, 24 August"
          title="Good morning, Mohammed"
          subtitle="Four things need you. Everything else can keep moving."
          action={
            <a className="primary-button" href="/app/inbox">
              <Plus size={16} />
              Quick capture
            </a>
          }
        />
        <section className="home-focus-strip" aria-label="Daily focus summary">
          <MetricLink
            href="/app/attention"
            icon={Sparkles}
            value={needsYou.length}
            label="Needs you"
            tone="violet"
          />
          <MetricLink
            href="/app/decisions"
            icon={FileQuestion}
            value={decisions.length}
            label="Decisions"
            tone="blue"
          />
          <MetricLink
            href="/app/waiting"
            icon={Hourglass}
            value={demoWaitingStates.length}
            label="Waiting"
            tone="amber"
          />
          <MetricLink
            href="/app/reviews"
            icon={CalendarClock}
            value={2}
            label="Reviews due"
            tone="green"
          />
        </section>
        <div className="home-columns">
          <section className="trevv-panel" aria-labelledby="home-needs-title">
            <PanelHeading
              icon={Sparkles}
              title="Needs You"
              subtitle="Ranked by impact, urgency, and your responsibility."
              href="/app/attention"
            />
            <div className="attention-list compact">
              {needsYou.map((signal) => (
                <AttentionRow key={signal.id} signal={signal} />
              ))}
            </div>
          </section>
          <section className="trevv-panel" aria-labelledby="today-title">
            <PanelHeading
              icon={Clock3}
              title="Today"
              subtitle="The commitments closest to now."
            />
            <div className="today-list">
              {demoItems
                .filter((item) => item.status !== "done")
                .slice(0, 5)
                .map((item) => (
                  <a
                    key={item.id}
                    href={`/app/hubs/${hubFor(item.hubId)?.slug}/boards/${item.boardId}`}
                  >
                    <span className={`priority-dot ${item.priority}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {hubFor(item.hubId)?.name} · {item.dueDate ?? "No date"}
                      </small>
                    </div>
                    <ArrowRight size={14} />
                  </a>
                ))}
            </div>
          </section>
        </div>
        <section
          className="trevv-panel change-radar"
          aria-labelledby="radar-title"
        >
          <PanelHeading
            icon={RefreshCw}
            title="Change Radar"
            subtitle="Meaningful movement since your last visit — routine activity is filtered out."
          />
          <div className="change-groups">
            {[...new Set(changes.map((change) => change.hubId))].map(
              (hubId) => (
                <article key={hubId}>
                  <header>
                    <HubMark hubId={hubId} />
                    <div>
                      <strong>{hubFor(hubId)?.name}</strong>
                      <small>
                        {
                          changes.filter((change) => change.hubId === hubId)
                            .length
                        }{" "}
                        meaningful changes
                      </small>
                    </div>
                  </header>
                  <ul>
                    {changes
                      .filter((change) => change.hubId === hubId)
                      .map((change) => (
                        <li key={change.id}>{change.summary}</li>
                      ))}
                  </ul>
                </article>
              ),
            )}
          </div>
        </section>
        <section className="trevv-panel wins-panel">
          <PanelHeading
            icon={CheckCircle2}
            title="Recent wins"
            subtitle="Progress worth noticing, without turning every event into a notification."
          />
          {recentWins.map((win) => (
            <p key={win.id}>
              <Check size={15} />
              {win.summary} <span>{hubFor(win.hubId)?.name}</span>
            </p>
          ))}
        </section>
      </main>
    </WorkspaceFrame>
  );
}

const attentionTabs = [
  "Needs You",
  "At Risk",
  "Blocked",
  "Overdue",
  "Stale",
  "Waiting",
] as const;
type AttentionTab = (typeof attentionTabs)[number];

function matchesAttentionTab(signal: AttentionSignal, tab: AttentionTab) {
  if (tab === "Needs You") return signal.responsibility >= 1;
  if (tab === "At Risk") return ["high", "critical"].includes(signal.severity);
  if (tab === "Blocked")
    return [
      "blocked_work",
      "dependency_threat",
      "decision_blocking_execution",
    ].includes(signal.signalType);
  if (tab === "Overdue") return signal.signalType.includes("overdue");
  if (tab === "Stale")
    return (
      signal.signalType.includes("stale") ||
      signal.signalType === "missing_update"
    );
  return (
    signal.signalType === "waiting_too_long" ||
    signal.signalType === "follow_up_overdue"
  );
}

export function AttentionExperience() {
  const [signals, setSignals] = useState(initialSignals);
  const [tab, setTab] = useState<AttentionTab>("Needs You");
  const [acting, setActing] = useState<{
    id: string;
    action: "dismiss" | "snooze";
  } | null>(null);
  const [reason, setReason] = useState("");
  const visible = signals.filter((signal) => matchesAttentionTab(signal, tab));
  const remove = (id: string) =>
    setSignals((current) => current.filter((signal) => signal.id !== id));
  const completeAction = () => {
    if (!acting || !reason.trim()) return;
    remove(acting.id);
    setActing(null);
    setReason("");
  };
  return (
    <WorkspaceFrame active="attention">
      <main className="trevv-main attention-center">
        <PageHeader
          eyebrow="Portfolio · Venture Portfolio"
          title="Attention Center"
          subtitle="Real operational signals, ranked so the important few stay visible."
        />
        <div
          className="attention-tabs"
          role="tablist"
          aria-label="Attention filters"
        >
          {attentionTabs.map((name) => {
            const count = signals.filter((signal) =>
              matchesAttentionTab(signal, name),
            ).length;
            return (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                {name}
                <b>{count}</b>
              </button>
            );
          })}
        </div>
        <section className="attention-explainer">
          <ShieldCheck size={17} />
          <div>
            <strong>Why these signals?</strong>
            <span>
              Each item points to the evidence that triggered it. Snoozed and
              dismissed signals stay out of the active queue.
            </span>
          </div>
        </section>
        <div className="attention-list">
          {visible.map((signal) => (
            <article className="attention-detail-card" key={signal.id}>
              <div className={`attention-severity ${signal.severity}`}>
                <AlertTriangle size={17} />
              </div>
              <div className="attention-detail-copy">
                <header>
                  <span>{hubFor(signal.hubId)?.name ?? "Portfolio"}</span>
                  <b>{signal.severity}</b>
                  <small>Score {attentionScore(signal, now)}</small>
                </header>
                <h2>
                  {String(
                    signal.metadata.title ??
                      signal.signalType.replaceAll("_", " "),
                  )}
                </h2>
                <p>{signal.reason}</p>
                {signal.recommendedAction && (
                  <div className="recommended-action">
                    <Sparkles size={14} />
                    <span>
                      <b>Recommended action</b>
                      {signal.recommendedAction}
                    </span>
                  </div>
                )}
              </div>
              <div className="attention-actions">
                <button className="resolve" onClick={() => remove(signal.id)}>
                  <Check size={14} />
                  Resolve
                </button>
                <button
                  onClick={() => setActing({ id: signal.id, action: "snooze" })}
                >
                  <Pause size={14} />
                  Snooze
                </button>
                <button
                  onClick={() =>
                    setActing({ id: signal.id, action: "dismiss" })
                  }
                >
                  <X size={14} />
                  Dismiss
                </button>
              </div>
              {acting?.id === signal.id && (
                <div className="attention-action-note">
                  <label>
                    {acting.action === "snooze"
                      ? "Why and until when?"
                      : "Why is this not useful?"}
                    <input
                      autoFocus
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={
                        acting.action === "snooze"
                          ? "Waiting until Friday for client response"
                          : "Already covered in another review"
                      }
                    />
                  </label>
                  <button onClick={() => setActing(null)}>Cancel</button>
                  <button
                    className="primary-button"
                    disabled={!reason.trim()}
                    onClick={completeAction}
                  >
                    Save {acting.action}
                  </button>
                </div>
              )}
            </article>
          ))}
          {!visible.length && (
            <EmptyState
              icon={CheckCircle2}
              title="This queue is clear"
              note="Resolved, snoozed, and dismissed signals no longer compete for attention."
            />
          )}
        </div>
      </main>
    </WorkspaceFrame>
  );
}

const waitingSections = [
  "Waiting on Me",
  "Waiting on Team",
  "Waiting on External",
  "Waiting Too Long",
] as const;
type WaitingSection = (typeof waitingSections)[number];
function inWaitingSection(waiting: WaitingState, section: WaitingSection) {
  if (section === "Waiting on Me")
    return (
      waiting.waitingType === "decision" ||
      waiting.waitingLabel === "Portfolio owner"
    );
  if (section === "Waiting on Team")
    return ["person", "team"].includes(waiting.waitingType);
  if (section === "Waiting on External")
    return ["client", "vendor", "external_partner"].includes(
      waiting.waitingType,
    );
  return Boolean(waiting.expectedBy && waiting.expectedBy < "2026-08-24");
}

export function WaitingExperience() {
  const [waiting, setWaiting] = useState(demoWaitingStates);
  const [section, setSection] = useState<WaitingSection>("Waiting on Me");
  const [notice, setNotice] = useState<string | null>(null);
  const visible = waiting.filter((item) => inWaitingSection(item, section));
  return (
    <WorkspaceFrame active="waiting">
      <main className="trevv-main waiting-center">
        <PageHeader
          eyebrow="Follow-ups"
          title="Waiting Center"
          subtitle="Track dependencies that are waiting on a person, team, decision, document, or external partner."
        />
        {notice && (
          <div className="success-toast" role="status">
            <CheckCircle2 size={15} />
            {notice}
            <button aria-label="Dismiss notice" onClick={() => setNotice(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="attention-tabs waiting-tabs">
          {waitingSections.map((name) => (
            <button
              key={name}
              className={section === name ? "active" : ""}
              onClick={() => setSection(name)}
            >
              {name}
              <b>
                {waiting.filter((item) => inWaitingSection(item, name)).length}
              </b>
            </button>
          ))}
        </div>
        <div className="waiting-list">
          {visible.map((item) => (
            <article key={item.id}>
              <div className="waiting-icon">
                <Hourglass size={18} />
              </div>
              <div>
                <p>
                  {hubFor(item.hubId)?.name} ·{" "}
                  {item.entityType.replace("_", " ")}
                </p>
                <h2>{item.title}</h2>
                <span>
                  Waiting on{" "}
                  <b>
                    {item.waitingLabel ?? item.waitingType.replaceAll("_", " ")}
                  </b>{" "}
                  since {item.waitingSince}
                </span>
                {item.waitingNote && <small>{item.waitingNote}</small>}
              </div>
              <dl>
                <div>
                  <dt>Expected</dt>
                  <dd
                    className={
                      item.expectedBy && item.expectedBy < "2026-08-24"
                        ? "overdue"
                        : ""
                    }
                  >
                    {item.expectedBy ?? "Not set"}
                  </dd>
                </div>
                <div>
                  <dt>Follow-up owner</dt>
                  <dd>{item.followUpOwnerName}</dd>
                </div>
                <div>
                  <dt>Next follow-up</dt>
                  <dd>{item.nextFollowUp ?? "Not set"}</dd>
                </div>
              </dl>
              <footer>
                <button
                  onClick={() =>
                    setNotice(
                      `Nudge prepared for ${item.waitingLabel ?? "the owner"}.`,
                    )
                  }
                >
                  <Send size={14} />
                  Nudge
                </button>
                <button
                  className="resolve"
                  onClick={() =>
                    setWaiting((current) =>
                      current.filter((candidate) => candidate.id !== item.id),
                    )
                  }
                >
                  <Check size={14} />
                  Resolve
                </button>
              </footer>
            </article>
          ))}
          {!visible.length && (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing waiting here"
              note="Change the filter or add a waiting state from a work item, decision, or approval."
            />
          )}
        </div>
      </main>
    </WorkspaceFrame>
  );
}

export function ReviewsExperience() {
  const [posted, setPosted] = useState(false);
  const [enabled, setEnabled] = useState(
    () =>
      new Set(
        demoReviewRituals
          .filter((ritual) => ritual.enabled)
          .map((ritual) => ritual.id),
      ),
  );
  const toggleRitual = (id: string) =>
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <WorkspaceFrame active="reviews">
      <main className="trevv-main review-page">
        <PageHeader
          eyebrow="Management memory"
          title="Review Rituals"
          subtitle="Optional operating rhythms that turn updates into snapshots and refreshed attention."
        />
        <div className="review-grid">
          <section className="trevv-panel daily-focus">
            <PanelHeading
              icon={Sparkles}
              title="Daily Focus"
              subtitle="A short list for the next useful move."
            />
            <ul>
              <li>
                <b>4</b> top Attention items
              </li>
              <li>
                <b>2</b> decisions due
              </li>
              <li>
                <b>3</b> waiting follow-ups
              </li>
              <li>
                <b>1</b> milestone at risk
              </li>
            </ul>
          </section>
          <section className="trevv-panel weekly-review">
            <PanelHeading
              icon={MessageSquareText}
              title="Weekly Hub Review"
              subtitle="Northstar Apparel · due today"
            />
            {posted ? (
              <div className="review-posted">
                <CheckCircle2 size={24} />
                <h2>Review published</h2>
                <p>
                  Structured update posted, a Hub snapshot captured, and
                  Attention signals refreshed.
                </p>
                <a href="/app/portfolio">
                  See refreshed Portfolio <ArrowRight size={13} />
                </a>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setPosted(true);
                }}
              >
                <label>
                  Health
                  <select defaultValue="critical">
                    <option value="on_track">On Track</option>
                    <option value="watch">Attention</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
                <label>
                  Biggest progress
                  <textarea defaultValue="Photography landed and 14 of 22 products are ready." />
                </label>
                <label>
                  Biggest blocker
                  <textarea defaultValue="Signed packaging evidence is still outstanding." />
                </label>
                <div>
                  <label>
                    Next milestone
                    <input defaultValue="SS26 storefront launch" />
                  </label>
                  <label>
                    Priority next week
                    <input defaultValue="Release compliant print files" />
                  </label>
                </div>
                <label>
                  Decision needed
                  <input defaultValue="Approve launch offer by Tuesday" />
                </label>
                <button className="primary-button" type="submit">
                  Publish review & snapshot
                </button>
              </form>
            )}
          </section>
        </div>
        <section className="trevv-panel time-machine">
          <PanelHeading
            icon={History}
            title="Portfolio Time Machine"
            subtitle="Lightweight rollups captured by reviews — not copies of the full board."
          />
          <div
            className="trend-line"
            aria-label="Northstar Apparel health trend"
          >
            {demoHubSnapshots.map((snapshot, index) => (
              <div key={snapshot.id}>
                <span className={`trend-dot ${snapshot.health}`} />
                {index < demoHubSnapshots.length - 1 && <i />}
                <strong>
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "2-digit",
                  }).format(new Date(snapshot.capturedAt))}
                </strong>
                <small>{snapshot.health.replace("_", " ")}</small>
                <b>{snapshot.attentionCount} signals</b>
              </div>
            ))}
          </div>
        </section>
        <section className="trevv-panel ritual-settings">
          <PanelHeading
            icon={CalendarClock}
            title="Cadence settings"
            subtitle="Each ritual can be configured or disabled completely."
          />
          {demoReviewRituals.map((ritual) => (
            <article key={ritual.id}>
              <div>
                <strong>{ritual.type.replaceAll("_", " ")}</strong>
                <span>
                  {ritual.cadence} ·{" "}
                  {ritual.reminderEnabled ? "Reminder on" : "No reminder"}
                </span>
              </div>
              <button
                role="switch"
                aria-checked={enabled.has(ritual.id)}
                className={enabled.has(ritual.id) ? "on" : ""}
                onClick={() => toggleRitual(ritual.id)}
              >
                <i />
              </button>
            </article>
          ))}
        </section>
      </main>
    </WorkspaceFrame>
  );
}

export function IdeasExperience() {
  const opportunity = demoIdeaOpportunities[0]!;
  const linkedInsights = demoInsights.filter(
    (insight) => insight.hubId === "hub-mealflow",
  );
  return (
    <WorkspaceFrame active="ideas">
      <main className="trevv-main ideas-page">
        <PageHeader
          eyebrow="Discovery"
          title="Ideas & evidence"
          subtitle="Develop opportunities lightly, attach the why, and preserve provenance when work is promoted."
          action={
            <button className="primary-button">
              <Plus size={16} />
              Capture idea
            </button>
          }
        />
        <div className="ideas-layout">
          <section className="opportunity-card">
            <header>
              <span>
                <Lightbulb size={18} />
              </span>
              <div>
                <p>MealFlow · Opportunity</p>
                <h2>Service-first pilot home</h2>
              </div>
              <b>Review Sep 02</b>
            </header>
            <dl>
              <div>
                <dt>Problem / opportunity</dt>
                <dd>{opportunity.problemOrOpportunity}</dd>
              </div>
              <div>
                <dt>Hypothesis</dt>
                <dd>{opportunity.hypothesis}</dd>
              </div>
            </dl>
            <div className="optional-score">
              <span>
                <small>Impact</small>
                <b>{opportunity.expectedImpact}/5</b>
              </span>
              <span>
                <small>Confidence</small>
                <b>{opportunity.confidence}/5</b>
              </span>
              <span>
                <small>Strategic fit</small>
                <b>{opportunity.strategicFit}/5</b>
              </span>
              <span>
                <small>Effort</small>
                <b>{opportunity.effort}/5</b>
              </span>
              <strong>Optional score {opportunityScore(opportunity)}</strong>
            </div>
            <footer>
              <span>
                <GitBranch size={14} />
                Promoted to Decision: “Select onboarding navigation”
              </span>
              <a href="/app/decisions">
                Open decision <ArrowRight size={13} />
              </a>
            </footer>
          </section>
          <section className="trevv-panel evidence-panel">
            <PanelHeading
              icon={Link2}
              title="Linked evidence"
              subtitle="Evidence stays connected to the idea and its promoted work."
            />
            {linkedInsights.map((insight) => (
              <article key={insight.id}>
                <span>
                  <FileText size={16} />
                </span>
                <div>
                  <p>
                    {insight.sourceType.replaceAll("_", " ")} · {insight.impact}{" "}
                    impact
                  </p>
                  <h3>{insight.title}</h3>
                  <small>{insight.description}</small>
                  <div>
                    {insight.labels.map((label) => (
                      <b key={label}>{label}</b>
                    ))}
                  </div>
                </div>
              </article>
            ))}
            <button>
              <Plus size={14} />
              Attach insight
            </button>
          </section>
        </div>
        <section className="trevv-panel consequence-panel">
          <PanelHeading
            icon={History}
            title="Decision consequence review"
            subtitle="Selected decisions return later so the organization can learn, not merely remember."
          />
          {demoDecisionOutcomes.map((outcome) => (
            <article key={outcome.id}>
              <span className="outcome-badge">Better than expected</span>
              <div>
                <h3>Choose pilot packaging model</h3>
                <p>{outcome.learning}</p>
                <small>
                  Would make the same decision again:{" "}
                  <b>{outcome.wouldRepeat ? "Yes" : "No"}</b>
                </small>
              </div>
              <time>{outcome.recordedAt.slice(0, 10)}</time>
            </article>
          ))}
        </section>
      </main>
    </WorkspaceFrame>
  );
}

export function TeamExperience() {
  const pressure = calculateResourcePressure(demoHubs, demoItems, now);
  return (
    <WorkspaceFrame active="team">
      <main className="trevv-main team-page">
        <PageHeader
          eyebrow="Across Hubs"
          title="Team pressure"
          subtitle="Lightweight workload evidence for bottlenecks — no timesheets or hourly estimates."
          action={
            <button className="primary-button">
              <Plus size={16} />
              Invite member
            </button>
          }
        />
        <section className="pressure-note">
          <AlertTriangle size={18} />
          <div>
            <strong>Cross-Hub signal</strong>
            <span>
              {pressure[0]?.criticalHubResponsibilities ?? 0} critical Hubs and{" "}
              {pressure[0]?.urgentHighActive ?? 0} urgent/high items currently
              depend on {pressure[0]?.userName ?? "one owner"}.
            </span>
          </div>
          <a href="/app/attention">
            Review signal <ArrowRight size={13} />
          </a>
        </section>
        <section className="trevv-panel pressure-table">
          <header>
            <span>Person</span>
            <span>Urgent / high</span>
            <span>Due this week</span>
            <span>Blocked</span>
            <span>Critical Hubs</span>
            <span>Milestones</span>
            <span>Pressure</span>
          </header>
          {pressure.map((person) => (
            <article key={person.userId}>
              <span>
                <span className="avatar">
                  {person.userName
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <div>
                  <strong>{person.userName}</strong>
                  <small>{person.hubIds.length} Hubs</small>
                </div>
              </span>
              <b>{person.urgentHighActive}</b>
              <b>{person.dueThisWeek}</b>
              <b>{person.blockedResponsibilities}</b>
              <b>{person.criticalHubResponsibilities}</b>
              <b>{person.milestonesOwned}</b>
              <span className={`pressure-badge ${person.pressure}`}>
                {person.pressure}
              </span>
            </article>
          ))}
        </section>
      </main>
    </WorkspaceFrame>
  );
}

export function HubsExperience() {
  const [portfolioId, setPortfolioId] = useState("portfolio-demo");
  const hubs = demoHubs.filter((hub) => hub.portfolioId === portfolioId);
  return (
    <WorkspaceFrame active="hub">
      <main className="trevv-main hubs-page">
        <PageHeader
          eyebrow="Responsibility containers"
          title="All Hubs"
          subtitle="Businesses, brands, clients, products, departments, ventures, initiatives, and projects — without forcing one vocabulary."
          action={
            <button className="primary-button">
              <Plus size={16} />
              New Hub
            </button>
          }
        />
        <div className="hub-directory-filter">
          <label>
            Portfolio
            <select
              value={portfolioId}
              onChange={(event) => setPortfolioId(event.target.value)}
            >
              {demoPortfolios.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </option>
              ))}
            </select>
          </label>
          <span>{hubs.length} Hubs</span>
        </div>
        <div className="hub-directory">
          {hubs.map((hub) => (
            <a href={`/app/hubs/${hub.slug}`} key={hub.id}>
              <HubMark hubId={hub.id} />
              <div>
                <p>
                  {hub.type.replaceAll("_", " ")} · {hub.stage}
                </p>
                <h2>{hub.name}</h2>
                <span>{hub.priority}</span>
              </div>
              <b className={`health-badge ${hub.health}`}>
                {hub.health.replace("_", " ")}
              </b>
              <ArrowRight size={15} />
            </a>
          ))}
        </div>
      </main>
    </WorkspaceFrame>
  );
}

export function BlueprintsExperience() {
  const current = demoBlueprintVersions[0]!;
  const next = demoBlueprintVersions[1]!;
  const instance = demoBlueprintInstances[0]!;
  const diff = previewBlueprintUpdate(instance, current, next);
  const [selected, setSelected] = useState(
    new Set([...diff.additions, ...diff.changes]),
  );
  const [state, setState] = useState<"preview" | "applied" | "detached">(
    "preview",
  );
  const toggle = (entry: string) =>
    setSelected((currentSet) => {
      const nextSet = new Set(currentSet);
      if (nextSet.has(entry)) nextSet.delete(entry);
      else nextSet.add(entry);
      return nextSet;
    });
  return (
    <WorkspaceFrame active="templates">
      <main className="trevv-main blueprint-page">
        <PageHeader
          eyebrow="Managed standards"
          title="Blueprints"
          subtitle="Reusable operating systems that can improve over time without overwriting local work."
        />
        <section className="blueprint-summary">
          <span>
            <Grid2X2 size={20} />
          </span>
          <div>
            <p>Blueprint · version 2 available</p>
            <h2>{demoBlueprints[0]?.name}</h2>
            <small>{demoBlueprints[0]?.description}</small>
          </div>
          <b>LocalReach / Delivery board</b>
        </section>
        {state === "preview" ? (
          <section className="trevv-panel blueprint-diff">
            <PanelHeading
              icon={GitBranch}
              title="Preview changes"
              subtitle="Choose what to apply. Nothing destructive is applied automatically."
            />
            <div className="diff-groups">
              <article>
                <h3>Additions</h3>
                {diff.additions.map((entry) => (
                  <label key={entry}>
                    <input
                      type="checkbox"
                      checked={selected.has(entry)}
                      onChange={() => toggle(entry)}
                    />
                    <Plus size={13} />
                    {entry}
                  </label>
                ))}
              </article>
              <article>
                <h3>Configuration changes</h3>
                {diff.changes.map((entry) => (
                  <label key={entry}>
                    <input
                      type="checkbox"
                      checked={selected.has(entry)}
                      onChange={() => toggle(entry)}
                    />
                    <RefreshCw size={13} />
                    {entry}
                  </label>
                ))}
              </article>
              <article className="override-group">
                <h3>Local overrides preserved</h3>
                {diff.preservedOverrides.map((entry) => (
                  <p key={entry}>
                    <ShieldCheck size={14} />
                    {entry}
                  </p>
                ))}
              </article>
            </div>
            <footer>
              <button onClick={() => setState("detached")}>
                Detach from Blueprint
              </button>
              <button
                className="primary-button"
                disabled={!selected.size}
                onClick={() => setState("applied")}
              >
                Apply {selected.size} selected changes
              </button>
            </footer>
          </section>
        ) : (
          <section className="trevv-panel blueprint-result">
            <CheckCircle2 size={28} />
            <h2>
              {state === "applied"
                ? "Selected improvements applied"
                : "Instance detached"}
            </h2>
            <p>
              {state === "applied"
                ? "Local overrides were preserved. The instance now follows version 2."
                : "This board keeps its current configuration and will not receive Blueprint updates."}
            </p>
            <button onClick={() => setState("preview")}>
              Return to preview
            </button>
          </section>
        )}
      </main>
    </WorkspaceFrame>
  );
}

export function ImportExperience() {
  const [preset, setPreset] = useState<ImportPreset>("generic_csv");
  const [previewed, setPreviewed] = useState(false);
  const presets: Array<[ImportPreset, string]> = [
    ["generic_csv", "Generic CSV"],
    ["monday", "monday.com CSV/export"],
    ["clickup", "ClickUp CSV"],
    ["asana", "Asana CSV"],
  ];
  return (
    <WorkspaceFrame active="settings">
      <main className="trevv-main import-page">
        <PageHeader
          eyebrow="Migration"
          title="Import work"
          subtitle="Map fields, statuses, and owners before anything is written. Unsupported data is always reported."
        />
        <div className="import-steps">
          <b className="active">1 Source</b>
          <i />
          <b className={previewed ? "active" : ""}>2 Mapping</b>
          <i />
          <b>3 Dry run</b>
          <i />
          <b>4 Import report</b>
        </div>
        <section className="trevv-panel import-card">
          <div className="import-source">
            <label>
              Source preset
              <select
                value={preset}
                onChange={(event) => {
                  setPreset(event.target.value as ImportPreset);
                  setPreviewed(false);
                }}
              >
                {presets.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              CSV export
              <div className="file-drop">
                <FileText size={22} />
                <strong>client-delivery-export.csv</strong>
                <span>184 rows · 42 KB</span>
              </div>
            </label>
            <button
              className="primary-button"
              onClick={() => setPreviewed(true)}
            >
              Preview mapping <ArrowRight size={14} />
            </button>
          </div>
          {previewed && (
            <div className="mapping-preview">
              <header>
                <div>
                  <strong>Dry run preview</strong>
                  <span>184 rows detected · 179 ready · 5 need review</span>
                </div>
                <b>Nothing has been imported</b>
              </header>
              <div className="mapping-table">
                <span>Source field</span>
                <span>TREVV field</span>
                <span>Preview</span>
                {[
                  ["Task name", "Title", "Finalize kickoff pack"],
                  ["People", "Owner", "Nora Klein"],
                  ["Status", "Status", "In progress → Working"],
                  ["Client phase", "Custom field", "Launch"],
                  ["Time tracking", "Unsupported", "Preserved in report"],
                ].map((row) =>
                  row.map((cell, index) => (
                    <span
                      className={cell === "Unsupported" ? "warning" : ""}
                      key={`${row[0]}-${index}`}
                    >
                      {cell}
                      {index === 1 && cell !== "Unsupported" && (
                        <ChevronDown size={12} />
                      )}
                    </span>
                  )),
                )}
              </div>
              <div className="import-warning">
                <AlertTriangle size={16} />
                <div>
                  <strong>5 values need attention</strong>
                  <span>
                    3 owners do not match a member; 2 time-tracking fields are
                    unsupported and will be included in the import report.
                  </span>
                </div>
              </div>
              <footer>
                <button>Download dry-run report</button>
                <button className="primary-button">Continue to import</button>
              </footer>
            </div>
          )}
        </section>
      </main>
    </WorkspaceFrame>
  );
}

export function NotificationsExperience() {
  const [events, setEvents] = useState([
    {
      id: "notification-1",
      title: "LocalReach weekly update published",
      detail: "Delivery remains On Track · 18 minutes ago",
    },
    {
      id: "notification-2",
      title: "MealFlow blocker resolved",
      detail: "Pilot access checklist can continue · 1 hour ago",
    },
    {
      id: "notification-3",
      title: "Northstar Apparel milestone changed",
      detail: "Storefront launch moved by 3 days · Today",
    },
  ]);
  return (
    <WorkspaceFrame active="notifications">
      <main className="trevv-main notifications-page">
        <PageHeader
          eyebrow="Informational"
          title="Notifications"
          subtitle="Events worth knowing. Anything requiring action lives in Inbox instead."
          action={
            <a className="primary-button" href="/app/inbox">
              Open actionable Inbox
            </a>
          }
        />
        <section className="trevv-panel notification-feed">
          <PanelHeading
            icon={BellRing}
            title="Recent activity"
            subtitle="Read when useful—there is no expectation to process this queue."
          />
          {events.map((event) => (
            <article key={event.id}>
              <span>
                <BellRing size={15} />
              </span>
              <div>
                <strong>{event.title}</strong>
                <small>{event.detail}</small>
              </div>
              <button
                onClick={() =>
                  setEvents((current) =>
                    current.filter((candidate) => candidate.id !== event.id),
                  )
                }
              >
                Mark read
              </button>
            </article>
          ))}
          {!events.length && (
            <EmptyState
              icon={CheckCircle2}
              title="You're caught up"
              note="New informational events will appear here without becoming Inbox work."
            />
          )}
        </section>
      </main>
    </WorkspaceFrame>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="trevv-page-header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </div>
      {action}
    </header>
  );
}

function PanelHeading({
  icon: Icon,
  title,
  subtitle,
  href,
}: {
  icon: typeof Sparkles;
  title: string;
  subtitle: string;
  href?: string;
}) {
  return (
    <header className="panel-heading">
      <span>
        <Icon size={16} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {href && (
        <a href={href}>
          View all <ArrowRight size={12} />
        </a>
      )}
    </header>
  );
}

function MetricLink({
  href,
  icon: Icon,
  value,
  label,
  tone,
}: {
  href: string;
  icon: typeof Sparkles;
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <a className={`metric-link ${tone}`} href={href}>
      <span>
        <Icon size={17} />
      </span>
      <strong>{value}</strong>
      <small>{label}</small>
      <ArrowRight size={13} />
    </a>
  );
}

function HubMark({ hubId }: { hubId: string }) {
  const hub = hubFor(hubId);
  return (
    <span
      className="hub-mark"
      style={{ background: `${hub?.accent}18`, color: hub?.accent }}
    >
      {hub?.icon ?? "H"}
    </span>
  );
}

function AttentionRow({ signal }: { signal: AttentionSignal }) {
  return (
    <a className="attention-row" href="/app/attention">
      <span className={`signal-pip ${signal.severity}`} />
      <div>
        <p>
          {hubFor(signal.hubId)?.name ?? "Portfolio"} · {signal.severity}
        </p>
        <strong>
          {String(
            signal.metadata.title ?? signal.signalType.replaceAll("_", " "),
          )}
        </strong>
        <small>{signal.reason}</small>
      </div>
      <ArrowRight size={14} />
    </a>
  );
}

function EmptyState({
  icon: Icon,
  title,
  note,
}: {
  icon: typeof CheckCircle2;
  title: string;
  note: string;
}) {
  return (
    <section className="trevv-empty">
      <Icon size={26} />
      <h2>{title}</h2>
      <p>{note}</p>
    </section>
  );
}
