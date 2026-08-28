"use client";

import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileCheck2,
  Flag,
  FolderKanban,
  Gauge,
  History,
  Link2,
  ListChecks,
  MessageSquareText,
  Pause,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  X,
} from "lucide-react";
import {
  demoBoards,
  demoDependencies,
  demoHubs,
  demoItems,
  demoPortfolios,
  demoWaitingStates,
  type AttentionSignal,
} from "@founderhq/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type GroupedSignal } from "@/lib/attention";
import { useWorkspace } from "@/lib/workspace-context";
import { Hint } from "./learning-center";

const attentionTabs = [
  "Needs You",
  "At Risk",
  "Blocked",
  "Overdue",
  "Stale",
  "Waiting",
] as const;
type AttentionTab = (typeof attentionTabs)[number];
const attentionHashTabs: Record<string, AttentionTab> = {
  "at-risk": "At Risk",
  blocked: "Blocked",
  overdue: "Overdue",
  stale: "Stale",
  waiting: "Waiting",
};
type AttentionAction = "resolve" | "snooze" | "dismiss";

interface AttentionToast {
  message: string;
  restore?: GroupedSignal;
}

interface AttentionActivity {
  id: string;
  text: string;
  detail: string;
}

const owners = [
  "Mohammed Zaman",
  "Amira Demir",
  "Nora Klein",
  "Elias Hart",
  "Tim Bauer",
  "Jana Roth",
  "Unassigned",
];

