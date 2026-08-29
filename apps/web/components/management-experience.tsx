"use client";

import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  GitBranch,
  Grid2X2,
  History,
  Hourglass,
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
  demoBlueprintInstances,
  demoBlueprints,
  demoBlueprintVersions,
  demoWorkspaceSnapshots,
  demoWorkspaces,
  demoPortfolios,
  demoReviewRituals,
  demoWaitingStates,
  previewBlueprintUpdate,
  type WorkspaceType,
  type ImportPreset,
  type Portfolio,
  type WaitingState,
} from "@founderhq/core";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { useWorkspace } from "@/lib/workspace-context";
import { type GroupedSignal } from "@/lib/attention";
import { Hint } from "./learning-center";
import { IdeasWorkflow } from "./ideas-workflow";
import { TeamWorkflow } from "./team-workflow";
import { AttentionCenter } from "./attention-center";
import {
  createCustomWorkspace,
  useCustomWorkspaces,
} from "@/lib/custom-workspaces";
import { useCustomPortfolios } from "@/lib/custom-portfolios";
import { workspaceHref } from "@/lib/workspace-routes";
import { CapabilityNotice } from "./capability-status";

const workspaceFor = (workspaceId?: string) =>
  demoWorkspaces.find((workspace) => workspace.id === workspaceId);

export function AttentionExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  return (
    <WorkspaceFrame active="attention" workspaceSlug={workspaceSlug}>
      <AttentionCenter />
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

export function WaitingExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  return (
    <WorkspaceFrame active="waiting" workspaceSlug={workspaceSlug}>
      <WaitingMain />
    </WorkspaceFrame>
  );
}

function WaitingMain() {
  const { scope } = useWorkspace();
  const [waiting, setWaiting] = useState(demoWaitingStates);
  const [section, setSection] = useState<WaitingSection>("Waiting on Me");
  const [notice, setNotice] = useState<string | null>(null);
  const [nudgeItem, setNudgeItem] = useState<WaitingState | null>(null);
  const [resolveItem, setResolveItem] = useState<WaitingState | null>(null);
  const [lastResolved, setLastResolved] = useState<WaitingState | null>(null);
  const scopedWorkspaceIds = new Set(
    scope.workspaces.map((workspace) => workspace.id),
  );
  const scopedWaiting = waiting.filter((item) =>
    scopedWorkspaceIds.has(item.workspaceId),
  );
  const visible = scopedWaiting.filter((item) =>
    inWaitingSection(item, section),
  );
  return (
    <main className="trevv-main waiting-center">
      <PageHeader
        eyebrow="Follow-ups"
        title="Waiting Center"
        subtitle="Track dependencies that are waiting on a person, team, decision, document, or external partner."
        hintId="waiting"
      />
      {notice && (
        <div className="success-toast" role="status">
          <CheckCircle2 size={15} />
          {notice}
          {lastResolved && (
            <button
              className="toast-undo"
              onClick={() => {
                setWaiting((current) => [lastResolved, ...current]);
                setNotice("Waiting state restored.");
                setLastResolved(null);
              }}
            >
              Undo
            </button>
          )}
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
              {
                scopedWaiting.filter((item) => inWaitingSection(item, name))
                  .length
              }
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
                {workspaceFor(item.workspaceId)?.name} ·{" "}
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
              <button onClick={() => setNudgeItem(item)}>
                <Send size={14} />
                Draft follow-up
              </button>
              <button className="resolve" onClick={() => setResolveItem(item)}>
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
      {nudgeItem && (
        <WaitingNudgeDialog
          item={nudgeItem}
          onClose={() => setNudgeItem(null)}
          onRecord={(message, nextFollowUp) => {
            setWaiting((current) =>
              current.map((item) =>
                item.id === nudgeItem.id
                  ? { ...item, waitingNote: message, nextFollowUp }
                  : item,
              ),
            );
            setLastResolved(null);
            setNotice(
              `Follow-up prepared for ${nudgeItem.waitingLabel ?? "the owner"}.`,
            );
            setNudgeItem(null);
          }}
        />
      )}
      {resolveItem && (
        <WaitingResolveDialog
          item={resolveItem}
          onClose={() => setResolveItem(null)}
          onConfirm={() => {
            setWaiting((current) =>
              current.filter((candidate) => candidate.id !== resolveItem.id),
            );
            setLastResolved(resolveItem);
            setNotice(`Resolved “${resolveItem.title}”.`);
            setResolveItem(null);
          }}
        />
      )}
    </main>
  );
}

function WaitingNudgeDialog({
  item,
  onClose,
  onRecord,
}: {
  item: WaitingState;
  onClose: () => void;
  onRecord: (message: string, nextFollowUp: string) => void;
}) {
  const [channel, setChannel] = useState("Email draft");
  const [message, setMessage] = useState(
    `Hi ${item.waitingLabel ?? "there"}, checking in on “${item.title}”. We expected this by ${item.expectedBy ?? "the agreed date"}. Could you share the current status and next step?`,
  );
  const [nextFollowUp, setNextFollowUp] = useState(
    item.nextFollowUp ?? "2026-08-28",
  );
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="workflow-dialog waiting-nudge-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiting-nudge-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onRecord(message.trim(), nextFollowUp);
        }}
      >
        <header>
          <span>
            <Send size={17} />
          </span>
          <div>
            <p>Follow-up helper</p>
            <h2 id="waiting-nudge-title">Prepare a focused nudge</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close nudge dialog"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body">
          <CapabilityNotice capability="waitingFollowUp" />
          <div className="workflow-context-card">
            <Hourglass size={16} />
            <p>
              <strong>{item.title}</strong>
              <span>
                Waiting on{" "}
                {item.waitingLabel ?? item.waitingType.replaceAll("_", " ")}
              </span>
            </p>
          </div>
          <label>
            <span>Channel</span>
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              <option>Email draft</option>
              <option>Slack draft</option>
              <option>Internal follow-up</option>
            </select>
          </label>
          <label>
            <span>Message</span>
            <textarea
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <label>
            <span>Next follow-up</span>
            <input
              required
              type="date"
              value={nextFollowUp}
              onChange={(event) => setNextFollowUp(event.target.value)}
            />
          </label>
          <p className="workflow-safety-note">
            <ShieldCheck size={14} /> TREVV records this follow-up in the demo;
            it does not contact an external person.
          </p>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!message.trim() || !nextFollowUp}
          >
            Save local preview <ArrowRight size={13} />
          </button>
        </footer>
      </form>
    </div>
  );
}

function WaitingResolveDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: WaitingState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog compact-workflow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiting-resolve-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="success-dialog-icon">
            <Check size={17} />
          </span>
          <div>
            <p>Waiting state</p>
            <h2 id="waiting-resolve-title">Mark this dependency resolved?</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close resolve dialog"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body">
          <p className="resolve-dialog-copy">
            “{item.title}” will leave the Waiting Center. The underlying work
            item and its history stay available.
          </p>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={onConfirm}>
            <Check size={14} /> Mark resolved
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ReviewsExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  return (
    <WorkspaceFrame active="reviews" workspaceSlug={workspaceSlug}>
      <ReviewsMain />
    </WorkspaceFrame>
  );
}

function ReviewsMain() {
  const { scope } = useWorkspace();
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
  const activeProject = scope.workspaces[0];
  const reviewLabel = activeProject?.name ?? "Selected workspace";
  const decisionCount = scope.items.filter(
    (item) => item.type === "decision" && item.status !== "done",
  ).length;
  const milestoneRiskCount = scope.items.filter(
    (item) =>
      item.type === "milestone" &&
      (item.status === "blocked" ||
        Boolean(item.dueDate && item.dueDate < "2026-08-27")),
  ).length;
  const snapshots = demoWorkspaceSnapshots.filter(
    (snapshot) => !activeProject || snapshot.workspaceId === activeProject.id,
  );
  const rituals = demoReviewRituals.filter(
    (ritual) =>
      ritual.portfolioId === scope.portfolioId &&
      (!activeProject ||
        !ritual.workspaceId ||
        ritual.workspaceId === activeProject.id),
  );
  return (
    <main className="trevv-main review-page">
      <PageHeader
        eyebrow="Management memory"
        title="Review Rituals"
        subtitle="Optional operating rhythms that turn updates into snapshots and refreshed attention."
        hintId="reviews"
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
              <b>{Math.min(scope.attentionCount, 4)}</b> top Attention items
            </li>
            <li>
              <b>{decisionCount}</b> decisions due
            </li>
            <li>
              <b>{scope.waiting.length}</b> waiting follow-ups
            </li>
            <li>
              <b>{milestoneRiskCount}</b> milestones at risk
            </li>
          </ul>
        </section>
        <section className="trevv-panel weekly-review">
          <PanelHeading
            icon={MessageSquareText}
            title="Weekly workspace review"
            subtitle={`${reviewLabel} · due today`}
          />
          <CapabilityNotice capability="publishedUpdates" />
          {posted ? (
            <div className="review-posted">
              <CheckCircle2 size={24} />
              <h2>Sample review saved locally</h2>
              <p>
                The preview recorded a browser-local update and demonstrates how
                a snapshot and Attention refresh would work for {reviewLabel}.
              </p>
              {activeProject && (
                <Link href={workspaceHref(activeProject.slug)}>
                  See refreshed workspace <ArrowRight size={13} />
                </Link>
              )}
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
                <select defaultValue={activeProject?.health ?? "watch"}>
                  <option value="on_track">On Track</option>
                  <option value="watch">Attention</option>
                  <option value="critical">Critical</option>
                  <option value="parked">Parked</option>
                </select>
              </label>
              <label>
                Biggest progress
                <textarea
                  defaultValue={
                    activeProject?.latestUpdate.text ??
                    "Summarize the most meaningful progress since the last review."
                  }
                />
              </label>
              <label>
                Biggest blocker
                <textarea
                  defaultValue={
                    activeProject?.healthNote ??
                    "Describe the strongest blocker or emerging risk."
                  }
                />
              </label>
              <div>
                <label>
                  Next milestone
                  <input
                    defaultValue={
                      activeProject?.nextMilestone.title ?? "Next milestone"
                    }
                  />
                </label>
                <label>
                  Priority next week
                  <input
                    defaultValue={
                      activeProject?.priority ?? "Set the next priority"
                    }
                  />
                </label>
              </div>
              <label>
                Decision needed
                <input
                  defaultValue={
                    scope.items.find(
                      (item) =>
                        item.type === "decision" && item.status !== "done",
                    )?.title ?? "No open decision recorded"
                  }
                />
              </label>
              <button className="primary-button" type="submit">
                Save sample review locally
              </button>
            </form>
          )}
        </section>
      </div>
      <section className="trevv-panel time-machine">
        <PanelHeading
          icon={History}
          title={`${reviewLabel} Time Machine`}
          subtitle="Lightweight rollups captured by reviews — not copies of the full board."
        />
        <div className="trend-line" aria-label={`${reviewLabel} health trend`}>
          {snapshots.map((snapshot, index) => (
            <div key={snapshot.id}>
              <span className={`trend-dot ${snapshot.health}`} />
              {index < snapshots.length - 1 && <i />}
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
          {!snapshots.length && (
            <EmptyState
              icon={History}
              title="No review history yet"
              note={`Save the first sample ${reviewLabel} review to preview a health timeline in this browser.`}
            />
          )}
        </div>
      </section>
      <section className="trevv-panel ritual-settings">
        <PanelHeading
          icon={CalendarClock}
          title="Cadence settings"
          subtitle="Each ritual can be configured or disabled completely."
        />
        {rituals.map((ritual) => (
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
  );
}

export function IdeasExperience({ workspaceSlug }: { workspaceSlug?: string }) {
  return (
    <WorkspaceFrame active="ideas" workspaceSlug={workspaceSlug}>
      <main className="trevv-main ideas-page">
        <IdeasWorkflow />
      </main>
    </WorkspaceFrame>
  );
}

export function TeamExperience({ workspaceSlug }: { workspaceSlug?: string }) {
  return (
    <WorkspaceFrame active="teams" workspaceSlug={workspaceSlug}>
      <main className="trevv-main team-page">
        <TeamWorkflow />
      </main>
    </WorkspaceFrame>
  );
}

export function WorkspacesExperience() {
  const [portfolioId, setPortfolioId] = useState("portfolio-demo");
  const [createOpen, setCreateOpen] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const customWorkspaces = useCustomWorkspaces();
  const customPortfolioRecords = useCustomPortfolios();
  const availablePortfolios = useMemo(
    () => [
      ...demoPortfolios,
      ...customPortfolioRecords.map((record) => record.portfolio),
    ],
    [customPortfolioRecords],
  );
  const workspaces = [
    ...customWorkspaces.map((record) => record.workspace),
    ...demoWorkspaces,
  ].filter((workspace) => workspace.portfolioId === portfolioId);
  useEffect(() => {
    let frame = 0;
    let selectionFrame = 0;
    const openCreator = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setCreateOpen(true));
    };
    window.addEventListener("trevv:open-workspace-creator", openCreator);
    try {
      const stored = JSON.parse(
        localStorage.getItem("trevv:workspace-selection") ?? "null",
      ) as { portfolioId?: unknown } | null;
      if (
        typeof stored?.portfolioId === "string" &&
        availablePortfolios.some(
          (portfolio) => portfolio.id === stored.portfolioId,
        )
      ) {
        const storedPortfolioId = stored.portfolioId;
        selectionFrame = window.requestAnimationFrame(() =>
          setPortfolioId(storedPortfolioId),
        );
      }
    } catch {
      // The built-in portfolio remains selected when preferences are blocked.
    }
    const params = new URLSearchParams(window.location.search);
    if (["workspace", "project"].includes(params.get("create") ?? ""))
      openCreator();
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(selectionFrame);
      window.removeEventListener("trevv:open-workspace-creator", openCreator);
    };
  }, [availablePortfolios]);
  const closeCreate = () => {
    setCreateOpen(false);
    if (window.location.search)
      window.history.replaceState(null, "", window.location.pathname);
  };
  return (
    <WorkspaceFrame active="workspace">
      <>
        <main className="trevv-main workspaces-page">
          {createdSlug && (
            <div className="workflow-toast success-toast" role="status">
              <CheckCircle2 size={15} />
              <span>Your workspace and its first board are ready.</span>
              <Link href={workspaceHref(createdSlug)}>Open workspace</Link>
              <button
                aria-label="Dismiss workspace confirmation"
                onClick={() => setCreatedSlug(null)}
              >
                <X size={13} />
              </button>
            </div>
          )}
          <PageHeader
            eyebrow="Portfolio workspaces"
            title="All workspaces"
            subtitle="Choose the responsibility container where work, decisions, updates, evidence, and ownership belong."
            hintId="workspaces"
            action={
              <button
                className="primary-button"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={16} />
                New workspace
              </button>
            }
          />
          <div className="workspace-directory-filter">
            <label>
              Portfolio
              <select
                value={portfolioId}
                onChange={(event) => setPortfolioId(event.target.value)}
              >
                {availablePortfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {workspaces.length}{" "}
              {workspaces.length === 1 ? "workspace" : "workspaces"}
            </span>
          </div>
          <div className="workspace-directory">
            {workspaces.map((workspace) => (
              <Link href={workspaceHref(workspace.slug)} key={workspace.id}>
                <WorkspaceMark
                  workspaceId={workspace.id}
                  fallback={workspace.icon}
                  accent={workspace.accent}
                />
                <div>
                  <p>
                    {workspace.type.replaceAll("_", " ")} · {workspace.stage}
                  </p>
                  <h2>{workspace.name}</h2>
                  <span>{workspace.priority}</span>
                </div>
                <b className={`health-badge ${workspace.health}`}>
                  {workspace.health.replace("_", " ")}
                </b>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </main>
        {createOpen && (
          <CreateWorkspaceDialog
            portfolios={availablePortfolios}
            initialPortfolioId={portfolioId}
            onClose={closeCreate}
            onCreated={(slug) => {
              setCreatedSlug(slug);
              closeCreate();
            }}
          />
        )}
      </>
    </WorkspaceFrame>
  );
}

function CreateWorkspaceDialog({
  portfolios,
  initialPortfolioId,
  onClose,
  onCreated,
}: {
  portfolios: readonly Portfolio[];
  initialPortfolioId: string;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [name, setName] = useState("");
  const [portfolioId, setPortfolioId] = useState(initialPortfolioId);
  const [type, setType] = useState<WorkspaceType>("project");
  const [lead, setLead] = useState("Mohammed Zaman");
  const [priority, setPriority] = useState("");
  const [milestone, setMilestone] = useState("First operating review");
  const [milestoneDate, setMilestoneDate] = useState("2026-09-30");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !milestoneDate) return;
    const record = createCustomWorkspace({
      name,
      portfolioId,
      type,
      lead,
      priority,
      milestone,
      milestoneDate,
    });
    onCreated(record.workspace.slug);
  };
  const types: Array<[WorkspaceType, string]> = [
    ["business", "Business"],
    ["brand", "Brand"],
    ["client", "Client"],
    ["product", "Product"],
    ["venture", "Venture"],
    ["initiative", "Initiative"],
    ["project", "Project"],
    ["department", "Department"],
  ];
  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="capture-dialog create-workspace-dialog"
        aria-labelledby="create-workspace-title"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
      >
        <header>
          <span className="attention-icon">
            <Grid2X2 size={17} />
          </span>
          <div>
            <h2 id="create-workspace-title">Create a workspace</h2>
            <p>
              A workspace keeps work, decisions, updates, evidence, and
              ownership together.
            </p>
          </div>
          <button
            aria-label="Close workspace creation"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <div className="create-workspace-fields">
          <label>
            Workspace name
            <input
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Name the responsibility clearly"
              required
              value={name}
            />
          </label>
          <div>
            <label>
              Portfolio
              <select
                value={portfolioId}
                onChange={(event) => setPortfolioId(event.target.value)}
              >
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as WorkspaceType)
                }
              >
                {types.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Lead
            <input
              required
              value={lead}
              onChange={(event) => setLead(event.target.value)}
            />
          </label>
          <label>
            Current priority
            <input
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              placeholder="What outcome matters first?"
            />
          </label>
          <div>
            <label>
              First milestone
              <input
                required
                value={milestone}
                onChange={(event) => setMilestone(event.target.value)}
              />
            </label>
            <label>
              Target date
              <input
                required
                type="date"
                value={milestoneDate}
                onChange={(event) => setMilestoneDate(event.target.value)}
              />
            </label>
          </div>
        </div>
        <footer>
          <span>
            Creates a workspace overview and an empty operating board.
          </span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={!name.trim() || !milestoneDate}
              type="submit"
            >
              <Plus size={14} /> Create workspace
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function BlueprintsExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  const current = demoBlueprintVersions[0]!;
  const next = demoBlueprintVersions[1]!;
  const instance = demoBlueprintInstances[0]!;
  const diff = previewBlueprintUpdate(instance, current, next);
  const [view, setView] = useState<
    "updates" | "catalog" | "instances" | "history"
  >("updates");
  const [selected, setSelected] = useState(
    new Set([...diff.additions, ...diff.changes]),
  );
  const [state, setState] = useState<"preview" | "applied" | "detached">(
    "preview",
  );
  const [confirmDetach, setConfirmDetach] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [installed, setInstalled] = useState(new Set(["Client delivery"]));
  const [history, setHistory] = useState([
    {
      id: "history-created",
      action: "Instance created from Client delivery v1",
      detail: "LocalReach / Delivery board",
      date: "18 Aug 2026, 09:24",
    },
  ]);
  useEffect(() => {
    if (window.location.hash !== "#available-blueprints") return;
    const frame = window.requestAnimationFrame(() => setView("catalog"));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const toggle = (entry: string) =>
    setSelected((currentSet) => {
      const nextSet = new Set(currentSet);
      if (nextSet.has(entry)) nextSet.delete(entry);
      else nextSet.add(entry);
      return nextSet;
    });
  return (
    <WorkspaceFrame active="templates" workspaceSlug={workspaceSlug}>
      <main className="trevv-main blueprint-page">
        <PageHeader
          eyebrow="Managed standards"
          title="Blueprints"
          subtitle="Reusable operating systems that can improve over time without overwriting local work."
          hintId="blueprints"
          action={
            <button
              className="primary-button"
              onClick={() => setView("catalog")}
            >
              <Plus size={15} /> Browse Blueprints
            </button>
          }
        />
        {notice && (
          <div className="success-toast" role="status">
            <CheckCircle2 size={15} /> {notice}
            <button aria-label="Dismiss notice" onClick={() => setNotice(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        <div
          className="blueprint-tabs"
          role="tablist"
          aria-label="Blueprint sections"
        >
          {[
            ["updates", "Updates", state === "preview" ? 1 : 0],
            ["catalog", "Catalog", blueprintCatalog.length],
            ["instances", "Instances", installed.size],
            ["history", "History", history.length],
          ].map(([key, label, count]) => (
            <button
              type="button"
              role="tab"
              aria-selected={view === key}
              className={view === key ? "active" : ""}
              onClick={() => setView(key as typeof view)}
              key={String(key)}
            >
              {String(label)} <b>{Number(count)}</b>
            </button>
          ))}
        </div>

        {view === "updates" && (
          <>
            <section className="blueprint-summary">
              <span>
                <Grid2X2 size={20} />
              </span>
              <div>
                <p>
                  Blueprint ·{" "}
                  {state === "preview"
                    ? "version 2 available"
                    : state === "applied"
                      ? "version 2 current"
                      : "detached"}
                </p>
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
                  hintId="blueprints"
                />
                <div className="blueprint-selection-tools">
                  <span>
                    {selected.size} of{" "}
                    {diff.additions.length + diff.changes.length} optional
                    changes selected
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(new Set([...diff.additions, ...diff.changes]))
                    }
                  >
                    Select all
                  </button>
                  <button type="button" onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </div>
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
                        <Plus size={13} /> {entry}
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
                        <RefreshCw size={13} /> {entry}
                      </label>
                    ))}
                  </article>
                  <article className="override-group">
                    <h3>Local overrides preserved</h3>
                    {diff.preservedOverrides.map((entry) => (
                      <p key={entry}>
                        <ShieldCheck size={14} /> {entry}
                      </p>
                    ))}
                  </article>
                </div>
                <footer>
                  <button onClick={() => setConfirmDetach(true)}>
                    Detach from Blueprint
                  </button>
                  <button
                    className="primary-button"
                    disabled={!selected.size}
                    onClick={() => {
                      setState("applied");
                      setHistory((entries) => [
                        {
                          id: `history-${Date.now()}`,
                          action: `Applied Client delivery v2 (${selected.size} changes)`,
                          detail: "Local overrides preserved",
                          date: "27 Aug 2026, just now",
                        },
                        ...entries,
                      ]);
                      setNotice(
                        `${selected.size} Blueprint improvements applied safely.`,
                      );
                    }}
                  >
                    Apply {selected.size} selected changes
                  </button>
                </footer>
              </section>
            ) : (
              <section className="trevv-panel blueprint-result">
                {state === "applied" ? (
                  <CheckCircle2 size={28} />
                ) : (
                  <Pause size={28} />
                )}
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
                <div>
                  <button onClick={() => setView("history")}>
                    View history
                  </button>
                  {state === "detached" && (
                    <button
                      onClick={() => {
                        setState("preview");
                        setNotice(
                          "Blueprint connection restored. Review the update before applying it.",
                        );
                      }}
                    >
                      Reconnect Blueprint
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {view === "catalog" && (
          <section className="blueprint-catalog" id="available-blueprints">
            {blueprintCatalog.map((blueprint) => {
              const isInstalled = installed.has(blueprint.name);
              return (
                <article className="trevv-panel" key={blueprint.name}>
                  <span>{blueprint.icon}</span>
                  <p>{blueprint.category}</p>
                  <h2>{blueprint.name}</h2>
                  <small>{blueprint.description}</small>
                  <ul>
                    {blueprint.includes.map((entry) => (
                      <li key={entry}>
                        <Check size={12} /> {entry}
                      </li>
                    ))}
                  </ul>
                  <footer>
                    <b>{blueprint.version}</b>
                    <button
                      type="button"
                      className={isInstalled ? "installed" : ""}
                      disabled={isInstalled}
                      onClick={() => {
                        setInstalled((currentSet) =>
                          new Set(currentSet).add(blueprint.name),
                        );
                        setHistory((entries) => [
                          {
                            id: `history-${Date.now()}`,
                            action: `Added ${blueprint.name} to the Blueprint library`,
                            detail: "Ready to create an instance",
                            date: "27 Aug 2026, just now",
                          },
                          ...entries,
                        ]);
                        setNotice(
                          `${blueprint.name} added to your Blueprint library.`,
                        );
                      }}
                    >
                      {isInstalled ? (
                        <>
                          <Check size={13} /> In library
                        </>
                      ) : (
                        <>
                          <Plus size={13} /> Add to library
                        </>
                      )}
                    </button>
                  </footer>
                </article>
              );
            })}
          </section>
        )}

        {view === "instances" && (
          <section className="trevv-panel blueprint-instances">
            <PanelHeading
              icon={Grid2X2}
              title="Managed instances"
              subtitle="Boards connected to a reusable Blueprint standard."
              hintId="blueprints"
            />
            {[...installed].map((name, index) => (
              <article key={name}>
                <span>
                  <Grid2X2 size={16} />
                </span>
                <div>
                  <strong>
                    {index === 0
                      ? "LocalReach / Delivery board"
                      : `${name} / Ready to configure`}
                  </strong>
                  <small>
                    {name} ·{" "}
                    {index === 0
                      ? state === "detached"
                        ? "Detached"
                        : state === "applied"
                          ? "Version 2"
                          : "Version 1"
                      : "No board connected yet"}
                  </small>
                </div>
                <b
                  className={index === 0 && state === "preview" ? "update" : ""}
                >
                  {index === 0 && state === "preview"
                    ? "Update available"
                    : index === 0 && state === "detached"
                      ? "Detached"
                      : "Current"}
                </b>
                <button
                  type="button"
                  onClick={() => setView(index === 0 ? "updates" : "catalog")}
                >
                  {index === 0 ? "Manage" : "Configure"}{" "}
                  <ArrowRight size={12} />
                </button>
              </article>
            ))}
          </section>
        )}

        {view === "history" && (
          <section className="trevv-panel blueprint-history">
            <PanelHeading
              icon={History}
              title="Blueprint history"
              subtitle="An audit-friendly record of versions, connections, and library changes."
              hintId="blueprints"
            />
            {history.map((entry) => (
              <article key={entry.id}>
                <span>
                  <History size={15} />
                </span>
                <div>
                  <strong>{entry.action}</strong>
                  <small>{entry.detail}</small>
                </div>
                <time>{entry.date}</time>
              </article>
            ))}
          </section>
        )}

        {confirmDetach && (
          <BlueprintDetachDialog
            onClose={() => setConfirmDetach(false)}
            onConfirm={() => {
              setState("detached");
              setConfirmDetach(false);
              setHistory((entries) => [
                {
                  id: `history-${Date.now()}`,
                  action: "Detached LocalReach / Delivery board",
                  detail: "The board kept its current configuration",
                  date: "27 Aug 2026, just now",
                },
                ...entries,
              ]);
              setNotice(
                "Blueprint detached. The board configuration was preserved.",
              );
            }}
          />
        )}
      </main>
    </WorkspaceFrame>
  );
}

const blueprintCatalog = [
  {
    icon: "CD",
    category: "Service delivery",
    name: "Client delivery",
    description:
      "A repeatable delivery rhythm with review gates and stakeholder updates.",
    version: "Version 2",
    includes: ["Delivery groups", "Approval gates", "Weekly update ritual"],
  },
  {
    icon: "PL",
    category: "Product operations",
    name: "Product launch",
    description:
      "Milestones, decisions, dependencies, and launch-readiness checks in one standard.",
    version: "Version 1",
    includes: ["Launch milestones", "Risk review", "Decision register"],
  },
  {
    icon: "RC",
    category: "Recurring operations",
    name: "Recurring care",
    description:
      "A dependable intake, delivery, review, and renewal rhythm for recurring work.",
    version: "Version 1",
    includes: ["Request intake", "Service cadence", "Renewal checkpoint"],
  },
  {
    icon: "VV",
    category: "Venture building",
    name: "Venture validation",
    description:
      "Evidence, hypotheses, experiments, and investment decisions for a new venture.",
    version: "Version 3",
    includes: ["Hypothesis board", "Evidence score", "Investment gates"],
  },
];

function BlueprintDetachDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog compact-workflow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blueprint-detach-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="warning-dialog-icon">
            <GitBranch size={17} />
          </span>
          <div>
            <p>Managed instance</p>
            <h2 id="blueprint-detach-title">
              Detach this board from its Blueprint?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detach dialog"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body">
          <p className="resolve-dialog-copy">
            LocalReach keeps its current board configuration and local
            overrides, but it will stop receiving future Blueprint updates.
          </p>
          <p className="workflow-safety-note">
            <ShieldCheck size={14} /> No board, group, field, or work item will
            be deleted.
          </p>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Keep connected
          </button>
          <button
            className="danger-workflow-button"
            type="button"
            onClick={onConfirm}
          >
            Detach Blueprint
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ImportExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
} = {}) {
  const [preset, setPreset] = useState<ImportPreset>("generic_csv");
  const [previewed, setPreviewed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [imported, setImported] = useState(false);
  const presets: Array<[ImportPreset, string]> = [
    ["generic_csv", "Generic CSV"],
    ["monday", "monday.com CSV/export"],
    ["clickup", "ClickUp CSV"],
    ["asana", "Asana CSV"],
  ];
  const downloadReport = () => {
    const report = [
      "TREVV import dry-run report",
      `Preset,${preset}`,
      "Rows detected,184",
      "Ready,179",
      "Needs review,5",
      "Unmatched owners,3",
      "Unsupported time-tracking fields,2",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([report], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "trevv-import-dry-run.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <WorkspaceFrame active="settings" workspaceSlug={workspaceSlug}>
      <main className="trevv-main import-page">
        <PageHeader
          eyebrow="Migration"
          title="Preview an import"
          subtitle="Explore a fictional mapping and dry-run report. No file is uploaded and no records are written."
          hintId="import-export"
        />
        <CapabilityNotice capability="import" />
        <div className="import-steps">
          <b className="active">1 Source</b>
          <i />
          <b className={previewed ? "active" : ""}>2 Mapping</b>
          <i />
          <b className={confirming || imported ? "active" : ""}>3 Dry run</b>
          <i />
          <b className={imported ? "active" : ""}>4 Sample outcome</b>
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
                  setConfirming(false);
                  setImported(false);
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
                <button onClick={downloadReport}>
                  Download dry-run report
                </button>
                <button
                  className="primary-button"
                  onClick={() => setConfirming(true)}
                >
                  Preview sample outcome
                </button>
              </footer>
            </div>
          )}
          {confirming && !imported && (
            <div className="import-confirmation" role="alert">
              <ShieldCheck size={18} />
              <div>
                <strong>Preview the sample import outcome</strong>
                <span>
                  The walkthrough will show how 179 ready rows would be handled.
                  It creates no records and changes no existing TREVV work.
                </span>
              </div>
              <button onClick={() => setConfirming(false)}>Back</button>
              <button
                className="primary-button"
                onClick={() => {
                  setImported(true);
                  setConfirming(false);
                }}
              >
                Simulate 179-row outcome
              </button>
            </div>
          )}
          {imported && (
            <div className="import-complete" role="status">
              <CheckCircle2 size={24} />
              <div>
                <strong>Sample import preview complete</strong>
                <span>
                  The preview demonstrates 179 ready rows and five review rows.
                  No work item was created.
                </span>
              </div>
              <button onClick={downloadReport}>Download sample report</button>
              <Link className="primary-button" href="/app/portfolio">
                Open Portfolio
              </Link>
            </div>
          )}
        </section>
      </main>
    </WorkspaceFrame>
  );
}

export function NotificationsExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  return (
    <WorkspaceFrame active="notifications" workspaceSlug={workspaceSlug}>
      <NotificationsMain />
    </WorkspaceFrame>
  );
}

function NotificationsMain() {
  const { scope } = useWorkspace();
  const [events, setEvents] = useState([
    {
      id: "notification-1",
      workspaceId: "workspace-localreach",
      title: "Sample LocalReach weekly update",
      detail: "Fictional activity · Delivery remains On Track · 18 minutes ago",
    },
    {
      id: "notification-2",
      workspaceId: "workspace-mealflow",
      title: "MealFlow blocker resolved",
      detail: "Pilot access checklist can continue · 1 hour ago",
    },
    {
      id: "notification-3",
      workspaceId: "workspace-northstar",
      title: "Northstar Apparel milestone changed",
      detail: "Storefront launch moved by 3 days · Today",
    },
  ]);
  const scopedWorkspaceIds = new Set(
    scope.workspaces.map((workspace) => workspace.id),
  );
  const visibleEvents = events.filter((event) =>
    scopedWorkspaceIds.has(event.workspaceId),
  );
  return (
    <main className="trevv-main notifications-page">
      <PageHeader
        eyebrow="Informational"
        title="Notifications"
        subtitle="Events worth knowing. Anything requiring action lives in Inbox instead."
        hintId="notifications"
        action={
          <Link
            className="primary-button"
            href={
              scope.workspaces[0]
                ? workspaceHref(scope.workspaces[0].slug, "inbox")
                : "/app/portfolio"
            }
          >
            Open actionable Inbox
          </Link>
        }
      />
      <section className="trevv-panel notification-feed">
        <PanelHeading
          icon={BellRing}
          title="Recent activity"
          subtitle="Read when useful—there is no expectation to process this queue."
        />
        {visibleEvents.map((event) => (
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
        {!visibleEvents.length && (
          <EmptyState
            icon={CheckCircle2}
            title="You're caught up"
            note="New informational events will appear here without becoming Inbox work."
          />
        )}
      </section>
    </main>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  hintId,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  hintId?: string;
}) {
  return (
    <header className="trevv-page-header">
      <div>
        <p>{eyebrow}</p>
        <h1 className="page-title-with-hint">
          {title}
          {hintId && <Hint resourceId={hintId} />}
        </h1>
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
  hintId,
}: {
  icon: typeof Sparkles;
  title: string;
  subtitle: string;
  href?: string;
  hintId?: string;
}) {
  return (
    <header className="panel-heading">
      <span>
        <Icon size={16} />
      </span>
      <div>
        <h2 className="panel-title-with-hint">
          {title}
          {hintId && <Hint resourceId={hintId} />}
        </h2>
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

export function WorkspaceMark({
  workspaceId,
  fallback = "H",
  accent,
}: {
  workspaceId: string;
  fallback?: string;
  accent?: string;
}) {
  const workspace = workspaceFor(workspaceId);
  const color = workspace?.accent ?? accent ?? "var(--fh-primary)";
  return (
    <span
      className="workspace-mark"
      style={{ background: `${color}18`, color }}
    >
      {workspace?.icon ?? fallback}
    </span>
  );
}

export function AttentionRow({ group }: { group: GroupedSignal }) {
  return (
    <Link
      className="attention-row"
      href={
        workspaceFor(group.workspaceId)
          ? workspaceHref(
              workspaceFor(group.workspaceId)!.slug,
              "attention",
              group.id,
            )
          : "/app/portfolio"
      }
    >
      <span className={`signal-pip ${group.severity}`} />
      <div>
        <p>
          {workspaceFor(group.workspaceId)?.name ?? "Portfolio"} ·{" "}
          {group.severity}
        </p>
        <strong>{group.title}</strong>
        <small>
          {group.reasons[0]}{" "}
          {group.reasons.length > 1 && (
            <b className="reason-more">
              +{group.reasons.length - 1} more{" "}
              {group.reasons.length === 2 ? "reason" : "reasons"}
            </b>
          )}
        </small>
      </div>
      <ArrowRight size={14} />
    </Link>
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