export function AttentionCenter() {
  const { scope } = useWorkspace();
  const [groups, setGroups] = useState<GroupedSignal[]>(scope.attention);
  const [tab, setTab] = useState<AttentionTab>("Needs You");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acting, setActing] = useState<{
    group: GroupedSignal;
    action: AttentionAction;
  } | null>(null);
  const [toast, setToast] = useState<AttentionToast | null>(null);
  const [ownerOverrides, setOwnerOverrides] = useState<Record<string, string>>(
    {},
  );
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>(
    {},
  );
  const [activities, setActivities] = useState<
    Record<string, AttentionActivity[]>
  >({});
  const scopedGroupIds = useMemo(
    () => new Set(scope.attention.map((group) => group.id)),
    [scope.attention],
  );
  const scopedGroups = useMemo(
    () => groups.filter((group) => scopedGroupIds.has(group.id)),
    [groups, scopedGroupIds],
  );

  useEffect(() => {
    let frame = 0;
    const openFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      if (attentionHashTabs[hash]) {
        setTab(attentionHashTabs[hash]);
        setSeverityFilter("all");
        setSelectedId(null);
        return;
      }
      if (!scopedGroupIds.has(hash)) return;
      frame = window.requestAnimationFrame(() => setSelectedId(hash));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, [scopedGroupIds]);

  const portfolio = demoPortfolios.find(
    (candidate) => candidate.id === scope.portfolioId,
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return scopedGroups.filter((group) => {
      const hub = hubFor(group);
      const item = itemFor(group);
      if (!groupMatchesTab(group, tab)) return false;
      if (projectFilter !== "all" && group.hubId !== projectFilter)
        return false;
      if (severityFilter !== "all" && group.severity !== severityFilter)
        return false;
      if (!normalized) return true;
      return [
        group.title,
        hub?.name,
        item?.assignee,
        item?.type,
        ...group.reasons,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase().includes(normalized),
        );
    });
  }, [projectFilter, query, scopedGroups, severityFilter, tab]);

  const summary = useMemo(
    () => ({
      critical: scopedGroups.filter((group) => group.severity === "critical")
        .length,
      blocked: scopedGroups.filter((group) =>
        group.signals.some((signal) => isBlockedSignal(signal)),
      ).length,
      overdue: scopedGroups.filter((group) =>
        group.signals.some((signal) => signal.signalType.includes("overdue")),
      ).length,
      waiting: scopedGroups.filter((group) =>
        group.signals.some(
          (signal) =>
            signal.signalType === "waiting_too_long" ||
            signal.signalType.includes("stale"),
        ),
      ).length,
    }),
    [scopedGroups],
  );
  const selected =
    scopedGroups.find((group) => group.id === selectedId) ?? null;
  const hasFilters =
    query.length > 0 || projectFilter !== "all" || severityFilter !== "all";

  function openSignal(group: GroupedSignal) {
    setSelectedId(group.id);
    window.history.replaceState(null, "", `#${encodeURIComponent(group.id)}`);
  }

  function closeSignal() {
    setSelectedId(null);
    window.history.replaceState(null, "", window.location.pathname);
  }

  function removeSignal(group: GroupedSignal, message: string) {
    setGroups((current) =>
      current.filter((candidate) => candidate.id !== group.id),
    );
    setSelectedId(null);
    setActing(null);
    setToast({ message, restore: group });
    window.history.replaceState(null, "", window.location.pathname);
  }

  function restoreSignal() {
    if (!toast?.restore) return;
    setGroups((current) =>
      [...current, toast.restore!].sort(
        (left, right) => right.score - left.score,
      ),
    );
    setToast(null);
  }

  function logActivity(group: GroupedSignal, text: string, detail: string) {
    setActivities((current) => ({
      ...current,
      [group.id]: [
        { id: `${group.id}-${Date.now()}`, text, detail },
        ...(current[group.id] ?? []),
      ],
    }));
  }

  function requestUpdate(group: GroupedSignal) {
    const hub = hubFor(group);
    logActivity(
      group,
      "Structured update requested",
      `Sent to ${itemFor(group)?.assignee ?? hub?.lead.name ?? "the project lead"}.`,
    );
    setToast({
      message: `Update request sent for “${group.title}”. The signal stays visible until evidence changes.`,
    });
  }

  function resetFilters() {
    setQuery("");
    setProjectFilter("all");
    setSeverityFilter("all");
    setTab("Needs You");
  }

  return (
    <main className="trevv-main attention-center attention-center-complete">
      {toast && (
        <div
          className="workflow-toast success-toast attention-toast"
          role="status"
        >
          <CheckCircle2 size={15} />
          <span>{toast.message}</span>
          {toast.restore && (
            <button className="toast-undo" onClick={restoreSignal}>
              <RotateCcw size={12} /> Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <header className="trevv-page-header attention-page-header">
        <div>
          <p>Portfolio · {portfolio?.name ?? "Venture Portfolio"}</p>
          <h1 className="page-title-with-hint">
            Attention Center <Hint resourceId="attention" />
          </h1>
          <span>
            Turn operational risk into a clear next action—with the evidence and
            project context attached.
          </span>
        </div>
        <button
          className="primary-button attention-next-button"
          disabled={!filtered[0]}
          onClick={() => filtered[0] && openSignal(filtered[0])}
        >
          <Target size={15} /> Resolve next
        </button>
      </header>

      <section
        className="attention-summary-grid"
        aria-label="Attention summary"
      >
        <button
          onClick={() => {
            setTab("At Risk");
            setSeverityFilter("critical");
          }}
        >
          <span className="critical">
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>{summary.critical}</strong>
            <small>Critical now</small>
          </div>
          <em>
            Highest impact <ArrowRight size={11} />
          </em>
        </button>
        <button
          onClick={() => {
            setTab("Blocked");
            setSeverityFilter("all");
          }}
        >
          <span className="blocked">
            <Link2 size={17} />
          </span>
          <div>
            <strong>{summary.blocked}</strong>
            <small>Blocked paths</small>
          </div>
          <em>
            Unblock work <ArrowRight size={11} />
          </em>
        </button>
        <button
          onClick={() => {
            setTab("Overdue");
            setSeverityFilter("all");
          }}
        >
          <span className="overdue">
            <CalendarClock size={17} />
          </span>
          <div>
            <strong>{summary.overdue}</strong>
            <small>Overdue</small>
          </div>
          <em>
            Reset commitments <ArrowRight size={11} />
          </em>
        </button>
        <button
          onClick={() => {
            setTab("Waiting");
            setSeverityFilter("all");
          }}
        >
          <span className="waiting">
            <Clock3 size={17} />
          </span>
          <div>
            <strong>{summary.waiting}</strong>
            <small>Waiting or stale</small>
          </div>
          <em>
            Chase evidence <ArrowRight size={11} />
          </em>
        </button>
      </section>

      <section className="attention-operating-note">
        <span>
          <Sparkles size={17} />
        </span>
        <div>
          <strong>TREVV shows the path, not just the problem</strong>
          <p>
            Signals stay attached to their project, source work, evidence,
            owner, and recommended resolution. Resolving one records why it can
            leave your queue.
          </p>
        </div>
        <div className="attention-note-legend">
          <span>
            <b>1</b> Understand
          </span>
          <ChevronRight size={12} />
          <span>
            <b>2</b> Act
          </span>
          <ChevronRight size={12} />
          <span>
            <b>3</b> Verify
          </span>
        </div>
      </section>

      <div
        className="attention-tabs-complete"
        role="tablist"
        aria-label="Attention filters"
      >
        {attentionTabs.map((name) => {
          const count = scopedGroups.filter((group) =>
            groupMatchesTab(group, name),
          ).length;
          return (
            <button
              aria-selected={tab === name}
              className={tab === name ? "active" : ""}
              key={name}
              onClick={() => setTab(name)}
              role="tab"
            >
              {name}
              <b>{count}</b>
            </button>
          );
        })}
      </div>

      <div className="attention-command-bar">
        <label className="attention-search">
          <Search size={14} />
          <input
            aria-label="Search Attention Center"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search signals, projects, owners…"
            value={query}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </label>
        <label className="attention-filter-select">
          <FolderKanban size={13} />
          <select
            aria-label="Filter by project"
            onChange={(event) => setProjectFilter(event.target.value)}
            value={projectFilter}
          >
            <option value="all">All projects</option>
            {scope.hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.name}
              </option>
            ))}
          </select>
        </label>
        <label className="attention-filter-select">
          <Gauge size={13} />
          <select
            aria-label="Filter by severity"
            onChange={(event) => setSeverityFilter(event.target.value)}
            value={severityFilter}
          >
            <option value="all">All severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <span className="attention-result-count">
          <b>{filtered.length}</b> actionable{" "}
          {filtered.length === 1 ? "signal" : "signals"}
        </span>
      </div>

      <div className="attention-action-list">
        {filtered.map((group, index) => (
          <AttentionCard
            group={group}
            index={index}
            key={group.id}
            onAct={(action) => setActing({ group, action })}
            onOpen={() => openSignal(group)}
            onRequestUpdate={() => requestUpdate(group)}
            owner={ownerOverrides[group.id]}
            dueDate={dateOverrides[group.id]}
          />
        ))}
        {!filtered.length && (
          <section className="attention-empty-state">
            <span>
              <CheckCircle2 size={24} />
            </span>
            <h2>
              {scopedGroups.length
                ? "No signals match this view"
                : "Your Attention Center is clear"}
            </h2>
            <p>
              {scopedGroups.length
                ? "Broaden the project, severity, or search filters."
                : "Resolved, snoozed, and dismissed signals no longer compete for attention."}
            </p>
            {hasFilters && (
              <button className="primary-button" onClick={resetFilters}>
                <RotateCcw size={13} /> Reset filters
              </button>
            )}
          </section>
        )}
      </div>

      {selected && (
        <AttentionDetailPanel
          activities={activities[selected.id] ?? []}
          dueDate={dateOverrides[selected.id]}
          group={selected}
          onAct={(action) => setActing({ group: selected, action })}
          onClose={closeSignal}
          onLog={(text, detail) => logActivity(selected, text, detail)}
          onRequestUpdate={() => requestUpdate(selected)}
          onSaveAssignment={(owner, date) => {
            setOwnerOverrides((current) => ({
              ...current,
              [selected.id]: owner,
            }));
            if (date)
              setDateOverrides((current) => ({
                ...current,
                [selected.id]: date,
              }));
            logActivity(
              selected,
              "Commitment updated",
              `${owner} · ${date ? `due ${formatDate(date)}` : "date unchanged"}`,
            );
            setToast({
              message: `Updated the owner and commitment for “${selected.title}”.`,
            });
          }}
          owner={ownerOverrides[selected.id]}
        />
      )}

      {acting && (
        <AttentionActionDialog
          action={acting.action}
          group={acting.group}
          onCancel={() => setActing(null)}
          onConfirm={(note, until) => {
            const verb =
              acting.action === "resolve"
                ? "Resolved"
                : acting.action === "snooze"
                  ? `Snoozed until ${formatDate(until)}`
                  : "Dismissed";
            removeSignal(
              acting.group,
              `${verb} “${acting.group.title}”${note ? ` — ${note}` : "."}`,
            );
          }}
        />
      )}
    </main>
  );
}

function AttentionCard({
  group,
  index,
  owner,
  dueDate,
  onOpen,
  onAct,
  onRequestUpdate,
}: {
  group: GroupedSignal;
  index: number;
  owner: string | undefined;
  dueDate: string | undefined;
  onOpen: () => void;
  onAct: (action: AttentionAction) => void;
  onRequestUpdate: () => void;
}) {
  const hub = hubFor(group);
  const item = itemFor(group);
  const board =
    item && demoBoards.find((candidate) => candidate.id === item.boardId);
  const primaryLabel = actionLabel(group);
  const destination = workflowHref(group);
  return (
    <article
      className={`attention-action-card severity-${group.severity}`}
      id={group.id}
    >
      <div className="attention-rank-column">
        <span>#{index + 1}</span>
        <div className={`attention-severity-icon ${group.severity}`}>
          <AlertTriangle size={17} />
        </div>
        <i />
      </div>
      <div className="attention-card-main">
        <header className="attention-project-path">
          {hub ? (
            <>
              <Link href={`/app/hubs/${hub.slug}`}>
                <span
                  style={{
                    background: `${hub.accent}18`,
                    color: hub.accent,
                  }}
                >
                  {hub.icon}
                </span>
                {hub.name}
              </Link>
              {board && (
                <>
                  <ChevronRight size={11} />
                  <Link href={boardHref(group)}>{board.name}</Link>
                </>
              )}
            </>
          ) : (
            <span>Portfolio-wide signal</span>
          )}
          <b className={`signal-severity ${group.severity}`}>
            {group.severity}
          </b>
          <small>
            {group.reasons.length} evidence{" "}
            {group.reasons.length === 1 ? "point" : "points"}
          </small>
        </header>
        <button className="attention-card-title" onClick={onOpen}>
          <h2>{group.title}</h2>
          <ArrowRight size={14} />
        </button>
        <p className="attention-primary-reason">{group.reasons[0]}</p>
        <div className="attention-context-strip">
          <span>
            <UserRound size={12} />{" "}
            {owner ?? item?.assignee ?? hub?.lead.name ?? "Needs owner"}
          </span>
          <span>
            <Flag size={12} />{" "}
            {item
              ? `${capitalize(item.priority)} priority`
              : `${capitalize(hub?.health ?? "watch")} health`}
          </span>
          <span>
            <CalendarClock size={12} />{" "}
            {dueDate
              ? formatDate(dueDate)
              : item?.dueDate
                ? formatDate(item.dueDate)
                : hub?.nextMilestone.date
                  ? `Milestone ${formatDate(hub.nextMilestone.date)}`
                  : "No date"}
          </span>
          {item && (
            <span>
              <ListChecks size={12} /> {humanize(item.status)}
            </span>
          )}
        </div>
        {group.primary.recommendedAction && (
          <div className="attention-recommendation">
            <Sparkles size={14} />
            <div>
              <strong>TREVV recommends</strong>
              <span>{group.primary.recommendedAction}</span>
            </div>
          </div>
        )}
      </div>
      <aside className="attention-card-actions">
        <button className="attention-primary-action" onClick={onOpen}>
          <Target size={13} /> {primaryLabel}
        </button>
        <Link href={destination}>
          Open source <ExternalLink size={11} />
        </Link>
        <div>
          <button onClick={onRequestUpdate} title="Request a structured update">
            <Send size={12} /> Update
          </button>
          <button onClick={() => onAct("snooze")} title="Snooze signal">
            <Pause size={12} /> Snooze
          </button>
          <button onClick={() => onAct("resolve")} title="Resolve signal">
            <Check size={12} /> Resolve
          </button>
        </div>
      </aside>
    </article>
  );
}

function AttentionDetailPanel({
  group,
  owner,
  dueDate,
  activities,
  onClose,
  onAct,
  onRequestUpdate,
  onSaveAssignment,
  onLog,
}: {
  group: GroupedSignal;
  owner: string | undefined;
  dueDate: string | undefined;
  activities: AttentionActivity[];
  onClose: () => void;
  onAct: (action: AttentionAction) => void;
  onRequestUpdate: () => void;
  onSaveAssignment: (owner: string, dueDate: string) => void;
  onLog: (text: string, detail: string) => void;
}) {
  const item = itemFor(group);
  const hub = hubFor(group);
  const waiting = demoWaitingStates.find(
    (state) => state.entityId === group.entityId,
  );
  const [selectedOwner, setSelectedOwner] = useState(
    owner ?? item?.assignee ?? hub?.lead.name ?? "Unassigned",
  );
  const [selectedDate, setSelectedDate] = useState(
    dueDate ?? item?.dueDate ?? hub?.nextMilestone.date ?? "",
  );
  const [note, setNote] = useState("");
  const ownerOptions = owners.includes(selectedOwner)
    ? owners
    : [selectedOwner, ...owners];
  const dependency = demoDependencies.find(
    (entry) => entry.itemId === group.entityId,
  );
  const dependencyItem =
    dependency &&
    demoItems.find((candidate) => candidate.id === dependency.dependsOnItemId);
  const dependencyHub =
    dependencyItem &&
    demoHubs.find((candidate) => candidate.id === dependencyItem.hubId);
  return (
    <div
      className="attention-panel-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-labelledby="attention-detail-title"
        aria-modal="true"
        className="attention-resolution-panel"
        role="dialog"
      >
        <header className="attention-panel-header">
          <div className={`attention-severity-icon ${group.severity}`}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <p>
              {hub?.name ?? "Portfolio"} · {group.severity} attention
            </p>
            <h2 id="attention-detail-title">{group.title}</h2>
          </div>
          <button aria-label="Close attention details" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="attention-panel-scroll">
          <section className="attention-resolution-hero">
            <span>
              <Sparkles size={15} />
            </span>
            <div>
              <small>Recommended resolution</small>
              <strong>
                {group.primary.recommendedAction ??
                  "Review the evidence, agree ownership, and record the next commitment."}
              </strong>
            </div>
            <button onClick={() => onAct("resolve")}>
              <Check size={13} /> Resolve with note
            </button>
          </section>

          <nav
            className="attention-source-links"
            aria-label="Signal source navigation"
          >
            {hub && (
              <Link href={`/app/hubs/${hub.slug}`}>
                <FolderKanban size={13} /> Project overview{" "}
                <ExternalLink size={10} />
              </Link>
            )}
            {item && (
              <Link href={boardHref(group)}>
                <ListChecks size={13} /> Source board <ExternalLink size={10} />
              </Link>
            )}
            <Link href={workflowHref(group)}>
              <Target size={13} /> Related workflow <ExternalLink size={10} />
            </Link>
          </nav>

          <section className="attention-detail-section">
            <header>
              <div>
                <ShieldCheck size={14} />
                <strong>Why TREVV surfaced this</strong>
              </div>
              <Hint resourceId="attention" />
            </header>
            <div className="attention-evidence-list">
              {group.signals.map((signal) => (
                <article key={signal.id}>
                  <span className={`evidence-pip ${signal.severity}`} />
                  <div>
                    <strong>{signalLabel(signal)}</strong>
                    <p>{signal.reason}</p>
                  </div>
                  <small>{capitalize(signal.severity)}</small>
                </article>
              ))}
            </div>
            <div className="attention-score-explainer">
              <MetricBar label="Impact" value={group.primary.impact} />
              <MetricBar label="Urgency" value={group.primary.urgency} />
              <MetricBar
                label="Responsibility"
                value={Math.min(
                  5,
                  Math.round(group.primary.responsibility * 4),
                )}
              />
            </div>
          </section>

          <section className="attention-detail-section">
            <header>
              <div>
                <FolderKanban size={14} />
                <strong>Project relevance</strong>
              </div>
            </header>
            {hub ? (
              <div className="attention-project-context">
                <div className="attention-project-identity">
                  <span
                    style={{
                      background: `${hub.accent}18`,
                      color: hub.accent,
                    }}
                  >
                    {hub.icon}
                  </span>
                  <div>
                    <strong>{hub.name}</strong>
                    <small>
                      {capitalize(hub.type)} · {capitalize(hub.stage)}
                    </small>
                  </div>
                  <b className={`health-${hub.health}`}>
                    {humanize(hub.health)}
                  </b>
                </div>
                <p>{hub.healthNote}</p>
                <dl>
                  <div>
                    <dt>Project priority</dt>
                    <dd>{hub.priority}</dd>
                  </div>
                  <div>
                    <dt>Lead</dt>
                    <dd>{hub.lead.name}</dd>
                  </div>
                  <div>
                    <dt>Next milestone</dt>
                    <dd>
                      {hub.nextMilestone.title} ·{" "}
                      {formatDate(hub.nextMilestone.date)}
                    </dd>
                  </div>
                  <div>
                    <dt>Latest evidence</dt>
                    <dd>{hub.latestUpdate.text}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="attention-no-context">
                This signal affects the portfolio rather than one project.
              </p>
            )}
          </section>

          {item && (
            <section className="attention-detail-section">
              <header>
                <div>
                  <ListChecks size={14} />
                  <strong>Source work</strong>
                </div>
                <Link href={boardHref(group)}>
                  Open on board <ArrowRight size={11} />
                </Link>
              </header>
              <div className="attention-source-work">
                <span className={`source-type ${item.type}`}>
                  <FileCheck2 size={15} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {capitalize(item.type)} · {humanize(item.status)} ·{" "}
                    {capitalize(item.priority)} priority
                  </small>
                </div>
                <time>
                  {item.dueDate ? formatDate(item.dueDate) : "No date"}
                </time>
              </div>
              {dependencyItem && (
                <div className="attention-dependency-card">
                  <Link2 size={14} />
                  <div>
                    <strong>Blocked by {dependencyItem.title}</strong>
                    <span>
                      {dependencyHub?.name} · {humanize(dependencyItem.status)}{" "}
                      ·{" "}
                      {dependencyItem.dueDate
                        ? formatDate(dependencyItem.dueDate)
                        : "No date"}
                    </span>
                  </div>
                  <Link
                    href={
                      dependencyHub
                        ? `/app/hubs/${dependencyHub.slug}/boards/${dependencyItem.boardId}`
                        : "/app/attention"
                    }
                  >
                    <ExternalLink size={12} />
                  </Link>
                </div>
              )}
              {waiting && (
                <div className="attention-waiting-card">
                  <Clock3 size={14} />
                  <div>
                    <strong>
                      Waiting on {waiting.waitingLabel ?? waiting.waitingType}
                    </strong>
                    <span>
                      Since {formatDate(waiting.waitingSince)} · Expected{" "}
                      {waiting.expectedBy
                        ? formatDate(waiting.expectedBy)
                        : "without a date"}
                    </span>
                    <p>{waiting.waitingNote}</p>
                  </div>
                  <Link href="/app/waiting">
                    Open Waiting <ArrowRight size={11} />
                  </Link>
                </div>
              )}
            </section>
          )}

          <section className="attention-detail-section attention-commitment-section">
            <header>
              <div>
                <UserRound size={14} />
                <strong>Set the next commitment</strong>
              </div>
            </header>
            <p>
              Update responsibility here, then resolve only when the underlying
              evidence has changed.
            </p>
            <div>
              <label>
                <span>Accountable owner</span>
                <select
                  onChange={(event) => setSelectedOwner(event.target.value)}
                  value={selectedOwner}
                >
                  {ownerOptions.map((candidate) => (
                    <option key={candidate}>{candidate}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Next check or due date</span>
                <input
                  onChange={(event) => setSelectedDate(event.target.value)}
                  type="date"
                  value={selectedDate}
                />
              </label>
            </div>
            <button
              onClick={() => onSaveAssignment(selectedOwner, selectedDate)}
            >
              <Check size={12} /> Save commitment
            </button>
          </section>

          <section className="attention-detail-section">
            <header>
              <div>
                <ListChecks size={14} />
                <strong>Suggested resolution path</strong>
              </div>
            </header>
            <ol className="attention-resolution-steps">
              {resolutionSteps(group).map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="attention-detail-section attention-activity-section">
            <header>
              <div>
                <History size={14} />
                <strong>Action trail</strong>
              </div>
            </header>
            <div className="attention-note-compose">
              <MessageSquareText size={14} />
              <input
                aria-label="Add action note"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Record a call, blocker, or decision…"
                value={note}
              />
              <button
                disabled={!note.trim()}
                onClick={() => {
                  onLog("Action note added", note.trim());
                  setNote("");
                }}
              >
                Add note
              </button>
            </div>
            <div className="attention-activity-list">
              {activities.map((activity) => (
                <article key={activity.id}>
                  <span>
                    <Check size={11} />
                  </span>
                  <div>
                    <strong>{activity.text}</strong>
                    <p>{activity.detail}</p>
                  </div>
                  <time>Now</time>
                </article>
              ))}
              <article>
                <span>
                  <BellRing size={11} />
                </span>
                <div>
                  <strong>Signal generated</strong>
                  <p>
                    {group.reasons.length} evidence{" "}
                    {group.reasons.length === 1 ? "point" : "points"} crossed
                    TREVV’s attention threshold.
                  </p>
                </div>
                <time>24 Aug</time>
              </article>
            </div>
          </section>
        </div>

        <footer className="attention-panel-footer">
          <button onClick={() => onAct("dismiss")}>
            <X size={13} /> Dismiss
          </button>
          <button onClick={() => onAct("snooze")}>
            <Pause size={13} /> Snooze
          </button>
          <button onClick={onRequestUpdate}>
            <Send size={13} /> Request update
          </button>
          <button className="primary-button" onClick={() => onAct("resolve")}>
            <Check size={13} /> Resolve signal
          </button>
        </footer>
      </aside>
    </div>
  );
}

function AttentionActionDialog({
  group,
  action,
  onCancel,
  onConfirm,
}: {
  group: GroupedSignal;
  action: AttentionAction;
  onCancel: () => void;
  onConfirm: (note: string, until: string) => void;
}) {
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("2026-08-28");
  const labels = {
    resolve: {
      title: "Resolve this signal",
      prompt: "What changed in the underlying evidence?",
      placeholder: "Owner confirmed and a realistic delivery date agreed…",
      icon: CheckCircle2,
    },
    snooze: {
      title: "Snooze with a reason",
      prompt: "What are you waiting for?",
      placeholder: "Waiting for the supplier response before Friday…",
      icon: Pause,
    },
    dismiss: {
      title: "Dismiss as not useful",
      prompt: "Why should TREVV stop surfacing this?",
      placeholder: "Duplicated by another tracked signal…",
      icon: X,
    },
  } as const;
  const config = labels[action];
  const Icon = config.icon;
  return (
    <div
      className="workflow-dialog-layer attention-action-dialog-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        aria-labelledby="attention-action-title"
        aria-modal="true"
        className="workflow-dialog compact-workflow-dialog attention-action-dialog"
        role="dialog"
      >
        <header>
          <span
            className={
              action === "resolve"
                ? "success-dialog-icon"
                : action === "dismiss"
                  ? "warning-dialog-icon"
                  : ""
            }
          >
            <Icon size={17} />
          </span>
          <div>
            <p>{capitalize(action)} attention</p>
            <h2 id="attention-action-title">{config.title}</h2>
          </div>
          <button aria-label="Close action dialog" onClick={onCancel}>
            <X size={15} />
          </button>
        </header>
        <div className="workflow-dialog-body">
          <div className="workflow-context-card">
            <AlertTriangle size={14} />
            <p>
              <strong>{group.title}</strong>
              <span>
                {hubFor(group)?.name ?? "Portfolio"} ·{" "}
                {capitalize(group.severity)}
              </span>
            </p>
          </div>
          {action === "snooze" && (
            <label>
              <span>Snooze until</span>
              <input
                min="2026-08-25"
                onChange={(event) => setUntil(event.target.value)}
                type="date"
                value={until}
              />
            </label>
          )}
          <label>
            <span>{config.prompt}</span>
            <textarea
              autoFocus
              onChange={(event) => setNote(event.target.value)}
              placeholder={config.placeholder}
              value={note}
            />
          </label>
          <p className="workflow-safety-note">
            <ShieldCheck size={14} /> This action is recorded in the audit
            trail. A changed or newly triggered condition may surface the signal
            again.
          </p>
        </div>
        <footer>
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary-button"
            disabled={!note.trim() || (action === "snooze" && !until)}
            onClick={() => onConfirm(note.trim(), until)}
          >
            {action === "resolve"
              ? "Resolve signal"
              : action === "snooze"
                ? "Save snooze"
                : "Dismiss signal"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <div>
        {[1, 2, 3, 4, 5].map((step) => (
          <i className={step <= value ? "filled" : ""} key={step} />
        ))}
      </div>
      <b>{value}/5</b>
    </div>
  );
}

function matchesAttentionTab(signal: AttentionSignal, tab: AttentionTab) {
  if (tab === "Needs You") return signal.responsibility >= 1;
  if (tab === "At Risk") return ["high", "critical"].includes(signal.severity);
  if (tab === "Blocked") return isBlockedSignal(signal);
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

function groupMatchesTab(group: GroupedSignal, tab: AttentionTab) {
  return group.signals.some((signal) => matchesAttentionTab(signal, tab));
}

function isBlockedSignal(signal: AttentionSignal) {
  return [
    "blocked_work",
    "dependency_threat",
    "decision_blocking_execution",
  ].includes(signal.signalType);
}

function hubFor(group: GroupedSignal) {
  return demoHubs.find((hub) => hub.id === group.hubId);
}

function itemFor(group: GroupedSignal) {
  return demoItems.find((item) => item.id === group.entityId);
}

function boardHref(group: GroupedSignal) {
  const hub = hubFor(group);
  const item = itemFor(group);
  return hub && item
    ? `/app/hubs/${hub.slug}/boards/${item.boardId}`
    : hub
      ? `/app/hubs/${hub.slug}`
      : "/app/portfolio";
}

function workflowHref(group: GroupedSignal) {
  const item = itemFor(group);
  if (group.signals.some((signal) => signal.signalType === "waiting_too_long"))
    return "/app/waiting";
  if (item?.type === "decision") return "/app/decisions";
  if (item?.type === "approval") return "/app/approvals";
  return boardHref(group);
}

function actionLabel(group: GroupedSignal) {
  const types = group.signals.map((signal) => signal.signalType);
  if (types.includes("missing_owner")) return "Assign owner";
  if (types.some((type) => type.includes("stale") || type === "missing_update"))
    return "Request update";
  if (types.includes("waiting_too_long") || types.includes("follow_up_overdue"))
    return "Send follow-up";
  if (types.some((type) => type.includes("decision"))) return "Review decision";
  if (types.some((type) => type.includes("approval"))) return "Review approval";
  if (
    types.some(
      (type) => type.includes("blocked") || type === "dependency_threat",
    )
  )
    return "Build unblock plan";
  if (types.some((type) => type.includes("overdue"))) return "Reset commitment";
  return "Review & act";
}

function resolutionSteps(group: GroupedSignal) {
  const types = group.signals.map((signal) => signal.signalType);
  if (
    types.some(
      (type) => type.includes("blocked") || type === "dependency_threat",
    )
  )
    return [
      "Name the exact blocker and the person who can remove it.",
      "Agree one unblock action with a specific owner and date.",
      "Verify the dependent work can move, then resolve this signal.",
    ];
  if (types.some((type) => type.includes("overdue")))
    return [
      "Confirm whether the outcome is still needed and who owns it.",
      "Set a realistic date and the immediate next action.",
      "Notify affected people, then resolve after the commitment is accepted.",
    ];
  if (types.some((type) => type.includes("stale") || type === "missing_update"))
    return [
      "Request a structured update from the project lead.",
      "Reassess health against the new evidence.",
      "Publish the next milestone and resolve the stale signal.",
    ];
  if (types.includes("waiting_too_long"))
    return [
      "Send the planned follow-up to the waiting party.",
      "Reset the expected response date and follow-up owner.",
      "Escalate or choose an alternative path if no response arrives.",
    ];
  if (types.includes("missing_owner"))
    return [
      "Choose one accountable owner—not a group.",
      "Confirm the expected outcome and due date with them.",
      "Verify acceptance, then resolve this signal.",
    ];
  return [
    "Review the source evidence and expected outcome.",
    "Agree an owner, next action, and check date.",
    "Verify the change in TREVV, then resolve the signal.",
  ];
}

function signalLabel(signal: AttentionSignal) {
  return humanize(signal.signalType).replace(/\b\w/g, (letter) =>
    letter.toUpperCase(),
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function formatDate(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
